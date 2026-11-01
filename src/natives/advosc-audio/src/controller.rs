//! The single thread that owns all playback state. Commands, decode results, finished voices
//! and stream errors all arrive here as one queue, so none of them need locks.

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{mpsc::Sender, Arc};
use std::time::{Duration, Instant};

use crate::decode::{DecodeJob, Sound};
use crate::output;
use crate::protocol::{self, Command, DeviceChangeReason, EndReason, Event};
use crate::voice::{Gain, VoiceShared, VoiceSource};
use crate::Msg;

/// Keep the stream open this long after the last voice, so a burst of triggers doesn't reopen
/// it each time. Closed afterwards because an open stream, even a silent one, keeps Windows
/// from sleeping and keeps a Bluetooth headset awake.
const IDLE_CLOSE: Duration = Duration::from_secs(15);
/// How often to compare the open stream against the system's device list. cpal reports a
/// changed default, but a stream on a chosen device can go quiet with no error at all when
/// it's unplugged, because WASAPI just stops signalling its buffer event.
const DEVICE_POLL: Duration = Duration::from_secs(2);
/// Floor between reopen attempts, so a device that errors right away can't become a spin.
const REOPEN_FLOOR: Duration = Duration::from_millis(500);

fn clamp_gain(gain: f32) -> f32 {
    if gain.is_finite() {
        gain.clamp(0.0, 1.0)
    } else {
        1.0
    }
}

struct Voice {
    serial: u64,
    sound_id: String,
    sound: Arc<Sound>,
    shared: Arc<VoiceShared>,
    looping: bool,
}

/// A voice whose sound is still decoding. Same as the old engine, where `play` awaited the
/// decode. Lives in the queue so `stop` and `set_gain` can still reach it.
struct PendingVoice {
    voice: u64,
    id: String,
    gain: f32,
    looping: bool,
}

struct Output {
    /// Dropping the sink ends the stream, and every source in it with it.
    sink: rodio::MixerDeviceSink,
    id: Option<String>,
    fallback: bool,
}

enum Trigger {
    /// A voice wanted a stream and none was open.
    Open,
    Requested,
    /// The open stream died, or stopped matching what it should be.
    Recover,
}

pub struct Controller {
    tx: Sender<Msg>,
    jobs: Sender<DecodeJob>,
    master: Arc<Gain>,

    sounds: HashMap<String, Arc<Sound>>,
    /// Sound id to the sequence of its newest decode, so a stale result can be spotted.
    loading: HashMap<String, u64>,
    load_seq: u64,

    voices: HashMap<u64, Voice>,
    pending: Vec<PendingVoice>,
    serial: u64,

    /// What `set_device` asked for. "" follows the default.
    wanted: String,
    output: Option<Output>,
    /// Stream errors name the stream they came from, so one that's already gone is ignored.
    generation: u64,
    needs_reopen: bool,
    last_open: Instant,
    next_poll: Instant,
    idle_since: Option<Instant>,
    /// What the engine was last told, so an idle reopen on the same device stays quiet.
    reported: Option<(Option<String>, bool)>,
}

impl Controller {
    pub fn new(tx: Sender<Msg>, jobs: Sender<DecodeJob>) -> Self {
        let now = Instant::now();
        Self {
            tx,
            jobs,
            master: Arc::new(Gain::new(1.0)),
            sounds: HashMap::new(),
            loading: HashMap::new(),
            load_seq: 0,
            voices: HashMap::new(),
            pending: Vec::new(),
            serial: 0,
            wanted: String::new(),
            output: None,
            generation: 0,
            needs_reopen: false,
            last_open: now - REOPEN_FLOOR,
            next_poll: now,
            idle_since: None,
            reported: None,
        }
    }

    /// How long the main loop may sleep. Nothing here is time driven while output is closed.
    pub fn tick_interval(&self) -> Option<Duration> {
        self.output.as_ref().map(|_| Duration::from_millis(100))
    }

    // -------------------------------------------------------------------- commands

    /// Returns false when the process should exit.
    pub fn handle(&mut self, command: Command) -> bool {
        match command {
            Command::Load { id, path } => self.load(id, path),
            Command::Unload { id } => self.unload(id),
            Command::Play {
                voice,
                id,
                gain,
                looping,
            } => self.play(voice, id, gain, looping),
            Command::Stop { voice } => self.stop(voice),
            Command::StopAll => self.stop_all(),
            Command::SetGain { voice, gain } => self.set_gain(voice, gain),
            Command::SetMaster { gain } => self.master.set(clamp_gain(gain)),
            Command::SetDevice { id } => self.set_device(id),
            Command::ListDevices => self.list_devices(),
            Command::Quit => return false,
            #[cfg(feature = "test-hooks")]
            Command::TestFailStream => self.on_stream_error(self.generation),
            #[cfg(feature = "test-hooks")]
            Command::TestStats { id } => self.test_stats(id),
            #[cfg(feature = "test-hooks")]
            Command::TestHideDevice { id } => *output::HIDDEN_DEVICE.lock().unwrap() = id,
        }
        true
    }

