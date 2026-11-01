// @ts-nocheck

import { toast } from 'svelte-sonner';
import { connectEngine, onEngineInfo } from './lib/api/engine';

const CONNECT_TIMEOUT_MS = 20000;

let safeModeShown = false;

function showSafeMode(info) {
  if (!info.safeMode || safeModeShown) return;
  safeModeShown = true;
  toast.warning('Safe mode', {
    description: "ADVOSC kept crashing, so the chatbox, forwarder and sound rules are off until you restart it.",
    duration: Infinity,
  });
}

/**
 * Stores read their first value when they're created, and the app imports all of them, so
 * nothing else can load until the engine has handed over its state. That's why the app comes
 * in through a dynamic import here instead of a static one.
 */
async function start() {
  const target = document.getElementById('app')!;

  const timeout = setTimeout(() => {
    target.textContent = "ADVOSC can't reach its background service. Try restarting it from the tray.";
  }, CONNECT_TIMEOUT_MS);

  window.ADVOSCNative.engine.onEvent((name, payload) => {
    if (name === 'toast') toast[payload.kind](payload.title, payload.options);
  });

  const info = await connectEngine();
  clearTimeout(timeout);
  target.textContent = '';

  const [{ mount }, { default: App }] = await Promise.all([import('svelte'), import('./main.svelte')]);
  mount(App, { target });

  // The engine can land in safe mode while this window is open, so a single check isn't enough.
  showSafeMode(info);
  onEngineInfo(showSafeMode);
}

start();
