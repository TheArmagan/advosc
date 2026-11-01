import WebSocket from "ws";
import { CLIENT_NAME, MESSAGE_VERSION } from "./intiface-transport";

/**
 * One stop, for when an earlier engine may have left something running and only the server
 * could end it. Whether a server stops devices when a client disconnects is unverified, and
 * this doesn't depend on it.
 *
 * It's deliberately not the transport: handshake, `StopAllDevices`, wait for the Ok, close. No
 * device list, no scanning, no status, and nothing here can send a level, so it's safe to run
 * with the panic latch set. A latched engine never sends anything except a stop.
 */

const ATTEMPT_LIMIT_MS = 1400;
const RETRY_DELAY_MS = 100;
/** One retry, because a killed client can linger on the server for a moment. */
const ATTEMPTS = 2;
const MAX_PAYLOAD_BYTES = 1024 * 1024;

const SERVER_INFO_ID = 1;
const STOP_ID = 2;

function attempt(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      handshakeTimeout: ATTEMPT_LIMIT_MS,
      perMessageDeflate: false,
      maxPayload: MAX_PAYLOAD_BYTES,
    });

    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(limit);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else socket.terminate();
      if (error) reject(error);
      else resolve();
    };

    const limit = setTimeout(() => finish(new Error("Intiface didn't answer in time.")), ATTEMPT_LIMIT_MS);
    const send = (message: unknown) => socket.send(JSON.stringify([message]));

    socket.on("error", () => finish(new Error("Couldn't reach Intiface.")));
    socket.on("close", () => finish(new Error("Intiface closed the connection.")));
    socket.on("open", () => {
      send({ RequestServerInfo: { Id: SERVER_INFO_ID, ClientName: CLIENT_NAME, MessageVersion: MESSAGE_VERSION } });
    });

    socket.on("message", (data) => {
      let messages: unknown;
      try {
        messages = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(messages)) return;

      for (const message of messages) {
        const body = message?.ServerInfo ?? message?.Ok ?? message?.Error;
        if (message?.ServerInfo && body?.Id === SERVER_INFO_ID) send({ StopAllDevices: { Id: STOP_ID } });
        else if (message?.Ok && body?.Id === STOP_ID) finish();
        else if (message?.Error) finish(new Error("Intiface refused the stop."));
      }
    });
  });
}

/** Never rejects and never takes much over 3 s, so a dead Intiface can't hold anything up. */
export async function stopIntifaceOnce(url: string): Promise<boolean> {
  for (let tries = 1; ; tries++) {
    try {
      await attempt(url);
      console.log("Stopped Intiface devices left over from the last engine.");
      return true;
    } catch (error) {
      if (tries >= ATTEMPTS) {
        console.warn(`Couldn't stop leftover Intiface devices: ${(error as Error).message}`);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
