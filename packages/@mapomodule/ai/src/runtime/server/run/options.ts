/**
 * The options of `run` and `read`: the providers `run` may call, its
 * defaults, the app's rules, the verification rules, the readers `read`
 * leaves on, how `read/link` reads a page, the limits and the audit's
 * retention.
 * They are read twice, with the same rules: when the app builds, from
 * `mapo.ai`, with a warning for each value that cannot be read; when the
 * server runs, from the private runtime config, where the environment may
 * have changed a value. Both times they are outside data, and a value that
 * cannot be read never widens what may spend: a provider that cannot be
 * read is not enabled, and a limit that cannot be read is the narrowest,
 * `0`. A rule of verification or the audit's retention keeps its default.
 * Pure.
 */

import type { MapoAiLimits } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import {
  DEFAULT_ANTHROPIC_URL,
  DEFAULT_EFFORT,
  DEFAULT_OPENAI_URL,
  MAPO_AI_EFFORTS,
} from "../providers/cloud";
import type { MapoAiEffort } from "../providers/cloud";
import { DEFAULT_OLLAMA_URL, serverURL } from "../providers/local";
import { hostPatternOf } from "../links/rules";
import { readSecretWord } from "../../shared/entity";
import { DEFAULT_VERIFICATION_RULES } from "../../shared/sanitize";
import type { AiVerificationRules } from "../../shared/sanitize";

/** A provider as `mapo.ai.providers` enables it. */
export interface MapoAiProviderOptions {
  /**
   * The models a request may ask for, the default first. Without it, the
   * provider's own list: `["mock"]` for the mock, `["gpt-6.1-sol",
   * "gpt-6-luna"]` for `openai`, `["claude-opus-5-5", "claude-sonnet-5-5",
   * "claude-haiku-5-5"]` for `anthropic`. Any model of the provider may be
   * listed, one newer than this version of Mapo too. `ollama` and
   * `openai-compatible` have none of their own: list the models the server
   * has that the app allows.
   */
  models?: string[];
  /**
   * Seconds a call may take before the gateway gives up with a 504: 300 for
   * `openai` and `anthropic`, 600 for `ollama` and `openai-compatible`, 120
   * for the others, unless set.
   */
  timeout?: number;
  /**
   * The address of the server, for Mapo's providers that call one:
   * `openai` (`https://api.openai.com/v1` unless set, or OpenAI's European
   * `https://eu.api.openai.com/v1`, or a proxy), `anthropic`
   * (`https://api.anthropic.com/v1` unless set), `ollama`
   * (`http://localhost:11434` unless set) and `openai-compatible`
   * (required, up to its `/v1`: `http://localhost:1234/v1`). An `http:` or
   * `https:` address without credentials, query or fragment. Only the app
   * sets it, here or in the environment; a request never does.
   */
  baseURL?: string;
  /**
   * For `openai` and `anthropic`: how much the model reasons before it
   * answers, `"low"`, `"medium"` or `"high"`. The reasoning is paid as
   * written tokens and takes time; filling a form from the quotes of a
   * source needs little of it.
   * @default "low"
   */
  effort?: MapoAiEffort;
  /**
   * For `openai` and `anthropic`: keeps the stable part of the prompt (Mapo's
   * rules, the app's, the record's description and the answer's schema) in
   * the provider's prompt cache, never the source. The first call writes it,
   * at a higher price for that part (1.25 times); the calls on the same kind
   * of record that follow within the cache's time (5 minutes for Anthropic,
   * 30 for OpenAI) read it at a fraction of the price. Off, nothing is
   * written to a cache, unless an OpenAI model refuses the cache's
   * options: then OpenAI caches that model's prompts by its own rules,
   * and the server's log says so.
   * @default false
   */
  promptCache?: boolean;
  /**
   * For `openai-compatible`: the tokens the server's models read, when its
   * list of models does not say it (vLLM's does). Such a server sets the
   * context itself, and some cut a longer prompt in silence, rules
   * included. With the context known, a prompt that cannot fit fails with
   * 413 before the call, and one the server counted up to the context
   * fails after it. Ollama's own provider, `ollama`, needs none: Ollama
   * says each model's context, and refuses a prompt that does not fit.
   */
  contextTokens?: number;
  /**
   * Whether the AI's admins may add models to this provider's own, on the
   * AI settings page: each one the provider's server lists, with the key
   * their own calls use, after the app's, to assign as the others. A model
   * added widens what may spend, so only the app allows it. Not for the
   * mock.
   * @default false
   */
  adminModels?: boolean;
  /**
   * For `anthropic`: whether a request its model declines for its safety
   * filters is asked again of the model Anthropic picks for that kind of
   * request (its fallbacks), which may be one `models` does not list, at
   * its own prices; the answer, the audit and the log name it. The AI's
   * admins can turn them off on the AI settings page, and on again only
   * where the app leaves them on.
   * @default true
   */
  fallbacks?: boolean;
}

