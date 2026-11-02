import { ipcMain, type WebContents } from 'electron';
import { BUNDLE_LINK_PREFIX, MAX_LINK_PAYLOAD } from '../../shared/automation-bundle';

/**
 * Takes `advosc://` links from the command line and hands them to the window one at a time.
 *
 * A link can arrive with no window at all, since the app can be tray-only, so nothing is sent
 * until the renderer says it's listening. The renderer says that again each time it's done with a
 * link, which is how more than one link stays in order. Anything that doesn't look right is dropped
 * here, so only a well-formed payload ever reaches a window. The renderer still validates what's
 * inside it.
 *
 * Only import constants from `automation-bundle.ts` here. Main's build leaves fflate external, so
 * calling one of its decode functions adds a `require('fflate')`, and forge prunes that package.
 * The constants alone tree-shake it away.
 */

/** Someone clicking the same link in a loop shouldn't be able to pile up reviews. */
const MAX_QUEUED = 8;

const queue: string[] = [];
/** The renderer that's waiting for a link. Cleared on delivery until it's ready again. */
let listener: WebContents | null = null;

function isBundleLink(value: string): boolean {
  if (!value.startsWith(BUNDLE_LINK_PREFIX)) return false;
  const payload = value.slice(BUNDLE_LINK_PREFIX.length);
  return payload.length <= MAX_LINK_PAYLOAD && /^[A-Za-z0-9_-]+$/.test(payload);
}

function deliverNext() {
  if (listener?.isDestroyed()) listener = null;
  if (!listener || queue.length === 0) return;
  const target = listener;
  listener = null;
  target.send('deeplink:open', queue.shift());
}

/** Queues every valid link in a command line, and silently skips the rest of it. */
export function queueLinks(argv: readonly string[]) {
  for (const value of argv) {
    if (isBundleLink(value) && !queue.includes(value) && queue.length < MAX_QUEUED) queue.push(value);
  }
  deliverNext();
}

export function hasPendingLinks() {
  return queue.length > 0;
}

export function setupDeepLinks() {
  ipcMain.on('deeplink:ready', (event) => {
    listener = event.sender;
    deliverNext();
  });
}
