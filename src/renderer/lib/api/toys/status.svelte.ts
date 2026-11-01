import { panic, toys } from "./index";

/**
 * Runes copies of the two values the app shell reads. `visible()` in `nav.ts` is a plain function
 * called from a template, so it only re-runs when it reads runes state: `get(store)` would leave
 * the sidebar showing what was true when it first rendered.
 */

let enabled = $state(false);
let latched = $state(false);

toys.settings.subscribe((value) => {
  enabled = value.enabled;
});

panic.state.subscribe((value) => {
  latched = value.latched;
});

export const toyStatus = {
  get enabled() {
    return enabled;
  },
  get latched() {
    return latched;
  },
};
