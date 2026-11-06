/**
 * A request's body, read up to a bound: the routes that take one (`run`,
 * `read`) refuse a body past their bound as soon as it is, before it is all
 * in memory.
 */

import type { IncomingMessage } from "node:http";
import { readRawBody } from "h3";
import type { H3Event } from "h3";

/**
 * The body's bytes, by the way the runtime hands them over: a web stream; a
 * Node request still arriving, read with a listener of its own, so a body
 * past the bound is drained unread instead of left half in the parser; or
 * a body already in memory, such as one Nitro's local fetch sends.
 * @throws the error of `tooLarge` once the body passes `maxBytes`
 */
export async function readLimitedBytes(
  event: H3Event,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<Uint8Array> {
  const webBody = event.web?.request?.body;
  if (webBody) return readWebStream(webBody, maxBytes, tooLarge);
  const request = event.node.req;
  if (isArriving(request)) return readNodeRequest(request, maxBytes, tooLarge);
  const raw = await readRawBody(event, false);
  const bytes = raw ? new Uint8Array(raw) : new Uint8Array();
  if (bytes.byteLength > maxBytes) throw tooLarge();
  return bytes;
}

/** A Node request whose body still arrives from the client, read by nobody yet. */
function isArriving(request: IncomingMessage): boolean {
  const isMock = "__unenv__" in request;
  const isRead = "rawBody" in request || "body" in request;
  const isStream = typeof request.on === "function";
  return isStream && !isMock && !isRead && !request.readableEnded;
}

async function readWebStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  return joined(chunks, size);
}

/**
 * Reads a Node request until its end, or until it passes `maxBytes`: then
 * it stops listening and lets the rest flow away unread, so the client gets
 * the 413 and the server's parser is left with nothing pending.
 */
function readNodeRequest(
  request: IncomingMessage,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const stop = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      // An error after the answer, such as the client leaving, is no one's.
      request.on("error", () => undefined);
    };
    const onData = (chunk: Uint8Array | string) => {
      const bytes =
        typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
      size += bytes.byteLength;
      if (size <= maxBytes) {
        chunks.push(bytes);
        return;
      }
      stop();
      request.resume();
      reject(tooLarge());
    };
    const onEnd = () => {
      stop();
      resolve(joined(chunks, size));
    };
    const onError = (error: unknown) => {
      stop();
      reject(error);
    };
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
  });
}

function joined(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
