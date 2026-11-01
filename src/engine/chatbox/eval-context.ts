import { AsyncLocalStorage } from "async_hooks";

/**
 * What the current template evaluation is for, carried across every `await` inside it.
 *
 * A root is one top-level evaluation: a chatbox render, a rule's source, a preview. Everything
 * it resolves, however deep, shares that root's budget. The context has to follow the async
 * call chain rather than sit in a global, because several roots run at once and modules
 * re-enter `fillTemplate` from inside `getPlaceholderValue`.
 */

export type EvalPurpose = "render" | "rule" | "preview";

export interface EvalFailure {
  kind: "no-data" | "error";
  /** Plain words. Shown as a rule's status, so it can't quote a template. */
  message: string;
}

export interface EvalRoot {
  purpose: EvalPurpose;
  /** Placeholders with side effects return without acting. */
  readOnly: boolean;
  /** Placeholders resolved so far. */
  calls: number;
  /** Why this result can't be trusted. Read by whoever started the root. */
  failure: EvalFailure | null;
  /** The budget or depth limit stopped this root, which means it's probably recursive. */
  runaway: boolean;
}

export interface EvalFrame {
  root: EvalRoot;
  depth: number;
}

const storage = new AsyncLocalStorage<EvalFrame>();

export function currentFrame(): EvalFrame | undefined {
  return storage.getStore();
}

export function newRootFrame(purpose: EvalPurpose, readOnly: boolean): EvalFrame {
  return {
    root: { purpose, readOnly, calls: 0, failure: null, runaway: false },
    depth: 0,
  };
}

export function runInFrame<T>(frame: EvalFrame, run: () => T): T {
  return storage.run(frame, run);
}

/** True inside automation sources and previews. Anything that acts has to check this. */
export function isReadOnly(): boolean {
  return storage.getStore()?.root.readOnly ?? false;
}

/**
 * False during a preview, which runs on every keystroke. A half-typed URL or token shouldn't
 * reach the network or open a connection, so reads there answer from what's already cached.
 */
export function canReachNetwork(): boolean {
  return storage.getStore()?.root.purpose !== "preview";
}

/** The value couldn't be read. Doesn't change the output: renders still show what they show. */
export function reportNoData(message: string) {
  const root = storage.getStore()?.root;
  if (root && !root.failure) root.failure = { kind: "no-data", message };
}

export function reportError(message: string) {
  const root = storage.getStore()?.root;
  if (root && root.failure?.kind !== "error") root.failure = { kind: "error", message };
}
