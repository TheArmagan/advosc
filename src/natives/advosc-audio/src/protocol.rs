//! The stdin/stdout contract. One JSON object per line in each direction, same as `ble-hr`.
//! `src/engine/audio/protocol.ts` mirrors these types, so change them together.

use serde::{Deserialize, Serialize};
use std::io::Write;

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    /// Decode a file into memory under `id`. Replaces whatever `id` held before.
    Load {
        id: String,
        path: String,
    },
    Unload {
        id: String,
    },
    /// Start a voice. The caller picks `voice`, so a `stop` can never lose a race with this.
    Play {
        voice: u64,
        id: String,
        #[serde(default = "full_gain")]
        gain: f32,
        #[serde(default, rename = "loop")]
        looping: bool,
    },
    Stop {
        voice: u64,
    },
    StopAll,
    SetGain {
        voice: u64,
        gain: f32,
    },
    SetMaster {
        gain: f32,
    },
    /// An id from `devices`, or "" to follow the Windows default output.
    SetDevice {
        id: String,
    },
    ListDevices,
    Quit,
    #[cfg(feature = "test-hooks")]
    TestFailStream,
    #[cfg(feature = "test-hooks")]
    TestStats {
        id: String,
    },
    #[cfg(feature = "test-hooks")]
    TestHideDevice {
        id: String,
    },
}

fn full_gain() -> f32 {
    1.0
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum EndReason {
    /// Ran off the end of the sound.
    Finished,
    /// `stop`, `stop_all`, or a new voice reusing this id.
    Stopped,
    /// `unload` of the sound it was playing or waiting on.
    Unloaded,
    /// `play` named an id that was never loaded.
    NotLoaded,
    /// The voice was waiting for a decode that failed.
    LoadFailed,
    /// No output device could be opened.
    NoDevice,
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum DeviceChangeReason {
    /// A stream opened on a device other than the last one reported.
    Opened,
    /// The answer to a `set_device`.
    Requested,
    /// Following the default, and Windows changed it.
    DefaultChanged,
    /// The chosen device went away, so output fell back to the default.
    DeviceLost,
    /// The chosen device came back after a fallback.
    DeviceRestored,
    /// The stream died and was reopened on the same device.
    StreamRestarted,
    /// Nothing can be opened at all. `id` and `name` are null.
    NoDevice,
}

#[derive(Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Ready {
        version: &'static str,
    },
    Loaded {
        id: String,
        frames: u64,
        channels: u16,
        sample_rate: u32,
        duration_ms: u64,
    },
    LoadError {
        id: String,
        message: String,
    },
    VoiceEnded {
        voice: u64,
        reason: EndReason,
        /// Source frames rendered, counting every pass of a loop.
        frames: u64,
    },
    Devices {
        devices: Vec<DeviceInfo>,
        default_id: Option<String>,
        /// The device a stream is open on. Null while output is closed.
        current_id: Option<String>,
    },
    DeviceChanged {
        id: Option<String>,
        name: Option<String>,
        /// What `set_device` last asked for.
        wanted: String,
        following_default: bool,
        /// `wanted` is unavailable and this is the default standing in for it.
        fallback: bool,
        reason: DeviceChangeReason,
        sample_rate: Option<u32>,
        channels: Option<u16>,
    },
    Error {
        message: String,
    },
    #[cfg(feature = "test-hooks")]
    TestStats {
        id: String,
        frames: u64,
        sample_rate: u32,
        channels: u16,
        peak: f32,
        rms: f32,
        /// From zero crossings on the first channel, so it only means anything for a tone.
        tone_hz: f32,
    },
}

pub fn emit(event: &Event) {
    let Ok(json) = serde_json::to_string(event) else {
        return;
    };
    let mut out = std::io::stdout().lock();
    // A broken stdout means the parent is gone, so there's nobody left to play for.
    if writeln!(out, "{json}").is_err() || out.flush().is_err() {
        std::process::exit(0);
    }
}

pub fn error(message: impl Into<String>) {
    emit(&Event::Error {
        message: message.into(),
    });
}