    #[cfg(feature = "test-hooks")]
    fn test_stats(&self, id: String) {
        let Some(sound) = self.sounds.get(&id) else {
            protocol::error(format!("test_stats: {id} is not loaded"));
            return;
        };
        let channels = sound.channels.get() as usize;
        let samples = &sound.samples;
        let peak = samples
            .iter()
            .fold(0.0f32, |peak, sample| peak.max(sample.abs()));
        let energy: f64 = samples.iter().map(|sample| (*sample as f64).powi(2)).sum();
        let rms = (energy / samples.len() as f64).sqrt() as f32;

        let first: Vec<f32> = samples.iter().step_by(channels).copied().collect();
        let crossings = first
            .windows(2)
            .filter(|w| w[0] < 0.0 && w[1] >= 0.0)
            .count();
        let seconds = sound.frames() as f32 / sound.sample_rate.get() as f32;

        protocol::emit(&Event::TestStats {
            id,
            frames: sound.frames() as u64,
            sample_rate: sound.sample_rate.get(),
            channels: sound.channels.get(),
            peak,
            rms,
            tone_hz: crossings as f32 / seconds,
        });
    }

    fn load(&mut self, id: String, path: String) {
        self.sounds.remove(&id);
        self.load_seq += 1;
        self.loading.insert(id.clone(), self.load_seq);
        let job = DecodeJob {
            id,
            seq: self.load_seq,
            path,
        };
        if self.jobs.send(job).is_err() {
            protocol::error("decode workers are gone");
        }
    }

    fn unload(&mut self, id: String) {
        self.sounds.remove(&id);
        self.loading.remove(&id);
        self.end_pending(|pending| pending.id == id, EndReason::Unloaded);

        let voices: Vec<u64> = self
            .voices
            .iter()
            .filter(|(_, voice)| voice.sound_id == id)
            .map(|(voice, _)| *voice)
            .collect();
        for voice in voices {
            self.end_voice(voice, EndReason::Unloaded);
        }
    }

    fn play(&mut self, voice: u64, id: String, gain: f32, looping: bool) {
        // A reused id replaces the voice instead of leaving one nobody can address.
        self.end_voice(voice, EndReason::Stopped);
        self.end_pending(|pending| pending.voice == voice, EndReason::Stopped);

        let gain = clamp_gain(gain);
        if let Some(sound) = self.sounds.get(&id).cloned() {
            self.start_voice(voice, id, sound, gain, looping);
        } else if self.loading.contains_key(&id) {
            self.pending.push(PendingVoice {
                voice,
                id,
                gain,
                looping,
            });
        } else {
            voice_ended(voice, EndReason::NotLoaded, 0);
        }
    }

    fn stop(&mut self, voice: u64) {
        self.end_voice(voice, EndReason::Stopped);
        self.end_pending(|pending| pending.voice == voice, EndReason::Stopped);
    }

    fn stop_all(&mut self) {
        let voices: Vec<u64> = self.voices.keys().copied().collect();
        for voice in voices {
            self.end_voice(voice, EndReason::Stopped);
        }
        self.end_pending(|_| true, EndReason::Stopped);
    }

    fn set_gain(&mut self, voice: u64, gain: f32) {
        let gain = clamp_gain(gain);
        if let Some(active) = self.voices.get(&voice) {
            active.shared.gain.set(gain);
        } else if let Some(pending) = self.pending.iter_mut().find(|p| p.voice == voice) {
            pending.gain = gain;
        }
    }

    fn set_device(&mut self, id: String) {
        self.wanted = id;
        if self.output.is_some() {
            self.open_output(Trigger::Requested);
            return;
        }

        // Nothing is open, and opening a stream just to answer would hold the device for no
        // reason. Report where the next stream would go.
        let chosen = (!self.wanted.is_empty())
            .then(|| output::find_device(&self.wanted))
            .flatten();
        let fallback = chosen.is_none() && !self.wanted.is_empty();
        let device = chosen.or_else(output::default_device);
        let info = device.as_ref().and_then(|device| {
            let id = output::device_id(device)?;
            Some((id, output::device_name(device)))
        });

        let (id, name) = match info {
            Some((id, name)) => (Some(id), Some(name)),
            None => (None, None),
        };
        let reason = if id.is_some() {
            DeviceChangeReason::Requested
        } else {
            DeviceChangeReason::NoDevice
        };
        self.report_device(id, name, fallback, reason, None, None);
    }

