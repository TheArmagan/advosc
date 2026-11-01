import type { ToyFeature, ToyPattern, ToyPresetName } from "$shared/toys";

/** Lovense wants more than 100, and anything faster is noise on a motor anyway. */
export const MIN_STEP_MS = 110;
export const MAX_STEPS = 50;

/**
 * What Lovense's presets get replaced with whenever they can't be used: below a 100% cap,
 * because a native preset has no strength field, and always on Intiface.
 */
const PRESET_TABLE: Record<ToyPresetName, { stepMs: number; steps: number[] }> = {
  pulse: { stepMs: 300, steps: [1, 0, 1, 0, 1, 0, 0, 0] },
  wave: { stepMs: 200, steps: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1, 0.85, 0.7, 0.55, 0.4, 0.25] },
  fireworks: { stepMs: 150, steps: [0.1, 0.2, 0.3, 0.5, 0.7, 1, 1, 0.6, 0.3, 0.1, 0, 0, 0.2, 0.5, 1, 0.5, 0, 0] },
  earthquake: { stepMs: 120, steps: [1, 0.6, 0.9, 0.5, 1, 0.7, 0.4, 0.8, 1, 0.5, 0.9, 0.6] },
};

export function presetPattern(preset: ToyPresetName, features: ToyFeature[]): ToyPattern | null {
  const table = PRESET_TABLE[preset];
  if (!table) return null;
  return { id: `preset:${preset}`, name: preset, stepMs: table.stepMs, steps: table.steps, features };
}

/** Patterns come from settings a window can write, so nothing about them is taken on trust. */
export function sanitizePattern(pattern: ToyPattern): ToyPattern | null {
  if (!pattern || !Array.isArray(pattern.steps)) return null;
  const steps = pattern.steps.slice(0, MAX_STEPS).map((step) => (Number.isFinite(step) ? step : 0));
  if (!steps.length) return null;
  const stepMs = Number(pattern.stepMs);
  return {
    ...pattern,
    stepMs: Number.isFinite(stepMs) ? Math.max(MIN_STEP_MS, Math.round(stepMs)) : MIN_STEP_MS,
    steps,
    features: Array.isArray(pattern.features) ? pattern.features : [],
  };
}

/** Starts the table where the running pattern has got to, so a reissue carries on instead of restarting. */
export function rotateSteps(steps: number[], stepMs: number, elapsedMs: number) {
  const offset = Math.floor(elapsedMs / stepMs) % steps.length;
  return offset === 0 ? steps : [...steps.slice(offset), ...steps.slice(0, offset)];
}
