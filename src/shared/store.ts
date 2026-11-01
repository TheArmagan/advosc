/**
 * A small copy of `svelte/store`, so the engine has no Svelte dependency. It keeps the same
 * `subscribe` contract and `safe_not_equal` semantics, which means renderer components can
 * use these with `$store` syntax exactly as they did the Svelte ones.
 */

export type Subscriber<T> = (value: T) => void;
export type Unsubscriber = () => void;
export type Updater<T> = (value: T) => T;
export type StartStopNotifier<T> = (
  set: (value: T) => void,
  update: (fn: Updater<T>) => void,
) => void | (() => void);

export interface Readable<T> {
  subscribe(run: Subscriber<T>, invalidate?: () => void): Unsubscriber;
}

export interface Writable<T> extends Readable<T> {
  set(value: T): void;
  update(fn: Updater<T>): void;
}

type SubscriberEntry<T> = [run: Subscriber<T>, invalidate: () => void];

function safeNotEqual(a: unknown, b: unknown): boolean {
  return a != a
    ? b == b
    : a !== b || (a !== null && typeof a === "object") || typeof a === "function";
}

const noop = () => {};

/** Shared across every store so a nested `set` runs after the current round of subscribers. */
const subscriberQueue: unknown[] = [];

export function writable<T>(value: T, start: StartStopNotifier<T> = noop): Writable<T> {
  let stop: (() => void) | null = null;
  const subscribers = new Set<SubscriberEntry<T>>();

  function set(next: T): void {
    if (!safeNotEqual(value, next)) return;
    value = next;
    if (!stop) return;

    const runQueue = subscriberQueue.length === 0;
    for (const subscriber of subscribers) {
      subscriber[1]();
      subscriberQueue.push(subscriber, value);
    }
    if (!runQueue) return;

    try {
      for (let i = 0; i < subscriberQueue.length; i += 2) {
        (subscriberQueue[i] as SubscriberEntry<T>)[0](subscriberQueue[i + 1] as T);
      }
    } finally {
      // A throwing subscriber must not leave the queue full, or every store in the process
      // would stop notifying. The renderer could afford that until a reload; the engine can't.
      subscriberQueue.length = 0;
    }
  }

  function update(fn: Updater<T>): void {
    set(fn(value));
  }

  function subscribe(run: Subscriber<T>, invalidate: () => void = noop): Unsubscriber {
    const subscriber: SubscriberEntry<T> = [run, invalidate];
    subscribers.add(subscriber);
    if (subscribers.size === 1) stop = start(set, update) || noop;
    run(value);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }

  return { set, update, subscribe };
}

export function get<T>(store: Readable<T>): T {
  let value!: T;
  store.subscribe((current) => {
    value = current;
  })();
  return value;
}
