// HTTP/2 gRPC client for the Grok mobile chat API.
// Adapted from grok-mcp/src/grok-client.ts: same wire protocol, but returns a
// parsed GrokResult (or a friendly error string) instead of the raw response.
import http2 from "node:http2";
import { grpcFrame, fieldString, fieldBool, concat } from "./protobuf.js";
import { parseGrokResponse } from "./parse.js";
import type { GrokMode, GrokResult } from "./types.js";

const HOST = "https://grok.com";
const PATH = "/grok_api.Chat/CreateConversationAndRespond";

// Request field tags (from reversed CreateConversationAndRespondRequest)
const TAG_TEMPORARY = 3; // bool  -> incognito
const TAG_MESSAGE = 5; // string -> prompt
const TAG_DISABLE_SEARCH = 8; // bool
const TAG_MODE_ID = 60; // string -> "fast" | "expert"

export interface GrokRequestOptions {
  sso: string;
  ssoRw?: string;
  userAgent?: string;
  timeoutMs?: number;
}

export function buildRequestBody(prompt: string, mode: GrokMode): Uint8Array {
  // temporary=true (always incognito), disable_search=false (search on), mode_id=fast|expert
  return concat(
    fieldBool(TAG_TEMPORARY, true),
    fieldString(TAG_MESSAGE, prompt),
    fieldBool(TAG_DISABLE_SEARCH, false),
    fieldString(TAG_MODE_ID, mode),
  );
}

interface GrokRawResponse {
  status: number; // grpc-status
  message?: string; // grpc-message
  body: Uint8Array; // concatenated framed payloads
}

function callGrokRaw(
  prompt: string,
  mode: GrokMode,
  opts: GrokRequestOptions,
): Promise<GrokRawResponse> {
  const ssoRw = opts.ssoRw ?? opts.sso;
  const cookie = `sso=${opts.sso}; sso-rw=${ssoRw}`;
  const userAgent = opts.userAgent ?? "grok/1.1.82 (Android 16)";
  const payload = grpcFrame(buildRequestBody(prompt, mode));
  const timeoutMs = opts.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    const client = http2.connect(HOST);
    const chunks: Uint8Array[] = [];
    let grpcStatus = 0;
    let grpcMessage: string | undefined;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try { client.close(); } catch { /* noop */ }
      reject(err);
    };

    client.on("error", fail);

    const req = client.request({
      ":method": "POST",
      ":path": PATH,
      "content-type": "application/grpc",
      te: "trailers",
      "user-agent": userAgent,
      cookie,
    });

    const timer = setTimeout(() => fail(new Error(`Grok request timed out after ${timeoutMs}ms`)), timeoutMs);

    req.on("response", (headers) => {
      const s = headers["grpc-status"];
      if (typeof s === "string") grpcStatus = parseInt(s, 10);
      const m = headers["grpc-message"];
      if (typeof m === "string") grpcMessage = decodeURIComponent(m);
    });

    // trailers carry the real grpc-status for streaming responses
    req.on("trailers", (trailers) => {
      const s = trailers["grpc-status"];
      if (typeof s === "string") grpcStatus = parseInt(s, 10);
      const m = trailers["grpc-message"];
      if (typeof m === "string") grpcMessage = decodeURIComponent(m);
    });

    req.on("data", (c: Buffer) => chunks.push(new Uint8Array(c)));

    req.on("end", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { client.close(); } catch { /* noop */ }
      resolve({ status: grpcStatus, message: grpcMessage, body: concat(...chunks) });
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      fail(err);
    });

    req.write(Buffer.from(payload));
    req.end();
  });
}

export class GrokError extends Error {}

// High-level call: sends the prompt and returns a parsed GrokResult.
// Throws GrokError with a human-readable message on auth/throttle/empty errors.
export async function askGrok(
  prompt: string,
  mode: GrokMode,
  opts: GrokRequestOptions,
): Promise<GrokResult> {
  const raw = await callGrokRaw(prompt, mode, opts);

  if (raw.status === 16) {
    throw new GrokError(
      `Grok auth failed (${raw.message ?? "bad credentials"}). The GROK_SSO cookie is likely expired — re-harvest it.`,
    );
  }
  if (raw.status !== 0) {
    throw new GrokError(`Grok returned grpc-status ${raw.status}: ${raw.message ?? "unknown error"}`);
  }

  const result = parseGrokResponse(raw.body);

  if (result.throttled) {
    throw new GrokError("Grok rate-limited this request (throttle). Try again later or slow down.");
  }
  if (!result.text) {
    throw new GrokError("Grok returned an empty response.");
  }

  return result;
}
