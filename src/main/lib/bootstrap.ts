import * as fs from 'fs';
import * as path from 'path';
import { writeFileAtomicSync } from '../../engine/persistence/file-store';
import { resolveDataDir } from './paths';

/**
 * What main needs before the engine exists, so it can't live in the engine's store. Start
 * hidden has to be known before the first window, and the panic latch has to survive an
 * engine that's dead or stuck.
 */

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Bootstrap {
  startHidden: boolean;
  /**
   * Off by default. Chromium's GPU process keeps its video memory after the last window is
   * destroyed, so closing to tray alone frees none. With acceleration off it uses none at all.
   * Electron only reads this before 'ready', so changing it needs a restart.
   */
  gpuAcceleration: boolean;
  bounds: WindowBounds | null;
  panicLatched: boolean;
}

const defaults: Bootstrap = { startHidden: false, gpuAcceleration: false, bounds: null, panicLatched: false };

let current: Bootstrap | null = null;

function filePath() {
  return path.join(resolveDataDir(), 'bootstrap.json');
}

export function getBootstrap(): Bootstrap {
  if (current) return current;
  try {
    current = { ...defaults, ...JSON.parse(fs.readFileSync(filePath(), 'utf-8')) };
  } catch {
    current = { ...defaults };
  }
  return current!;
}

export function updateBootstrap(patch: Partial<Bootstrap>) {
  current = { ...getBootstrap(), ...patch };
  try {
    writeFileAtomicSync(filePath(), JSON.stringify(current, null, 2));
  } catch (error) {
    console.error('Could not save bootstrap settings:', error);
  }
}
