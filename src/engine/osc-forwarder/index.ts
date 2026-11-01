import type { ForwardType, OscForwarderEntry } from "$shared/osc-forwarder";
import { get, writable } from "$shared/store";
import { chatbox } from "../chatbox";
import { native } from "../native";
import { mirror, synced } from "../sync/hub";

function mapValue(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

const entriesStore = synced<OscForwarderEntry[]>("OSCForwarder;Entries", []);

// Per-entry timers
const timers = new Map<string, ReturnType<typeof setInterval>>();

// Last sent value per entry id
const lastValuesStore = writable<Record<string, string>>({});

async function processEntry(entry: OscForwarderEntry) {
  if (!entry.enabled || !entry.oscPath) return;
  try {
    const resolved = await chatbox.fillTemplate(entry.valueTemplate, "{{;}}", false, `OSCForwarder;${entry.id}`);

    let sendArgs: { value: number | string | boolean; type: ForwardType }[];
    let displayValue: string;

    if (entry.forwardType === "String") {
      sendArgs = [{ value: resolved, type: "String" }];
      displayValue = resolved;
    } else if (entry.forwardType === "Bool") {
      const lower = resolved.trim().toLowerCase();
      const boolVal = lower === "true" || lower === "1";
      sendArgs = [{ value: boolVal, type: "Bool" }];
      displayValue = String(boolVal);
    } else {
      let num = parseFloat(resolved);
      if (isNaN(num)) num = 0;
      if (entry.enableMapping) {
        num = mapValue(num, entry.inputMin, entry.inputMax, entry.outputMin, entry.outputMax);
      }
      if (entry.forwardType === "Int") {
        num = Math.round(num);
        displayValue = String(num);
      } else {
        displayValue = num.toFixed(4);
      }
      sendArgs = [{ value: num, type: entry.forwardType }];
    }

    native.osc.sendCustom(entry.oscPath, sendArgs);
    lastValuesStore.update((prev) => ({ ...prev, [entry.id]: displayValue }));
  } catch (e) {
    console.error("OSCForwarder", entry.oscPath, e);
    lastValuesStore.update((prev) => ({ ...prev, [entry.id]: "(error)" }));
  }
}

function stopTimer(id: string) {
  const t = timers.get(id);
  if (t) {
    clearInterval(t);
    timers.delete(id);
  }
}

function startTimer(entry: OscForwarderEntry) {
  stopTimer(entry.id);
  if (!entry.enabled || !entry.oscPath) return;
  const t = setInterval(() => {
    // always grab fresh entry from store so interval closes over id only
    const current = get(entriesStore).find((e) => e.id === entry.id);
    if (current) processEntry(current);
  }, entry.intervalMs);
  timers.set(entry.id, t);
  processEntry(entry);
}

function syncTimers(entries: OscForwarderEntry[]) {
  // stop timers for removed entries
  for (const id of timers.keys()) {
    if (!entries.find((e) => e.id === id)) stopTimer(id);
  }
  // start/restart timers for each entry
  for (const entry of entries) {
    startTimer(entry);
  }
}

export function startOscForwarder(options: { safeMode: boolean }) {
  mirror("OSCForwarder;LastValues", lastValuesStore);
  if (options.safeMode) return;
  entriesStore.subscribe(syncTimers);
}
