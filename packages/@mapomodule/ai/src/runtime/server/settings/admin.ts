/**
 * How the AI works in the whole app, as its admins set it on the AI
 * settings page: their instructions (layer 3 of the prompt), the rules of
 * verification, the words that name a secret, and for each provider the
 * prompt cache, Anthropic's fallbacks and the models they add.
 *
 * The app's options stay the defaults: the admins change instructions,
 * rules, words and the cache; what widens the models or the spending (the
 * models they add, Anthropic's fallbacks) only where the app allows it
 * (`adminModels`, `fallbacks`). One sealed record holds it all; this file
 * reads it, reads a change, checks the change against what the app allows,
 * applies the record to the options of a request and answers the page.
 * Pure: the storage, the clock and the models a server lists come from the
 * caller.
 */

import { createError } from "h3";
import { z } from "zod";
import { MAPO_SECRET_NAMES, readSecretWord } from "../../shared/entity";
import type {
  MapoAiProviderSettings,
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
  MapoAiTaskInstructions,
} from "../../shared/gateway";
import { DEFAULT_VERIFICATION_RULES } from "../../shared/sanitize";
import type { AiVerificationRules } from "../../shared/sanitize";
import { looserRules } from "../../shared/settings";
import type { KeyActor } from "../keys/assignments";
import { MAX_SECRET_WORDS } from "../run/options";
import type { MapoAiRunOptions } from "../run/options";

/** The record's key in the storage's `settings` purpose, outside every user's space. */
export const ADMIN_SETTINGS_RECORD = "admin";
/** Characters of one of the admins' instructions. */
export const MAX_ADMIN_INSTRUCTIONS = 4000;
/** Models the admins may add to one provider. */
export const MAX_ADDED_MODELS = 20;
/** Bytes the body of a route of the settings may have: three instructions, the words, the providers. */
export const SETTINGS_BODY_BYTES = 64 * 1024;

/** The admins' settings of one provider. */
export interface AdminProviderSettings {
  /** For a cloud provider; absent, the app's applies. */
  promptCache?: boolean;
  /** For `anthropic`; absent, the app's applies. */
  fallbacks?: boolean;
  /** Models added after the app's, each one its server listed. */
  models?: string[];
}

/** The admins' settings, as the storage keeps them. */
export interface AdminSettingsRecord {
  v: 1;
  instructions: MapoAiTaskInstructions;
  /** The rules they set; a rule absent follows the app's. */
  verification: Partial<AiVerificationRules>;
  secretWords: string[];
  /** By provider id. */
  providers: Record<string, AdminProviderSettings>;
  /** Who changed it last, and when. */
  updated?: { at: string; by: KeyActor };
}

/** The blocks of the settings, as a change and its audit name them. */
export type AdminSettingsBlock =
  | "instructions"
  | "verification"
  | "secretWords"
  | "providers";

const PROVIDER_ID = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const MODEL_ID = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\p{L}\p{N}._:/@+-]+$/u, "a model's id has no spaces");
const INSTRUCTION = z.string().max(MAX_ADMIN_INSTRUCTIONS);
const RULES = z.strictObject({
  dateYear: z.boolean().optional(),
  bareHours: z.boolean().optional(),
  timeZones: z.boolean().optional(),
  oneWordQuotes: z.enum(["unique", "never"]).optional(),
  richTextLinks: z.boolean().optional(),
  soleNumber: z.boolean().optional(),
}) satisfies z.ZodType<Partial<AiVerificationRules>>;
const PROVIDER_SETTINGS = z.strictObject({
  promptCache: z.boolean().optional(),
  fallbacks: z.boolean().optional(),
  models: z.array(MODEL_ID).max(MAX_ADDED_MODELS).optional(),
});
const ACTOR = z.strictObject({
  id: z.string().min(1).max(150),
  username: z.string().max(150).optional(),
});

const RECORD = z.strictObject({
  v: z.literal(1),
  instructions: z.strictObject({
    all: INSTRUCTION,
    fill: INSTRUCTION,
    extract: INSTRUCTION,
  }),
  verification: RULES,
  secretWords: z.array(z.string().max(64)).max(MAX_SECRET_WORDS),
  providers: z.record(PROVIDER_ID, PROVIDER_SETTINGS),
  updated: z.strictObject({ at: z.string().max(40), by: ACTOR }).optional(),
});

const INPUT = z.strictObject({
  instructions: z
    .strictObject({
      all: INSTRUCTION.optional(),
      fill: INSTRUCTION.optional(),
      extract: INSTRUCTION.optional(),
    })
    .optional(),
  verification: RULES.optional(),
  secretWords: z.array(z.unknown()).max(MAX_SECRET_WORDS).optional(),
  providers: z.record(PROVIDER_ID, PROVIDER_SETTINGS).optional(),
});

