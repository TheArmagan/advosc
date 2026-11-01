import * as fs from 'fs';
import { spawn } from 'child_process';
import type { StartTimeResponse, TrackerBattery, TrackerBatteryResponse } from '$shared/native-types';
import { nativeExePath } from './natives';

function getUtilsExePath(): string {
  return nativeExePath('advosc-utils.exe');
}

function executeCommand(args: string[]): Promise<string> {
  const exePath = getUtilsExePath();

  if (!fs.existsSync(exePath)) {
    return Promise.reject(new Error('advosc-utils.exe not found at: ' + exePath));
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(exePath, args);
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      if (code === 0 || stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Process exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Get the start time of a process in Unix timestamp (milliseconds)
 */
export async function getProcessStartTime(processName: string): Promise<StartTimeResponse> {
  try {
    const output = await executeCommand(['start-time', processName]);
    const raw = JSON.parse(output);
    return { startTime: raw.start_time ?? null, error: raw.error };
  } catch (err) {
    return { startTime: null, error: String(err) };
  }
}

/**
 * Get battery levels of all OpenVR trackers (requires SteamVR to be running)
 */
export async function getOpenVRTrackers(): Promise<TrackerBatteryResponse> {
  try {
    const output = await executeCommand(['openvr-trackers']);
    const raw = JSON.parse(output);
    const trackers: TrackerBattery[] | null = raw.trackers?.map((t: any) => ({
      deviceIndex: t.device_index,
      serialNumber: t.serial_number,
      modelNumber: t.model_number,
      batteryLevel: t.battery_level,
      isCharging: t.is_charging,
      deviceClass: t.device_class,
    })) ?? null;
    return { trackers, error: raw.error };
  } catch (err) {
    return { trackers: null, error: String(err) };
  }
}
