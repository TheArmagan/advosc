import { rawStore } from "../engine";

/** Same API as ever. The data lives in the engine, hydrated into this window before mount. */

function getLocalData(key: string, defaultValue: any = null): any {
  const data = rawStore.get(key);
  if (data === null) return defaultValue;
  try {
    return JSON.parse(data);
  } catch {
    return defaultValue;
  }
}

function setLocalData(key: string, value: any): void {
  rawStore.set(key, JSON.stringify(value));
}

function removeLocalData(key: string): void {
  rawStore.remove(key);
}

function updateLocalData(key: string, updater: (currentValue: any) => void): void {
  const currentValue = getLocalData(key);
  const newValue = updater(currentValue);
  setLocalData(key, newValue);
  return newValue;
}

async function hasLocalData(key: string): Promise<boolean> {
  return rawStore.get(key) !== null;
}

export const localData = {
  get: getLocalData,
  set: setLocalData,
  has: hasLocalData,
  remove: removeLocalData,
  update: updateLocalData
}
