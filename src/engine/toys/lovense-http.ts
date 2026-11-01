import * as http from "http";
import * as https from "https";
import type { LookupFunction } from "net";
import type { LovenseStopTarget } from "../../shared/engine-protocol";

/**
 * Talking to Lovense Remote's local server. Plain Node with no electron and no engine imports,
 * because main bundles this too, for the direct Stop it sends when the engine can't.
 *
 * Over HTTPS the socket goes straight to the IP while TLS validates `<dashed-ip>.lovense.club`.
 * That name is only ever resolved by the `lookup` below, so routers that block DNS rebinding and
 * offline PCs both work. Verification is Node's default and nothing here turns it off.
 */

export type LovenseScheme = "https" | "http";

export interface LovenseEndpoint {
  ip: string;
  port: number;
  scheme: LovenseScheme;
}

export type LovenseErrorKind = "certificate" | "network" | "timeout" | "reply" | "device";

export class LovenseError extends Error {
  constructor(
    message: string,
    public kind: LovenseErrorKind,
    public code?: number,
  ) {
    super(message);
  }
}

/** Shown to the user, so every line here is plain words. */
const deviceErrors: Record<number, string> = {
  400: "Lovense Remote didn't accept that command.",
  401: "Lovense Remote can't find that toy.",
  402: "That toy isn't connected to Lovense Remote.",
  403: "That toy can't do that.",
  404: "Lovense Remote rejected a value in that command.",
  500: "Lovense Remote's game mode server isn't running. Turn on Game Mode in the app.",
  506: "Lovense Remote hit a server error. Restarting the app should fix it.",
};

const CERTIFICATE_ERRORS = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

const MAX_REPLY_BYTES = 1024 * 1024;
const PLATFORM_NAME = "ADVOSC";

export const LOVENSE_PC_IP = "127.0.0.1";
export const LOVENSE_PC_ATTEMPTS = [
  { scheme: "https", port: 30010 },
  { scheme: "http", port: 20010 },
] as const satisfies readonly { scheme: LovenseScheme; port: number }[];

/** `timeSec` 0 is only ever sent on this command. Everything else has to run out by itself. */
export const LOVENSE_STOP_BODY = { command: "Function", action: "Stop", timeSec: 0, apiVer: 1 } as const;

export function lovenseHostname(ip: string) {
  return `${ip.replaceAll(".", "-")}.lovense.club`;
}

/** Takes what the Game Mode screen shows, or the dashed name. Returns null for anything else. */
export function parseLovenseIp(host: string): string | null {
  const text = host.trim().toLowerCase().replace(/\.lovense\.club$/, "").replaceAll("-", ".");
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  if (!parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return null;
  return parts.map(Number).join(".");
}

function explainFailure(error: NodeJS.ErrnoException, endpoint: LovenseEndpoint): LovenseError {
  const code = error.code ?? "";
  if (error instanceof LovenseError) return error;
  if (CERTIFICATE_ERRORS.has(code)) {
    return new LovenseError(
      `The certificate from ${endpoint.ip}:${endpoint.port} didn't check out, so ADVOSC won't talk to it.`,
      "certificate",
    );
  }
  if (code === "ECONNREFUSED") {
    return new LovenseError(
      `Nothing is answering at ${endpoint.ip}:${endpoint.port}. Check that Lovense Remote is open with Game Mode on.`,
      "network",
    );
  }
  return new LovenseError(`Couldn't reach Lovense Remote at ${endpoint.ip}:${endpoint.port}.`, "network");
}

export interface LovenseRequestOptions {
  timeoutMs: number;
  /** Omit for a one-off connection. Stops use one, so a stale pooled socket can't lose them. */
  agent?: http.Agent;
}

/** POSTs to `/command`. Resolves with `data` on `code` 200 and rejects in plain words otherwise. */
export function postLovense(
  endpoint: LovenseEndpoint,
  body: Record<string, unknown>,
  options: LovenseRequestOptions,
): Promise<any> {
  const secure = endpoint.scheme === "https";
  const payload = JSON.stringify(body);

  // Called with `all` when Node's autoSelectFamily is on, which is the default.
  const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) (callback as any)(null, [{ address: endpoint.ip, family: 4 }]);
    else callback(null, endpoint.ip, 4);
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: LovenseError | null, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const request = (secure ? https : http).request(
      {
        hostname: secure ? lovenseHostname(endpoint.ip) : endpoint.ip,
        port: endpoint.port,
        path: "/command",
        method: "POST",
        lookup,
        agent: options.agent ?? false,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "X-platform": PLATFORM_NAME,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_REPLY_BYTES) {
            request.destroy();
            finish(new LovenseError("Lovense Remote sent back more data than expected.", "reply"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", (error) => finish(explainFailure(error, endpoint)));
        response.on("end", () => {
          let reply: any;
          try {
            reply = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          } catch {
            finish(new LovenseError("Lovense Remote sent a reply ADVOSC couldn't read.", "reply"));
            return;
          }
          const code = Number(reply?.code);
          if (code === 200) finish(null, reply.data);
          else if (deviceErrors[code]) finish(new LovenseError(deviceErrors[code], "device", code));
          else finish(new LovenseError("Lovense Remote sent a reply ADVOSC couldn't read.", "reply"));
        });
      },
    );

    // The socket's own timeout only covers idle time, and a server that trickles bytes would
    // hold the in-flight slot forever. This is a hard limit on the whole request.
    const timer = setTimeout(() => {
      finish(new LovenseError("Lovense Remote didn't answer in time.", "timeout"));
      request.destroy();
    }, options.timeoutMs);

    request.on("error", (error) => finish(explainFailure(error, endpoint)));
    request.end(payload);
  });
}

/** Tries each way in and stops at the first that answers. Never drops to HTTP after a bad certificate. */
export async function stopLovenseDirect(target: LovenseStopTarget, timeoutMs: number): Promise<void> {
  let failure: unknown = new Error("No way to reach this Lovense app.");
  for (const { scheme, port } of target.attempts) {
    try {
      await postLovense({ ip: target.ip, port, scheme }, { ...LOVENSE_STOP_BODY }, { timeoutMs });
      return;
    } catch (error) {
      failure = error;
      if (error instanceof LovenseError && error.kind === "certificate") break;
    }
  }
  throw failure;
}
