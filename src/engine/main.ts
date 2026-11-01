import "./runtime/globals";
import { engineConfig } from "./runtime/config";
import "./runtime/log";
import { announceReady, onShutdown, setClientHandler, startHost } from "./runtime/host";
import { startDailyBackups } from "./persistence/backups";
import { cacheData } from "./persistence/cache";
import { localData } from "./persistence/local-data";
import { addClient, markReady } from "./sync/hub";
import { startOSCPort } from "./native";
import { shortcuts } from "./shortcuts";
import { startAvatarOSC, startAvatarScale } from "./vrc-osc";
import { chatbox, startChatbox } from "./chatbox";
import type { ChatboxVarModule } from "./chatbox/modules/chatbox-var-module";
import { startOscForwarder } from "./osc-forwarder";
import { startSoundEffects } from "./sound-effects";
import { startAutomations } from "./automations";
import { registerRpc } from "./rpc";
import { startMediaMonitor, stopMediaMonitor } from "./services/media";
import { stopSystemMonitor } from "./services/system-monitor";
import { stopBleHeartRate } from "./services/ble-heart-rate";
import { stopSpeechServer } from "./services/speech-server";

async function boot() {
  const { safeMode, version } = engineConfig;
  console.log(`Engine starting: version ${version}, pid ${process.pid}${safeMode ? ", safe mode" : ""}`);

  setClientHandler(addClient);
  startHost();
  startDailyBackups();

  startOSCPort();
  await shortcuts.initialize();

  startAvatarOSC();
  startAvatarScale();
  startMediaMonitor();
  startChatbox({ safeMode });
  startOscForwarder({ safeMode });
  startSoundEffects();
  startAutomations({ safeMode });
  registerRpc();

  const flushData = () => {
    (chatbox.modules.get("Var") as ChatboxVarModule).persist();
    localData.flush();
    cacheData.flush();
  };

  // Hooks run last registered first. The flush runs at both ends: first so a stuck hook can't
  // lose settings, and last to catch anything the other hooks changed on the way out.
  onShutdown(flushData);
  onShutdown(() => {
    stopMediaMonitor();
    stopSystemMonitor();
    stopBleHeartRate();
  });
  onShutdown(async () => {
    await stopSpeechServer();
  });
  onShutdown(flushData);

  markReady();
  announceReady();
  console.log("Engine ready.");
}

boot().catch((error) => {
  console.error("Engine failed to start:", error);
  process.exit(1);
});
