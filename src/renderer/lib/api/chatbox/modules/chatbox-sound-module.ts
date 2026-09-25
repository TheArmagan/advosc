import { get } from "svelte/store";
import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
import { isTruthy, soundEngine } from "../../sound-effects/engine";

/**
 * An occurrence counts as still "on" if it was rendered with a true condition this recently.
 * Longer than the 2.2 s chatbox render interval, so a placeholder that stays in the
 * template doesn't re-fire, but one that drops out and comes back does.
 */
const ACTIVE_WINDOW_MS = 5000;

export class ChatboxSoundModule extends ChatboxModule {
  private edges = new Map<string, { lastSeen: number; lastCond: boolean }>();
  /** Looping playbacks started by `Loop` placeholders, per occurrence. */
  private loops = new Map<string, { voice: number | null; lastSeen: number }>();

  constructor() {
    super({
      id: "Sound",
      name: "Sound",
      description: "Plays sounds from your Sound Effects library. Actions fire once when the condition turns true (or once when the placeholder shows up if there's no condition) and render as nothing.",
      examplePlaceholders: {
        "Play;SoundName;Condition": {
          value: "",
          description: "Plays a sound once when the optional condition turns true.",
          fillText: "Sound;Play;${1:soundName};${2:[[OSCData:/avatar/parameters/Booped]]}"
        },
        "Loop;SoundName;Condition": {
          value: "",
          description: "Loops a sound while the condition is true and stops it when the condition turns false or the placeholder goes away.",
          fillText: "Sound;Loop;${1:soundName};${2:[[OSCData:/avatar/parameters/Booped]]}"
        },
        "Stop;SoundName;Condition": {
          value: "",
          description: "Stops every playing copy of a sound when the optional condition turns true.",
          fillText: "Sound;Stop;${1:soundName};${2:condition}"
        },
        "StopAll;Condition": {
          value: "",
          description: "Stops every playing sound when the optional condition turns true.",
          fillText: "Sound;StopAll;${1:condition}"
        },
        "Volume;0-100;Condition": {
          value: "",
          description: "Sets the master volume when the optional condition turns true.",
          fillText: "Sound;Volume;${1:50};${2:condition}"
        },
        "IsPlaying;SoundName": {
          value: "false",
          description: "Returns 'true' while the sound is playing, 'false' otherwise.",
          fillText: "Sound;IsPlaying;${1:soundName}"
        },
        "Playing": {
          value: "boop, vine boom",
          description: "Names of the sounds playing right now, separated by commas.",
          fillText: "Sound;Playing"
        },
      }
    });

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

