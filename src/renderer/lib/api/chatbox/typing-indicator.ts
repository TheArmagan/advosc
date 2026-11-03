import { chatbox } from ".";

/** How long after the last keystroke the bubble goes away. */
const IDLE_MS = 1500;
/** Renewal rate while typing, well inside the engine's 5 s failsafe. */
const RENEW_MS = 2000;

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastSent = 0;
let active = false;

function send(state: boolean) {
  chatbox.setTyping(state).catch(() => {});
}

/** Call on every keystroke in a box that types into the chatbox. */
export function typingPulse() {
  const now = Date.now();
  if (!active || now - lastSent > RENEW_MS) {
    active = true;
    lastSent = now;
    send(true);
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(typingStop, IDLE_MS);
}

export function typingStop() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!active) return;
  active = false;
  send(false);
}
