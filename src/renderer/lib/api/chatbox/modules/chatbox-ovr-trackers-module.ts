import type { TrackerBattery } from "$shared/native-types";
import { ovrTrackersOptions } from "$shared/chatbox/modules/ovr-trackers";
import { callModule } from "../../engine";
import { ModuleClient } from "../module-client";

export type { TrackerBattery };

export class OVRTrackersModule extends ModuleClient {
  constructor() {
    super(ovrTrackersOptions);
  }

  getTrackers(): Promise<TrackerBattery[]> {
    return callModule("OVRTrackers", "getTrackers");
  }
}
