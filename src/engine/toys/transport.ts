import type { ToyFeature, ToyTransport } from "$shared/toys";

/** What the service needs from a transport beyond the shared contract. */
export interface EngineToyTransport extends ToyTransport {
  /**
   * The step `level` lands on for this toy. The service compares these to decide whether a send
   * would change anything. A transport may only ever round down from here on: rounding up would
   * put the toy above the cap the service just applied.
   */
  quantize(toyId: string, feature: ToyFeature, level: number): number;
}

export function clampLevel(level: number) {
  if (!Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}

/** One place that decides a command is bounded. A `timeSec` of 0 would run forever. */
export function assertBoundedSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 1) {
    throw new Error(`Refusing a toy command with an unbounded time: ${seconds}`);
  }
}
