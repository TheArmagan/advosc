import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import type { TrackerBattery } from "../../../../../main/preload";
// @ts-expect-error
import ChatboxOVRTrackerSettings from "$lib/components/chatbox-editor/modules/chatbox-ovr-tracker-settings.svelte";

export type { TrackerBattery };

interface TrackersCache {
  trackers: TrackerBattery[];
  lastChecked: number;
  error?: string;
}

export class ChatboxOVRTrackersModule extends ChatboxModule {
  private trackersCache: TrackersCache | null = null;
  private readonly CHECK_INTERVAL = 5000; // 5 seconds

  constructor() {
    super({
      id: "OVRTrackers",
      name: "OpenVR Trackers",
      description: "OpenVR tracker information including battery level, charging status, and device details.",
      Component: ChatboxOVRTrackerSettings,
      examplePlaceholders: {
        "BatteryLevel": {
          value: "85",
          description: "Returns the battery level (0-100) of the tracker matching the finder. Finder can be device index, serial number, device class, or model number (contains).",
          fillText: "OVRTrackers;BatteryLevel;${1:finder}"
        },
        "IsCharging": {
          value: "true",
          description: "Returns 'true' if the tracker matching the finder is charging, 'false' otherwise.",
          fillText: "OVRTrackers;IsCharging;${1:finder}"
        },
        "DeviceClass": {
          value: "TrackedDeviceClass_GenericTracker",
          description: "Returns the device class of the tracker matching the finder.",
          fillText: "OVRTrackers;DeviceClass;${1:finder}"
        },
        "ModelNumber": {
          value: "Vive Tracker 3.0",
          description: "Returns the model number of the tracker matching the finder.",
          fillText: "OVRTrackers;ModelNumber;${1:finder}"
        },
        "SerialNumber": {
          value: "LHR-12345678",
          description: "Returns the serial number of the tracker matching the finder.",
          fillText: "OVRTrackers;SerialNumber;${1:finder}"
        },
        "DeviceIndex": {
          value: "3",
          description: "Returns the device index of the tracker matching the finder.",
          fillText: "OVRTrackers;DeviceIndex;${1:finder}"
        },
        "IsExists": {
          value: "true",
          description: "Returns 'true' if a tracker matching the finder exists, 'false' otherwise.",
          fillText: "OVRTrackers;IsExists;${1:finder}"
        }
      }
    });
  }

  async getTrackers(): Promise<TrackerBattery[]> {
    const now = Date.now();

    // If cached and within interval, return cached value
    if (this.trackersCache && (now - this.trackersCache.lastChecked) < this.CHECK_INTERVAL) {
      return this.trackersCache.trackers;
    }

    // Fetch fresh data
    try {
      const result = await window.ADVOSCNative.utils.getOpenVRTrackers();

      if (result.error || result.trackers === null) {
        this.trackersCache = {
          trackers: [],
          lastChecked: now,
          error: result.error
        };
        return [];
      }

      this.trackersCache = {
        trackers: result.trackers,
        lastChecked: now
      };

      return result.trackers;
    } catch (err) {
      this.trackersCache = {
        trackers: [],
        lastChecked: now,
        error: String(err)
      };
      return [];
    }
  }

  private findTracker(trackers: TrackerBattery[], finder: string): TrackerBattery | undefined {
    if (!finder) return undefined;

    // Try to parse as device index (number)
    const deviceIndex = parseInt(finder, 10);
    if (!isNaN(deviceIndex)) {
      const tracker = trackers.find(t => t.deviceIndex === deviceIndex);
      if (tracker) return tracker;
    }

    // Try exact match on serial number
    const bySerial = trackers.find(t => t.serialNumber === finder);
    if (bySerial) return bySerial;

    // Try exact match on device class
    const byDeviceClass = trackers.find(t => t.deviceClass === finder);
    if (byDeviceClass) return byDeviceClass;

    // Try contains match on model number
    const byModelContains = trackers.find(t =>
      t.modelNumber && t.modelNumber.toLowerCase().includes(finder.toLowerCase())
    );
    if (byModelContains) return byModelContains;

    return undefined;
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates([key, ...params], "[[:]]", false, chatbox.getInstanceKey());

    const finder = params[0];
    if (!finder) return "";

    try {
      const trackers = await this.getTrackers();
      const tracker = this.findTracker(trackers, finder);

      if (!tracker) {
        // IsExists should return "false" when tracker not found
        if (key === "IsExists") return "false";
        if (key === "BatteryLevel") return "0";
        return "";
      }

      switch (key) {
        case "BatteryLevel":
          return Math.round(tracker.batteryLevel * 100).toString();
        case "IsCharging":
          return tracker.isCharging ? "true" : "false";
        case "DeviceClass":
          return tracker.deviceClass || "";
        case "ModelNumber":
          return tracker.modelNumber || "";
        case "SerialNumber":
          return tracker.serialNumber || "";
        case "DeviceIndex":
          return tracker.deviceIndex.toString();
        case "IsExists":
          return "true";
        default:
          return "";
      }
    } catch (e) {
      return `(OVRTrackers error: ${e})`;
    }
  }
}
