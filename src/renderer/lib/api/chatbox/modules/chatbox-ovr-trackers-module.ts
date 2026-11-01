import type { TrackerBattery } from "$shared/native-types";
import { ovrTrackersOptions } from "$shared/chatbox/modules/ovr-trackers";
import { callModule } from "../../engine";
import { ChatboxModuleClient } from "../module-client";

export type { TrackerBattery };

export class ChatboxOVRTrackersModule extends ChatboxModuleClient {
  constructor() {
    super(ovrTrackersOptions);
  }

  getTrackers(): Promise<TrackerBattery[]> {
    return callModule("OVRTrackers", "getTrackers");
  }
}
