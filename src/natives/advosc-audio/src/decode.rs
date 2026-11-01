//! Turns a file into interleaved `f32` frames in memory, which is what the browser's
//! `decodeAudioData` gave the old engine. Messages here end up on the sound's error badge.

use std::num::NonZero;
use std::path::Path;
use std::sync::{mpsc::Sender, Arc, Mutex, OnceLock};

use symphonia::core::audio::{Channels, Position};
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::codecs::registry::CodecRegistry;
use symphonia::core::errors::Error;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia_adapter_libopus::OpusDecoder;

use crate::Msg;

/// About an hour of 48 kHz stereo, or 1.4 GB. Past this a respawn would replay the same load
/// and die the same way, so refuse the file instead of letting the allocator abort us.
const MAX_SAMPLES: usize = 48_000 * 2 * 3600;

pub struct Sound {
    /// Interleaved, one or two channels.
    pub samples: Vec<f32>,
    pub channels: NonZero<u16>,
    pub sample_rate: NonZero<u32>,
}

impl Sound {
    pub fn frames(&self) -> usize {
        self.samples.len() / self.channels.get() as usize
    }
}

pub struct DecodeJob {
    pub id: String,
    pub seq: u64,
    pub path: String,
}

/// A fixed pool, so a library of a hundred sounds doesn't start a hundred decodes at once,
/// and a long decode doesn't hold up `play` on the command thread.
pub fn spawn_workers(count: usize, tx: Sender<Msg>) -> Sender<DecodeJob> {
    let (job_tx, job_rx) = std::sync::mpsc::channel::<DecodeJob>();
    let job_rx = Arc::new(Mutex::new(job_rx));

    for _ in 0..count {
        let job_rx = job_rx.clone();
        let tx = tx.clone();
        std::thread::spawn(move || loop {
            let job = match job_rx.lock() {
                Ok(rx) => rx.recv(),
                Err(_) => return,
            };
            let Ok(job) = job else { return };
            // Symphonia parses untrusted files. One that panics costs that sound, not the
            // whole process and everything else that's playing.
            let path = job.path;
            let result = std::panic::catch_unwind(|| decode_file(&path))
                .unwrap_or_else(|_| Err("Could not decode this file".to_string()));
            let msg = Msg::Decoded {
                id: job.id,
                seq: job.seq,
                result: result.map(Arc::new),
            };
            if tx.send(msg).is_err() {
                return;
            }
        });
    }

    job_tx
}

fn codecs() -> &'static CodecRegistry {
    static REGISTRY: OnceLock<CodecRegistry> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        let mut registry = CodecRegistry::new();
        symphonia::default::register_enabled_codecs(&mut registry);
        // Symphonia has no Opus decoder of its own.
        registry.register_audio_decoder::<OpusDecoder>();
        registry
    })
}

/// How much of each source channel goes to left and right. These are the Web Audio 5.1 to
/// stereo coefficients, which is what these files got before. rodio would keep the first two
/// channels and drop the rest, which loses the center, and with it most speech.
fn stereo_matrix(channels: &Channels) -> Vec<[f32; 2]> {
    const SIDE: f32 = std::f32::consts::FRAC_1_SQRT_2;
    let mut matrix = vec![[0.0; 2]; channels.count()];

    match channels {
        Channels::Positioned(positions) => {
            // Decoders hand planes over in position bit order, which is what iter() walks.
            for (index, position) in positions.iter().enumerate() {
                matrix[index] = match position {
                    Position::FRONT_LEFT => [1.0, 0.0],
                    Position::FRONT_RIGHT => [0.0, 1.0],
                    Position::FRONT_CENTER => [SIDE, SIDE],
                    Position::REAR_LEFT | Position::SIDE_LEFT => [SIDE, 0.0],
                    Position::REAR_RIGHT | Position::SIDE_RIGHT => [0.0, SIDE],
                    _ => [0.0, 0.0],
                };
            }
        }
        _ => {
            matrix[0] = [1.0, 0.0];
            matrix[1] = [0.0, 1.0];
        }
    }

    matrix
}

fn downmix(frame_data: &[f32], matrix: &[[f32; 2]], output: &mut Vec<f32>) {
    for frame in frame_data.chunks_exact(matrix.len()) {
        let (mut left, mut right) = (0.0, 0.0);
        for (sample, weights) in frame.iter().zip(matrix) {
            left += sample * weights[0];
            right += sample * weights[1];
        }
        output.push(left);
        output.push(right);
    }
}

pub fn decode_file(path: &str) -> Result<Sound, String> {
    let file = std::fs::File::open(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => "File not found".to_string(),
        _ => format!("Could not open this file: {e}"),
    })?;

    let mut hint = Hint::new();
    if let Some(extension) = Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(extension);
    }

    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|_| "Unsupported file format".to_string())?;

    let track = format
        .default_track(TrackType::Audio)
        .ok_or("This file has no audio track")?;
    let track_id = track.id;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or("This file has no audio track")?;

    // Gapless drops encoder delay and padding, which a looped sound would otherwise click on.
    let mut decoder = codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default().gapless(true))
        .map_err(|_| "This file's audio codec isn't supported".to_string())?;

    let mut samples: Vec<f32> = Vec::new();
    let mut packet_samples: Vec<f32> = Vec::new();
    let mut layout: Option<(usize, u32, Channels)> = None;

    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            // A chained Ogg stream, or a file cut short. Either way keep what we have. If
            // that's nothing, the check after the loop turns it into an error.
            Err(_) => break,
        };
        if packet.track_id != track_id {
            continue;
        }

        let buffer = match decoder.decode(&packet) {
            Ok(buffer) => buffer,
            // One bad packet costs one packet, same as a browser decoder.
            Err(Error::DecodeError(_)) | Err(Error::IoError(_)) => continue,
            Err(Error::Unsupported(_)) => {
                return Err("This file's audio codec isn't supported".to_string());
            }
            Err(_) => return Err("Could not decode this file".to_string()),
        };
        if buffer.frames() == 0 {
            continue;
        }

        let channel_count = buffer.num_planes();
        let (expected_channels, sample_rate, channels) = layout.get_or_insert_with(|| {
            (
                channel_count,
                buffer.spec().rate(),
                buffer.spec().channels().clone(),
            )
        });
        // The format can't change mid stream in anything we keep in memory as one buffer.
        if channel_count != *expected_channels || buffer.spec().rate() != *sample_rate {
            continue;
        }

        buffer.copy_to_vec_interleaved(&mut packet_samples);
        if channel_count <= 2 {
            samples.extend_from_slice(&packet_samples);
        } else {
            downmix(&packet_samples, &stereo_matrix(channels), &mut samples);
        }
        if samples.len() > MAX_SAMPLES {
            return Err("This file is too long, the limit is one hour".to_string());
        }
    }

    let Some((channel_count, sample_rate, _)) = layout else {
        return Err("Could not decode this file".to_string());
    };

    // Growing by doubling can leave up to half the capacity unused, and this stays in memory.
    samples.shrink_to_fit();

    Ok(Sound {
        samples,
        channels: NonZero::new(channel_count.min(2) as u16).ok_or("Could not decode this file")?,
        sample_rate: NonZero::new(sample_rate).ok_or("Could not decode this file")?,
    })
}
