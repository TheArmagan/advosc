import { emit, hasClients } from "../sync/hub";

type ToastKind = "error" | "warning" | "success" | "info";

export interface ToastOptions {
  description?: string;
  duration?: number;
}

export interface ToastPayload {
  kind: ToastKind;
  title: string;
  options?: ToastOptions;
}

function show(kind: ToastKind, title: string, options?: ToastOptions) {
  if (hasClients()) {
    emit("toast", { kind, title, options } satisfies ToastPayload);
  } else {
    // The description can quote a template, so it doesn't go in the log.
    console.log(`Notification with no window open: ${kind}: ${title}`);
  }
}

/** Same shape as `toast` from svelte-sonner, so moved code keeps its calls. */
export const notify = {
  error: (title: string, options?: ToastOptions) => show("error", title, options),
  warning: (title: string, options?: ToastOptions) => show("warning", title, options),
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
};
