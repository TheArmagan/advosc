function getLocalData(key: string, defaultValue: any = null): any {
  const data = localStorage.getItem(`ADCOSC;${key}`);
  if (data === null) return defaultValue;
  try {
    return JSON.parse(data);
  } catch {
    return defaultValue;
  }
}

function setLocalData(key: string, value: any): void {
  localStorage.setItem(`ADCOSC;${key}`, JSON.stringify(value));
}

function removeLocalData(key: string): void {
  localStorage.removeItem(`ADCOSC;${key}`);
}

function updateLocalData(key: string, updater: (currentValue: any) => void): void {
  const currentValue = getLocalData(key);
  const newValue = updater(currentValue);
  setLocalData(key, newValue);
  return newValue;
}

async function hasLocalData(key: string): Promise<boolean> {
  return localStorage.getItem(`ADCOSC;${key}`) !== null;
}

export const localData = {
  get: getLocalData,
  set: setLocalData,
  has: hasLocalData,
  remove: removeLocalData,
  update: updateLocalData
}