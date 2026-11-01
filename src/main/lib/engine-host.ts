import {
  app,
  MessageChannelMain,
  powerMonitor,
  utilityProcess,
  type UtilityProcess,
  type WebContents,
} from 'electron';
import * as path from 'path';
import {
  ENGINE_CONFIG_ENV,
  type EngineConfig,
  type EngineToMain,
  type MainToEngine,
} from '../../shared/engine-protocol';
import { isDev, nativesDir, resolveDataDir } from './paths';
import { handleHostCall, resetHostState } from './host-api';
import { getBootstrap } from './bootstrap';
import { directStop, isPanicLatched, markToyOutputStopped } from './panic';

const HEARTBEAT_MS = 500;
/** How long a hung engine gets. Short while it's driving something, so toys can't run away. */
const HANG_LIMIT_ACTIVE_MS = 3000;
const HANG_LIMIT_IDLE_MS = 10000;
/** A cold start reads the whole data file before it can answer, so give it room. */
const BOOT_LIMIT_MS = 30000;
/** Timers stall across sleep, so don't read the silence after a resume as a hang. */
const RESUME_GRACE_MS = 15000;
/** A gap this large means main itself stalled, not the engine. */
const OWN_STALL_MS = 2000;

const RESPAWN_DELAY_MS = 500;
const CRASH_WINDOW_MS = 60000;
const CRASH_LIMIT = 5;

/** Longest a clean quit waits for the engine to stop toys and flush. */
export const SHUTDOWN_TIMEOUT_MS = 2500;
/** An engine that can't confirm a panic this fast is treated as hung and killed. */
const PANIC_ACK_MS = 300;

let child: UtilityProcess | null = null;
/** Any engine after the first replaces one that died. */
let spawnCount = 0;
let nextPanicId = 1;
const pendingPanics = new Map<number, () => void>();
/** The direct Stop from the last engine exit, so a respawn or a quit can wait for it. */
let exitStop: Promise<void> = Promise.resolve();
let stopping = false;
let safeMode = false;
let answered = false;
let outputsActive = false;
let lastPong = 0;
let spawnedAt = 0;
let graceUntil = 0;
let lastBeat = 0;
let heartbeat: NodeJS.Timeout | null = null;
let nextClientId = 1;
let exitTimes: number[] = [];
/** `clean` is true only when the engine itself said it finished. */
let shutdownDone: ((clean: boolean) => void) | null = null;

const windows = new Set<WebContents>();
const safeModeListeners = new Set<(active: boolean) => void>();

function post(message: MainToEngine, ports?: Electron.MessagePortMain[]) {
  child?.postMessage(message, ports);
}

function buildConfig(): EngineConfig {
  return {
    userData: app.getPath('userData'),
    dataDir: resolveDataDir(),
    logDir: path.join(app.getPath('userData'), 'logs'),
    nativesDir: nativesDir(),
    isDev,
    safeMode,
    version: app.getVersion(),
    panicLatched: isPanicLatched(),
    // After the first spawn, this engine is replacing one that died. On the first spawn, the
    // saved flag says main itself went down with output running.
    toysMuted: spawnCount > 0 || getBootstrap().toyFailsafe.outputActive === true,
  };
}

/** Gives a window its own channel to the engine. Windows reconnect through here after a respawn. */
function connectWindow(contents: WebContents) {
  if (!child || contents.isDestroyed()) return;
  const { port1, port2 } = new MessageChannelMain();
  post({ t: 'client', id: nextClientId++ }, [port1]);
  contents.postMessage('engine:port', null, [port2]);
}

export function attachWindow(contents: WebContents) {
  if (!windows.has(contents)) {
    windows.add(contents);
    contents.once('destroyed', () => windows.delete(contents));
  }
  connectWindow(contents);
}

function checkHeartbeat() {
  const now = Date.now();
  if (now - lastBeat > OWN_STALL_MS) lastPong = now;
  lastBeat = now;

  post({ t: 'hb', at: now });

  if (isDev || now < graceUntil) return;

  if (!answered) {
    if (now - spawnedAt > BOOT_LIMIT_MS) {
      console.error('Engine never answered, killing it.');
      child?.kill();
    }
    return;
  }

  const limit = outputsActive ? HANG_LIMIT_ACTIVE_MS : HANG_LIMIT_IDLE_MS;
  if (now - lastPong > limit) {
    console.error(`Engine has not answered in ${now - lastPong} ms, killing it.`);
    child?.kill();
  }
}

function handleMessage(message: EngineToMain) {
  switch (message.t) {
    case 'ready':
      console.log('Engine ready.');
      break;
    case 'hb':
      answered = true;
      lastPong = Date.now();
      outputsActive = message.active;
      break;
    case 'call':
      void handleHostCall(message.m, message.a).then(
        (value) => post({ t: 'res', id: message.id, ok: true, v: value }),
        (error) => post({ t: 'res', id: message.id, ok: false, e: String(error?.message ?? error) }),
      );
      break;
    case 'shutdown-done':
      shutdownDone?.(true);
      break;
    case 'panic-ack':
      pendingPanics.get(message.id)?.();
      break;
  }
}

