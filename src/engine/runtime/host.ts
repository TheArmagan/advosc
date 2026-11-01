import type { MessagePortMain } from "electron";
import type {
  EngineToMain,
  HostMethodName,
  HostMethods,
  MainToEngine,
} from "$shared/engine-protocol";
import { engineConfig } from "./config";

/**
 * Everything the engine says to main. Main is the only process with Tray, globalShortcut,
 * dialog and shell, so those go through `hostCall`.
 */

const parent = process.parentPort;

const HEARTBEAT_CHECK_MS = 1000;
/** With no heartbeat for this long, main is gone or hung, so stop and exit. */
const MAIN_LOST_MS = 5000;
/** A gap this large means this process itself was asleep, not that main went quiet. */
const OWN_STALL_MS = 2000;

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

const pending = new Map<number, Pending>();
let nextCallId = 1;
let lastHeard = Date.now();
let outputsActive = false;

type ClientHandler = (id: number, port: MessagePortMain) => void;
let onClient: ClientHandler = () => {};
const shortcutHandlers = new Set<(id: string) => void>();
const shutdownHooks: (() => void | Promise<void>)[] = [];
let shutdownStarted = false;

export type ToyHostMessage = Extract<MainToEngine, { t: "panic" | "rearm" | "toys-stop" }>;
let onToyMessage: ((message: ToyHostMessage) => void) | null = null;
/** Main can panic during boot. Nothing is running yet, so it's answered and replayed later. */
const earlyToyMessages: ToyHostMessage[] = [];

function send(message: EngineToMain) {
  parent.postMessage(message);
}

export function hostCall<M extends HostMethodName>(
  method: M,
  ...args: Parameters<HostMethods[M]>
): Promise<ReturnType<HostMethods[M]>> {
  return new Promise((resolve, reject) => {
    const id = nextCallId++;
    pending.set(id, { resolve, reject });
    send({ t: "call", id, m: method, a: args });
  });
}

export function setClientHandler(handler: ClientHandler) {
  onClient = handler;
}

export function onHostShortcut(handler: (id: string) => void) {
  shortcutHandlers.add(handler);
}

export function setToyHostHandler(handler: (message: ToyHostMessage) => void) {
  onToyMessage = handler;
  for (const message of earlyToyMessages.splice(0)) handler(message);
}

export function ackPanic(id: number) {
  send({ t: "panic-ack", id });
}

/**
 * Tells main that something is actively driving a device, which shortens how long it will
 * wait on a hung engine before killing it.
 */
export function setOutputsActive(active: boolean) {
  outputsActive = active;
}

/** Runs during a clean shutdown, last registered first, so services stop in reverse start order. */
export function onShutdown(hook: () => void | Promise<void>) {
  shutdownHooks.unshift(hook);
}

async function runShutdownHooks() {
  if (shutdownStarted) return;
  shutdownStarted = true;
  for (const hook of shutdownHooks) {
    try {
      await hook();
    } catch (error) {
      console.error("Shutdown hook failed:", error);
    }
  }
}

function handleMessage(message: MainToEngine, ports: MessagePortMain[]) {
  switch (message.t) {
    case "client":
      onClient(message.id, ports[0]);
      break;
    case "hb":
      lastHeard = Date.now();
      send({ t: "hb", at: message.at, active: outputsActive });
      break;
    case "res": {
      const call = pending.get(message.id);
      if (!call) break;
      pending.delete(message.id);
      if (message.ok) call.resolve(message.v);
      else call.reject(new Error(message.e || "Host call failed"));
      break;
    }
    case "shortcut":
      for (const handler of shortcutHandlers) handler(message.id);
      break;
    case "panic":
    case "rearm":
    case "toys-stop":
      if (onToyMessage) {
        onToyMessage(message);
      } else {
        earlyToyMessages.push(message);
        if (message.t === "panic") ackPanic(message.id);
      }
      break;
    case "shutdown":
      void runShutdownHooks().finally(() => {
        console.log("Engine shut down cleanly.");
        send({ t: "shutdown-done" });
      });
      break;
  }
}

export function startHost() {
  parent.on("message", (event) => {
    handleMessage(event.data as MainToEngine, event.ports as MessagePortMain[]);
  });

  // Main owns the panic latch and the failsafes, so an engine without it has nothing
  // watching it. Dev skips this so a debugger pause in main doesn't kill the engine.
  if (engineConfig.isDev) return;

  let lastCheck = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (now - lastCheck > OWN_STALL_MS) lastHeard = now;
    lastCheck = now;

    if (now - lastHeard < MAIN_LOST_MS) return;
    console.error("No heartbeat from main, shutting down.");
    void runShutdownHooks().finally(() => process.exit(1));
  }, HEARTBEAT_CHECK_MS);
}

export function announceReady() {
  send({ t: "ready" });
}
