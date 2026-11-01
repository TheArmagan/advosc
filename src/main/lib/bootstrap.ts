import * as fs from 'fs';
import * as path from 'path';
import { writeFileAtomicSync } from '../../engine/persistence/file-store';
import type { ToyFailsafe } from '../../shared/engine-protocol';
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
  /** Electron accelerator, "" when unset. Registered by main, so it works with no engine. */
  panicHotkey: string;
  /** Saved so a panic during startup can reach toys before the engine has said anything. */
  toyFailsafe: ToyFailsafe;
}

const defaults: Bootstrap = {
  startHidden: false,
  gpuAcceleration: false,
  bounds: null,
  panicLatched: false,
  panicHotkey: '',
  toyFailsafe: { enabled: false, lovense: [] },
};

let current: Bootstrap | null = null;

function filePath() {
  return path.join(resolveDataDir(), 'bootstrap.json');
}

function readFile(file: string): Partial<Bootstrap> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return null;
  }
}

export function getBootstrap(): Bootstrap {
  if (current) return current;
  const stored = readFile(filePath()) ?? readFile(`${filePath()}.bak`);
  // A file that exists and can't be read might have held a set latch. Wrongly asking for a
  // re-arm costs a click, and wrongly clearing it could start a toy after a panic.
  current = stored ? { ...defaults, ...stored } : { ...defaults, panicLatched: true };
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
