import "./runtime/globals";
import { engineConfig } from "./runtime/config";
import { installLogging } from "./runtime/log";
import { announceReady, setClientHandler, startHost } from "./runtime/host";
import { addClient, markReady } from "./sync/hub";

installLogging();
console.log(
  `Engine starting: version ${engineConfig.version}, pid ${process.pid}${engineConfig.safeMode ? ", safe mode" : ""}`,
);

setClientHandler(addClient);
startHost();

markReady();
announceReady();
console.log("Engine ready.");
