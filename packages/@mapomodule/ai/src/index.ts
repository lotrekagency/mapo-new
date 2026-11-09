/**
 * Public types for `@mapomodule/ai`.
 * Import from `@mapomodule/ai/types`, or from `mapomodule/types` in an app.
 */

import type { MapoAiAccessRule } from "./runtime/server/auth/user";
import type {
  MapoAiModelPrice,
  MapoAiProviderOptions,
} from "./runtime/server/run/options";
import type { MapoAiLimits } from "./runtime/shared/gateway";
import type { AiVerificationRules } from "./runtime/shared/sanitize";

export type {
  MapoAiDefaults,
  MapoAiExtractRequest,
  MapoAiFillRequest,
  MapoAiKeyAssignment,
  MapoAiKeyAssignmentInput,
  MapoAiKeyLevel,
  MapoAiKeyProvider,
  MapoAiKeyScope,
  MapoAiKeysAnswer,
  MapoAiKeyStatus,
  MapoAiLimits,
  MapoAiPreference,
  MapoAiAction,
  MapoAiActionKind,
  MapoAiActionsAnswer,
  MapoAiPreviewEntity,
  MapoAiPreviewField,
  MapoAiPreviewInput,
  MapoAiPreviewResponse,
  MapoAiPreviewSkipped,
  MapoAiProviderSettings,
  MapoAiProviderSettingsInput,
  MapoAiProviderStatus,
  MapoAiReaderStatus,
  MapoAiReadResponse,
  MapoAiRunEntity,
  MapoAiRunPreviewResponse,
  MapoAiRunRequest,
  MapoAiRunResponse,
  MapoAiSavedToken,
  MapoAiSecretState,
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
  MapoAiSourcePart,
  MapoAiStatus,
  MapoAiStorageState,
  MapoAiTaskInstructions,
  MapoAiTestInput,
  MapoAiTestResponse,
  MapoAiTextPart,
  MapoAiTokenInput,
  MapoAiUsage,
  MapoAiUsageAnswer,
  MapoAiUsageByDay,
  MapoAiUsageByModel,
  MapoAiUsageByUser,
  MapoAiUsageCall,
  MapoAiUsageTotals,
} from "./runtime/shared/gateway";
export type {
  MapoAiAccessRule,
  MapoAiUser,
  MapoAiUserContext,
} from "./runtime/server/auth/user";
export type { MapoAiRuntimeHooks } from "./runtime/server/auth/hooks";
export type {
  MapoAiModelInfo,
  MapoAiProvider,
  MapoAiProviderAnswer,
  MapoAiProviderCapabilities,
  MapoAiProviderFailure,
  MapoAiProviderRequest,
} from "./runtime/server/providers/types";
export type { MapoAiMockFixture } from "./runtime/server/providers/mock";
export type {
  MapoAiReadContext,
  MapoAiReader,
  MapoAiReadFile,
} from "./runtime/server/readers/types";
export type { MapoAiPrompt } from "./runtime/server/prompts/compose";
export type {
  MapoAiPromptContext,
  MapoAiPromptEntity,
} from "./runtime/server/run/run";
export type {
  MapoAiModelPrice,
  MapoAiProviderOptions,
} from "./runtime/server/run/options";
export type { MapoAiEffort } from "./runtime/server/providers/cloud";
export type { AiChoice } from "./runtime/shared/entity";
export type {
  MapoAiFillAction,
  MapoAiFillEntity,
  MapoAiFillEntry,
  MapoAiFillResponse,
} from "./runtime/shared/fill";
export type {
  MapoAiReadDependencies,
  MapoAiReadOptions,
} from "./runtime/shared/read";
export type { MapoAiRead } from "./runtime/composables/useMapoAiRead";
export type {
  MapoAiFill,
  MapoAiFillCall,
  MapoAiFillError,
  MapoAiFillField,
  MapoAiFillOptions,
  MapoAiFillTarget,
} from "./runtime/composables/useMapoAiFill";
export type {
  AiAnswerWarning,
  AiDiscardReason,
  AiDroppedValue,
  AiExtractedItem,
  AiExtractResult,
  AiFieldOutcome,
  AiFieldOutcomes,
  AiFillResult,
  AiItemOutcome,
  AiQuote,
  AiValue,
  AiVerificationRules,
} from "./runtime/shared/sanitize";

/**
 * Options of `@mapomodule/ai`: the `mapo.ai` key through the meta-module, or
 * `mapoAi` when the module is registered on its own.
 *
 * Setting the key installs the module and turns the gateway routes on. The
 * gateway knows the user from the backend session: it forwards the
 * request's cookie to `userInfoApi`, as core does when it renders a page.
 */
