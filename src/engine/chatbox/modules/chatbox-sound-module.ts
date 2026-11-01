import { moduleValues } from "../module-values";
import { soundOptions } from "$shared/chatbox/modules/sound";
import { get } from "$shared/store";
import { chatbox } from "..";
import { AppModule, type PlaceholdersRecord } from "$shared/chatbox/module-base";
import { isTruthy, soundEngine } from "../../sound-effects/engine";
import { isReadOnly } from "../eval-context";

/** Placeholders that act. The rest only read, so they work the same in a read-only evaluation. */
const ACTIONS = new Set(["Play", "Loop", "Stop", "StopAll", "Volume"]);

/**
 * An occurrence counts as still "on" if it was rendered with a true condition this recently.
 * Longer than the 2.2 s chatbox render interval, so a placeholder that stays in the
 * template doesn't re-fire, but one that drops out and comes back does.
 */
const ACTIVE_WINDOW_MS = 5000;

export class SoundModule extends AppModule {
  private edges = new Map<string, { lastSeen: number; lastCond: boolean }>();
  /** Looping playbacks started by `Loop` placeholders, per occurrence. */
  private loops = new Map<string, { voice: number | null; lastSeen: number }>();

  constructor() {
    super(soundOptions, moduleValues("Sound"));

    let ready = false;
    soundEngine.sounds.subscribe(() => {
      if (ready) chatbox.updatePlaceholders();
    });
    ready = true;

    setInterval(() => {
      const cutoff = Date.now() - 60_000;
      for (const [key, edge] of this.edges) if (edge.lastSeen < cutoff) this.edges.delete(key);
    }, 30_000);

    // A Loop placeholder that stopped being rendered (its branch went away) stops its sound.
    setInterval(() => {
      const cutoff = Date.now() - ACTIVE_WINDOW_MS;
      for (const [key, loop] of this.loops) if (loop.lastSeen < cutoff) this.stopLoop(key);
    }, 1000);
  }

  private stopLoop(key: string) {
    const loop = this.loops.get(key);
    if (!loop) return;
    this.loops.delete(key);
    if (loop.voice !== null) soundEngine.stopVoice(loop.voice);
  }

  private startLoop(key: string, name: string) {
    this.stopLoop(key);
    const entry = { voice: null as number | null, lastSeen: Date.now() };
    this.loops.set(key, entry);
    soundEngine.play(name, { loop: true }).then((voice) => {
      if (voice === null) return;
      // Stopped or restarted while the file was loading.
      if (this.loops.get(key) !== entry) soundEngine.stopVoice(voice);
      else entry.voice = voice;
    });
  }

  /** True once per false-to-true change of `cond` for this placeholder occurrence. */
  private shouldFire(key: string, cond: boolean): boolean {
    const now = Date.now();
    const edge = this.edges.get(key);
    const wasActive = !!edge && edge.lastCond && now - edge.lastSeen < ACTIVE_WINDOW_MS;
    this.edges.set(key, { lastSeen: now, lastCond: cond });
    return cond && !wasActive;
  }

  async getPlaceholderValue(action: string, ...params: string[]): Promise<string> {
    const key = chatbox.getInstanceKey();
    [action, ...params] = await chatbox.fillTemplates([action ?? "", ...params], "[[:]]", false, key);

    // Returns before `shouldFire` too: a preview mustn't use up the edge the real render needs.
    if (isReadOnly() && ACTIONS.has(action)) return "";

    const condAt = (i: number) => (params.length > i ? isTruthy(params[i]) : true);

    switch (action) {
      case "Play":
        if (params[0] && this.shouldFire(key, condAt(1))) soundEngine.play(params[0]);
        return "";
      case "Loop": {
        const cond = condAt(1);
        const fire = this.shouldFire(key, cond);
        if (!cond || !params[0]) {
          this.stopLoop(key);
          return "";
        }
        const loop = this.loops.get(key);
        if (loop) loop.lastSeen = Date.now();
        if (fire) this.startLoop(key, params[0]);
        return "";
      }
      case "Stop":
        if (params[0] && this.shouldFire(key, condAt(1))) soundEngine.stop(params[0]);
        return "";
      case "StopAll":
        if (this.shouldFire(key, condAt(0))) soundEngine.stopAll();
        return "";
      case "Volume":
        if (this.shouldFire(key, condAt(1))) soundEngine.setMasterVolume(parseFloat(params[0]));
        return "";
      case "IsPlaying":
        return soundEngine.isPlaying(params[0] ?? "") ? "true" : "false";
      case "Playing":
        return soundEngine.playingNames().join(", ");
      default:
        return "";
    }
  }

  runInput(inputId: string, args: Record<string, string>) {
    switch (inputId) {
      case "play":
        void soundEngine.play(args.sound ?? "");
        return;
      case "stop":
        soundEngine.stop(args.sound ?? "");
        return;
      case "stopAll":
        soundEngine.stopAll();
        return;
      case "volume":
        soundEngine.setMasterVolume(parseFloat(args.volume ?? ""));
        return;
      default:
        return super.runInput(inputId, args);
    }
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const placeholders: PlaceholdersRecord = {};
    for (const sound of get(soundEngine.sounds)) {
      const name = sound.name.replace(/\\/g, "\\\\").replace(/;/g, "\\;");
      placeholders[`Play;${sound.name}`] = {
        value: "",
        description: `Plays "${sound.name}".`,
        fillText: `Sound;Play;${name}`
      };
    }
    return placeholders;
  }

  getCleanValues(): Record<string, any> {
    return {};
  }
}

