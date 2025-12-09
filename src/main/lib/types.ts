export type MediaCommand = 'skip-track' | 'previous-track' | 'toggle-play-pause' | 'pause' | 'resume';

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

export type OSCMessage = {
  address: string;
  args: any[];
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