/**
 * The price of a million tokens of a model, in the currency of
 * `mapo.ai.prices`: the prompt's (`input`), the answer's with its
 * reasoning (`output`), and the prompt's tokens read from or written to
 * the provider's prompt cache, which cost as `input` unless set.
 */
export interface MapoAiModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** The options of `run`, read and complete: every value has its default. */
export interface MapoAiRunOptions {
  /** The providers enabled, by id, in the order the app lists them. */
  providers: Record<
    string,
    {
      models?: string[];
      timeout: number;
      baseURL?: string;
      contextTokens?: number;
      /** For a cloud provider, always: its default, unless the app set one. */
      effort?: MapoAiEffort;
      /** For a cloud provider, always: `false`, unless the app turned it on. */
      promptCache?: boolean;
      /** Whether the AI's admins may add models: always, `false` unless the app allows it; never for the mock. */
      adminModels?: boolean;
      /** For `anthropic`, always: `true`, unless the app or an admin turned them off. */
      fallbacks?: boolean;
      /**
       * The models the AI's admins added, after the app's: never from the
       * config; a request reads them from the AI settings.
       */
      addedModels?: string[];
    }
  >;
  /** What a request that names no provider or model gets, as the app wrote it. */
  default: { provider?: string; models: { fill?: string; extract?: string } };
  /** The app's rules, for every task and for each. */
  instructions: { all: string; fill: string; extract: string };
  /**
   * The AI's admins' instructions, for every task and for each: never in
   * the config; a request reads them from the AI settings.
   */
  adminInstructions?: { all: string; fill: string; extract: string };
  /**
   * The words that name a secret besides Mapo's, the app's
   * (`mapo.ai.secretWords`); a request adds the admins'.
   */
  secretWords: string[];
  verification: AiVerificationRules;
  /**
   * The readers the app turns on or off, by id, as it wrote them: a reader
   * not here is on.
   */
  readers: Record<string, boolean>;
  /** How `read/link` reads a page. */
  web: MapoAiWebOptions;
  limits: MapoAiLimits;
  audit: { retentionDays: number };
  /**
   * The app's prices of its models, for the costs the usage shows: by
   * provider id, then model id. A model without a price shows its tokens
   * only.
   */
  prices: {
    currency: string;
    providers: Record<string, Record<string, MapoAiModelPrice>>;
  };
}

/** How `read/link` reads a page, from `mapo.ai.web`, read and complete. */
export interface MapoAiWebOptions {
  /** The hosts the app opens, as written: `localhost:3000`, `*.intranet.example`. */
  allow: string[];
  /** The hosts the app keeps out, as written: `*` for every host. */
  deny: string[];
  /** What the requests for a page name as their client. */
  userAgent: string;
  /** Seconds a page may take, its redirects included. */
  timeout: number;
}

/** Seconds a page may take, its redirects included, unless `mapo.ai.web.timeout` says otherwise. */
export const DEFAULT_WEB_TIMEOUT = 20;
/** What the requests for a page name as their client, unless `mapo.ai.web.userAgent` says otherwise. */
export const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; MapoAI/1.0)";
const MAX_WEB_TIMEOUT = 120;
const MAX_HOSTS = 200;
const MAX_USER_AGENT = 200;

/** Seconds a call to a provider may take, unless `timeout` says otherwise. */
export const DEFAULT_PROVIDER_TIMEOUT = 120;
/**
 * Seconds a call to a local model may take, unless `timeout` says otherwise:
 * a large form keeps a model on the app's own hardware busy for minutes.
 */
export const DEFAULT_LOCAL_PROVIDER_TIMEOUT = 600;
/**
 * Seconds a call to a cloud model may take, unless `timeout` says otherwise:
 * a fill streams in under a minute and a half, a long extraction in three
 * to five minutes.
 */
export const DEFAULT_CLOUD_PROVIDER_TIMEOUT = 300;
/**
 * Mapo's providers that call a server, with the server's address when the
 * app sets none, whether the app may say the models' context, and whether
 * they are a cloud's, with an effort and a prompt cache. Their entry of
 * `mapo.ai.providers` takes `baseURL`.
 */
