/**
 * The options of `run`: the providers it may call, its defaults, the app's
 * rules, the verification rules, its limits and the audit's retention.
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
import { DEFAULT_VERIFICATION_RULES } from "../../shared/sanitize";
import type { AiVerificationRules } from "../../shared/sanitize";

/** A provider as `mapo.ai.providers` enables it. */
export interface MapoAiProviderOptions {
  /**
   * The models a request may ask for, the default first. Without it, the
   * provider's own list: `["mock"]` for the mock.
   */
  models?: string[];
  /** Seconds a call may take before the gateway gives up with a 504. */
  timeout?: number;
}

/** The options of `run`, read and complete: every value has its default. */
export interface MapoAiRunOptions {
  /** The providers enabled, by id, in the order the app lists them. */
  providers: Record<string, { models?: string[]; timeout: number }>;
  /** What a request that names no provider or model gets, as the app wrote it. */
  default: { provider?: string; models: { fill?: string; extract?: string } };
  /** The app's rules, for every task and for each. */
  instructions: { all: string; fill: string; extract: string };
  verification: AiVerificationRules;
  limits: MapoAiLimits;
  audit: { retentionDays: number };
}

/** Seconds a call to a provider may take, unless `timeout` says otherwise. */
export const DEFAULT_PROVIDER_TIMEOUT = 120;
/** The limits of `run`, unless `mapo.ai.limits` says otherwise. */
export const DEFAULT_LIMITS: Readonly<MapoAiLimits> = Object.freeze({
  perUserPerMinute: 20,
  maxSourceChars: 100_000,
  maxInstructionsChars: 2_000,
});
/** Days an audit record is kept, unless `mapo.ai.audit.retentionDays` says otherwise. */
export const DEFAULT_RETENTION_DAYS = 90;

const MAX_TIMEOUT = 3600;
const MAX_RETENTION_DAYS = 3650;
const MAX_MODEL_ID = 200;
/** A provider's id: lowercase letters, digits and `-`, starting with a letter. */
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
    verification: verificationOf(options.verification, warn),
    limits: limitsOf(options.limits, warn),
    audit: auditOf(options.audit, warn),
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
    unknownKeys(entry, ["models", "timeout"], option, warn);
    const models = modelsOf(entry.models, option, warn);
    providers[id] = {
      ...(models ? { models } : {}),
      timeout: timeoutOf(entry.timeout, option, warn),
    };
  }
  return providers;
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
): number {
  if (value === undefined) return DEFAULT_PROVIDER_TIMEOUT;
  const isUsable =
    typeof value === "number" && value > 0 && value <= MAX_TIMEOUT;
  if (isUsable) return value;
  warn(
    `${option}.timeout is not a number of seconds above 0, up to ${MAX_TIMEOUT}, so it is ${DEFAULT_PROVIDER_TIMEOUT}.`,
  );
  return DEFAULT_PROVIDER_TIMEOUT;
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

function limitsOf(
  value: unknown,
  warn: (message: string) => void,
): MapoAiLimits {
  const limits: MapoAiLimits = { ...DEFAULT_LIMITS };
  if (value === undefined || value === null) return limits;
  const names = Object.keys(DEFAULT_LIMITS) as (keyof MapoAiLimits)[];
  if (!isRecord(value)) {
    warn(
      "mapo.ai.limits is not { perUserPerMinute?, maxSourceChars?, maxInstructionsChars? }, so every limit is 0: run takes no call.",
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
