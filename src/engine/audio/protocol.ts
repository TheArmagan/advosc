/**
 * The wire format of `advosc-audio.exe`: one JSON object per line, commands on stdin and events
 * on stdout. `src/natives/advosc-audio/src/protocol.rs` is the other half, so change them together.
 */

export type AudioCommand =
  | { cmd: 'load'; id: string; path: string }
  | { cmd: 'unload'; id: string }
  | { cmd: 'play'; voice: number; id: string; gain: number; loop: boolean }
  | { cmd: 'stop'; voice: number }
  | { cmd: 'stop_all' }
  | { cmd: 'set_gain'; voice: number; gain: number }
  | { cmd: 'set_master'; gain: number }
  | { cmd: 'set_device'; id: string }
  | { cmd: 'list_devices' }
  | { cmd: 'quit' };

export interface AudioDevice {
  /** An endpoint id. These survive reboots, unlike the browser's salted `deviceId`. */
  id: string;
  name: string;
  is_default: boolean;
}

export interface AudioDeviceList {
  devices: AudioDevice[];
  default_id: string | null;
  /** The device a stream is open on. Null while output is closed, which it is when idle. */
  current_id: string | null;
}

export type VoiceEndReason =
  /** Ran off the end of the sound. */
  | 'finished'
  /** `stop`, `stop_all`, or a new voice reusing the id. */
  | 'stopped'
  /** `unload` of the sound it was playing or waiting on. */
  | 'unloaded'
  /** `play` named a sound that was never loaded. */
  | 'not_loaded'
  /** It was waiting for a decode that failed. */
  | 'load_failed'
  /** No output device could be opened. */
  | 'no_device'
  /** Added by the client: the sidecar died with this voice in it. */
  | 'sidecar_exit'
  /** Added by the client: the sidecar wasn't running and couldn't take the voice. */
  | 'sidecar_unavailable';

export type DeviceChangeReason =
  /** A stream opened on a device other than the last one reported. */
  | 'opened'
  /** The answer to a `set_device`. */
  | 'requested'
  /** Following the default, and Windows changed it. */
  | 'default_changed'
  /** The chosen device went away, so output fell back to the default. */
  | 'device_lost'
  /** The chosen device came back after a fallback. */
  | 'device_restored'
  /** The stream died and was reopened on the same device. */
  | 'stream_restarted'
  /** Nothing can be opened at all. `id` and `name` are null. */
  | 'no_device';

export type AudioEvent =
  | { type: 'ready'; version: string }
  | {
      type: 'loaded';
      id: string;
      frames: number;
      channels: number;
      sample_rate: number;
      duration_ms: number;
    }
  /** `message` is fit for the sound's error badge. */
  | { type: 'load_error'; id: string; message: string }
  /** `frames` counts source frames rendered, across every pass of a loop. */
  | { type: 'voice_ended'; voice: number; reason: VoiceEndReason; frames: number }
  | ({ type: 'devices' } & AudioDeviceList)
  | {
      type: 'device_changed';
      id: string | null;
      name: string | null;
      /** What `set_device` last asked for. "" follows the default. */
      wanted: string;
      following_default: boolean;
      /** `wanted` is unavailable and this is the default standing in for it. */
      fallback: boolean;
      reason: DeviceChangeReason;
      sample_rate: number | null;
      channels: number | null;
    }
  | { type: 'error'; message: string }
  /** Added by the client when the process goes away for any reason. */
  | { type: 'sidecar_exit'; code: number | null; signal: string | null };