const SERVER_PROVIDERS: ReadonlyMap<
  string,
  { baseURL?: string; takesContext?: boolean; isCloud?: boolean }
> = new Map([
  ["ollama", { baseURL: DEFAULT_OLLAMA_URL }],
  ["openai-compatible", { takesContext: true }],
  ["openai", { baseURL: DEFAULT_OPENAI_URL, isCloud: true }],
  ["anthropic", { baseURL: DEFAULT_ANTHROPIC_URL, isCloud: true }],
]);
/** The least context a server's models may be said to read. */
const MIN_CONTEXT_TOKENS = 1024;
/** The most context a server's models may be said to read. */
const MAX_CONTEXT_TOKENS = 10_000_000;
/** The limits of `run`, unless `mapo.ai.limits` says otherwise. */
export const DEFAULT_LIMITS: Readonly<MapoAiLimits> = Object.freeze({
  perUserPerMinute: 20,
  maxSourceChars: 100_000,
  maxInstructionsChars: 2_000,
  maxFileBytes: 10 * 1024 * 1024,
  linksPerUserPerMinute: 20,
});
/** Days an audit record is kept, unless `mapo.ai.audit.retentionDays` says otherwise. */
export const DEFAULT_RETENTION_DAYS = 90;

const MAX_TIMEOUT = 3600;
const MAX_RETENTION_DAYS = 3650;
const MAX_MODEL_ID = 200;
/** A provider's id, or a reader's: lowercase letters, digits and `-`, starting with a letter. */
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,63}$/;
const TASKS = ["fill", "extract"] as const;
const RULE_NAMES = Object.keys(
  DEFAULT_VERIFICATION_RULES,
) as (keyof AiVerificationRules)[];

/**
 * Reads the options of `run` from `mapo.ai`, or from the runtime config.
 * @param value the whole `mapo.ai` object: outside data
 * @param warn told about each value that cannot be read, and what is kept instead
 */
export function readRunOptions(
  value: unknown,
  warn: (message: string) => void,
): MapoAiRunOptions {
  const options = isRecord(value) ? value : {};
  return {
    providers: providersOf(options.providers, warn),
    default: defaultsOf(options.default, warn),
    instructions: instructionsOf(options.instructions, warn),
    secretWords: secretWordsOf(options.secretWords, warn),
    verification: verificationOf(options.verification, warn),
    readers: readersOf(options.readers, warn),
    web: webOf(options.web, warn),
    limits: limitsOf(options.limits, warn),
    audit: auditOf(options.audit, warn),
    prices: pricesOf(options.prices, warn),
  };
}

function providersOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiRunOptions["providers"] {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) {
    warn(
      "mapo.ai.providers is not an object of providers by id, so no provider is enabled.",
    );
    return {};
  }
  const providers: MapoAiRunOptions["providers"] = {};
  for (const [id, entry] of Object.entries(value)) {
    const option = `mapo.ai.providers.${id}`;
    if (entry === false) continue;
    if (!PROVIDER_ID.test(id)) {
      warn(
        `${option}: a provider's id is lowercase letters, digits and "-", starting with a letter, so it is not enabled.`,
      );
      continue;
    }
    if (!isRecord(entry)) {
      warn(
        `${option} is not { models?, timeout? } (or false), so the provider is not enabled.`,
      );
      continue;
    }
    const server = SERVER_PROVIDERS.get(id);
    // The key is read apart, by `providerKeyOf()`: it never joins the
    // options. Every provider but the mock has a place for it, an app's
    // too, which gets it with each call when it declares `key`.
    const known = [
      "models",
      "timeout",
      ...(id !== "mock" ? ["apiKey"] : []),
      ...(server ? ["baseURL"] : []),
      ...(server?.takesContext ? ["contextTokens"] : []),
      ...(server?.isCloud ? ["effort", "promptCache"] : []),
      ...(id !== "mock" ? ["adminModels"] : []),
      ...(id === "anthropic" ? ["fallbacks"] : []),
    ];
    unknownKeys(entry, known, option, warn);
    const baseURL = server
      ? baseURLOf(entry.baseURL, server.baseURL, option, warn)
      : undefined;
    const hasNoServer = server !== undefined && baseURL === undefined;
    if (hasNoServer) continue;
    const context = server?.takesContext
      ? contextOf(entry.contextTokens, option, warn)
      : undefined;
    if (context === null) continue;
    const models = modelsOf(entry.models, option, warn);
    const timeout = defaultTimeoutOf(server);
    providers[id] = {
      ...(models ? { models } : {}),
      timeout: timeoutOf(entry.timeout, option, warn, timeout),
      ...(baseURL ? { baseURL } : {}),
      ...(context !== undefined ? { contextTokens: context } : {}),
      // Always written, so the environment can change them at runtime
      // (`NUXT_MAPO_AI_PROVIDERS_OPENAI_EFFORT`): it fills only a place the
      // runtime config has.
      ...(server?.isCloud
        ? {
            effort: effortOf(entry.effort, option, warn),
            promptCache: promptCacheOf(entry.promptCache, option, warn),
          }
        : {}),
      ...(id !== "mock"
        ? {
            adminModels: switchOf(
              entry.adminModels,
              false,
              option,
              "adminModels",
              warn,
            ),
          }
        : {}),
      ...(id === "anthropic"
        ? {
            fallbacks: switchOf(
              entry.fallbacks,
              true,
              option,
              "fallbacks",
              warn,
            ),
          }
        : {}),
    };
  }
  return providers;
}

