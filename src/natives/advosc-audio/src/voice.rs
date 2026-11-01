//! One playing copy of a sound, as a rodio `Source`. The mixer owns the source and pulls it
//! from the audio thread; the controller reaches it through `VoiceShared`.

use std::num::NonZero;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc::Sender, Arc};
use std::time::Duration;

use rodio::Source;

use crate::decode::Sound;
use crate::Msg;

/// An `f32` that can be written from the command thread and read from the audio thread.
pub struct Gain(AtomicU32);

impl Gain {
    pub fn new(value: f32) -> Self {
        Self(AtomicU32::new(value.to_bits()))
    }

    pub fn get(&self) -> f32 {
        f32::from_bits(self.0.load(Ordering::Relaxed))
    }

    pub fn set(&self, value: f32) {
        self.0.store(value.to_bits(), Ordering::Relaxed);
    }
}

/// Outlives any one `VoiceSource`. Moving to another device drops the source with the old
/// stream and builds a new one from `next_sample`.
pub struct VoiceShared {
    pub gain: Gain,
    pub stopped: AtomicBool,
    pub next_sample: AtomicUsize,
    pub frames_rendered: AtomicU64,
}

impl VoiceShared {
    pub fn new(gain: f32) -> Self {
        Self {
            gain: Gain::new(gain),
            stopped: AtomicBool::new(false),
            next_sample: AtomicUsize::new(0),
            frames_rendered: AtomicU64::new(0),
        }
    }
}

pub struct VoiceSource {
    pub voice: u64,
    pub serial: u64,
    pub sound: Arc<Sound>,
    pub shared: Arc<VoiceShared>,
    pub master: Arc<Gain>,
    pub looping: bool,
    pub tx: Sender<Msg>,
    pub next_sample: usize,
    pub frame_gain: f32,
}

impl VoiceSource {
    /// Everything that only needs checking once per frame. Returns false to end the voice.
    #[inline]
    fn start_frame(&mut self) -> bool {
        if self.shared.stopped.load(Ordering::Relaxed) {
            return false;
        }

        if self.next_sample >= self.sound.samples.len() {
            if !self.looping {
                let _ = self.tx.send(Msg::VoiceFinished {
                    voice: self.voice,
                    serial: self.serial,
                });
                return false;
            }
            self.next_sample = 0;
        }

        self.shared
            .next_sample
            .store(self.next_sample, Ordering::Relaxed);
        self.shared.frames_rendered.fetch_add(1, Ordering::Relaxed);
        self.frame_gain = self.shared.gain.get() * self.master.get();
        true
    }
}

impl Iterator for VoiceSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<f32> {
        // Only ever stop on a frame boundary, or left and right swap in the mixer.
        let frame_start = self
            .next_sample
            .is_multiple_of(self.sound.channels.get() as usize);
        if frame_start && !self.start_frame() {
            return None;
        }
        let sample = self.sound.samples[self.next_sample] * self.frame_gain;
        self.next_sample += 1;
        Some(sample)
    }
}

impl Source for VoiceSource {
    // None keeps rodio's converter running as one span. With a length it would restart the
    // resampler every 32768 samples and at each loop point.
    fn current_span_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> NonZero<u16> {
        self.sound.channels
    }

    fn sample_rate(&self) -> NonZero<u32> {
        self.sound.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}