/** The settings before any admin changed them: the app's apply. */
export function emptyAdminSettings(): AdminSettingsRecord {
  return {
    v: 1,
    instructions: { all: "", fill: "", extract: "" },
    verification: {},
    secretWords: [],
    providers: {},
  };
}

/**
 * The record read back from the storage, or `undefined` when it is not one
 * this version writes.
 * @param value the stored value: outside data
 */
export function readAdminSettingsRecord(
  value: unknown,
): AdminSettingsRecord | undefined {
  const parsed = RECORD.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The body of `PUT /_mapo/ai/settings`, read as outside data.
 * @throws H3Error 400 naming where the body is wrong, never what it wrote
 */
export function readSettingsInput(value: unknown): MapoAiSettingsInput {
  const parsed = INPUT.safeParse(value);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const path = issue?.path.length ? issue.path.join(".") : "body";
    refuse(path, issue?.message ?? "invalid");
  }
  const { secretWords, ...rest } = parsed.data;
  if (secretWords === undefined) return rest;
  const words: string[] = [];
  secretWords.forEach((entry, index) => {
    const word = readSecretWord(entry);
    if (word === undefined) {
      refuse(
        `secretWords.${index}`,
        "a word of a key: letters, digits, spaces, _, - and ., up to 64 characters",
      );
    }
    if (!words.includes(word)) words.push(word);
  });
  return { ...rest, secretWords: words };
}

/**
 * The models of a change the provider's server must list before they are
 * saved: those not saved already, by provider.
 */
export function modelsToCheck(
  record: AdminSettingsRecord,
  input: MapoAiSettingsInput,
): Map<string, string[]> {
  const checks = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(input.providers ?? {})) {
    const saved = Object.hasOwn(record.providers, id)
      ? (record.providers[id]?.models ?? [])
      : [];
    const added = (entry.models ?? []).filter(
      (model) => !saved.includes(model),
    );
    if (added.length) checks.set(id, [...new Set(added)]);
  }
  return checks;
}

/**
 * The record with `input` applied, block by block, if the app allows it.
 * @param options the app's options, without the admins' settings
 * @throws H3Error 400 for a provider the app does not enable or a setting
 *   it does not take; 403 for what the app keeps from the admins: a model
 *   added where the app allows none, Anthropic's fallbacks on where the
 *   app turns them off
 */
export function withSettingsInput(
  record: AdminSettingsRecord,
  input: MapoAiSettingsInput,
  options: MapoAiRunOptions,
  change: { at: string; by: KeyActor },
): {
  record: AdminSettingsRecord;
  blocks: AdminSettingsBlock[];
  loosened: (keyof AiVerificationRules)[];
  providers: string[];
} {
  const next: AdminSettingsRecord = {
    ...record,
    instructions: { ...record.instructions },
    verification: { ...record.verification },
    secretWords: [...record.secretWords],
    providers: { ...record.providers },
    updated: change,
  };
  const blocks: AdminSettingsBlock[] = [];
  if (input.instructions) {
    blocks.push("instructions");
    next.instructions = {
      all: input.instructions.all?.trim() ?? "",
      fill: input.instructions.fill?.trim() ?? "",
      extract: input.instructions.extract?.trim() ?? "",
    };
  }
  if (input.verification) {
    blocks.push("verification");
    next.verification = { ...input.verification };
  }
  if (input.secretWords) {
    blocks.push("secretWords");
    next.secretWords = [...input.secretWords];
  }
  const providers = Object.keys(input.providers ?? {});
  if (input.providers) {
    blocks.push("providers");
    for (const [id, entry] of Object.entries(input.providers)) {
      const settings = providerSettingsOf(id, entry, options);
      if (Object.keys(settings).length) next.providers[id] = settings;
      else delete next.providers[id];
    }
  }
  // Less prudent than Mapo's defaults, or than the app's rules it overrides.
  const loosened = input.verification
    ? looserRules(input.verification, [
        DEFAULT_VERIFICATION_RULES,
        options.verification,
      ])
    : [];
  return { record: next, blocks, loosened, providers };
}

/** One provider's settings of a change, checked against what the app allows. */
function providerSettingsOf(
  id: string,
  entry: NonNullable<MapoAiSettingsInput["providers"]>[string],
  options: MapoAiRunOptions,
): AdminProviderSettings {
  const enabled = Object.hasOwn(options.providers, id)
    ? options.providers[id]
    : undefined;
  if (!enabled) refuse(`providers.${id}`, "not a provider the app enables");
  const takesCache = enabled.promptCache !== undefined;
  if (entry.promptCache !== undefined && !takesCache) {
    refuse(`providers.${id}.promptCache`, "this provider has no prompt cache");
  }
  const takesFallbacks = enabled.fallbacks !== undefined;
  if (entry.fallbacks !== undefined && !takesFallbacks) {
    refuse(`providers.${id}.fallbacks`, "this provider has no fallbacks");
  }
  if (entry.fallbacks === true && enabled.fallbacks === false) {
    throw createError({
      statusCode: 403,
      statusMessage: "The app keeps this provider's fallbacks off",
    });
  }
  const models = [...new Set(entry.models ?? [])];
  if (models.length && enabled.adminModels !== true) {
    throw createError({
      statusCode: 403,
      statusMessage: "The app lets no admin add models to this provider",
    });
  }
  return {
    ...(entry.promptCache !== undefined
      ? { promptCache: entry.promptCache }
      : {}),
    ...(entry.fallbacks !== undefined ? { fallbacks: entry.fallbacks } : {}),
    ...(models.length ? { models } : {}),
  };
}

