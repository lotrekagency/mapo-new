/**
 * What Mapo's providers for local models share: the address of their
 * server, the answer's schema in the prompt, the tokens a call may read and
 * write, and what a server said about a model, for a while. Pure.
 *
 * A server holds the answer to its schema (`format`, `response_format`)
 * but may cut the prompt, or let the model loop inside a string value,
 * without a word: the numbers below keep a call within what the model
 * reads and writes, and the providers turn each overflow into a failure.
 */

import type { JSONSchema } from "@mapomodule/utils";
import type { MapoAiPrompt } from "../prompts/compose";
import type { MapoAiModelInfo } from "./types";

/** Where Ollama answers unless `baseURL` says otherwise. */
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/**
 * Characters per token on the low side: the schema's names, JSON and short
 * words take short tokens, so a prompt rarely needs more tokens than this
 * gives. It sizes what a call asks.
 */
const FEW_CHARS_PER_TOKEN = 2.5;
/**
 * Characters per token on the high side: text needs more tokens than this
 * gives, so a prompt counted below it was cut.
 */
const MANY_CHARS_PER_TOKEN = 6;
/** The least an answer may write: a form's values, with a quote each. */
const MIN_FILL_TOKENS = 4096;
/** The least an extraction may write: an item for each record of the source. */
const MIN_EXTRACT_TOKENS = 16_384;
/** The least room a model must have left for an answer. */
export const MIN_ANSWER_ROOM = 1024;
/**
 * The least context a call asks. Calls of a similar size ask the same, a
 * power of two from here, since a new size reloads the model on the server.
 */
const MIN_CONTEXT_TOKENS = 8192;
/** The most context a call asks, when the server does not say the model's. */
const MAX_CONTEXT_TOKENS = 1_048_576;
/** How long what a server says about a model is kept, in milliseconds. */
const MODEL_INFO_MS = 10 * 60 * 1000;
/** How many models' details are kept, all servers together. */
const MAX_MODEL_INFOS = 200;

/**
 * A server's address as the developer writes it, ready for a path to be
 * appended: `http:` or `https:`, with no credentials, query or fragment,
 * without the final `/`. `undefined` when it is none of these.
 * @param value outside data: the option, or the environment's value
 */
export function serverURL(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  const isWeb = url.protocol === "http:" || url.protocol === "https:";
  const hasCredentials = url.username !== "" || url.password !== "";
  const hasExtras = url.search !== "" || url.hash !== "";
  if (!isWeb || hasCredentials || hasExtras) return undefined;
  // Built from its parts, so an empty `?` or `#` does not stay at the end.
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/**
 * The stable part of the prompt, with the answer's schema after it. A local
 * server holds the answer to the schema but does not show it to the model,
 * which then never reads the fields' descriptions: what each holds, its
 * format and limits, the templates of a list's items. Ollama's docs advise
 * the same. The schema goes after the layers that change rarely, so a
 * server can keep the whole part in its cache.
 */
export function instructionsWithSchema(
  prompt: MapoAiPrompt,
  schema: JSONSchema,
): string {
  return `${prompt.instructions}\n\n# The answer's JSON schema\n${JSON.stringify(schema)}`;
}

/** The tokens of `chars` characters on the high side: what a call should make room for. */
export function tokensAtMost(chars: number): number {
  return Math.ceil(chars / FEW_CHARS_PER_TOKEN);
}

/** The tokens of `chars` characters on the low side: fewer means the prompt was cut. */
export function tokensAtLeast(chars: number): number {
  return Math.floor(chars / MANY_CHARS_PER_TOKEN);
}

/**
 * The most an answer may write. It repeats the schema's keys, each with a
 * value and a quote, so it grows with the schema; an extraction writes one
 * item per record, so it gets more. The cap matters: every value of the
 * schema is a string, and the constrained answer does not stop a model that
 * loops inside one.
 * @param schemaChars the characters of the answer's schema, as JSON
 */
export function answerTokens(
  task: "fill" | "extract",
  schemaChars: number,
): number {
  const least = task === "fill" ? MIN_FILL_TOKENS : MIN_EXTRACT_TOKENS;
  return Math.max(least, Math.ceil(schemaChars / 2));
}

/**
 * The context a call asks of a server that takes one per call, as Ollama
 * does: room for the prompt and the answer, as a power of two from 8192,
 * and at most what the model reads.
 * @param modelContext the model's own limit, when the server says it
 */
export function contextTokens(
  promptTokens: number,
  answer: number,
  modelContext?: number,
): number {
  const most = modelContext ?? MAX_CONTEXT_TOKENS;
  const needed = promptTokens + answer;
  let size = MIN_CONTEXT_TOKENS;
  while (size < needed && size < most) size *= 2;
  return Math.min(size, most);
}

/** What a server said about its models, kept for ten minutes. */
export interface ModelInfoCache {
  /** What the server said about this model, when it is still fresh. */
  get(server: string, model: string, now?: number): MapoAiModelInfo | undefined;
  set(server: string, info: MapoAiModelInfo, now?: number): void;
}

/** A cache of what servers say about their models, in this process. */
export function createModelInfoCache(): ModelInfoCache {
  const entries = new Map<string, { info: MapoAiModelInfo; until: number }>();
  const keyOf = (server: string, model: string) =>
    JSON.stringify([server, model]);
  return {
    get(server, model, now = Date.now()) {
      const key = keyOf(server, model);
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.until > now) return entry.info;
      entries.delete(key);
      return undefined;
    },
    set(server, info, now = Date.now()) {
      const key = keyOf(server, info.id);
      entries.delete(key);
      entries.set(key, { info, until: now + MODEL_INFO_MS });
      // The oldest goes first: a Map keeps the order of insertion.
      for (const oldest of entries.keys()) {
        if (entries.size <= MAX_MODEL_INFOS) break;
        entries.delete(oldest);
      }
    },
  };
}

/**
 * The answer as the model wrote it: JSON when it is, the text itself
 * otherwise, which the gateway's sanitizer reads as unreadable.
 */
export function answerOutput(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return text;
  }
}

/** A count of tokens a server wrote: a whole number from 1; `undefined` otherwise. */
export function tokenCount(value: unknown): number | undefined {
  const isCount = Number.isInteger(value) && Number(value) > 0;
  return isCount ? Number(value) : undefined;
}
