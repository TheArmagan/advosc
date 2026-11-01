/**
 * What the sound engine needs from audio playback. The real implementation is the sidecar
 * client in `src/engine/audio`. Everything above this line (volume, mute, cooldowns, rules,
 * `isPlaying`) stays in the sound engine; this only moves samples.
 *
 * The engine assigns voice ids, so a stop can never lose a race with its own play.
 */

export interface AudioDevice {
  id: string;
  name: string;
}

export interface AudioBackend {
  /** Decodes a file ahead of time. Rejects with a message that's fit to show the user. */
  load(soundId: string, path: string): Promise<void>;
  unload(soundId: string): void;
  /** `gain` is 0 to 1. Rejects with a user-facing message if it can't start. */
  play(voice: number, soundId: string, options: { gain: number; loop: boolean }): Promise<void>;
  stopVoice(voice: number): void;
  stopAll(): void;
  /** 0 to 1, applied on top of every voice's own gain. */
  setMasterGain(gain: number): void;
  /** Null means the Windows default output. */
  setOutputDevice(device: AudioDevice | null): Promise<void>;
  listDevices(): Promise<AudioDevice[]>;
  /** Fires when a voice finishes or is stopped, for any reason. */
  onVoiceEnded(listener: (voice: number) => void): () => void;
  /** Called on quit. Should end the sidecar and resolve once it's gone. */
  shutdown(): Promise<void>;
}

/** Sound playback isn't wired up yet, so loads fail into the existing per-sound error badge. */
export function createUnavailableBackend(): AudioBackend {
  const message = "Sound playback isn't available in this build.";

  return {
    load: () => Promise.reject(new Error(message)),
    unload() {},
    play: () => Promise.reject(new Error(message)),
    stopVoice() {},
    stopAll() {},
    setMasterGain() {},
    setOutputDevice: () => Promise.resolve(),
    listDevices: () => Promise.resolve([]),
    onVoiceEnded: () => () => {},
    shutdown: () => Promise.resolve(),
  };
}