function setSafeMode(active: boolean) {
  if (safeMode === active) return;
  safeMode = active;
  for (const listener of safeModeListeners) listener(active);
}

export function onSafeModeChanged(listener: (active: boolean) => void) {
  safeModeListeners.add(listener);
}

export function isSafeMode() {
  return safeMode;
}

function handleExit(code: number) {
  child = null;
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  // `kill()` also reports code 0, so the code can't say whether this was on purpose. Only
  // `stopping` can. The shortcuts registered for this engine died with its callbacks.
  resetHostState();
  for (const settle of [...pendingPanics.values()]) settle();
  shutdownDone?.(false);
  if (stopping) return;

  // Whatever the engine was running is now nobody's. This is what ends it short of `timeSec`.
  exitStop = directStop();

  const now = Date.now();
  exitTimes = [...exitTimes.filter((time) => now - time < CRASH_WINDOW_MS), now];
  console.error(`Engine exited with code ${code} (${exitTimes.length} in the last minute).`);
  if (exitTimes.length > CRASH_LIMIT) setSafeMode(true);

  // The new engine isn't allowed to start until the old one's output is known to be stopped.
  const delay = new Promise((resolve) => setTimeout(resolve, RESPAWN_DELAY_MS));
  void Promise.all([delay, exitStop]).then(() => {
    if (!stopping) spawnEngine();
  });
}

function spawnEngine() {
  // Forked from the path inside the asar, because that's what can resolve the external
  // `chokidar`. The unpacked copy has no node_modules next to it.
  child = utilityProcess.fork(path.join(__dirname, 'engine.cjs'), [], {
    serviceName: 'ADVOSC Engine',
    stdio: 'pipe',
    env: { ...process.env, [ENGINE_CONFIG_ENV]: JSON.stringify(buildConfig()) },
  });
  spawnCount++;

  child.stdout?.on('data', (data: Buffer) => process.stdout.write(`[engine] ${data}`));
  child.stderr?.on('data', (data: Buffer) => process.stderr.write(`[engine] ${data}`));
  child.on('message', (message: EngineToMain) => handleMessage(message));
  child.once('exit', handleExit);

  answered = false;
  outputsActive = false;
  spawnedAt = lastBeat = lastPong = Date.now();
  heartbeat = setInterval(checkHeartbeat, HEARTBEAT_MS);

  for (const contents of windows) connectWindow(contents);
}

export function startEngine() {
  stopping = false;
  spawnEngine();

  powerMonitor.on('suspend', () => {
    graceUntil = Date.now() + RESUME_GRACE_MS;
    // Nothing can renew or stop anything once the PC is asleep.
    post({ t: 'toys-stop' });
    void directStop();
  });
  powerMonitor.on('resume', () => {
    graceUntil = Date.now() + RESUME_GRACE_MS;
  });
}

/** Lets a global shortcut press reach the engine. */
export function sendShortcutTriggered(id: string) {
  post({ t: 'shortcut', id });
}

/**
 * Tells the engine to latch and stop, and settles once it has answered or been killed for not
 * answering. A kill goes through `handleExit`, which sends the direct Stop and respawns with the
 * latch set, and that engine's one-shot is what reaches Intiface. Nothing to do when there's no
 * engine: the next one starts latched anyway.
 */
export function panicEngine(): Promise<void> {
  const engine = child;
  if (!engine) return Promise.resolve();

  const id = nextPanicId++;
  return new Promise((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      pendingPanics.delete(id);
      resolve();
    };
    const timer = setTimeout(() => {
      console.error('Engine did not confirm a panic, killing it.');
      settle();
      engine.kill();
    }, PANIC_ACK_MS);

    pendingPanics.set(id, settle);
    post({ t: 'panic', id });
  });
}

export function rearmEngine() {
  post({ t: 'rearm' });
}

/**
 * Asks the engine to stop toys and flush, makes sure it's gone, then sends a direct Stop of its
 * own. The app stays open until that's done. Safe to call once the engine is gone.
 */
export function stopEngine(): Promise<void> {
  stopping = true;
  const engine = child;
  if (!engine) return exitStop;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error('Engine did not finish shutting down in time, killing it.');
      finish(false);
    }, SHUTDOWN_TIMEOUT_MS);

    const finish = (clean: boolean) => {
      clearTimeout(timer);
      shutdownDone = null;
      engine.kill();
      // An engine that didn't finish may not have stopped Intiface, so the next start still has to.
      if (clean) markToyOutputStopped();
      void directStop().finally(resolve);
    };

    shutdownDone = finish;
    post({ t: 'shutdown' });
  });
}