/** The seconds a provider's call may take when the app sets none. */
function defaultTimeoutOf(server: { isCloud?: boolean } | undefined): number {
  if (!server) return DEFAULT_PROVIDER_TIMEOUT;
  return server.isCloud
    ? DEFAULT_CLOUD_PROVIDER_TIMEOUT
    : DEFAULT_LOCAL_PROVIDER_TIMEOUT;
}

/** How much a cloud model reasons: the app's choice, or `low`. */
function effortOf(
  value: unknown,
  option: string,
  warn: (message: string) => void,
): MapoAiEffort {
  const isUnset = value === undefined || value === null || value === "";
  if (isUnset) return DEFAULT_EFFORT;
  const effort = MAPO_AI_EFFORTS.find((one) => one === value);
  if (effort) return effort;
  warn(
    `${option}.effort is not "low", "medium" or "high", so it is "${DEFAULT_EFFORT}".`,
  );
  return DEFAULT_EFFORT;
}

/** Whether a cloud provider writes the stable part of the prompt to its cache: off unless the app says `true`. */
function promptCacheOf(
  value: unknown,
  option: string,
  warn: (message: string) => void,
): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  warn(`${option}.promptCache is not true or false, so it is false.`);
  return false;
}

/**
 * A switch of a provider: its default when unset, and when it cannot be
 * read, with a warning. `adminModels` and `fallbacks` widen what may spend
 * only as their defaults say.
 */
function switchOf(
  value: unknown,
  fallback: boolean,
  option: string,
  name: string,
  warn: (message: string) => void,
): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  warn(`${option}.${name} is not true or false, so it is ${fallback}.`);
  return fallback;
}

/**
 * The context the app says a server's models read: `undefined` when it says
 * none; `null`, with a warning, when it cannot be read. Then the provider is
 * not enabled, since without the context it could let a cut prompt through.
 */
function contextOf(
  value: unknown,
  option: string,
  warn: (message: string) => void,
): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  const isUsable =
    Number.isInteger(value) &&
    Number(value) >= MIN_CONTEXT_TOKENS &&
    Number(value) <= MAX_CONTEXT_TOKENS;
  if (isUsable) return Number(value);
  warn(
    `${option}.contextTokens is not a whole number of tokens from ${MIN_CONTEXT_TOKENS} to ${MAX_CONTEXT_TOKENS}, so the provider is not enabled.`,
  );
  return null;
}

/**
 * The address of a provider's server: the app's, or the provider's own
 * default. `undefined`, with a warning, for an address that cannot be read
 * or a provider with no default: then the provider is not enabled, since
 * the gateway calls only an address the app wrote.
 */
function baseURLOf(
  value: unknown,
  fallback: string | undefined,
  option: string,
  warn: (message: string) => void,
): string | undefined {
  const isUnset = value === undefined || value === null || value === "";
  if (isUnset && fallback !== undefined) return fallback;
  if (isUnset) {
    warn(
      `${option} has no baseURL, the address of its server, so the provider is not enabled.`,
    );
    return undefined;
  }
  const url = serverURL(value);
  if (url === undefined) {
    warn(
      `${option}.baseURL is not an http or https address without credentials, query or fragment, so the provider is not enabled.`,
    );
  }
  return url;
}

/**
 * The project's key of a provider, from the runtime config, where the
 * environment puts it (`NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY`,
 * `NUXT_MAPO_AI_PROVIDERS_ACME_API_KEY` for an app's provider `acme`). It is read apart
 * from the options, so a key never travels with them. Only text is a key:
 * Nuxt reads a value of digits only as a number, and `true` as a boolean,
 * so such a key is left out, and `warn` says so without the value.
 * @param value the whole `mapo.ai` runtime config, or `mapo.ai`: outside data
 */
