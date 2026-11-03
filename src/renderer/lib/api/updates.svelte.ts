import type { UpdateState } from "$shared/native-types";
import { toast } from "svelte-sonner";

/** The updater's state from main. One subscription for the whole window. */
export const updates = $state<{ state: UpdateState }>({
  state: { status: "unsupported", reason: "dev" },
});

let started = false;

function apply(next: UpdateState) {
  const wasReady = updates.state.status === "ready";
  updates.state = next;
  if (next.status === "ready" && !wasReady) {
    toast.success(`ADVOSC ${next.version} is ready`, {
      description: "Restarting takes a few seconds. Your settings, templates and profiles are kept.",
      duration: 20000,
      action: { label: "Restart now", onClick: restartToUpdate },
    });
  }
}

export function startUpdateWatch() {
  if (started) return;
  started = true;
  const api = window.ADVOSCNative.updates;
  api.onChange(apply);
  api.get().then((state) => {
    // A ready update found before this window opened still gets its toast.
    apply(state);
  }, () => {});
}

export function checkForUpdates() {
  window.ADVOSCNative.updates.check();
}

export function restartToUpdate() {
  window.ADVOSCNative.updates.restart();
}

/** 0 to 100, or null when the size isn't known yet. */
export function downloadPercent(state: UpdateState): number | null {
  if (state.status !== "downloading" || !state.total || state.received === undefined) return null;
  return Math.min(100, Math.round((state.received / state.total) * 100));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Rough time left from the average speed so far. */
export function timeLeft(state: UpdateState): string | null {
  if (state.status !== "downloading" || !state.total || !state.received) return null;
  const elapsed = (Date.now() - state.startedAt) / 1000;
  if (elapsed < 2) return null;
  const seconds = ((state.total - state.received) / state.received) * elapsed;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s left`;
  return `${Math.round(seconds / 60)} min left`;
}

export function timeAgo(at: number | undefined) {
  if (!at) return "";
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}
