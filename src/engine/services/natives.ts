import * as path from 'path';
import { engineConfig } from '../runtime/config';

/** Main works out the folder, because dev and packaged builds keep the exes in different places. */
export function nativeExePath(name: string): string {
  return path.join(engineConfig.nativesDir, name);
}
