import { RequestConfig } from "$shared/chatbox/modules/request";
import type { RequestSource } from "$shared/chatbox/request-types";
import { callModule, fire } from "../../engine";
import { moduleValues } from "../module-client";

interface RequestStatus {
  connected: boolean;
  error?: string;
  count: number;
  lastUpdate?: number;
  status?: number;
  preview?: string;
}

export class ChatboxRequestModule extends RequestConfig {
  private statuses = new Map<string, RequestStatus>();

  constructor() {
    super(moduleValues("Request"));
  }

  /** Each keep-alive brings back the status, so the settings tab pays for what it shows. */
  keepAlive(name: string) {
    callModule<RequestStatus>("Request", "keepAlive", name).then(
      (status) => this.statuses.set(name, status),
      () => this.statuses.delete(name),
    );
  }

  getStatus(name: string): RequestStatus {
    return this.statuses.get(name) ?? { connected: false, count: 0 };
  }

  refresh(name: string) {
    fire("module.call", "Request", "refresh", [name]);
  }

  testSource(source: RequestSource) {
    return callModule("Request", "testSource", source);
  }
}
