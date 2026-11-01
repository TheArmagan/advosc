import { native } from "../../native";
import { moduleValues } from "../module-values";
import { RequestConfig } from "$shared/chatbox/modules/request";
import { chatbox } from "..";
import type { PlaceholdersRecord } from "$shared/chatbox/module-base";
import { canReachNetwork, isReadOnly, reportNoData } from "../eval-context";
import { RequestSocket } from "./request/socket";
import {
  clampRefreshSeconds,
  formatValue,
  isSourceConfigured,
  parseBody,
  readPath,
  DEFAULT_TIMEOUT_MS,
  type RequestSource,
} from "$shared/chatbox/request-types";

/** Prefix for the throwaway sources created by the inline `Get` placeholder. */
const INLINE_PREFIX = "__inline:";
/** Backoff after a failed request so a dead endpoint is not hammered every tick. */
const ERROR_RETRY_SECONDS = 15;
/** How long a resolved (placeholder-filled) request is reused before being rebuilt. */
const RESOLVE_TTL = 1000;
/** Sockets and inline caches are dropped once nothing has read them for this long. */
const INACTIVITY_MS = 60 * 1000;
/** A body can be 2 MB, and this goes to a window a few times a second. */
const MAX_STATUS_PREVIEW = 2000;

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

export class RequestModule extends RequestConfig {
  private feeds = new Map<string, FeedState>();
  private inactivityCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super(moduleValues("Request"));

    this.inactivityCheckInterval = setInterval(() => this.checkInactiveFeeds(), 15000);

    // An edited or deleted source must not keep its old socket or cached body around.
    this.onValuesChange(() => this.pruneStaleFeeds());
  }

  // ---------------------------------------------------------------- sources

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
          const result = await native.http.request({
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
        preview: feed.text.slice(0, MAX_STATUS_PREVIEW),
      };
    }
    return {
      connected: !feed.error && !!feed.lastUpdate,
      error: feed.error,
      count: feed.count,
      lastUpdate: feed.lastUpdate,
      status: feed.status,
      preview: feed.text.slice(0, MAX_STATUS_PREVIEW),
    };
  }

  /** Keeps a source live (socket connected, polling running) while its card is open. */
  keepAlive(name: string) {
    const source = this.getSources()[name];
    if (isSourceConfigured(source)) {
      if (source.kind === "websocket") {
        this.getSocketFeed(name, source).catch(() => { });
      } else {
        const feed = this.feeds.get(name);
        if (feed) feed.lastAccess = Date.now();
        this.getHttpFeed(name, source).catch(() => { });
      }
    }
    return this.getStatus(name);
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
    const result = await native.http.request({
      url: resolved.url,
      method: resolved.method,
      headers: resolved.headers,
      body: resolved.body,
      timeoutMs: resolved.timeoutMs,
    });
    return { websocket: false, resolved, result };
  }

  // ------------------------------------------------------------ placeholders

  runInput(inputId: string, args: Record<string, string>) {
    if (inputId !== "refresh") return super.runInput(inputId, args);
    this.refresh(args.source ?? "");
  }

  /**
   * Whether this read may go out on the network. A rule keeps a source's feed alive, paced by
   * the source's own refresh time, as long as fetching it can't change anything. A source that
   * POSTs could, so read-only rules only see what something else already fetched. Previews run
   * on every keystroke and never go out at all.
   */
  private mayFetch(source: RequestSource): boolean {
    if (!canReachNetwork()) return false;
    if (!isReadOnly() || source.kind === "websocket") return true;
    return ["GET", "HEAD"].includes((source.method || "GET").toUpperCase());
  }

  /** Resolves a placeholder's first parameter into a feed, creating it if needed. */
  private async getFeed(name: string): Promise<FeedState | null> {
    const source = this.getSources()[name];
    if (!isSourceConfigured(source)) return null;
    if (!this.mayFetch(source)) return this.feeds.get(name) ?? null;
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
      if (!feed) {
        reportNoData(`Nothing has fetched the ${name} source yet.`);
        return "";
      }

      if ((key === "Value" || key === "Text" || key === "Has") && (feed.error || !feed.lastUpdate)) {
        reportNoData(`The ${name} source has no data right now.`);
      }

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

    const feedKey = `${INLINE_PREFIX}${target}`;
    const feed = this.mayFetch(source) ? await this.getHttpFeed(feedKey, source) : this.feeds.get(feedKey);
    if (!feed) {
      reportNoData("Nothing has fetched this address yet.");
      return "";
    }
    if (feed.error && !feed.lastUpdate) {
      reportNoData("This address has no data right now.");
      return "";
    }
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

  dispose() {
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
    for (const key of [...this.feeds.keys()]) this.dropFeed(key);
  }
}
