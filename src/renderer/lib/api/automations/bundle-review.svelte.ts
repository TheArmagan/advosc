import { parseBundleInput, type AutomationBundle } from "$shared/automation-bundle";

/**
 * What the review drawer is showing. The drawer lives in `main.svelte`, because a link can land
 * on any page and pages unmount, so the Automations page opens it through here as well.
 */

const native = window.ADVOSCNative.deeplink;

let open = $state(false);
/** The paste step. Off, the drawer shows a bundle, or an error from a link. */
let pasting = $state(false);
let bundle = $state.raw<AutomationBundle | null>(null);
let error = $state<string | null>(null);

/** Main sent what's showing, so it's waiting to hear when that's done. */
let fromLink = false;
/** A link that landed while the paste step was open. Main sends no more until this one is done. */
let heldLink: string | null = null;

function parse(input: string): boolean {
  try {
    bundle = parseBundleInput(input);
    error = null;
    return true;
  } catch (reason) {
    bundle = null;
    error = (reason as Error).message;
    return false;
  }
}

function showLink(link: string) {
  fromLink = true;
  pasting = false;
  parse(link);
  open = true;
}

function close() {
  if (!open) return;
  open = false;

  const next = heldLink;
  heldLink = null;
  if (next) {
    showLink(next);
    return;
  }

  if (fromLink) {
    fromLink = false;
    native.ready();
  }
}

export const bundleReview = {
  get open() {
    return open;
  },
  get pasting() {
    return pasting;
  },
  get bundle() {
    return bundle;
  },
  get error() {
    return error;
  },
  /** Opens the paste step. */
  startImport() {
    if (open) return;
    bundle = null;
    error = null;
    pasting = true;
    open = true;
  },
  /** Moves from the paste step to the review. A bad input stays on the paste step, with its error. */
  submit(input: string) {
    if (parse(input)) pasting = false;
  },
  fail(message: string) {
    error = message;
  },
  close,
  /** Call once, when the drawer mounts. Main holds links until it hears this. */
  listen() {
    const stop = native.onLink((link) => {
      if (open) heldLink = link;
      else showLink(link);
    });
    native.ready();
    return stop;
  },
};
