/** Shapes of what the native services hand back. Used by the engine, preload and the renderer. */

export type WatchEventName = 'add' | 'change' | 'unlink';

export interface OSCIncomingMessage {
  address: string;
  args: (number | string | boolean | null | undefined)[];
  /** OSC type tag per arg ('i', 'f', 's', 'T', 'F', 'N'), parallel to `args`. */
  types?: string[];
}

export type MediaCommand ='skip-track' | 'previous-track' | 'toggle-play-pause' | 'pause' | 'resume';

export interface MediaInfo {
  title?: string;
  artist?: string;
  album?: string;
  playbackStatus: 'Playing' | 'Paused' | 'Stopped' | 'Unknown';
  position?: number;
  duration?: number;
  appName?: string;
  hasArtwork: boolean;
}

export interface TrackerBattery {
  deviceIndex: number;
  serialNumber: string | null;
  modelNumber: string | null;
  batteryLevel: number;
  isCharging: boolean;
  deviceClass: string;
}

export interface StartTimeResponse {
  startTime: number | null;
  error?: string;
}

export interface TrackerBatteryResponse {
  trackers: TrackerBattery[] | null;
  error?: string;
}

export interface SystemCpuInfo {
  name: string;
  vendor: string;
  /** Overall usage percentage (0-100). */
  usage: number;
  physicalCores: number | null;
  logicalCores: number;
  /** Current frequency in MHz. */
  frequency: number;
  perCoreUsage: number[];
  /** Celsius, when a readable sensor exists (rarely available on Windows). */
  temperature: number | null;
}

export interface SystemMemoryInfo {
  used: number;
  total: number;
  available: number;
  /** Used percentage (0-100). */
  usage: number;
  swapUsed: number;
  swapTotal: number;
  swapUsage: number;
}

export interface SystemGpuInfo {
  name: string;
  vendor: string;
  /** Utilization percentage (0-100), when it can be determined. */
  usage: number | null;
  vramUsed: number | null;
  vramTotal: number | null;
  vramUsage: number | null;
  /** Celsius. NVIDIA only. */
  temperature: number | null;
  /** Percentage. NVIDIA only. */
  fanSpeed: number | null;
  /** Watts. NVIDIA only. */
  power: number | null;
  /** MHz. NVIDIA only. */
  coreClock: number | null;
}

export interface SystemNetworkInterfaceInfo {
  name: string;
  /** Bytes per second. */
  upload: number;
  download: number;
  totalUploaded: number;
  totalDownloaded: number;
}

export interface SystemNetworkInfo {
  /** Bytes per second, summed over every interface. */
  upload: number;
  download: number;
  totalUploaded: number;
  totalDownloaded: number;
  interfaces: SystemNetworkInterfaceInfo[];
}

export interface SystemInfo {
  cpu: SystemCpuInfo;
  memory: SystemMemoryInfo;
  gpus: SystemGpuInfo[];
  network: SystemNetworkInfo;
  /** Seconds since boot. */
  uptime: number;
}

export interface SystemInfoResponse {
  info: SystemInfo | null;
  error?: string;
}

export interface BleScanResult {
  /** `AA:BB:CC:DD:EE:FF`. Stable per device, and what you connect with. */
  address: string;
  name: string | null;
  rssi: number | null;
  /** Whether the advertisement listed the 0x180D heart rate service. */
  hrService: boolean;
}

export interface BleDeviceState {
  address: string;
  connected: boolean;
  connecting: boolean;
  /** True while packets are still arriving. False means connected but silent. */
  active?: boolean;
  name?: string;
  /** Chest, Wrist, Finger and so on. Cosmetic, and often missing. */
  sensorLocation?: string;
  bpm?: number;
  /** Null when the device does not report skin contact at all. */
  contact?: boolean | null;
  rrIntervalsMs?: number[];
  battery?: number;
  lastPacketAt?: number;
  error?: string;
}

export interface BleState {
  /** Whether the sidecar process is alive. */
  running: boolean;
  adapter: string | null;
  scanning: boolean;
  error?: string;
  devices: BleDeviceState[];
  scanResults: BleScanResult[];
}

/** Raw sidecar events, plus a `state` snapshot emitted after each one. */
export type BleEvent =
  | { type: 'state'; state: BleState }
  | { type: 'ready'; adapter: string }
  | { type: 'scan_started' }
  | { type: 'scan_stopped' }
  | { type: 'scan_result'; address: string; name: string | null; rssi: number | null; hr_service: boolean }
  | { type: 'connecting'; address: string }
  | { type: 'connected'; address: string; name: string | null; sensor_location: string | null }
  | { type: 'hr'; address: string; bpm: number; contact: boolean | null; energy_kj?: number; rr_ms: number[]; ts: number }
  | { type: 'battery'; address: string; percent: number }
  | { type: 'disconnected'; address: string; reason: string }
  | { type: 'error'; address?: string; message: string };

export interface HttpRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Milliseconds before the request is aborted. */
  timeoutMs?: number;
}

export interface HttpRequestResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  /** Set when the request never produced a response (DNS, timeout, bad URL). */
  error?: string;
  durationMs: number;
  /** True when the body hit the size cap and was cut short. */
  truncated?: boolean;
}

export interface SpeechServerConfig {
  /** BCP-47 tag handed to the recognizer, e.g. "en-US". */
  language: string;
  interimResults: boolean;
  continuous: boolean;
  /** Whether the page should currently have the mic open. */
  listening: boolean;
  maxAlternatives: number;
}

export interface SpeechTranscript {
  sessionId: string;
  text: string;
  isFinal: boolean;
  confidence: number | null;
  language: string;
  at: number;
  /** Set when the page's Clear button wiped the transcript. */
  cleared?: boolean;
}

export interface SpeechPageStatus {
  sessionId?: string;
  listening: boolean;
  wantListening?: boolean;
  language?: string;
  /** False when the browser has no Web Speech API. */
  supported?: boolean;
  error?: string;
  closing?: boolean;
}

export interface SpeechServerState {
  running: boolean;
  port: number | null;
  url: string | null;
  /** Number of pages holding the event stream open. */
  clients: number;
  pageListening: boolean;
  lastError?: string;
  config: SpeechServerConfig;
}

export interface OSCEndpoint {
  address: string;
  port: number;
}

export interface OSCSourceConfig {
  id: string;
  name: string;
  enabled: boolean;
  local?: OSCEndpoint;
  remote?: OSCEndpoint;
}

export interface OSCSourceStatus {
  local?: OSCEndpoint;
  remote?: OSCEndpoint;
  isOpen: boolean;
}

export type OSCSourcesResult =
  | { success: true; sources: OSCSourceConfig[]; status: OSCSourceStatus[] }
  | { success: false; error: string };

export interface StartupSettings {
  startHidden: boolean;
  gpuAcceleration: boolean;
  /** The saved GPU setting differs from the one this run started with. */
  restartNeeded: boolean;
}

/**
 * What the updater is doing, owned by main. Squirrel reports no byte progress, so
 * `received` comes from watching the package grow in its folder, and either number can be
 * missing when that can't be worked out.
 */
export type UpdateState =
  | { status: 'unsupported'; reason: 'dev' | 'portable' | 'platform' }
  | { status: 'idle'; checkedAt?: number }
  | { status: 'checking' }
  | { status: 'downloading'; version?: string; received?: number; total?: number; startedAt: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string; checkedAt: number };
