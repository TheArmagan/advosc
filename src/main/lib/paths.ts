import { app } from 'electron';
import * as path from 'path';

export const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';

/**
 * Dev and packaged runs share `%APPDATA%\advosc` but not their localStorage, because the
 * origins differ. If dev used the same data folder, a dev run would mark the import as done
 * and the real packaged data would never get imported.
 */
export function resolveDataDir(): string {
  return path.join(app.getPath('userData'), isDev ? 'engine-data-dev' : 'engine-data');
}

export function nativesDir(): string {
  return isDev
    ? path.join(__dirname, '..', 'natives')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'natives');
}
