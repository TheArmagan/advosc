import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import type { AudioCommand, AudioDeviceList, AudioEvent, VoiceEndReason } from './protocol';

/** First wait before respawning after the sidecar dies with sounds still loaded. */
const RESPAWN_DELAY = 1000;
/** Ceiling for the respawn backoff. */
const RESPAWN_DELAY_MAX = 60000;
/**
 * A run this long clears the backoff. It can't be cleared on `ready`: a file that crashes the
 * decoder gets replayed after every respawn, so the sidecar would reach `ready` each time and
 * then die, and the delay would never grow.
 */
const STABLE_UPTIME = 30000;
/** How long `listDevices` waits for an answer. */
const LIST_TIMEOUT = 3000;
/** How long `shutdown` gives the process to leave before killing it. */
const QUIT_TIMEOUT = 1000;

const NO_DEVICES: AudioDeviceList = { devices: [], default_id: null, current_id: null };

export type AudioListener = (event: AudioEvent) => void;

export interface PlayOptions {
  /** 0 to 1. Defaults to 1. */
  gain?: number;
  loop?: boolean;
}

export interface AudioSidecarOptions {
  /** Where stderr and parse failures go. Defaults to `console.error`. */
  log?: (message: string) => void;
}

/**
 * Client for `advosc-audio.exe`. The process starts on the first command that needs it, comes
 * back with a backoff if it dies, and gets its sounds, master gain and device replayed. Voices
 * don't survive a crash: each one in flight gets a `voice_ended` with reason `sidecar_exit`, so
 * anything counting playing voices stays correct.
 *
 * `load` is fire and forget. Results arrive as `loaded` and `load_error`, and they arrive again
 * after a respawn. A `play` sent while its sound is decoding waits for the decode.
 */
export class AudioSidecar {
  private child: ChildProcess | null = null;
  private lineBuffer = '';
  private startedAt = 0;
  private respawnTimer: NodeJS.Timeout | null = null;
  private respawnAttempts = 0;
  private closed = false;
  private nextVoice = 0;

  /** Replayed on every start. Sound id to path. */
  private readonly sounds = new Map<string, string>();
  private master: number | null = null;
  private device: string | null = null;

  private readonly voices = new Set<number>();
  private readonly listeners = new Set<AudioListener>();
  private readonly deviceRequests: ((list: AudioDeviceList) => void)[] = [];
  private readonly log: (message: string) => void;

  constructor(
    private readonly exePath: string,
    options: AudioSidecarOptions = {},
  ) {
    this.log = options.log ?? ((message) => console.error('advosc-audio:', message));
  }

  /** Returns the function that unsubscribes. */
  onEvent(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get running(): boolean {
    return !!this.child;
  }

  // ---------------------------------------------------------------------- commands

  /** Decode a file under `id`, replacing what it held. Voices already playing it finish. */
  load(id: string, path: string): void {
    this.sounds.set(id, path);
    // Loading is deliberate, so it shouldn't sit behind a long backoff.
    this.retryNow();
    if (this.child) this.send({ cmd: 'load', id, path });
    else this.start();
  }

  unload(id: string): void {
    this.sounds.delete(id);
    this.send({ cmd: 'unload', id });
  }

  /**
   * Starts a voice and returns its id. The id exists before the sidecar has seen anything, so
   * a `stop` right after this can't lose a race with it. Nothing stops a caller from stopping
   * a voice that already ended, the sidecar ignores those.
   */
  play(id: string, options: PlayOptions = {}): number {
    const voice = ++this.nextVoice;
    this.voices.add(voice);

    // No retryNow here: a rule firing every frame would turn the backoff into a spawn loop.
    if (!this.child && !this.respawnTimer) this.start();

    if (this.child) {
      this.send({ cmd: 'play', voice, id, gain: options.gain ?? 1, loop: !!options.loop });
    } else {
      // On a later tick, so the caller has the id before it hears the voice ended.
      queueMicrotask(() => this.endVoice(voice, 'sidecar_unavailable'));
    }
    return voice;
  }

  stop(voice: number): void {
    this.send({ cmd: 'stop', voice });
  }

  stopAll(): void {
    this.send({ cmd: 'stop_all' });
  }

  setGain(voice: number, gain: number): void {
    this.send({ cmd: 'set_gain', voice, gain });
  }

  /** 0 to 1. Mute is this at 0: volume, mute and cooldowns are the engine's business. */
  setMaster(gain: number): void {
    this.master = gain;
    this.send({ cmd: 'set_master', gain });
  }

  /** An id from `listDevices`, or "" to follow the Windows default. */
  setDevice(id: string): void {
    this.device = id;
    this.send({ cmd: 'set_device', id });
  }

  /** Empty if the sidecar can't be reached. */
  listDevices(): Promise<AudioDeviceList> {
    this.retryNow();
    if (!this.child) this.start();
    if (!this.child) return Promise.resolve(NO_DEVICES);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this.deviceRequests.indexOf(answer);
        if (index >= 0) this.deviceRequests.splice(index, 1);
        resolve(NO_DEVICES);
      }, LIST_TIMEOUT);
      timer.unref();