    fn list_devices(&self) {
        protocol::emit(&Event::Devices {
            devices: output::list_devices(),
            default_id: output::default_device_id(),
            current_id: self.output.as_ref().and_then(|output| output.id.clone()),
        });
    }

    // ---------------------------------------------------------------------- events

    pub fn on_decoded(&mut self, id: String, seq: u64, result: Result<Arc<Sound>, String>) {
        // Unloaded, or loaded again from another path, while this one was decoding.
        if self.loading.get(&id) != Some(&seq) {
            return;
        }
        self.loading.remove(&id);

        match result {
            Ok(sound) => {
                let frames = sound.frames() as u64;
                let sample_rate = sound.sample_rate.get();
                protocol::emit(&Event::Loaded {
                    id: id.clone(),
                    frames,
                    channels: sound.channels.get(),
                    sample_rate,
                    duration_ms: frames * 1000 / sample_rate as u64,
                });
                self.sounds.insert(id.clone(), sound.clone());

                let waiting: Vec<PendingVoice>;
                (waiting, self.pending) = std::mem::take(&mut self.pending)
                    .into_iter()
                    .partition(|pending| pending.id == id);
                for pending in waiting {
                    self.start_voice(
                        pending.voice,
                        pending.id,
                        sound.clone(),
                        pending.gain,
                        pending.looping,
                    );
                }
            }
            Err(message) => {
                protocol::emit(&Event::LoadError {
                    id: id.clone(),
                    message,
                });
                self.end_pending(|pending| pending.id == id, EndReason::LoadFailed);
            }
        }
    }

    pub fn on_voice_finished(&mut self, voice: u64, serial: u64) {
        // The serial filters out a finish from an earlier voice that used the same id.
        if self.voices.get(&voice).map(|v| v.serial) == Some(serial) {
            self.end_voice(voice, EndReason::Finished);
        }
    }

    pub fn on_stream_error(&mut self, generation: u64) {
        if generation == self.generation && self.output.is_some() {
            self.needs_reopen = true;
        }
    }

    pub fn tick(&mut self) {
        if self.output.is_none() {
            return;
        }
        let now = Instant::now();

        if self.needs_reopen && now.duration_since(self.last_open) >= REOPEN_FLOOR {
            self.open_output(Trigger::Recover);
            return;
        }

        if now >= self.next_poll {
            self.next_poll = now + DEVICE_POLL;
            self.needs_reopen |= self.device_out_of_date();
        }

        if self.voices.is_empty() && self.pending.is_empty() {
            let idle_since = *self.idle_since.get_or_insert(now);
            if now.duration_since(idle_since) >= IDLE_CLOSE {
                self.output = None;
                self.needs_reopen = false;
                self.idle_since = None;
            }
        } else {
            self.idle_since = None;
        }
    }

    fn device_out_of_date(&self) -> bool {
        let Some(open) = &self.output else {
            return false;
        };
        if self.wanted.is_empty() {
            output::default_device_id() != open.id
        } else {
            // Unplugged while on it, or back after a fallback. Both mean a reopen.
            output::find_device(&self.wanted).is_some() == open.fallback
        }
    }

    // ----------------------------------------------------------------------- voices

    fn start_voice(
        &mut self,
        voice: u64,
        sound_id: String,
        sound: Arc<Sound>,
        gain: f32,
        looping: bool,
    ) {
        if self.output.is_none() && !self.open_output(Trigger::Open) {
            voice_ended(voice, EndReason::NoDevice, 0);
            return;
        }

        self.serial += 1;
        let active = Voice {
            serial: self.serial,
            sound_id,
            sound,
            shared: Arc::new(VoiceShared::new(gain)),
            looping,
        };
        if let Some(output) = &self.output {
            output.sink.mixer().add(self.source_for(voice, &active));
        }
        self.voices.insert(voice, active);
        self.idle_since = None;
    }

    fn source_for(&self, voice: u64, active: &Voice) -> VoiceSource {
        VoiceSource {
            voice,
            serial: active.serial,
            sound: active.sound.clone(),
            shared: active.shared.clone(),
            master: self.master.clone(),
            looping: active.looping,
            tx: self.tx.clone(),
            next_sample: active.shared.next_sample.load(Ordering::Relaxed),
            frame_gain: 0.0,
        }
    }

    fn end_voice(&mut self, voice: u64, reason: EndReason) {
        if let Some(active) = self.voices.remove(&voice) {
            active.shared.stopped.store(true, Ordering::Relaxed);
            let frames = active.shared.frames_rendered.load(Ordering::Relaxed);
            voice_ended(voice, reason, frames);
        }
    }

