/**
 * Shared shapes and helpers for the Request module: user-configured HTTP endpoints and
 * WebSocket feeds, plus the JSON path reader their placeholders use.
 */

export type RequestSourceKind = "http" | "websocket";

export const requestMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type RequestMethod = (typeof requestMethods)[number];

export interface RequestHeader {
  key: string;
  value: string;
}

export interface RequestSource {
  kind: RequestSourceKind;
  /** http(s) endpoint, or ws(s) endpoint for websocket sources. May contain placeholders. */
  url: string;
  /** http only. */
  method?: RequestMethod;
  /** http only. Header values may contain placeholders. */
  headers?: RequestHeader[];
  /** http only. May contain placeholders. */
  body?: string;
  /** http only. Seconds between polls. */
  refreshSeconds?: number;
  /** http only. Milliseconds before the request is aborted. */
  timeoutMs?: number;
  /** websocket only. Sent once right after the socket opens, e.g. a subscribe message. */
  openMessage?: string;
  /** websocket only. Sent repeatedly to keep the connection alive. */
  keepaliveMessage?: string;
  /** websocket only. Seconds between keepalive messages. */
  keepaliveSeconds?: number;
}

export const MIN_REFRESH_SECONDS = 1;
export const MAX_REFRESH_SECONDS = 3600;
export const DEFAULT_REFRESH_SECONDS = 60;
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_KEEPALIVE_SECONDS = 25;

export function createDefaultSource(kind: RequestSourceKind = "http"): RequestSource {
  return kind === "websocket"
    ? { kind: "websocket", url: "", openMessage: "", keepaliveMessage: "", keepaliveSeconds: DEFAULT_KEEPALIVE_SECONDS }
    : { kind: "http", url: "", method: "GET", headers: [], body: "", refreshSeconds: DEFAULT_REFRESH_SECONDS };
}

export function clampRefreshSeconds(value: unknown): number {
  const seconds = Number(value);
  if (!isFinite(seconds) || seconds <= 0) return DEFAULT_REFRESH_SECONDS;
  return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, Math.round(seconds)));
}

/** True when the source has enough filled in to actually be used. */
export function isSourceConfigured(source: RequestSource | undefined): boolean {
  if (!source || !(source.url || "").trim()) return false;
  return true;
}

export function normalizeSource(input: any): RequestSource | null {
  if (!input || typeof input !== "object") return null;
  const kind: RequestSourceKind = input.kind === "websocket" ? "websocket" : "http";
  const url = typeof input.url === "string" ? input.url : "";
  if (!url.trim()) return null;

  if (kind === "websocket") {
    return {
      kind,
      url,
      openMessage: typeof input.openMessage === "string" ? input.openMessage : "",
      keepaliveMessage: typeof input.keepaliveMessage === "string" ? input.keepaliveMessage : "",
      keepaliveSeconds: Number(input.keepaliveSeconds) > 0 ? Number(input.keepaliveSeconds) : DEFAULT_KEEPALIVE_SECONDS,
    };
  }

  const method = requestMethods.includes(String(input.method).toUpperCase() as RequestMethod)
    ? (String(input.method).toUpperCase() as RequestMethod)
    : "GET";

  return {
    kind,
    url,
    method,
    headers: Array.isArray(input.headers)
      ? input.headers
        .filter((header: any) => header && typeof header.key === "string")
        .map((header: any) => ({ key: header.key, value: String(header.value ?? "") }))
      : [],
    body: typeof input.body === "string" ? input.body : "",
    refreshSeconds: clampRefreshSeconds(input.refreshSeconds),
    timeoutMs: Number(input.timeoutMs) > 0 ? Number(input.timeoutMs) : DEFAULT_TIMEOUT_MS,
  };
}

const PathSegmentRegex = /\[\s*(-?\d+)\s*\]|\[\s*"([^"]*)"\s*\]|\[\s*'([^']*)'\s*\]|([^.[\]]+)/g;

/** Splits `data.items[0]."odd key"` into the segments used to walk a parsed body. */
export function parsePath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  for (const match of path.matchAll(PathSegmentRegex)) {
    if (match[1] !== undefined) segments.push(parseInt(match[1], 10));
    else if (match[2] !== undefined) segments.push(match[2]);
    else if (match[3] !== undefined) segments.push(match[3]);
    else if (match[4] !== undefined) {
      const part = match[4].trim();
      if (part) segments.push(part);
    }
  }
  return segments;
}

/**
 * Walks a parsed payload with a `data.items[0].title` style path. An empty path returns
 * the payload itself. Negative array indexes count from the end, so `[-1]` is the last item.
 */
export function readPath(payload: unknown, path: string): unknown {
  const segments = parsePath(path || "");
  let current: any = payload;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (typeof segment === "number" && Array.isArray(current)) {
      current = current[segment < 0 ? current.length + segment : segment];
      continue;
    }

    if (typeof current !== "object" && typeof current !== "string") return undefined;
    current = current[segment as any];
  }

  return current;
}

/** Parses a body as JSON, falling back to the raw text when it is not JSON. */
export function parseBody(text: string): unknown {
  const trimmed = (text || "").trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

/** Turns a value pulled out of a body into something printable in the chatbox. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
