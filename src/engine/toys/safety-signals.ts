import { native } from "../native";
import type { ToySettings } from "$shared/toys";
import type { ToyService } from "./service";

/**
 * Two signals that say whether anyone's still there. They're treated differently on purpose.
 *
 * VRChat's process is the hard one: seen running, then gone, means stop. OSC silence is soft,
 * because VRChat can send nothing at all while you sit still, so it only pauses `live` and
 * `while` output and the next message brings it back.
 */

const PROCESS_POLL_MS = 5000;
const SILENCE_CHECK_MS = 1000;
const AVATAR_CHANGE_ADDRESS = "/avatar/change";
/** Exactly what `advosc-utils start-time` says. Anything else means it couldn't tell. */
const NOT_RUNNING = /^Process '.*' not found$/;

export function startSafetySignals(service: ToyService, getSettings: () => ToySettings) {
  let lastOscAt = Date.now();
  let wasArmed = false;
  let vrchatStart: number | null = null;
  let polling = false;

  native.osc.onMessage((message) => {
    lastOscAt = Date.now();
    service.setSilencePaused(false);
    if (message.address === AVATAR_CHANGE_ADDRESS && getSettings().stopOnAvatarChange && service.armed) {
      console.log("Avatar changed, stopping toys.");
      service.interrupt();
    }
  });

  setInterval(() => {
    const armed = service.armed;
    // Time spent disarmed isn't silence worth acting on the moment it's armed again.
    if (armed && !wasArmed) lastOscAt = Date.now();
    wasArmed = armed;

    const { silencePauseSec } = getSettings();
    if (!armed || !(silencePauseSec > 0)) {
      service.setSilencePaused(false);
      return;
    }
    if (Date.now() - lastOscAt >= silencePauseSec * 1000) service.setSilencePaused(true);
  }, SILENCE_CHECK_MS);

  setInterval(async () => {
    if (!service.armed || polling) return;
    polling = true;
    try {
      const { startTime, error } = await native.utils.getStartTime("VRChat");

      if (typeof startTime === "number") {
        // A different start time means it closed and reopened between two polls.
        if (vrchatStart !== null && vrchatStart !== startTime) service.vrchatExited();
        vrchatStart = startTime;
        service.vrchatSeen();
        return;
      }

      if (vrchatStart !== null && NOT_RUNNING.test(error ?? "")) {
        vrchatStart = null;
        service.vrchatExited();
      }
    } finally {
      polling = false;
    }
  }, PROCESS_POLL_MS);
}
