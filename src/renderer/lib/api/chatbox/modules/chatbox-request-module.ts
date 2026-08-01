import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
import { RequestSocket } from "./request/socket";
import {
  clampRefreshSeconds,
  formatValue,
  isSourceConfigured,
  normalizeSource,
  parseBody,
  readPath,
  DEFAULT_TIMEOUT_MS,
  type RequestSource,
} from "./request/types";
// @ts-expect-error
import ChatboxRequestSettings from "$lib/components/chatbox-editor/modules/chatbox-request-settings.svelte";

/** Prefix for the throwaway sources created by the inline `Get` placeholder. */
const INLINE_PREFIX = "__inline:";
/** Backoff after a failed request so a dead endpoint is not hammered every tick. */
const ERROR_RETRY_SECONDS = 15;
/** How long a resolved (placeholder-filled) request is reused before being rebuilt. */
const RESOLVE_TTL = 1000;
/** Sockets and inline caches are dropped once nothing has read them for this long. */
const INACTIVITY_MS = 60 * 1000;

interface ResolvedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

interface HttpFeedState {
  kind: "http";
  resolved?: ResolvedRequest;
  resolvedAt: number;
  /** Signature of the request the cached response belongs to. */
  requestKey: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  text: string;
  parsed: unknown;
  ok: boolean;
  error?: string;
  lastAttempt: number;
  lastUpdate: number;
  count: number;
  lastAccess: number;
  pending?: Promise<void>;
}

interface SocketFeedState {
  kind: "websocket";
  socket: RequestSocket;
  url: string;
  /** Signature of the config the socket was opened with, so an edit forces a reconnect. */
  signature: string;
  text: string;
  parsed: unknown;
  isOnline: boolean;
  error?: string;
  lastUpdate: number;
  count: number;
  lastAccess: number;
}

type FeedState = HttpFeedState | SocketFeedState;