    fn end_pending(&mut self, matches: impl Fn(&PendingVoice) -> bool, reason: EndReason) {
        self.pending.retain(|pending| {
            if matches(pending) {
                voice_ended(pending.voice, reason, 0);
                false
            } else {
                true
            }
        });
    }

    // ----------------------------------------------------------------------- output

    /// Closes whatever is open and opens the right device, carrying playing voices across at
    /// their current position. Returns false if nothing could be opened.
    fn open_output(&mut self, trigger: Trigger) -> bool {
        // The old stream goes first, so its sources have stopped moving before they're read.
        let previous = self
            .output
            .take()
            .map(|output| (output.id, output.fallback));
        self.needs_reopen = false;
        self.last_open = Instant::now();
        self.next_poll = self.last_open + DEVICE_POLL;
        self.generation += 1;

        let following = self.wanted.is_empty();
        let mut opened = None;
        if !following {
            opened = output::find_device(&self.wanted).and_then(|device| self.try_open(device));
        }
        let fallback = opened.is_none() && !following;
        if opened.is_none() {
            opened = output::default_device().and_then(|device| self.try_open(device));
        }

        let Some(opened) = opened else {
            self.report_device(None, None, false, DeviceChangeReason::NoDevice, None, None);
            let voices: Vec<u64> = self.voices.keys().copied().collect();
            for voice in voices {
                self.end_voice(voice, EndReason::NoDevice);
            }
            return false;
        };

        let reason = device_change_reason(
            trigger,
            following,
            fallback,
            &opened.id,
            previous.as_ref().or(self.reported.as_ref()),
        );

        let new_output = Output {
            sink: opened.sink,
            id: opened.id.clone(),
            fallback,
        };
        for (voice, active) in &self.voices {
            new_output.sink.mixer().add(self.source_for(*voice, active));
        }
        self.output = Some(new_output);
        self.idle_since = None;

        if let Some(reason) = reason {
            self.report_device(
                opened.id,
                Some(opened.name),
                fallback,
                reason,
                Some(opened.sample_rate),
                Some(opened.channels),
            );
        }
        true
    }

    fn try_open(&self, device: cpal::Device) -> Option<output::OpenedOutput> {
        let tx = self.tx.clone();
        let generation = self.generation;
        let on_error = move |error: cpal::Error| {
            // Glitches. Everything else is reported as a stream that needs rebuilding.
            if matches!(
                error.kind(),
                cpal::ErrorKind::Xrun | cpal::ErrorKind::RealtimeDenied
            ) {
                return;
            }
            let _ = tx.send(Msg::StreamError { generation });
        };

        match output::open(device, on_error) {
            Ok(opened) => Some(opened),
            Err(message) => {
                protocol::error(format!("could not open output: {message}"));
                None
            }
        }
    }

    fn report_device(
        &mut self,
        id: Option<String>,
        name: Option<String>,
        fallback: bool,
        reason: DeviceChangeReason,
        sample_rate: Option<u32>,
        channels: Option<u16>,
    ) {
        self.reported = Some((id.clone(), fallback));
        protocol::emit(&Event::DeviceChanged {
            id,
            name,
            wanted: self.wanted.clone(),
            following_default: self.wanted.is_empty(),
            fallback,
            reason,
            sample_rate,
            channels,
        });
    }
}

/// None means the engine already knows all it needs to.
fn device_change_reason(
    trigger: Trigger,
    following: bool,
    fallback: bool,
    id: &Option<String>,
    previous: Option<&(Option<String>, bool)>,
) -> Option<DeviceChangeReason> {
    let changed = previous.is_none_or(|(previous_id, _)| previous_id != id);
    let was_fallback = previous.is_some_and(|(_, fallback)| *fallback);

    if matches!(trigger, Trigger::Requested) {
        return Some(DeviceChangeReason::Requested);
    }
    if fallback && !was_fallback {
        return Some(DeviceChangeReason::DeviceLost);
    }
    if !fallback && was_fallback {
        return Some(DeviceChangeReason::DeviceRestored);
    }

    match trigger {
        Trigger::Open if previous.is_none() => Some(DeviceChangeReason::Opened),
        Trigger::Open if following && changed => Some(DeviceChangeReason::DefaultChanged),
        Trigger::Open if changed => Some(DeviceChangeReason::Opened),
        Trigger::Open => None,
        _ if following && changed => Some(DeviceChangeReason::DefaultChanged),
        _ => Some(DeviceChangeReason::StreamRestarted),
    }
}

fn voice_ended(voice: u64, reason: EndReason, frames: u64) {
    protocol::emit(&Event::VoiceEnded {
        voice,
        reason,
        frames,
    });
}
