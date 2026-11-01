import type { AudioDevice } from './protocol';

/** What gets stored for the output device. An empty `id` means the Windows default. */
export interface SavedOutputDevice {
  id: string;
  name: string;
}

/** What legacy import can read from the old renderer: a salted `deviceId` and its label. */
export interface LegacyOutputDevice {
  deviceId: string;
  label: string;
}

/**
 * Chrome labels aren't quite the endpoint's name: USB devices get a "(046d:0a38)" suffix, and
 * the virtual entries get a "Default - " prefix.
 */
function normalizeName(name: string): string {
  return name
    .replace(/^(default|communications) - /i, '')
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function findByName(name: string, devices: AudioDevice[]): AudioDevice | undefined {
  const wanted = normalizeName(name);
  return wanted ? devices.find((device) => normalizeName(device.name) === wanted) : undefined;
}

/**
 * Turns a stored device into the id to hand `setDevice`: by id, then by name, since a driver
 * reinstall changes the id. With no match the stored id goes through anyway. The sidecar then
 * falls back to the default, says so with `fallback: true`, and returns to the device by itself
 * when it's plugged back in. Forgetting it here would lose that.
 */
export function resolveDeviceId(saved: SavedOutputDevice, devices: AudioDevice[]): string {
  if (!saved.id) return '';
  if (devices.some((device) => device.id === saved.id)) return saved.id;
  return findByName(saved.name, devices)?.id ?? saved.id;
}

/**
 * First run after the move from the browser. Its `deviceId` means nothing here, so the label is
 * all there is. Null when no device matches: use the default and tell the user once.
 */
export function migrateLegacyDevice(
  legacy: LegacyOutputDevice,
  devices: AudioDevice[],
): SavedOutputDevice | null {
  if (!legacy.deviceId) return { id: '', name: '' };
  const match = findByName(legacy.label, devices);
  return match ? { id: match.id, name: match.name } : null;
}
