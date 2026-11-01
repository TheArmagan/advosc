import { AppModule, type ModuleOptions } from "../module-base";
import type { Writable } from "../../store";
import type { HeartRateSource } from "../heart-rate";

export const heartRateOptions: ModuleOptions = {
  id: "HeartRate",
  name: "Heart Rate",
  description:
    "Live heart rate from a Bluetooth band or strap, Pulsoid, HypeRate, Stromno, or any custom WebSocket feed.",
  examplePlaceholders: {
    "Source;HeartRate": {
      value: "75",
      description: "The current heart rate of the named source.",
      fillText: "HeartRate;${1:sourceName};HeartRate",
    },
    "Source;IsOnline": {
      value: "true",
      description: "Indicates whether the named source is currently connected and sending data.",
      fillText: "HeartRate;${1:sourceName};IsOnline",
    },
    "Source;AverageHR;Seconds": {
      value: "72",
      description:
        "The average heart rate over the specified duration in seconds (default: 300 = 5 minutes). Max 900 seconds.",
      fillText: "HeartRate;${1:sourceName};AverageHR;${2:300}",
    },
    "Source;MaxHR": {
      value: "120",
      description: "The all-time maximum heart rate recorded this session.",
      fillText: "HeartRate;${1:sourceName};MaxHR",
    },
    "Source;MinHR": {
      value: "55",
      description: "The all-time minimum heart rate recorded this session.",
      fillText: "HeartRate;${1:sourceName};MinHR",
    },
    "Source;Battery": {
      value: "84",
      description: "Battery percentage of the device. Bluetooth sources only.",
      fillText: "HeartRate;${1:sourceName};Battery",
    },
    "Source;HasContact": {
      value: "true",
      description:
        "Whether the device reports skin contact. Bluetooth sources only, and true when the device does not report it.",
      fillText: "HeartRate;${1:sourceName};HasContact",
    },
    "Source;DeviceName": {
      value: "Xiaomi Smart Band 10 Pro",
      description: "Advertised name of the device. Bluetooth sources only.",
      fillText: "HeartRate;${1:sourceName};DeviceName",
    },
    "Source;SensorLocation": {
      value: "Wrist",
      description:
        "Where the device is worn (Chest, Wrist, Finger, and so on), when it reports it. Bluetooth sources only.",
      fillText: "HeartRate;${1:sourceName};SensorLocation",
    },
  },
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class HeartRateConfig extends AppModule {
  constructor(values: Writable<Record<string, any>>) {
    super(heartRateOptions, values);
  }

  getSources(): Record<string, HeartRateSource> {
    return this.getValues().sources || {};
  }

  setSource(name: string, source: HeartRateSource) {
    const values = this.getValues();
    this.values.set({
      ...values,
      sources: { ...(values.sources || {}), [name]: source },
    });
  }

  removeSource(name: string) {
    const values = this.getValues();
    const sources = { ...(values.sources || {}) };
    delete sources[name];
    this.values.set({ ...values, sources });
  }

  getCleanValues(): Record<string, any> {
    return { sources: this.getSources() };
  }
}
