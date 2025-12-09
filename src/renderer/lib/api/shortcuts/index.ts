import { localData } from '../local-data';

export interface ShortcutTriggerEvent {
  name: string;
  accelerator: string;
}

type ShortcutCallback = (event: ShortcutTriggerEvent) => void;

const STORAGE_KEY = 'Shortcuts';

// In-memory state
let triggers: Record<string, string> = localData.get(STORAGE_KEY, {});
const listeners: Set<ShortcutCallback> = new Set();

// Track active accelerators to their callback cleanup functions
const activeAccelerators = new Map<string, () => void>();

function saveTriggers(): void {
  localData.set(STORAGE_KEY, triggers);
}

function notifyListeners(event: ShortcutTriggerEvent): void {
  listeners.forEach((callback) => {
    try {
      callback(event);
    } catch (err) {
      console.error('Error in shortcut listener:', err);
    }
  });
}

async function registerAccelerator(name: string, accelerator: string): Promise<boolean> {
  // If this accelerator is already registered, unregister it first
  if (activeAccelerators.has(accelerator)) {
    await window.ADVOSCNative.globalShortcut.unregister(accelerator);
    activeAccelerators.delete(accelerator);
  }

  const result = await window.ADVOSCNative.globalShortcut.register(accelerator, () => {
    // Find the name for this accelerator (it might have changed)
    const currentName = Object.entries(triggers).find(([_, acc]) => acc === accelerator)?.[0];
    if (currentName) {
      notifyListeners({ name: currentName, accelerator });
    }
  });

  if (result.success) {
    activeAccelerators.set(accelerator, () => {
      window.ADVOSCNative.globalShortcut.unregister(accelerator);
    });
  }

  return result.success;
}

async function unregisterAccelerator(accelerator: string): Promise<void> {
  if (activeAccelerators.has(accelerator)) {
    await window.ADVOSCNative.globalShortcut.unregister(accelerator);
    activeAccelerators.delete(accelerator);
  }
}

/**
 * Subscribe to shortcut trigger events
 * @param callback Function called when any registered shortcut is triggered
 * @returns Unsubscribe function
 */
function onTriggered(callback: ShortcutCallback): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Set or update a named shortcut trigger
 * @param name Unique name for the trigger
 * @param accelerator Electron accelerator string (e.g., "CommandOrControl+Shift+X")
 * @returns Promise resolving to success status
 */
async function setTrigger(name: string, accelerator: string): Promise<boolean> {
  // If this name already has a different accelerator, unregister the old one
  const existingAccelerator = triggers[name];
  if (existingAccelerator && existingAccelerator !== accelerator) {
    // Check if any other trigger uses this accelerator
    const otherUsesAccelerator = Object.entries(triggers).some(
      ([n, acc]) => n !== name && acc === existingAccelerator
    );
    if (!otherUsesAccelerator) {
      await unregisterAccelerator(existingAccelerator);
    }
  }

  // Register the new accelerator
  const success = await registerAccelerator(name, accelerator);

  if (success) {
    triggers[name] = accelerator;
    saveTriggers();
  }

  return success;
}

/**
 * Remove a named shortcut trigger
 * @param name Name of the trigger to remove
 */
async function removeTrigger(name: string): Promise<void> {
  const accelerator = triggers[name];
  if (!accelerator) return;

  // Check if any other trigger uses this accelerator
  const otherUsesAccelerator = Object.entries(triggers).some(
    ([n, acc]) => n !== name && acc === accelerator
  );

  if (!otherUsesAccelerator) {
    await unregisterAccelerator(accelerator);
  }

  delete triggers[name];
  saveTriggers();
}

/**
 * Get all registered triggers
 * @returns Record of trigger names to accelerators
 */
function getAllTriggers(): Record<string, string> {
  return { ...triggers };
}

/**
 * Get the accelerator for a specific trigger
 * @param name Name of the trigger
 * @returns Accelerator string or undefined if not found
 */
function getTrigger(name: string): string | undefined {
  return triggers[name];
}

/**
 * Check if a trigger exists
 * @param name Name of the trigger
 */
function hasTrigger(name: string): boolean {
  return name in triggers;
}

/**
 * Clear all triggers
 */
async function clearAllTriggers(): Promise<void> {
  await window.ADVOSCNative.globalShortcut.unregisterAll();
  activeAccelerators.clear();
  triggers = {};
  saveTriggers();
}

/**
 * Initialize shortcuts by registering all saved triggers
 * Call this on app startup
 */
async function initialize(): Promise<void> {
  // Re-register all saved triggers
  for (const [name, accelerator] of Object.entries(triggers)) {
    await registerAccelerator(name, accelerator);
  }
}

export const shortcuts = {
  onTriggered,
  setTrigger,
  removeTrigger,
  getAllTriggers,
  getTrigger,
  hasTrigger,
  clearAllTriggers
};

initialize();