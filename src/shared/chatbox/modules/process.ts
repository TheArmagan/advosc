import type { ChatboxModuleOptions } from "../module-base";

export const processOptions: ChatboxModuleOptions = {
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
};
