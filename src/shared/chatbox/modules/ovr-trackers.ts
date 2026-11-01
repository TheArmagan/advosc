import type { ChatboxModuleOptions } from "../module-base";

export const ovrTrackersOptions: ChatboxModuleOptions = {
  id: "OVRTrackers",
  name: "OpenVR Trackers",
  description: "OpenVR tracker information including battery level, charging status, and device details.",
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
};