export function providerKeyOf(
  value: unknown,
  id: string,
  warn?: (message: string) => void,
): string | undefined {
  const options = isRecord(value) ? value : {};
  const providers = isRecord(options.providers) ? options.providers : {};
  const entry = Object.hasOwn(providers, id) ? providers[id] : undefined;
  const key = isRecord(entry) ? entry.apiKey : undefined;
  const isUnset = key === undefined || key === null || key === "";
  if (isUnset) return undefined;
  if (typeof key !== "string") {
    warn?.(
      `The key of the provider "${id}" (${providerKeyVariable(id)}) is not text, as Nuxt reads a value of digits only or true and false, so the provider calls its server without a key.`,
    );
    return undefined;
  }
  return key.trim() !== "" ? key.trim() : undefined;
}

/**
 * What the log says when a provider's key goes to a server over plain
 * `http:`, other than this machine: the key, and the prompt with the
 * source, travel in clear. `undefined` when they do not.
 */
export function plainKeyWarning(
  id: string,
  baseURL: string | undefined,
  apiKey: string | undefined,
): string | undefined {
  if (!apiKey || !baseURL) return undefined;
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    return undefined;
  }
  const isPlain = url.protocol === "http:";
  const isThisMachine = ["localhost", "127.0.0.1", "[::1]"].includes(
    url.hostname,
  );
  if (!isPlain || isThisMachine) return undefined;
  return `The provider "${id}" sends its key to ${url.host} over plain http: the key, and every prompt with its source, travel in clear. Use https.`;
}

/**
 * The environment's variable for the project's key of a provider, as Nuxt
 * names it: `NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`.
 */
export function providerKeyVariable(id: string): string {
  return `NUXT_MAPO_AI_PROVIDERS_${id.replace(/-/g, "_").toUpperCase()}_API_KEY`;
}

function modelsOf(
  value: unknown,
  option: string,
  warn: (message: string) => void,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    warn(
      `${option}.models is not a list of model ids, so the provider has no model to call.`,
    );
    return [];
  }
  const models = value.filter(
    (model): model is string =>
      typeof model === "string" &&
      model.trim() !== "" &&
      model.length <= MAX_MODEL_ID,
  );
  if (models.length < value.length) {
    warn(
      `${option}.models has entries that are not model ids: they are left out.`,
    );
  }
  return [...new Set(models)];
}

function timeoutOf(
  value: unknown,
  option: string,
  warn: (message: string) => void,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const isUsable =
    typeof value === "number" && value > 0 && value <= MAX_TIMEOUT;
  if (isUsable) return value;
  warn(
    `${option}.timeout is not a number of seconds above 0, up to ${MAX_TIMEOUT}, so it is ${fallback}.`,
  );
  return fallback;
}

function defaultsOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiRunOptions["default"] {
  const defaults: MapoAiRunOptions["default"] = { models: {} };
  if (value === undefined || value === null) return defaults;
  if (!isRecord(value)) {
    warn(
      "mapo.ai.default is not { provider?, models? }, so the first provider and its first model are the default.",
    );
    return defaults;
  }
  unknownKeys(value, ["provider", "models"], "mapo.ai.default", warn);
  if (typeof value.provider === "string" && value.provider !== "") {
    defaults.provider = value.provider;
  } else if (value.provider !== undefined) {
    warn(
      "mapo.ai.default.provider is not a provider's id, so the first provider is the default.",
    );
  }
  const models = value.models;
  if (models === undefined) return defaults;
  if (!isRecord(models)) {
    warn(
      "mapo.ai.default.models is not { fill?, extract? }, so each task gets the provider's first model.",
    );
    return defaults;
  }
  unknownKeys(models, TASKS, "mapo.ai.default.models", warn);
  for (const task of TASKS) {
    const model = models[task];
    if (typeof model === "string" && model !== "")
      defaults.models[task] = model;
    else if (model !== undefined) {
      warn(
        `mapo.ai.default.models.${task} is not a model id, so ${task} gets the provider's first model.`,
      );
    }
  }
  return defaults;
}

function instructionsOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiRunOptions["instructions"] {
  const instructions = { all: "", fill: "", extract: "" };
  if (value === undefined || value === null) return instructions;
  if (!isRecord(value)) {
    warn(
      "mapo.ai.instructions is not { all?, fill?, extract? }, so the app adds no rule to the prompts.",
    );
    return instructions;
  }
  const keys = ["all", ...TASKS] as const;
  unknownKeys(value, keys, "mapo.ai.instructions", warn);
  for (const key of keys) {
    const text = value[key];
    if (typeof text === "string") instructions[key] = text;
    else if (text !== undefined) {
      warn(`mapo.ai.instructions.${key} is not text, so it adds no rule.`);
    }
  }
  return instructions;
}

