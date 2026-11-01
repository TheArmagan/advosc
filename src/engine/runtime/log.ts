import * as fs from "fs";
import * as path from "path";
import { format } from "util";
import { engineConfig } from "./config";

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LINE_LENGTH = 2000;

const logPath = path.join(engineConfig.logDir, engineConfig.isDev ? "engine-dev.log" : "engine.log");

function rotateIfLarge() {
  try {
    if (fs.statSync(logPath).size > MAX_LOG_BYTES) fs.renameSync(logPath, `${logPath}.1`);
  } catch {
    // No log yet, or it's busy. Either way, keep appending.
  }
}

function write(level: string, args: unknown[]) {
  const line = `${new Date().toISOString()} [${level}] ${format(...args)}`.slice(0, MAX_LINE_LENGTH);
  try {
    fs.appendFileSync(logPath, line + "\n", "utf-8");
  } catch {
    // Logging must never be the thing that takes the engine down.
  }
}

/** Sends everything the engine prints to userData/logs as well as stdout, which main forwards in dev. */
function installLogging() {
  fs.mkdirSync(engineConfig.logDir, { recursive: true });
  rotateIfLarge();

  for (const [method, level] of [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      write(level, args);
      original(...args);
    };
  }

  // A renderer shrugs these off and logs them. Node's default is to exit, so without these
  // one forgotten `.catch` in a module would stop the chatbox.
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
  });

  setInterval(rotateIfLarge, 60 * 60 * 1000).unref();
}

// On import, because loading settings happens during imports and can have something to say.
installLogging();
