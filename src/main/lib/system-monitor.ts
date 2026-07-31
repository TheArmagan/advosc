import * as path from 'path';
import * as fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import type { SystemInfo, SystemInfoResponse } from '../preload';

const SAMPLE_INTERVAL = 2000;
/** Stop the helper when nothing has asked for a snapshot in this long. */
const IDLE_TIMEOUT = 30000;

let monitorProcess: ChildProcess | null = null;
let latest: SystemInfo | null = null;
let lastError: string | undefined;
let lastRequested = 0;
let idleTimer: NodeJS.Timeout | null = null;

function getUtilsExePath(): string {
  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';
  return isDev
    ? path.join(__dirname, '..', 'natives', 'advosc-utils.exe')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'natives', 'advosc-utils.exe');
}

function startMonitor(): void {
  if (monitorProcess) return;

  const exePath = getUtilsExePath();
  if (!fs.existsSync(exePath)) {
    lastError = 'advosc-utils.exe not found at: ' + exePath;
    return;
  }

  monitorProcess = spawn(exePath, ['system-monitor', '--interval', String(SAMPLE_INTERVAL)]);
  let buffer = '';

  monitorProcess.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        latest = JSON.parse(trimmed) as SystemInfo;
        lastError = undefined;
      } catch (err) {
        console.error('Failed to parse system info:', err, 'Line:', trimmed);
      }
    }
  });

  monitorProcess.stderr?.on('data', (data: Buffer) => {
    lastError = data.toString().trim();
    console.error('System monitor error:', lastError);
  });

  monitorProcess.on('error', (err) => {
    lastError = err.message;
    monitorProcess = null;
  });

  monitorProcess.on('close', () => {
    monitorProcess = null;
  });
}

export function stopSystemMonitor(): void {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  if (monitorProcess) {
    monitorProcess.kill();
    monitorProcess = null;
  }
  latest = null;
}

/**
 * Returns the most recent sample, starting the helper on first use. The helper
 * only lives while something keeps asking, so templates that never touch the
 * System module cost nothing.
 */
export function getSystemInfo(): SystemInfoResponse {
  lastRequested = Date.now();
  startMonitor();

  if (!idleTimer) {
    idleTimer = setInterval(() => {
      if (Date.now() - lastRequested > IDLE_TIMEOUT) {
        stopSystemMonitor();
      }
    }, IDLE_TIMEOUT);
  }

  // The first sample only arrives one interval after spawning.
  if (!latest) {
    return { info: null, error: lastError ?? 'System info is not sampled yet' };
  }

  return { info: latest, error: lastError };
}
