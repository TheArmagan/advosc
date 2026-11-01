/**
 * A generic reconnecting WebSocket for the Request module. Same backoff shape as the
 * heart rate sockets, but it hands the raw frame to the caller instead of parsing a BPM.
 */

export interface RequestSocketHandlers {
  onMessage: (raw: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onError: (error: unknown) => void;
}

export interface RequestSocketOptions {
  url: string;
  /** Sent once right after the socket opens. */
  openMessage?: string;
  /** Sent every `keepaliveSeconds` while connected. */
  keepaliveMessage?: string;
  keepaliveSeconds?: number;
}

export class RequestSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private closed = false;

  constructor(
    private options: RequestSocketOptions,
    private handlers: RequestSocketHandlers,
  ) { }

  send(message: string) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect() {
    this.closed = false;
    if (this.socket) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url.trim());
    } catch (e) {
      this.handlers.onError(e);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.handlers.onOpen();

      if (this.options.openMessage) this.send(this.options.openMessage);

      const keepalive = this.options.keepaliveMessage;
      if (keepalive) {
        const seconds = Math.max(1, Number(this.options.keepaliveSeconds) || 25);
        this.keepaliveTimer = setInterval(() => this.send(keepalive), seconds * 1000);
      }
    };

    socket.onmessage = (event) => {
      try {
        // Binary frames are rare here; stringifying keeps the placeholder path uniform.
        this.handlers.onMessage(typeof event.data === "string" ? event.data : String(event.data));
      } catch (e) {
        this.handlers.onError(e);
      }
    };

    socket.onerror = (event) => {
      this.handlers.onError(event);
    };

    socket.onclose = () => {
      this.teardownSocket();
      this.handlers.onClose();
      this.scheduleReconnect();
    };
  }

  private teardownSocket() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket = null;
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.attempts++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect();
    }, delay);
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.teardownSocket();
    try {
      socket?.close();
    } catch (e) {
      console.error("Request: error closing socket", e);
    }
  }
}
