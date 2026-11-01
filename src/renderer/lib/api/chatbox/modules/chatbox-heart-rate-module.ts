import type { HeartRateExtras, HeartRatePlatform, HeartRateSource } from "$shared/chatbox/heart-rate";
import { HeartRateConfig } from "$shared/chatbox/modules/heart-rate";
import { callModule } from "../../engine";
import { moduleValues } from "../module-client";

export type { HeartRatePlatform, HeartRateSource };

interface HeartRateStatus {
  connected: boolean;
  heartRate?: number;
  error?: string;
  extras?: HeartRateExtras;
}

export class HeartRateModule extends HeartRateConfig {
  private statuses = new Map<string, HeartRateStatus>();

  constructor() {
    super(moduleValues("HeartRate"));
  }

  /** Each keep-alive brings back the status, so the settings tab pays for what it shows. */
  keepAlive(name: string) {
    callModule<HeartRateStatus>("HeartRate", "keepAlive", name).then(
      (status) => this.statuses.set(name, status),
      () => this.statuses.delete(name),
    );
  }

  getStatus(name: string): HeartRateStatus {
    return this.statuses.get(name) ?? { connected: false };
  }
}
