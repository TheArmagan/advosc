import { ipcMain, type WebContents } from 'electron';
import { appLinkPayload, BUNDLE_LINK_PREFIX, isAppLink, MAX_LINK_PAYLOAD } from '../../shared/automation-bundle';

/**
 * Takes `advosc://` links from the command line and hands them to the window one at a time.
 *
 * A link can arrive with no window at all, since the app can be tray-only, so nothing is sent
 * until the renderer says it's listening. The renderer says that again each time it's done with a
 * link, which is how more than one link stays in order. Only a well-formed payload ever reaches a
 * window, and the renderer still validates what's inside it. A link that isn't well formed reaches
 * it empty, which shows as an error: dropped quietly, it would look like the app ignored the click.
 *
 * Only import constants and pure helpers from `automation-bundle.ts` here. Main's build leaves
 * fflate external, so calling one of its decode functions adds a `require('fflate')`, and forge
 * prunes that package. The rest tree-shakes it away.
 */

/** Someone clicking the same link in a loop shouldn't be able to pile up reviews. */
const MAX_QUEUED = 8;

const queue: string[] = [];
/** The renderer that's waiting for a link. Cleared on delivery until it's ready again. */
let listener: WebContents | null = null;

function toDeliverable(value: string): string {
  const payload = appLinkPayload(value);
  const usable = payload !== null && payload.length <= MAX_LINK_PAYLOAD;
  return `${BUNDLE_LINK_PREFIX}${usable ? payload : ''}`;
}

function deliverNext() {
  if (listener?.isDestroyed()) listener = null;
  if (!listener || queue.length === 0) return;
  const target = listener;
  listener = null;
  target.send('deeplink:open', queue.shift());
}

/** Queues every app link in a command line, in the one form the renderer gets to see. */
export function queueLinks(argv: readonly string[]) {
  for (const value of argv) {
    if (!isAppLink(value)) continue;
    const link = toDeliverable(value);
    if (!queue.includes(link) && queue.length < MAX_QUEUED) queue.push(link);
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