export class ChatboxRequestModule extends ChatboxModule {
  private feeds = new Map<string, FeedState>();
  private inactivityCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: "Request",
      name: "HTTP & WebSocket",
      description:
        "Pull custom info into your chatbox from any web API or WebSocket feed. Add sources below, then read values out of their JSON with a path.",
      Component: ChatboxRequestSettings,
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
    });

    this.inactivityCheckInterval = setInterval(() => this.checkInactiveFeeds(), 15000);

    // An edited or deleted source must not keep its old socket or cached body around.
    this.values.subscribe(() => this.pruneStaleFeeds());
  }

  // ---------------------------------------------------------------- sources

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
    this.dropFeed(name);
  }

  // -------------------------------------------------------------- resolving

  /** Fills the placeholders a user put into the URL, headers and body of a source. */
  private async resolveRequest(source: RequestSource): Promise<ResolvedRequest> {
    const headerEntries = (source.headers || []).filter((header) => (header.key || "").trim());

    const toFill = [
      source.url || "",
      source.body || "",
      ...headerEntries.map((header) => header.value ?? ""),
    ];
    const filled = await chatbox.fillTemplates(toFill, "{{;}}", false, `Request>${source.url}`);

    const headers: Record<string, string> = {};
    headerEntries.forEach((header, index) => {
      headers[header.key.trim()] = filled[2 + index] ?? "";
    });

    return {
      url: filled[0].trim(),
      method: (source.method || "GET").toUpperCase(),
      headers,
      body: filled[1],
      timeoutMs: Number(source.timeoutMs) > 0 ? Number(source.timeoutMs) : DEFAULT_TIMEOUT_MS,
    };
  }

  private requestKey(request: ResolvedRequest): string {
    return JSON.stringify([request.url, request.method, request.headers, request.body]);
  }

  private emptyHttpFeed(): HttpFeedState {
    return {
      kind: "http",
      resolvedAt: 0,
      requestKey: "",
      status: 0,
      statusText: "",
      responseHeaders: {},
      text: "",
      parsed: undefined,
      ok: false,
      lastAttempt: 0,
      lastUpdate: 0,
      count: 0,
      lastAccess: Date.now(),
    };
  }

  // --------------------------------------------------------------- fetching

  /**
   * Returns the cached state for an HTTP source, kicking off a refresh when it has gone
   * stale or when the resolved request changed. Only the very first read for a source
   * waits on the network, so renders stay cheap after that.
   */
  private async getHttpFeed(key: string, source: RequestSource): Promise<HttpFeedState> {
    const existing = this.feeds.get(key);
    const feed: HttpFeedState =
      existing && existing.kind === "http" ? existing : this.emptyHttpFeed();
    this.feeds.set(key, feed);
    feed.lastAccess = Date.now();

    const now = Date.now();
    // Rebuilding the request means re-running its placeholders, so it is throttled.
    if (!feed.resolved || now - feed.resolvedAt >= RESOLVE_TTL) {
      feed.resolved = await this.resolveRequest(source);
      feed.resolvedAt = Date.now();
    }
    const resolved = feed.resolved;
    const key2 = this.requestKey(resolved);

    const refreshMs = clampRefreshSeconds(source.refreshSeconds) * 1000;
    const maxAge = feed.error ? Math.min(refreshMs, ERROR_RETRY_SECONDS * 1000) : refreshMs;
    // A changed URL or body is new data by definition, but still respect a 1s floor so a
    // request built from a fast-moving placeholder cannot fire on every single render.
    const changed = feed.requestKey !== "" && feed.requestKey !== key2;
    const isStale = Date.now() - feed.lastAttempt >= (changed ? 1000 : maxAge);

    if (isStale && !feed.pending && resolved.url) {
      feed.lastAttempt = Date.now();
      feed.pending = (async () => {
        try {
          const result = await window.ADVOSCNative.http.request({
            url: resolved.url,
            method: resolved.method,
            headers: resolved.headers,
            body: resolved.body,
            timeoutMs: resolved.timeoutMs,
          });

          feed.requestKey = key2;
          feed.status = result.status;
          feed.statusText = result.statusText;
          feed.responseHeaders = result.headers || {};
          feed.ok = result.ok;

          if (result.error) {
            feed.error = result.error;
          } else {
            feed.error = result.ok ? undefined : `HTTP ${result.status} ${result.statusText}`.trim();
            feed.text = result.body;
            feed.parsed = parseBody(result.body);
            feed.lastUpdate = Date.now();
            feed.count++;
          }
        } catch (e) {
          feed.error = (e as Error)?.message || String(e);
        } finally {
          feed.lastAttempt = Date.now();
          delete feed.pending;
        }
      })();
    }

    // Nothing cached yet, so this read waits for the first response. Once an endpoint has
    // failed once we stop waiting, otherwise a dead URL would stall every render.
    if (!feed.lastUpdate && !feed.error && feed.pending) await feed.pending;

    return feed;
  }

  // ------------------------------------------------------------ connections

  private async getSocketFeed(key: string, source: RequestSource): Promise<SocketFeedState> {
    const [url] = await chatbox.fillTemplates([source.url || ""], "{{;}}", false, `Request>${key}`);
    const target = url.trim();
    const signature = JSON.stringify([
      target,
      source.openMessage || "",
      source.keepaliveMessage || "",
      source.keepaliveSeconds || 0,
    ]);

    const existing = this.feeds.get(key);
    if (existing && existing.kind === "websocket") {
      if (existing.signature === signature) {
        existing.lastAccess = Date.now();
        return existing;
      }
      // The config was edited (or a placeholder inside the URL changed), so reconnect.
      this.dropFeed(key);
    } else if (existing) {
      this.dropFeed(key);
    }

    const feed: SocketFeedState = {
      kind: "websocket",
      socket: null as unknown as RequestSocket,
      url: target,
      signature,
      text: "",
      parsed: undefined,
      isOnline: false,
      lastUpdate: 0,
      count: 0,
      lastAccess: Date.now(),
    };

    feed.socket = new RequestSocket(
      {
        url: target,
        openMessage: (source.openMessage || "").trim() || undefined,
        keepaliveMessage: (source.keepaliveMessage || "").trim() || undefined,
        keepaliveSeconds: source.keepaliveSeconds,
      },
      {
        onMessage: (raw) => {
          feed.text = raw;
          feed.parsed = parseBody(raw);
          feed.lastUpdate = Date.now();
          feed.count++;
        },
        onOpen: () => {
          feed.isOnline = true;
          feed.error = undefined;
        },
        onClose: () => {
          feed.isOnline = false;
        },
        onError: (error) => {
          feed.isOnline = false;
          feed.error = error instanceof Error ? error.message : "Connection error";
        },
      },
    );

    this.feeds.set(key, feed);
    feed.socket.connect();
    return feed;
  }

  private dropFeed(key: string) {
    const feed = this.feeds.get(key);
    if (!feed) return;
    if (feed.kind === "websocket") {
      try {
        feed.socket.disconnect();
      } catch (e) {
        console.error("Request: error closing socket", e);
      }
    }
    this.feeds.delete(key);
  }

  /** Drops feeds whose source was deleted or edited in the settings UI. */
  private pruneStaleFeeds() {
    const sources = this.getSources();
    for (const key of [...this.feeds.keys()]) {
      if (key.startsWith(INLINE_PREFIX)) continue;
      if (!sources[key]) this.dropFeed(key);
    }
  }

  private checkInactiveFeeds() {
    const cutoff = Date.now() - INACTIVITY_MS;
    for (const [key, feed] of [...this.feeds.entries()]) {
      if (feed.lastAccess < cutoff) this.dropFeed(key);
    }
  }

  // ----------------------------------------------------------------- status

  /** Live state for the settings UI. */
  getStatus(name: string) {
    const feed = this.feeds.get(name);
    if (!feed) return { connected: false, count: 0 };
    if (feed.kind === "websocket") {
      return {
        connected: feed.isOnline,
        error: feed.error,
        count: feed.count,
        lastUpdate: feed.lastUpdate,
        preview: feed.text,
      };
    }
    return {
      connected: !feed.error && !!feed.lastUpdate,
      error: feed.error,
      count: feed.count,
      lastUpdate: feed.lastUpdate,
      status: feed.status,
      preview: feed.text,
    };
  }

  /** Keeps a source live (socket connected, polling running) while its card is open. */
  keepAlive(name: string) {
    const source = this.getSources()[name];
    if (!isSourceConfigured(source)) return;
    if (source.kind === "websocket") {
      this.getSocketFeed(name, source).catch(() => { });
    } else {
      const feed = this.feeds.get(name);
      if (feed) feed.lastAccess = Date.now();
      this.getHttpFeed(name, source).catch(() => { });
    }
  }

  /** Forces the next read of a source to hit the network again. */
  refresh(name: string) {
    const feed = this.feeds.get(name);
    if (feed?.kind === "http") {
      feed.lastAttempt = 0;
      feed.resolvedAt = 0;
    }
    if (feed?.kind === "websocket") this.dropFeed(name);
  }

  /**
   * Runs a source once without touching the cache, for the "Test" button. Returns the
   * resolved request alongside the response so the user can see what actually went out.
   */
  async testSource(source: RequestSource) {
    if (source.kind === "websocket") {
      const [url] = await chatbox.fillTemplates([source.url || ""], "{{;}}", false, "Request>test");
      return { websocket: true, url: url.trim() };
    }
    const resolved = await this.resolveRequest(source);
    if (!resolved.url) return { websocket: false, resolved, result: null, error: "The URL is empty." };
    const result = await window.ADVOSCNative.http.request({
      url: resolved.url,
      method: resolved.method,
      headers: resolved.headers,
      body: resolved.body,
      timeoutMs: resolved.timeoutMs,
    });
    return { websocket: false, resolved, result };
  }

  // ------------------------------------------------------------ placeholders

  /** Resolves a placeholder's first parameter into a feed, creating it if needed. */
  private async getFeed(name: string): Promise<FeedState | null> {
    const source = this.getSources()[name];
    if (!isSourceConfigured(source)) return null;
    return source.kind === "websocket"
      ? await this.getSocketFeed(name, source)
      : await this.getHttpFeed(name, source);
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates(
      [key, ...params],
      "[[:]]",
      false,
      chatbox.getInstanceKey(),
    );

    try {
      if (key === "Get") {
        return await this.inlineGet(params[0] || "", params[1] || "", params[2]);
      }

      const name = params[0] || "";
      if (!name) return "";

      const source = this.getSources()[name];
      if (!source) return `(Unknown request source: ${name})`;
      if (!isSourceConfigured(source)) return "(Request source is not configured)";

      const feed = await this.getFeed(name);
      if (!feed) return "";

      return this.readFeed(feed, key, params.slice(1));
    } catch (e) {
      return `(Request error: ${e})`;
    }
  }

  /** Shared placeholder reader for both configured sources and inline GETs. */
  private readFeed(feed: FeedState, key: string, args: string[]): string {
    switch (key) {
      case "Value": {
        const value = readPath(feed.parsed, args[0] || "");
        return formatValue(value);
      }
      case "Has":
        return readPath(feed.parsed, args[0] || "") !== undefined ? "true" : "false";
      case "Text":
        return feed.text;
      case "Count":
        return String(feed.count);
      case "UpdatedAt":
        return feed.lastUpdate ? String(feed.lastUpdate) : "";
      case "Age":
        return feed.lastUpdate ? String(Math.floor((Date.now() - feed.lastUpdate) / 1000)) : "";
      case "Error":
        return feed.error ?? "";
      case "IsOnline":
        return feed.kind === "websocket"
          ? String(feed.isOnline)
          : String(!feed.error && !!feed.lastUpdate);
      case "Status":
        return feed.kind === "http" && feed.status ? String(feed.status) : "";
      case "Ok":
        return feed.kind === "http" ? String(feed.ok) : String(feed.isOnline);
      case "Header":
        return feed.kind === "http" ? feed.responseHeaders[(args[0] || "").toLowerCase()] ?? "" : "";
      default:
        return "";
    }
  }

  /** `{{Request;Get;url;path;seconds}}` — a configured-source-free GET, cached by URL. */
  private async inlineGet(url: string, path: string, refresh?: string): Promise<string> {
    const target = url.trim();
    if (!target) return "";

    const source: RequestSource = {
      kind: "http",
      url: target,
      method: "GET",
      headers: [],
      body: "",
      refreshSeconds: clampRefreshSeconds(refresh ?? 60),
    };

    const feed = await this.getHttpFeed(`${INLINE_PREFIX}${target}`, source);
    if (feed.error && !feed.lastUpdate) return "";
    return formatValue(readPath(feed.parsed, path));
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const placeholders: PlaceholdersRecord = {};

    for (const [name, source] of Object.entries(this.getSources())) {
      const label = source.kind === "websocket" ? "WebSocket feed" : "endpoint";
      placeholders[`Value;${name}`] = {
        value: "42",
        description: `Reads a JSON path out of the latest body from the "${name}" ${label}.`,
        fillText: `Request;Value;${name};\${1:data.value}`,
      };
      placeholders[`Text;${name}`] = {
        value: '{"data":{"value":42}}',
        description: `The raw latest body from the "${name}" ${label}.`,
        fillText: `Request;Text;${name}`,
      };
      placeholders[`IsOnline;${name}`] = {
        value: "true",
        description: `Whether "${name}" is currently healthy.`,
        fillText: `Request;IsOnline;${name}`,
      };
      placeholders[`Age;${name}`] = {
        value: "12",
        description: `Seconds since "${name}" last produced data.`,
        fillText: `Request;Age;${name}`,
      };
    }

    return placeholders;
  }

  getCleanValues(): Record<string, any> {
    return { sources: this.getSources() };
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

  dispose() {
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
    for (const key of [...this.feeds.keys()]) this.dropFeed(key);
  }
}
