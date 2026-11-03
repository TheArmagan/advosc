import { automations } from "$lib/api/automations";

const DEBOUNCE_MS = 300;
/** Values like the time keep moving after you stop typing, so this repeats while it's shown. */
const REFRESH_MS = 1000;

/**
 * Renders a template read-only (so nothing with a side effect fires) and keeps it fresh,
 * but only while its element is on screen and the window isn't minimized. Call it while a
 * component initializes, since it sets up effects.
 */
export function livePreview(options: {
  template: () => string;
  enabled: () => boolean;
  element: () => Element | null;
}) {
  let text = $state<string | null>(null);
  let failed = $state(false);
  let onScreen = $state(false);
  let pageVisible = $state(!document.hidden);

  $effect(() => {
    const element = options.element();
    if (!element || !options.enabled()) return;
    const observer = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!options.enabled()) return;
    const update = () => (pageVisible = !document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  });

  $effect(() => {
    const template = options.template();
    if (!options.enabled() || !template) {
      text = null;
      failed = false;
      return;
    }
    if (!onScreen) return;

    const repeat = pageVisible;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      try {
        const result = await automations.preview(template);
        if (stopped) return;
        text = result;
        failed = false;
      } catch {
        if (stopped) return;
        failed = true;
      }
      if (repeat) timer = setTimeout(run, REFRESH_MS);
    }

    timer = setTimeout(run, DEBOUNCE_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  });

  return {
    get text() {
      return text;
    },
    get failed() {
      return failed;
    },
  };
}