      const answer = (list: AudioDeviceList) => {
        clearTimeout(timer);
        resolve(list);
      };
      this.deviceRequests.push(answer);
      this.send({ cmd: 'list_devices' });
    });
  }

  /**
   * Stops the process and leaves nothing keeping the event loop alive. Final: this instance
   * won't start again.
   */
  shutdown(): Promise<void> {
    this.closed = true;
    this.clearRespawn();

    const child = this.child;
    if (!child) return Promise.resolve();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, QUIT_TIMEOUT);
      child.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      this.send({ cmd: 'quit' });
      child.stdin?.end();
    });
  }

  // --------------------------------------------------------------------- lifecycle

  private start(): void {
    if (this.child || this.closed) return;

    if (!fs.existsSync(this.exePath)) {
      this.dispatch({ type: 'error', message: `advosc-audio.exe not found at: ${this.exePath}` });
      return;
    }

    // Every stdio is a pipe, so windowsHide gets the console window suppressed altogether.
    const child = spawn(this.exePath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    this.lineBuffer = '';
    this.startedAt = Date.now();

    // A write can land just after the process died, and an unhandled stream error would take
    // the whole engine with it.
    child.stdin?.on('error', () => {});

    // Device names aren't ASCII ("Hoparlör"), and a chunk can end in the middle of a character.
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (data: string) => {
      if (this.child === child) this.receive(data);
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (data: string) => this.log(data.trim()));

    // A failed spawn gives `error` and may never give `close`, so both end up in onExit.
    child.on('error', (err) => {
      this.dispatch({ type: 'error', message: err.message });
      this.onExit(child, null, null);
    });
    child.on('close', (code, signal) => this.onExit(child, code, signal));

    if (this.master !== null) this.send({ cmd: 'set_master', gain: this.master });
    if (this.device !== null) this.send({ cmd: 'set_device', id: this.device });
    for (const [id, path] of this.sounds) this.send({ cmd: 'load', id, path });
  }

  private onExit(child: ChildProcess, code: number | null, signal: string | null): void {
    if (this.child !== child) return;
    this.child = null;

    if (Date.now() - this.startedAt >= STABLE_UPTIME) this.respawnAttempts = 0;

    for (const answer of this.deviceRequests.splice(0)) answer(NO_DEVICES);
    for (const voice of [...this.voices]) this.endVoice(voice, 'sidecar_exit');
    this.dispatch({ type: 'sidecar_exit', code, signal });

    // With nothing loaded there's nothing to come back for. The next command starts it.
    if (this.closed || this.sounds.size === 0 || this.respawnTimer) return;

    const delay = Math.min(RESPAWN_DELAY * 2 ** this.respawnAttempts, RESPAWN_DELAY_MAX);
    this.respawnAttempts++;
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = null;
      this.start();
    }, delay);
    this.respawnTimer.unref();
  }

  private clearRespawn(): void {
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
  }

  private retryNow(): void {
    this.clearRespawn();
    this.respawnAttempts = 0;
  }

  // ------------------------------------------------------------------------- wiring

  private send(command: AudioCommand): void {
    if (!this.child?.stdin?.writable) return;
    this.child.stdin.write(JSON.stringify(command) + '\n');
  }

  private receive(data: string): void {
    this.lineBuffer += data;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.handleEvent(JSON.parse(trimmed));
      } catch (err) {
        this.log(`Failed to parse event: ${err} Line: ${trimmed}`);
      }
    }
  }

  private handleEvent(event: AudioEvent): void {
    if (event.type === 'voice_ended') {
      this.voices.delete(event.voice);
    } else if (event.type === 'devices') {
      this.deviceRequests.shift()?.({
        devices: event.devices,
        default_id: event.default_id,
        current_id: event.current_id,
      });
    }
    this.dispatch(event);
  }

  private endVoice(voice: number, reason: VoiceEndReason): void {
    if (!this.voices.delete(voice)) return;
    this.dispatch({ type: 'voice_ended', voice, reason, frames: 0 });
  }

  private dispatch(event: AudioEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        // One bad listener shouldn't cost the others this event.
        this.log(`Audio listener failed: ${err}`);
      }
    }
  }
}
