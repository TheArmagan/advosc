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

/** Undefined when the file doesn't exist, null when it exists and can't be read. */
function readFile(file: string): Partial<Bootstrap> | null | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : null;
  }
}

export function getBootstrap(): Bootstrap {
  if (current) return current;
  const stored = readFile(filePath());
  if (stored === null) {
    // It might have held a set latch, and `.bak` is one write older so it can't say otherwise.
    // Wrongly asking for a re-arm costs a click. Wrongly clearing it could undo a panic.
    current = { ...defaults, ...readFile(`${filePath()}.bak`), panicLatched: true };
  } else {
    current = { ...defaults, ...stored };
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
