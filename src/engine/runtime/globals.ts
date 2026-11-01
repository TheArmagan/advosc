import WebSocketImpl from "ws";

/**
 * Must be the first import in the engine. A utility process has no `WebSocket`, and both
 * socket classes plus `@pulsoid/socket` use the global one.
 *
 * The socket classes clear `onerror` before calling `close()`, which is fine in a browser. In
 * `ws`, closing a socket that's still connecting emits an `error` event, and an EventEmitter
 * with no error listener throws. This no-op listener keeps that from taking the engine down.
 */
class EngineWebSocket extends WebSocketImpl {
  constructor(...args: ConstructorParameters<typeof WebSocketImpl>) {
    super(...args);
    this.on("error", () => {});
  }
}

(globalThis as any).WebSocket = EngineWebSocket;
