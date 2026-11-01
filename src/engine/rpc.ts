import type { ChatboxModule } from "$shared/chatbox/module-base";
import { automations } from "./automations";
import { chatbox } from "./chatbox";
import { searchLocations } from "./chatbox/modules/weather/open-meteo";
import { chatboxPresets } from "./chatbox/presets";
import { native } from "./native";
import { backupApi } from "./persistence/backup-api";
import { soundEffects } from "./sound-effects/rpc";
import { handle, handleAll } from "./sync/hub";
import { avatarOSC, avatarProfiles, avatarScale } from "./vrc-osc";

/**
 * What a window can ask the engine to do. Reads go through synced and mirrored stores, and
 * pure edits happen on synced stores in the renderer, so this is only what needs engine state
 * or has to run here.
 */

/** Allowlist, since the method name comes from a window. */
const moduleMethods: Record<string, string[]> = {
  Hotkey: ["setHotkey", "removeHotkey"],
  Stopwatch: ["startStopwatch", "pauseStopwatch", "resetStopwatch", "stopStopwatch"],
  OVRTrackers: ["getTrackers"],
  HeartRate: ["keepAlive"],
  Request: ["keepAlive", "refresh", "testSource"],
  Speech: ["startServer", "stopServer", "openPage", "setListening", "clearTranscript", "translateText"],
  Weather: ["getStatus", "invalidateCache", "getPlaceholderValue"],
};

export function registerRpc() {
  handle("module.call", (id: string, method: string, args: unknown[] = []) => {
    if (!moduleMethods[id]?.includes(method)) throw new Error(`Not callable: ${id}.${method}`);
    const module = chatbox.modules.get(id) as (ChatboxModule & Record<string, any>) | undefined;
    if (!module) throw new Error(`Unknown module: ${id}`);
    return module[method](...args);
  });

  // Runs anything a module declares in `options.inputs`, so a new input needs no change here.
  handle("module.input", (id: string, inputId: string, args?: Record<string, string>) =>
    chatbox.runModuleInput(id, inputId, args),
  );

  handleAll("automations", automations);
  handleAll("backup", backupApi);

  handleAll("chatbox", {
    fillTemplate: chatbox.fillTemplate,
    getAllValues: chatbox.getAllValues,
    setAllValues: (values) => {
      chatbox.setAllValues(values, { automations: "replace" });
      chatbox.updatePlaceholders();
    },
  });

  handle("weather.searchLocations", (query: string, count?: number) => searchLocations(query, count));

  handleAll("presets", chatboxPresets);

  handleAll("avatarOSC", {
    sendParameter: avatarOSC.sendParameter,
    setParameter: avatarOSC.setParameter,
    setAllParameters: avatarOSC.setAllParameters,
    lockParameter: avatarOSC.lockParameter,
    unlockParameter: avatarOSC.unlockParameter,
    unlockAll: avatarOSC.unlockAll,
    sendRaw: avatarOSC.sendRaw,
    animate: avatarOSC.animate,
    stopAnimation: avatarOSC.stopAnimation,
    stopAllAnimations: avatarOSC.stopAllAnimations,
    updateOSCSchema: avatarOSC.updateOSCSchema,
  });

  handleAll("avatarProfiles", {
    saveCurrentProfile: avatarProfiles.saveCurrentProfile,
    loadProfile: avatarProfiles.loadProfile,
  });

  handleAll("avatarScale", {
    setHeight: (value: number, persist?: boolean) => avatarScale.setHeight(value, persist),
    reapply: () => avatarScale.reapply(),
  });

  handleAll("sound", soundEffects);

  handleAll("osc", {
    getSources: native.osc.getSources,
    getDefaultSources: native.osc.getDefaultSources,
    getStatus: native.osc.getStatus,
    setSources: native.osc.setSources,
    resetSources: native.osc.resetSources,
  });

  handleAll("ble", {
    scan: native.ble.scan,
    stopScan: native.ble.stopScan,
    connect: native.ble.connect,
    disconnect: native.ble.disconnect,
    getState: native.ble.getState,
  });
}
