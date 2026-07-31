import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";

interface ProcessCache {
  startTime: number | null;
  lastChecked: number;
  error?: string;
}

export class ChatboxProcessModule extends ChatboxModule {
  private processCache: Map<string, ProcessCache> = new Map();
  private readonly CHECK_INTERVAL = 5000; // 5 seconds

  constructor() {
    super({
      id: "Process",
      name: "Process",
      description: "Process information utilities. Like start time and session duration.",
      examplePlaceholders: {
        "StartedAt": {
          value: "1700000000000",
          description: "Returns the start time of the specified process in milliseconds since Unix epoch. Returns empty if process not found.",
          fillText: "Process;StartedAt;${1:processName.exe}"
        },
        "SessionTime": {
          value: "3600000",
          description: "Returns the elapsed time in milliseconds since the specified process started. Returns empty if process not found.",
          fillText: "Process;SessionTime;${1:processName.exe}"
        },
        "IsRunning": {
          value: "true",
          description: "Returns 'true' if the specified process is running, 'false' otherwise.",
          fillText: "Process;IsRunning;${1:processName.exe}"
        }
      }
    });
  }

  private async getProcessStartTime(processName: string): Promise<number | null> {
    const now = Date.now();
    const cached = this.processCache.get(processName);

    // If cached and within interval, calculate offset from cached value
    if (cached && (now - cached.lastChecked) < this.CHECK_INTERVAL) {
      return cached.startTime;
    }

    // Fetch fresh data
    try {
      const result = await window.ADVOSCNative.utils.getStartTime(processName);

      if (result.error || result.startTime === null) {
        this.processCache.set(processName, {
          startTime: null,
          lastChecked: now,
          error: result.error
        });
        return null;
      }


      this.processCache.set(processName, {
        startTime: result.startTime,
        lastChecked: now
      });

      return result.startTime;
    } catch (err) {
      this.processCache.set(processName, {
        startTime: null,
        lastChecked: now,
        error: String(err)
      });
      return null;
    }
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    params = await chatbox.fillTemplates(params, "[[:]]", false, chatbox.getInstanceKey());

    try {
      switch (key) {
        case "StartedAt": {
          const processName = params[0];
          if (!processName) return "";

          const startTime = await this.getProcessStartTime(processName);
          if (startTime === null) return "";

          return startTime.toString();
        }
        case "SessionTime": {
          const processName = params[0];
          if (!processName) return "";

          const startTime = await this.getProcessStartTime(processName);
          if (startTime === null) return "";

          const elapsed = Date.now() - startTime;
          return elapsed.toString();
        }
        case "IsRunning": {
          const processName = params[0];
          if (!processName) return "false";

          const startTime = await this.getProcessStartTime(processName);
          return startTime !== null ? "true" : "false";
        }
      }
    } catch (e) {
      return `(Process error: ${e})`;
    }
    return "";
  }
}