export interface MapoAiOptions {
  /**
   * Who administers the AI. Superusers always do; so does a user in one of
   * `groups`, or with one of `permissions` (codenames, as `userInfoApi`
   * sends them). An admin assigns keys, providers and models to everyone,
   * a group or a user (`/_mapo/ai/keys`), allows personal tokens, and is
   * told the state of the gateway's storage in `status`.
   * @default {} (superusers only)
   * @example { groups: ["ai-admin"] }
   */
  admin?: MapoAiAccessRule;
  /**
   * Who may use the AI. Unset, every user `userInfoApi` returns may. Set,
   * only superusers, the AI's admins and the users the rule picks: in one
   * of `groups`, or with one of `permissions`. A Nitro plugin can narrow it
   * further with the `mapo-ai:user` hook, for a rule no group expresses.
   * @default undefined (every signed-in user)
   * @example { groups: ["editors"], permissions: ["change_article"] }
   */
  users?: MapoAiAccessRule;
  /**
   * The providers `run` may call, by id, each with the models a request may
   * ask for (its default first) and the seconds a call may take. Only the
   * providers listed here are called: Mapo's own (`mock`; `openai` and
   * `anthropic` for OpenAI's and Anthropic's models, with an `effort` and an
   * optional `promptCache`; `ollama` and `openai-compatible` for models on
   * the app's own servers, with their `baseURL`) and those the app registers
   * with `registerMapoAiProvider()`. `false` turns off one a layer enables.
   * A provider's project key goes in the server's environment, not here:
   * `NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`,
   * `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`,
   * `NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`,
   * `NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY`, and
   * `NUXT_MAPO_AI_PROVIDERS_<ID>_API_KEY` for an app's provider that
   * declares `key`. The AI's admins assign their own keys over it, and
   * narrow the models, for everyone, a group or a user.
   * @default {} (no provider: `run` answers 503)
   * @example { mock: { models: ["mock"], timeout: 120 } }
   */
  providers?: Record<string, MapoAiProviderOptions | false>;
  /**
   * The provider, and the model of each task, a request that names none
   * gets. Unset, or naming one not enabled: the first provider of
   * `providers`, and its first model.
   * @default {}
   * @example { provider: "mock", models: { fill: "mock", extract: "mock" } }
   */
  default?: { provider?: string; models?: { fill?: string; extract?: string } };
  /**
   * The app's rules for the AI, added to every prompt after Mapo's base
   * rules, which win where they disagree: `all` for every task, `fill` and
   * `extract` for one. A Nitro plugin adds rules per request with the
   * `mapo-ai:prompt` hook. The AI's admins add theirs on the AI settings
   * page, after these: where the two disagree, Mapo's rules and these win.
   * @default {}
   * @example { all: "Prices are in euros." }
   */
  instructions?: { all?: string; fill?: string; extract?: string };
  /**
   * Words that name a secret besides Mapo's (`password`, `token`, `api key`,
   * `credentials`…): a field whose key, or a key around it, holds one as
   * whole words in that order is never filled by the AI. `vault` keeps
   * `vault_url` out, never `vaulted`. The AI's admins add theirs on the AI
   * settings page; nothing removes Mapo's.
   * @default []
   * @example ["vault", "card number", "iban"]
   */
  secretWords?: string[];
  /**
   * What a quote must hold for a value to be verified, rule by rule; the
   * rules left out keep their prudent default. No rule verifies a value
   * without a quote found in the source. The AI's admins change them on
   * the AI settings page, where a rule less prudent than these or the
   * default shows a warning.
   * @default { dateYear: true, bareHours: false, timeZones: true, oneWordQuotes: "unique", richTextLinks: true, soleNumber: true }
   */
  verification?: Partial<AiVerificationRules>;
  /**
   * The readers `read` reads files with, by id, each `true` or `false`:
   * Mapo's (`text`, `markdown`, `json`, `html`, `csv`, `xlsx`) and those the
   * app registers with `registerMapoAiReader()`. Every reader is on unless
   * turned off here, or in the environment (`NUXT_MAPO_AI_READERS_XLSX=false`
   * for one of Mapo's). A file of a format that is off is `unsupported`.
   * @default {} (every reader on)
   * @example { xlsx: false }
   */
  readers?: Record<string, boolean>;
  /**
   * The limits of `run` and `read`: the calls one user may make in a minute
   * (counted in the memory of each server process), the characters of a
   * source (`read` reads no file into more), those of the operator's own
   * instructions (`0` lets operators send none), and the bytes of a file
   * `read` takes (`0` takes none).
   * @default { perUserPerMinute: 20, maxSourceChars: 100000, maxInstructionsChars: 2000, maxFileBytes: 10485760 }
   */
  limits?: Partial<MapoAiLimits>;
  /**
   * The audit of `run`: one sealed record per call, metadata only, kept
   * `retentionDays` days. The AI settings page reads it for the usage.
   * @default { retentionDays: 90 }
   */
  audit?: { retentionDays?: number };
  /**
   * The app's prices of its models, for the costs of the usage on the AI
   * settings page: by provider id, then model id, the price of a million
   * tokens of the prompt (`input`), of the answer with its reasoning
   * (`output`), and of the prompt's tokens read from or written to the
   * provider's cache (`cacheRead`, `cacheWrite`, as `input` unless set).
   * Mapo keeps no price list: a model the app does not price shows its
   * tokens only.
   * @default { currency: "USD", providers: {} }
   * @example { currency: "USD", providers: { openai: { "gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.1 } } } }
   */
  prices?: {
    currency?: string;
    providers: Record<string, Record<string, MapoAiModelPrice>>;
  };
  /**
   * The AI settings page, which the module adds when the app has no page on
   * its path: each user picks their provider and model, sees the key in
   * use, saves their own token where allowed and checks the connection;
   * the AI's admins assign keys. `path`, `false` for no page (the app puts
   * `<MapoAiSettings />` in a page of its own); `label`, its entry in the
   * sidebar; `usersApi` and `groupsApi`, the backend's endpoints that list
   * users and groups as Django REST Framework does, which the admins search
   * with `?search=`: without them, they write a user's id and a group's
   * name.
   * @default { path: "/ai-settings", label: "AI settings" }
   * @example { label: "Impostazioni AI", usersApi: "/api/users/", groupsApi: "/api/groups/" }
   */
  settings?: {
    path?: string | false;
    label?: string;
    usersApi?: string;
    groupsApi?: string;
  };
}
