import { chatbox } from "$lib/api/chatbox";
import { typingPulse, typingStop } from "$lib/api/chatbox/typing-indicator";
import { get } from "$shared/store";
import { onDestroy } from "svelte";

const RESET_MS = 30000;

/**
 * The "send a one-off message" box both editors have. While it holds text, that text is the
 * live template; it goes back to the editor's own template after 30 s or when cleared, and
 * VRChat's typing bubble shows while you type. Call it while a component initializes.
 */
export function oneOffMessage(original: () => string) {
  let text = $state("");
  let active = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function setTemplate(template: string) {
    chatbox.settings.set({ ...get(chatbox.settings), template });
  }

  function reset() {
    clearTimer();
    typingStop();
    text = "";
    if (active) {
      active = false;
      setTemplate(original());
    }
  }

  function input(value: string) {
    text = value;
    clearTimer();
    if (value.trim() === "") {
      reset();
      return;
    }
    typingPulse();
    active = true;
    setTemplate(value);
    timer = setTimeout(reset, RESET_MS);
  }

  onDestroy(() => {
    clearTimer();
    typingStop();
  });

  return {
    get text() {
      return text;
    },
    get active() {
      return active;
    },
    input,
    reset,
    blur: typingStop,
  };
}
