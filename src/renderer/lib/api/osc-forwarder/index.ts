import { defaultEntry, makeId, type ForwardType, type OscForwarderEntry } from "$shared/osc-forwarder";
import { mirrored, synced } from "../engine";

export { defaultEntry, makeId };
export type { ForwardType, OscForwarderEntry };

const entriesStore = synced<OscForwarderEntry[]>("OSCForwarder;Entries", []);

/** Last sent value per entry id. */
export const lastValuesStore = mirrored<Record<string, string>>("OSCForwarder;LastValues", {});

/** The engine watches the entries and keeps its timers in step, so editing them is all this does. */
export const oscForwarder = {
  entries: entriesStore,
  lastValues: lastValuesStore,
  addEntry() {
    entriesStore.update((prev) => [...prev, defaultEntry()]);
  },
  removeEntry(id: string) {
    entriesStore.update((prev) => prev.filter((e) => e.id !== id));
  },
  updateEntry(id: string, patch: Partial<OscForwarderEntry>) {
    entriesStore.update((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  },
};
