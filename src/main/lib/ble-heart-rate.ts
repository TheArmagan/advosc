import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import type { BleDeviceState, BleEvent, BleScanResult, BleState } from '../preload';

/** Stop the sidecar when nothing has wanted a device or a scan in this long. */
const IDLE_TIMEOUT = 60000;
/** How long a device can go without a packet before it counts as stale. */
const STALE_TIMEOUT = 5000;
/** First wait before respawning after the sidecar dies with devices still wanted. */
const RESPAWN_DELAY = 3000;
/** Ceiling for the respawn backoff, so Bluetooth being off is not a spawn storm. */
const RESPAWN_DELAY_MAX = 60000;

let sidecar: ChildProcess | null = null;
let adapterName: string | null = null;
let lastError: string | undefined;
let scanning = false;
let lastActivity = 0;
let idleTimer: NodeJS.Timeout | null = null;
let respawnTimer: NodeJS.Timeout | null = null;
let respawnAttempts = 0;
let stopped = false;

/** Addresses the renderer wants connected. Replayed whenever the sidecar restarts. */
const wanted = new Set<string>();
const devices = new Map<string, BleDeviceState>();
const scanResults = new Map<string, BleScanResult>();

function getUtilsExePath(): string {
  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';
  return isDev
    ? path.join(__dirname, '..', 'natives', 'advosc-utils.exe')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'natives', 'advosc-utils.exe');
}

function broadcast(event: BleEvent): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('ble:event', event));
}

function getDevice(address: string): BleDeviceState {
  let state = devices.get(address);
  if (!state) {
    state = { address, connected: false, connecting: false };
    devices.set(address, state);
  }
  return state;
}

function send(command: Record<string, unknown>): void {
  if (!sidecar?.stdin?.writable) return;
  sidecar.stdin.write(JSON.stringify(command) + '\n');
}

// ------------------------------------------------------------------ lifecycle

/** A deliberate scan or connect should not sit behind a long respawn backoff. */
function retryNow(): void {
  if (respawnTimer) {
    clearTimeout(respawnTimer);
    respawnTimer = null;
  }
  respawnAttempts = 0;
}

function ensureSidecar(): void {
  lastActivity = Date.now();
  startIdleTimer();
  if (sidecar) return;

  const exePath = getUtilsExePath();
  if (!fs.existsSync(exePath)) {
    lastError = 'advosc-utils.exe not found at: ' + exePath;
    return;
  }

  stopped = false;
  sidecar = spawn(exePath, ['ble-hr']);
  let buffer = '';

  sidecar.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleEvent(JSON.parse(trimmed));
      } catch (err) {
        console.error('Failed to parse BLE event:', err, 'Line:', trimmed);
      }
    }
  });

  sidecar.stderr?.on('data', (data: Buffer) => {
    console.error('BLE heart rate error:', data.toString().trim());
  });

  sidecar.on('error', (err) => {
    lastError = err.message;
    sidecar = null;
  });

  sidecar.on('close', () => {
    sidecar = null;
    adapterName = null;
    scanning = false;
    // The sidecar owned every GATT link, so nothing is connected any more.
    for (const state of devices.values()) {
      state.connected = false;
      state.connecting = false;
    }
    broadcast({ type: 'state', state: getBleState() });

    // Only come back if something still wants a device. A sidecar we stopped on
    // purpose, or one with nothing to do, stays down. The backoff matters because
    // with Bluetooth turned off the sidecar exits the moment it starts, and a flat
    // retry would respawn a process every few seconds for as long as the app runs.
    if (!stopped && wanted.size > 0 && !respawnTimer) {
      const delay = Math.min(RESPAWN_DELAY * 2 ** respawnAttempts, RESPAWN_DELAY_MAX);
      respawnAttempts++;
      respawnTimer = setTimeout(() => {
        respawnTimer = null;
        if (wanted.size > 0) ensureSidecar();
      }, delay);
    }
  });

  // Replay the wanted set so a restart reconnects everything by itself.
  for (const address of wanted) send({ cmd: 'connect', address });
}

function startIdleTimer(): void {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    if (wanted.size > 0 || scanning) {
      lastActivity = Date.now();
      return;
    }
    if (Date.now() - lastActivity > IDLE_TIMEOUT) stopBleHeartRate();
  }, IDLE_TIMEOUT / 2);
}

