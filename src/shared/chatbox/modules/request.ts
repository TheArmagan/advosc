import { ChatboxModule, type ChatboxModuleOptions } from "../module-base";
import type { Writable } from "../../store";
import { normalizeSource, type RequestSource } from "../request-types";

export const requestOptions: ChatboxModuleOptions = {
  id: "Request",
  name: "HTTP & WebSocket",
  description:
    "Pull custom info into your chatbox from any web API or WebSocket feed. Add sources below, then read values out of their JSON with a path.",
  examplePlaceholders: {
    "Value": {
      value: "42",
      description:
        "Reads a value out of the latest response (or latest WebSocket message) of a source, using a JSON path such as data.items[0].title. Leave the path empty for the whole body.",
      fillText: "Request;Value;${1:sourceName};${2:data.value}",
    },
    "Text": {
      value: '{"data":{"value":42}}',
      description: "The raw body of the latest response, or the latest WebSocket message as received.",
      fillText: "Request;Text;${1:sourceName}",
    },
    "Get": {
      value: "42",
      description:
        "One-off GET request without configuring a source. Takes a URL, an optional JSON path and an optional refresh interval in seconds (default 60).",
      fillText: "Request;Get;${1:https://api.example.com/data};${2:data.value};${3:60}",
    },
    "Status": {
      value: "200",
      description: "HTTP status code of the latest response. Empty for WebSocket sources.",
      fillText: "Request;Status;${1:sourceName}",
    },
    "Ok": {
      value: "true",
      description: "Returns 'true' when the latest response had a 2xx status code.",
      fillText: "Request;Ok;${1:sourceName}",
    },
    "IsOnline": {
      value: "true",
      description:
        "Returns 'true' while the source is healthy: the last request succeeded, or the WebSocket is connected.",
      fillText: "Request;IsOnline;${1:sourceName}",
    },
    "Has": {
      value: "true",
      description: "Returns 'true' when the given JSON path exists in the latest body.",
      fillText: "Request;Has;${1:sourceName};${2:data.value}",
    },
    "Count": {
      value: "7",
      description:
        "How many responses have been received this session, or how many WebSocket messages have arrived.",
      fillText: "Request;Count;${1:sourceName}",
    },
    "UpdatedAt": {
      value: "1700000000000",
      description:
        "When the source last produced data, in milliseconds since the Unix epoch. Format it with {{Time;Timestamp;...;HH:mm}}.",
      fillText: "Request;UpdatedAt;${1:sourceName}",
    },
    "Age": {
      value: "12",
      description: "Seconds since the source last produced data.",
      fillText: "Request;Age;${1:sourceName}",
    },
    "Error": {
      value: "Request timed out after 10000ms",
      description: "The last error message for the source, or empty when everything is fine.",
      fillText: "Request;Error;${1:sourceName}",
    },
    "Header": {
      value: "application/json",
      description: "A header of the latest HTTP response, by name.",
      fillText: "Request;Header;${1:sourceName};${2:content-type}",
    },
  },
  inputs: [
    {
      id: "refresh",
      label: "Refresh",
      description: "Fetches a source again on its next read, or reconnects its WebSocket.",
      params: [{ id: "source", label: "Source", type: "text", placeholder: "sourceName" }],
    },
  ],
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class RequestConfig extends ChatboxModule {
  constructor(values: Writable<Record<string, any>>) {
    super(requestOptions, values);
  }

  getSources(): Record<string, RequestSource> {
    return this.getValues().sources || {};
  }

  setSource(name: string, source: RequestSource) {
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

  /** Merges an imported `name -> source` map, dropping entries that make no sense. */
  importSources(raw: unknown): { imported: number; failed: number } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Expected an object of source names to source definitions.");
    }

    const values = this.getValues();
    const sources = { ...(values.sources || {}) };
    let imported = 0;
    let failed = 0;

    for (const [name, candidate] of Object.entries(raw as Record<string, unknown>)) {
      const normalized = normalizeSource(candidate);
      if (!normalized || !name.trim()) {
        failed++;
        continue;
      }
      sources[name] = normalized;
      imported++;
    }

    this.values.set({ ...values, sources });
    return { imported, failed };
  }

  getCleanValues(): Record<string, any> {
    return { sources: this.getSources() };
  }
}