/** Words that name a secret, at most, as the app or the admins write them. */
export const MAX_SECRET_WORDS = 100;

/** `mapo.ai.secretWords`: the words that can be read, lowercase, once each. */
function secretWordsOf(
  value: unknown,
  warn: (message: string) => void,
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warn(
      "mapo.ai.secretWords is not a list of words, so Mapo's names of secrets apply alone.",
    );
    return [];
  }
  const words: string[] = [];
  for (const entry of value) {
    const word = readSecretWord(entry);
    if (word === undefined) {
      warn(
        "mapo.ai.secretWords has an entry that is not a word of a key (letters, digits, spaces, _, - and ., up to 64 characters): ignored.",
      );
      continue;
    }
    if (!words.includes(word)) words.push(word);
  }
  if (words.length > MAX_SECRET_WORDS) {
    warn(
      `mapo.ai.secretWords has more than ${MAX_SECRET_WORDS} words: the first ${MAX_SECRET_WORDS} apply.`,
    );
  }
  return words.slice(0, MAX_SECRET_WORDS);
}

function verificationOf(
  value: unknown,
  warn: (message: string) => void,
): AiVerificationRules {
  const rules: AiVerificationRules = { ...DEFAULT_VERIFICATION_RULES };
  if (value === undefined || value === null) return rules;
  if (!isRecord(value)) {
    warn(
      "mapo.ai.verification is not an object of rules, so every rule keeps its default.",
    );
    return rules;
  }
  unknownKeys(value, RULE_NAMES, "mapo.ai.verification", warn);
  for (const name of RULE_NAMES) {
    if (!Object.hasOwn(value, name)) continue;
    const given = value[name];
    const fallback = DEFAULT_VERIFICATION_RULES[name];
    const isUsable =
      name === "oneWordQuotes"
        ? given === "unique" || given === "never"
        : typeof given === "boolean";
    if (isUsable) Object.assign(rules, { [name]: given });
    else {
      warn(
        `mapo.ai.verification.${name} is not ${name === "oneWordQuotes" ? '"unique" or "never"' : "true or false"}, so it keeps its default, ${JSON.stringify(fallback)}.`,
      );
    }
  }
  return rules;
}

/**
 * The readers the app turns on or off. A value that cannot be read turns
 * the reader off: the app wrote something about it, and a reader it meant
 * to turn off must not read.
 */
function readersOf(
  value: unknown,
  warn: (message: string) => void,
): Record<string, boolean> {
  const readers: Record<string, boolean> = {};
  if (value === undefined || value === null) return readers;
  if (!isRecord(value)) {
    warn(
      "mapo.ai.readers is not an object of readers by id, each true or false, so every reader is on.",
    );
    return readers;
  }
  for (const [id, on] of Object.entries(value)) {
    const option = `mapo.ai.readers.${id}`;
    if (!PROVIDER_ID.test(id)) {
      warn(
        `${option}: a reader's id is lowercase letters, digits and "-", starting with a letter, so it is ignored.`,
      );
      continue;
    }
    if (typeof on !== "boolean") {
      warn(`${option} is not true or false, so the reader is off.`);
    }
    readers[id] = on === true;
  }
  return readers;
}

/**
 * How `read/link` reads a page. A host `allow` cannot read is left out, so
 * fewer hosts are opened; a `deny` that cannot be read is `["*"]`, so no
 * page is read rather than one the app meant to keep out. A time or a
 * client that cannot be read keeps its default.
 */
function webOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiWebOptions {
  const web: MapoAiWebOptions = {
    allow: [],
    deny: [],
    userAgent: DEFAULT_USER_AGENT,
    timeout: DEFAULT_WEB_TIMEOUT,
  };
  if (value === undefined || value === null) return web;
  if (!isRecord(value)) {
    warn(
      "mapo.ai.web is not { allow?, deny?, userAgent?, timeout? }, so read/link reads no page.",
    );
    return { ...web, deny: ["*"] };
  }
  unknownKeys(
    value,
    ["allow", "deny", "userAgent", "timeout"],
    "mapo.ai.web",
    warn,
  );
  const allow = hostsOf(value.allow, "mapo.ai.web.allow", warn);
  web.allow = allow.hosts.filter((entry) => {
    const isEveryHost = entry === "*";
    if (isEveryHost) {
      warn(
        'mapo.ai.web.allow: "*" would open every host, a private network\'s included, so it is left out.',
      );
    }
    return !isEveryHost;
  });
  const deny = hostsOf(value.deny, "mapo.ai.web.deny", warn);
  if (deny.whole) web.deny = deny.hosts;
  else {
    warn("mapo.ai.web.deny cannot be read whole, so read/link reads no page.");
    web.deny = ["*"];
  }
  const userAgent = value.userAgent;
  if (userAgent !== undefined) {
    const isUsable =
      typeof userAgent === "string" &&
      userAgent.trim() !== "" &&
      userAgent.length <= MAX_USER_AGENT &&
      !Array.from(userAgent).some(isControl);
    if (isUsable) web.userAgent = userAgent.trim();
    else {
      warn(
        `mapo.ai.web.userAgent is not one line of up to ${MAX_USER_AGENT} characters, so it is "${DEFAULT_USER_AGENT}".`,
      );
    }
  }
  const timeout = value.timeout;
  if (timeout !== undefined) {
    const isUsable =
      typeof timeout === "number" && timeout > 0 && timeout <= MAX_WEB_TIMEOUT;
    if (isUsable) web.timeout = timeout;
    else {
      warn(
        `mapo.ai.web.timeout is not a number of seconds above 0, up to ${MAX_WEB_TIMEOUT}, so it is ${DEFAULT_WEB_TIMEOUT}.`,
      );
    }
  }
  return web;
}

/** Whether a character is a control one, which no header may hold: a line break, a NUL. */
function isControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 32 || code === 127;
}

/**
 * The hosts of `allow` or `deny`, as written: each a host pattern, up to
 * 200. An entry that is none is left out, and the warning says so;
 * `whole` says whether every entry was read.
 */
function hostsOf(
  value: unknown,
  option: string,
  warn: (message: string) => void,
): { hosts: string[]; whole: boolean } {
  if (value === undefined || value === null) return { hosts: [], whole: true };
  if (!Array.isArray(value)) {
    warn(`${option} is not a list of hosts.`);
    return { hosts: [], whole: false };
  }
  if (value.length > MAX_HOSTS) {
    warn(
      `${option} names more than ${MAX_HOSTS} hosts: the others are left out.`,
    );
  }
  const hosts: string[] = [];
  for (const entry of value.slice(0, MAX_HOSTS)) {
    const isHost =
      typeof entry === "string" && hostPatternOf(entry) !== undefined;
    if (isHost) hosts.push(entry.trim());
    else {
      warn(
        `${option}: ${JSON.stringify(entry)} is no host ("example.org", "*.example.org", "localhost:3000"), so it is left out.`,
      );
    }
  }
  return { hosts, whole: hosts.length === value.length };
}

function limitsOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiLimits {
  const limits: MapoAiLimits = { ...DEFAULT_LIMITS };
  if (value === undefined || value === null) return limits;
  const names = Object.keys(DEFAULT_LIMITS) as (keyof MapoAiLimits)[];
  if (!isRecord(value)) {
    warn(
      "mapo.ai.limits is not { perUserPerMinute?, maxSourceChars?, maxInstructionsChars?, maxFileBytes?, linksPerUserPerMinute? }, so every limit is 0: run takes no call, read no file and read/link no page.",
    );
    for (const name of names) limits[name] = 0;
    return limits;
  }
  unknownKeys(value, names, "mapo.ai.limits", warn);
  for (const name of names) {
    const given = value[name];
    if (given === undefined) continue;
    // `0` is a limit too: no call, no source, no instructions.
    const isUsable = Number.isInteger(given) && Number(given) >= 0;
    if (isUsable) {
      limits[name] = Number(given);
      continue;
    }
    // A limit that cannot be read is the narrowest, never the default.
    warn(`mapo.ai.limits.${name} is not a whole number from 0, so it is 0.`);
    limits[name] = 0;
  }
  return limits;
}

function auditOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiRunOptions["audit"] {
  const audit = { retentionDays: DEFAULT_RETENTION_DAYS };
  if (value === undefined || value === null) return audit;
  if (!isRecord(value)) {
    warn(
      `mapo.ai.audit is not { retentionDays? }, so audit records are kept ${DEFAULT_RETENTION_DAYS} days.`,
    );
    return audit;
  }
  unknownKeys(value, ["retentionDays"], "mapo.ai.audit", warn);
  const days = value.retentionDays;
  if (days === undefined) return audit;
  const isUsable =
    Number.isInteger(days) &&
    Number(days) >= 1 &&
    Number(days) <= MAX_RETENTION_DAYS;
  if (isUsable) audit.retentionDays = Number(days);
  else {
    warn(
      `mapo.ai.audit.retentionDays is not a whole number of days from 1 to ${MAX_RETENTION_DAYS}, so audit records are kept ${DEFAULT_RETENTION_DAYS} days.`,
    );
  }
  return audit;
}

