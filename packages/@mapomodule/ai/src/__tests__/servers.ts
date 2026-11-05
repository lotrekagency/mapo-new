/**
 * What the tests of Mapo's providers that call a server share: the answers
 * recorded from a real server, a fake `fetch` that serves them and keeps
 * every call, a body streamed in chunks of any size, and a request as the
 * gateway makes one.
 *
 * `recorded/` holds what Ollama 0.40.13 answered with `qwen2.5:7b`, on its
 * native API and on its OpenAI-compatible one: the streamed answer to the
 * request {@link providerRequest} makes, as the providers sent it, and the
 * same cut by a cap of 6 tokens; a prompt refused for the context, a model
 * it does not have, the details of a model (trimmed to the facts the
 * provider reads) and the lists of models.
 *
 * `documented/` holds what OpenAI's Responses API and Anthropic's Messages
 * API answer, as their API references describe it: written by hand, not
 * recorded, since the tests make no call with a key. The streamed answers
 * answer the same request, with the events each API sends around the
 * text (reasoning, thinking, pings); the others are their errors, their
 * lists of models, a cut answer, a refusal and a fallback.
 */

import { readFileSync } from "node:fs";
import type { ServerFetch } from "../runtime/server/providers/http";
import type { MapoAiProviderRequest } from "../runtime/server/providers/types";
import { composeMapoAiPrompt } from "../runtime/server/prompts/compose";
import { compileFillContract } from "../runtime/shared/contract";
import { buildAiEntity } from "../runtime/shared/entity";

/** The text of a recorded answer. */
export function recorded(name: string): string {
  return readFileSync(new URL(`./recorded/${name}`, import.meta.url), "utf8");
}

/** The text of an answer as a provider's API reference describes it. */
export function documented(name: string): string {
  return readFileSync(new URL(`./documented/${name}`, import.meta.url), "utf8");
}

/** A body sent in chunks of `size` bytes, as a server streams one. */
export function streamed(
  text: string,
  init: ResponseInit = {},
  size = 64,
): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
  return new Response(body, { status: 200, ...init });
}

/** A JSON answer: a value, or the text of a recorded one. */
export function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return new Response(text, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A call the fake server received. */
export interface ServerCall {
  path: string;
  method: string;
  headers: Record<string, string>;
  /** The JSON body, parsed. */
  body: unknown;
  /** How the call follows a redirect: `manual`, so it never does. */
  redirect: RequestRedirect | undefined;
  /** The signal the call was made with: the request's, so the gateway can stop it. */
  signal: AbortSignal | null | undefined;
}

/** What the fake server answers a path, in order: a response, or an error `fetch` throws. */
export type Served = Response | Error;

/**
 * A server answering each path from its list, in order, and keeping every
 * call. A call it has no answer for fails the test.
 */
export function fakeServer(answers: Record<string, Served[]>): {
  fetch: ServerFetch;
  calls: ServerCall[];
  paths(): string[];
} {
  const calls: ServerCall[] = [];
  const fetch: ServerFetch = async (url, init) => {
    const path = new URL(url).pathname;
    const body: unknown =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      headers[name] = value;
    });
    calls.push({
      path,
      method: init.method ?? "GET",
      headers,
      body,
      redirect: init.redirect,
      signal: init.signal,
    });
    if (init.signal?.aborted) {
      throw new DOMException("This operation was aborted", "AbortError");
    }
    const next = answers[path]?.shift();
    if (next === undefined) throw new Error(`No answer for ${path}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls, paths: () => calls.map((call) => call.path) };
}

/** The error Node's `fetch` throws for a server that refuses the connection. */
export function refusedConnection(): Error {
  return new TypeError("fetch failed", {
    cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), {
      code: "ECONNREFUSED",
    }),
  });
}

const entity = buildAiEntity({
  fields: {
    type: "object",
    properties: {
      title: { type: "string", title: "Title" },
      body: { type: "string", title: "Body" },
    },
  },
});

/** A request of the gateway to fill a title and a body from `source`. */
export function providerRequest(
  options: { model?: string; source?: string; signal?: AbortSignal } = {},
): MapoAiProviderRequest {
  const contract = compileFillContract({ entity });
  const source =
    options.source ?? "Title: About us\nBody: We are a small studio in Milan.";
  const parts = [{ kind: "text" as const, text: source }];
  return {
    task: contract.task,
    model: options.model ?? "qwen2.5:7b",
    prompt: composeMapoAiPrompt({ contract, parts, mark: "m" }),
    parts,
    schema: contract.schema,
    contract,
    signal: options.signal ?? new AbortController().signal,
  };
}

/** The body of the calls to `path`, in order. */
export function bodiesOf(
  calls: readonly ServerCall[],
  path: string,
): unknown[] {
  return calls.filter((call) => call.path === path).map((call) => call.body);
}
