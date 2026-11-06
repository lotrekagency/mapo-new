/**
 * The providers the gateway can call: Mapo's own, and those the app
 * registers from a Nitro plugin. Registering a provider makes it
 * available; only `mapo.ai.providers` makes it usable, so one place says
 * what may spend.
 */

import { createAnthropicProvider } from "./anthropic";
import { DEFAULT_ANTHROPIC_URL, DEFAULT_OPENAI_URL } from "./cloud";
import type { MapoAiEffort } from "./cloud";
import { DEFAULT_OLLAMA_URL } from "./local";
import { mockProvider } from "./mock";
import { createOllamaProvider } from "./ollama";
import { createOpenAiProvider } from "./openai";
import { createOpenAiCompatibleProvider } from "./openaiCompatible";
import type { MapoAiProvider } from "./types";

/**
 * What Mapo's providers that call a server are built from: the address and
 * the settings `mapo.ai.providers` gives, and the key the environment gives.
 */
export interface MapoAiServerSettings {
  /** The server's address, without the final `/`. */
  baseURL?: string;
  /** The key the server asks, from the environment. */
  apiKey?: string;
  /** The tokens the server's models read, as the app says it. */
  contextTokens?: number;
  /** How much a cloud model reasons. */
  effort?: MapoAiEffort;
  /** Whether a cloud provider keeps the stable part of the prompt in its cache. */
  promptCache?: boolean;
  /** For `anthropic`: `false` when the app or the admins turn its fallbacks off. */
  fallbacks?: boolean;
}

/** What Mapo's cloud providers take of their settings. */
function cloudSettings(
  { baseURL, apiKey, effort, promptCache, fallbacks }: MapoAiServerSettings,
  fallback: string,
) {
  return {
    baseURL: baseURL ?? fallback,
    ...(apiKey ? { apiKey } : {}),
    ...(effort ? { effort } : {}),
    ...(promptCache ? { promptCache } : {}),
    ...(fallbacks === false ? { fallbacks } : {}),
  };
}

/** Builds one of Mapo's providers; `undefined` for settings it cannot work with. */
type ProviderFactory = (
  settings: MapoAiServerSettings,
) => MapoAiProvider | undefined;

/** Mapo's own providers, by id, each built from its settings. */
const MAPO_PROVIDERS: ReadonlyMap<string, ProviderFactory> = new Map<
  string,
  ProviderFactory
>([
  ["mock", () => mockProvider],
  [
    "ollama",
    ({ baseURL, apiKey }) =>
      createOllamaProvider({
        baseURL: baseURL ?? DEFAULT_OLLAMA_URL,
        ...(apiKey ? { apiKey } : {}),
      }),
  ],
  [
    "openai-compatible",
    ({ baseURL, apiKey, contextTokens }) =>
      baseURL
        ? createOpenAiCompatibleProvider({
            baseURL,
            ...(apiKey ? { apiKey } : {}),
            ...(contextTokens ? { contextTokens } : {}),
          })
        : undefined,
  ],
  [
    "openai",
    (settings) =>
      createOpenAiProvider(cloudSettings(settings, DEFAULT_OPENAI_URL)),
  ],
  [
    "anthropic",
    (settings) =>
      createAnthropicProvider(cloudSettings(settings, DEFAULT_ANTHROPIC_URL)),
  ],
]);

/**
 * Ids kept for Mapo's own providers: those it has, and those it plans. An
 * app registers its providers under other ids, so an update of Mapo never
 * takes one of them over.
 */
export const MAPO_AI_RESERVED_PROVIDER_IDS: readonly string[] = [
  "mock",
  "openai",
  "anthropic",
  "openai-compatible",
  "ollama",
];

/** A provider's id: lowercase letters, digits and `-`, starting with a letter. */
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,63}$/;

const registered = new Map<string, MapoAiProvider>();

/**
 * Registers a provider the app implements, in a Nitro plugin. The gateway
 * calls it only when `mapo.ai.providers` lists its id too, with the models
 * it may use; registered and not listed, it is never called, and the server
 * says so when it starts.
 *
 * @example
 * // server/plugins/mapo-ai-provider.ts
 * export default defineNitroPlugin(() => {
 *   registerMapoAiProvider({
 *     id: "acme",
 *     capabilities: { structuredOutput: "json", pdf: false, images: false, streaming: false, tools: false },
 *     async run(request) { … },
 *   });
 * });
 * @throws TypeError when the id is not a provider's id or `run` is missing;
 *   Error when the id is Mapo's, or registered already
 */
export function registerMapoAiProvider(provider: MapoAiProvider): void {
  const id: unknown = provider?.id;
  if (typeof id !== "string" || !PROVIDER_ID.test(id)) {
    throw new TypeError(
      `A provider's id is lowercase letters, digits and "-", starting with a letter: ${JSON.stringify(id)}`,
    );
  }
  if (typeof provider.run !== "function") {
    throw new TypeError(`The provider "${id}" has no run()`);
  }
  if (MAPO_AI_RESERVED_PROVIDER_IDS.includes(id)) {
    throw new Error(
      `"${id}" is the id of a Mapo provider: register yours under another id`,
    );
  }
  if (registered.has(id)) {
    throw new Error(`A provider "${id}" is registered already`);
  }
  registered.set(id, provider);
}

/**
 * The provider with this id, Mapo's or the app's; `undefined` when there is
 * none. Mapo's providers that call a server are built from `settings`.
 */
export function mapoAiProvider(
  id: string,
  settings: MapoAiServerSettings = {},
): MapoAiProvider | undefined {
  const create = MAPO_PROVIDERS.get(id);
  return create ? create(settings) : registered.get(id);
}

/** The ids of the providers the app registered, in their order. */
export function registeredMapoAiProviders(): string[] {
  return [...registered.keys()];
}