/** The currency of the costs when the app names none. */
export const DEFAULT_CURRENCY = "USD";
/** The most a price of a million tokens may be: a typo of zeros stays out. */
const MAX_PRICE = 100_000;

/**
 * `mapo.ai.prices`: `{ currency?, providers: { [provider]: { [model]: price } } }`.
 * A price that cannot be read is left out, with a warning: its model shows
 * tokens only, never a wrong cost.
 */
function pricesOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiRunOptions["prices"] {
  const prices: MapoAiRunOptions["prices"] = {
    currency: DEFAULT_CURRENCY,
    providers: {},
  };
  if (value === undefined || value === null) return prices;
  if (!isRecord(value)) {
    warn(
      "mapo.ai.prices is not { currency?, providers }, so the usage shows tokens only.",
    );
    return prices;
  }
  unknownKeys(value, ["currency", "providers"], "mapo.ai.prices", warn);
  const { currency, providers } = value;
  if (typeof currency === "string" && /^[A-Z]{3}$/.test(currency)) {
    prices.currency = currency;
  } else if (currency !== undefined) {
    warn(
      `mapo.ai.prices.currency is not a code of three capital letters, such as "EUR", so it is "${DEFAULT_CURRENCY}".`,
    );
  }
  if (providers === undefined) return prices;
  if (!isRecord(providers)) {
    warn(
      "mapo.ai.prices.providers is not an object of providers by id, so the usage shows tokens only.",
    );
    return prices;
  }
  for (const [id, models] of Object.entries(providers)) {
    const option = `mapo.ai.prices.providers.${id}`;
    if (!PROVIDER_ID.test(id) || !isRecord(models)) {
      warn(`${option} is not an object of models by id: ignored.`);
      continue;
    }
    const priced: Record<string, MapoAiModelPrice> = {};
    for (const [model, price] of Object.entries(models)) {
      const read = priceOf(price);
      const isModelId = model.length > 0 && model.length <= MAX_MODEL_ID;
      if (read && isModelId) priced[model] = read;
      else {
        warn(
          `${option}.${model} is not { input, output, cacheRead?, cacheWrite? }, prices of a million tokens from 0 to ${MAX_PRICE}: ignored.`,
        );
      }
    }
    if (Object.keys(priced).length) prices.providers[id] = priced;
  }
  return prices;
}

/** A model's price, or `undefined` when it cannot be read. */
function priceOf(value: unknown): MapoAiModelPrice | undefined {
  if (!isRecord(value)) return undefined;
  const names = ["input", "output", "cacheRead", "cacheWrite"] as const;
  const hasOnlyPrices = Object.keys(value).every((key) =>
    (names as readonly string[]).includes(key),
  );
  if (!hasOnlyPrices) return undefined;
  const amount = (
    raw: unknown,
    isRequired: boolean,
  ): number | null | undefined => {
    if (raw === undefined && !isRequired) return undefined;
    const isAmount =
      typeof raw === "number" &&
      Number.isFinite(raw) &&
      raw >= 0 &&
      raw <= MAX_PRICE;
    return isAmount ? raw : null;
  };
  const input = amount(value.input, true);
  const output = amount(value.output, true);
  const cacheRead = amount(value.cacheRead, false);
  const cacheWrite = amount(value.cacheWrite, false);
  const values = [input, output, cacheRead, cacheWrite];
  if (values.includes(null) || input == null || output == null) {
    return undefined;
  }
  return {
    input,
    output,
    ...(cacheRead !== undefined && cacheRead !== null ? { cacheRead } : {}),
    ...(cacheWrite !== undefined && cacheWrite !== null ? { cacheWrite } : {}),
  };
}

/** Warns about the keys of `value` the option does not have. */
function unknownKeys(
  value: Record<string, unknown>,
  known: readonly string[],
  option: string,
  warn: (message: string) => void,
): void {
  const unknown = Object.keys(value).filter((key) => !known.includes(key));
  if (unknown.length) {
    warn(
      `${option} has no ${unknown.map((key) => `"${key}"`).join(", ")}: ignored.`,
    );
  }
}
