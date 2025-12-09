import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import type { MediaCommand, MediaInfo } from './types';

let mediaProcess: ChildProcess | null = null;

function getMediaExePath(): string {
  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';
  return isDev
    ? path.join(__dirname, '..', '..', 'natives', 'win-media-info.exe')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'natives', 'win-media-info.exe');
}

export function startMediaMonitor(): void {
  if (mediaProcess) {
    return;
  }

  const exePath = getMediaExePath();

  if (!fs.existsSync(exePath)) {
    console.error('win-media-info.exe not found at:', exePath);
    return;
  }

  // Don't pass any command to use default monitor behavior
  mediaProcess = spawn(exePath, []);
  let buffer = '';

  mediaProcess.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rawData = JSON.parse(trimmed);
        const mediaInfo: MediaInfo = {
          title: rawData.title,
          artist: rawData.artist,
          album: rawData.album,
          playbackStatus: rawData.playback_status,
          position: rawData.position,
          duration: rawData.duration,
          appName: rawData.app_name,
          hasArtwork: rawData.has_artwork
        };
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('media:info', mediaInfo));
      } catch (err) {
        console.error('Failed to parse media info:', err, 'Line:', trimmed);
      }
    }
  });

  mediaProcess.stderr?.on('data', (data: Buffer) => {
    console.error('Media monitor error:', data.toString());
  });

  mediaProcess.on('close', (code: number | null) => {
    console.log('Media monitor process exited with code:', code);
    mediaProcess = null;
    // Restart after 5 seconds if not manually stopped
    setTimeout(() => {
      if (BrowserWindow.getAllWindows().length > 0) {
        startMediaMonitor();
      }
    }, 5000);
  });
}

export function stopMediaMonitor(): void {
  if (mediaProcess) {
    mediaProcess.kill();
    mediaProcess = null;
  }
}

export async function executeMediaCommand(command: MediaCommand): Promise<{ success: boolean; command: string; error?: string }> {
  const exePath = getMediaExePath();

  if (!fs.existsSync(exePath)) {
    return { success: false, command, error: 'win-media-info.exe not found' };
  }

  return new Promise((resolve) => {
    const proc = spawn(exePath, [command]);
    let output = '';

    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('close', (code: number | null) => {
      try {
        const result = JSON.parse(output.trim());
        resolve(result);
      } catch {
        resolve({ success: code === 0, command, error: code !== 0 ? 'Command failed' : undefined });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, command, error: err.message });
    });
  });
}
