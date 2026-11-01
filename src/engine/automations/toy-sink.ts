import type { ToyRuleSink } from "$shared/toys";

/**
 * Where toy actions go. It lives on its own so the toy service can hand its sink over without
 * importing the automation engine. With no sink, toy actions do nothing.
 */

let sink: ToyRuleSink | null = null;
const listeners = new Set<(sink: ToyRuleSink | null) => void>();

/** The toy service calls this at startup. */
export function setToySink(next: ToyRuleSink | null) {
  sink = next;
  for (const listener of listeners) listener(next);
}

export function getToySink(): ToyRuleSink | null {
  return sink;
}

export function onToySinkChange(listener: (sink: ToyRuleSink | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