export function stopBleHeartRate(): void {
  stopped = true;
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  if (respawnTimer) {
    clearTimeout(respawnTimer);
    respawnTimer = null;
  }
  if (sidecar) {
    send({ cmd: 'quit' });
    sidecar.stdin?.end();
    sidecar.kill();
    sidecar = null;
  }
  scanning = false;
  adapterName = null;
  for (const state of devices.values()) {
    state.connected = false;
    state.connecting = false;
  }
}

// --------------------------------------------------------------------- events

function handleEvent(event: any): void {
  switch (event.type) {
    case 'ready':
      adapterName = event.adapter;
      lastError = undefined;
      // The adapter answered, so whatever made the last sidecar die is over.
      respawnAttempts = 0;
      break;

    case 'scan_started':
      scanning = true;
      scanResults.clear();
      break;

    case 'scan_stopped':
      scanning = false;
      break;

    case 'scan_result': {
      const previous = scanResults.get(event.address);
      scanResults.set(event.address, {
        address: event.address,
        // A device's first advertisement often has no name, so keep the one we have.
        name: event.name ?? previous?.name ?? null,
        rssi: event.rssi ?? null,
        hrService: !!event.hr_service || !!previous?.hrService,
      });
      break;
    }

    case 'connecting': {
      const state = getDevice(event.address);
      state.connecting = true;
      state.connected = false;
      break;
    }

    case 'connected': {
      const state = getDevice(event.address);
      state.connecting = false;
      state.connected = true;
      state.name = event.name ?? state.name;
      state.sensorLocation = event.sensor_location ?? state.sensorLocation;
      state.error = undefined;
      break;
    }

    case 'hr': {
      const state = getDevice(event.address);
      state.connected = true;
      state.connecting = false;
      state.bpm = event.bpm;
      state.contact = event.contact ?? null;
      state.rrIntervalsMs = event.rr_ms ?? [];
      state.lastPacketAt = event.ts ?? Date.now();
      state.error = undefined;
      break;
    }

    case 'battery': {
      const state = getDevice(event.address);
      state.battery = event.percent;
      break;
    }

    case 'disconnected': {
      const state = getDevice(event.address);
      state.connected = false;
      state.connecting = false;
      break;
    }

    case 'error': {
      if (event.address) {
        const state = getDevice(event.address);
        state.connected = false;
        state.connecting = false;
        state.error = event.message;
      } else {
        lastError = event.message;
      }
      break;
    }
  }

  broadcast(event as BleEvent);
  broadcast({ type: 'state', state: getBleState() });
}

// ------------------------------------------------------------------------ api

export function getBleState(): BleState {
  const now = Date.now();
  return {
    running: !!sidecar,
    adapter: adapterName,
    scanning,
    error: lastError,
    devices: [...devices.values()].map((state) => ({
      ...state,
      // Connected but silent is a different failure from disconnected, and the
      // user needs to be able to tell them apart.
      active: state.connected && !!state.lastPacketAt && now - state.lastPacketAt < STALE_TIMEOUT,
    })),
    scanResults: [...scanResults.values()],
  };
}

export function startBleScan(options: { seconds?: number; all?: boolean } = {}): BleState {
  retryNow();
  ensureSidecar();
  scanResults.clear();
  send({ cmd: 'scan', seconds: options.seconds ?? 12, all: !!options.all });
  return getBleState();
}

export function stopBleScan(): BleState {
  send({ cmd: 'stop_scan' });
  scanning = false;
  return getBleState();
}

export function connectBleDevice(address: string): BleState {
  const normalized = address.trim().toUpperCase();
  if (!normalized) return getBleState();
  const isNew = !wanted.has(normalized);
  wanted.add(normalized);
  const state = getDevice(normalized);
  state.connecting = true;
  if (isNew) retryNow();
  ensureSidecar();
  send({ cmd: 'connect', address: normalized });
  return getBleState();
}

export function disconnectBleDevice(address: string): BleState {
  const normalized = address.trim().toUpperCase();
  wanted.delete(normalized);
  send({ cmd: 'disconnect', address: normalized });
  devices.delete(normalized);
  return getBleState();
}