/**
 * The options of a request with the admins' settings applied: their
 * instructions, their rules over the app's, their words after the app's,
 * their prompt cache, Anthropic's fallbacks on only where both leave them
 * on, and the models they added where the app still allows it.
 * @param options the app's options
 */
export function withAdminSettings(
  options: MapoAiRunOptions,
  record: AdminSettingsRecord,
): MapoAiRunOptions {
  const providers: MapoAiRunOptions["providers"] = {};
  for (const [id, entry] of Object.entries(options.providers)) {
    const admin = Object.hasOwn(record.providers, id)
      ? record.providers[id]
      : undefined;
    const hasCache = entry.promptCache !== undefined;
    const hasFallbacks = entry.fallbacks !== undefined;
    const added = entry.adminModels === true ? (admin?.models ?? []) : [];
    providers[id] = {
      ...entry,
      ...(hasCache && admin?.promptCache !== undefined
        ? { promptCache: admin.promptCache }
        : {}),
      ...(hasFallbacks && admin?.fallbacks !== undefined
        ? { fallbacks: entry.fallbacks === true && admin.fallbacks }
        : {}),
      ...(added.length ? { addedModels: [...added] } : {}),
    };
  }
  return {
    ...options,
    providers,
    adminInstructions: { ...record.instructions },
    verification: { ...options.verification, ...record.verification },
    secretWords: [...new Set([...options.secretWords, ...record.secretWords])],
  };
}

/**
 * What `GET /_mapo/ai/settings` answers: the admins' settings beside the
 * app's and Mapo's, never a key.
 * @param options the app's options, without the admins' settings
 * @param providers the providers the app enables, with their own models
 */
export function settingsAnswer(
  options: MapoAiRunOptions,
  record: AdminSettingsRecord,
  providers: readonly { id: string; label?: string; models: string[] }[],
): MapoAiSettingsAnswer {
  return {
    instructions: {
      admin: { ...record.instructions },
      app: { ...options.instructions },
    },
    verification: {
      rules: { ...options.verification, ...record.verification },
      app: { ...options.verification },
      mapo: { ...DEFAULT_VERIFICATION_RULES },
      admin: { ...record.verification },
    },
    secretWords: {
      mapo: [...MAPO_SECRET_NAMES],
      app: [...options.secretWords],
      admin: [...record.secretWords],
    },
    providers: providers.map((provider) =>
      providerAnswer(provider, options, record),
    ),
    ...(record.updated
      ? {
          updated: {
            at: record.updated.at,
            by: { ...record.updated.by },
          },
        }
      : {}),
  };
}

function providerAnswer(
  provider: { id: string; label?: string; models: string[] },
  options: MapoAiRunOptions,
  record: AdminSettingsRecord,
): MapoAiProviderSettings {
  const { id } = provider;
  const enabled = Object.hasOwn(options.providers, id)
    ? options.providers[id]
    : undefined;
  const admin = Object.hasOwn(record.providers, id)
    ? record.providers[id]
    : undefined;
  const cache = enabled?.promptCache;
  const fallbacks = enabled?.fallbacks;
  return {
    id,
    ...(provider.label ? { label: provider.label } : {}),
    ...(cache !== undefined
      ? {
          promptCache: {
            app: cache,
            ...(admin?.promptCache !== undefined
              ? { admin: admin.promptCache }
              : {}),
            value: admin?.promptCache ?? cache,
          },
        }
      : {}),
    ...(fallbacks !== undefined
      ? {
          fallbacks: {
            app: fallbacks,
            ...(admin?.fallbacks !== undefined
              ? { admin: admin.fallbacks }
              : {}),
            value: fallbacks && (admin?.fallbacks ?? true),
          },
        }
      : {}),
    models: {
      app: [...provider.models],
      added: [...(admin?.models ?? [])],
      canAdd: enabled?.adminModels === true,
    },
  };
}

/** @throws H3Error 400 about the setting at `path` */
function refuse(path: string, problem: string): never {
  throw createError({
    statusCode: 400,
    statusMessage: "Not a change of the AI settings",
    data: { path: path.slice(0, 200), problem: problem.slice(0, 200) },
  });
}
