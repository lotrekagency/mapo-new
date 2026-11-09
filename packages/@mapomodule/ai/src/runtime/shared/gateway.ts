/**
 * The AI gateway contract: where its routes live and keep their state, which
 * version of the contract they speak, what they are sent and what they
 * answer. Pure TypeScript, shared by the module, the server routes and the
 * pages that call them.
 */

import type { JSONSchema } from "@mapomodule/utils";
import type { AiChoice } from "./entity";
import type {
  AiExtractResult,
  AiFillResult,
  AiVerificationRules,
} from "./sanitize";

/**
 * Path prefix of the gateway routes on the app's Nitro server. It stays
 * outside `/api/*`, so a backend integration that proxies `/api` to the real
 * backend never catches these routes.
 */
export const MAPO_AI_GATEWAY_PATH = "/_mapo/ai";

/**
 * The Nitro storage mount the gateway keeps its state in, every record
 * sealed (`runtime/server/storage/sealed.ts`). The app chooses its driver as
 * for any Nitro mount; without one the module mounts the file system.
 */
export const MAPO_AI_STORAGE_MOUNT = "mapo-ai";

/**
 * Version of the gateway contract: the routes, their bodies and their
 * responses. It goes up when one of them changes in a way an older client
 * cannot read. No body carries a task contract: the gateway compiles it
 * from the descriptions a request sends, so its format
 * (`AI_CONTRACT_FORMAT_VERSION`, `contract.ts`) raises this version only
 * when a body or a response changes with it.
 */
export const MAPO_AI_CONTRACT_VERSION = 2;

/**
 * Response of `GET /_mapo/ai/status`, for a signed-in user. Without a
 * session the route answers 401.
 */
export interface MapoAiStatus {
  /** The version of the gateway contract this server implements. */
  contract: number;
  /**
   * Whether the app's rules (`mapo.ai.users`, the `mapo-ai:user` hooks) let
   * the user use the AI. When `false`, the routes that act answer 403, and
   * the user administers nothing.
   */
  allowed: boolean;
  /** Whether the user administers the AI (`mapo.ai.admin`; superusers always). */
  admin: boolean;
  /** The state of the gateway's storage: for the AI's admins only. */
  storage?: MapoAiStorageState;
  /**
   * The providers `run` may call for the user, each with the models they
   * may ask for. For a user the app lets in; empty when the app enables no
   * provider.
   */
  providers?: MapoAiProviderStatus[];
  /**
   * What `run` calls when the request names no provider or no model: the
   * user's preference when they may still call it, else the app's
   * default. For a user the app lets in, when a provider is enabled.
   */
  default?: MapoAiDefaults;
  /**
   * The provider and model the user saved as theirs
   * (`PUT /_mapo/ai/preferences`), even when it no longer applies, as when
   * an admin closed the model to them: `default` says what applies.
   */
  preference?: MapoAiPreference;
  /** The limits of `run` and `read`. For a user the app lets in. */
  limits?: MapoAiLimits;
  /**
   * The formats `read` takes: Mapo's readers the app has not turned off,
   * then the app's own. For a user the app lets in.
   */
  readers?: MapoAiReaderStatus[];
}

/** A format `read` takes, as `status` lists it. */
export interface MapoAiReaderStatus {
  /** The reader's id: `csv`, or the id of the app's own. */
  id: string;
  /** Its name for people, when it has one. */
  label?: string;
  /** The extensions of the files it reads, lowercase, without the dot: `csv`. */
  extensions: string[];
  /** The media types of the files it reads: `text/csv`. */
  types: string[];
}

/** A provider `run` may call, as `status` lists it. */
export interface MapoAiProviderStatus {
  /** Its id, as the request names it: `mock`. */
  id: string;
  /** Its name for people, when it has one. */
  label?: string;
  /** The models a request may ask for, the provider's default first. */
  models: string[];
  /**
   * The key its calls use, for a provider that calls with one: which
   * level gives it, never the key. Absent for a provider that uses no key
   * of the gateway, such as the mock.
   */
  key?: MapoAiKeyStatus;
}

/**
 * Where the key of a call comes from, nearest to the user first:
 * - `personal`: the user's own token, where an admin's assignment allows
 *   one;
 * - `user`, `group`, `all`: the key an admin assigned to the user, to one
 *   of their groups, or to everyone;
 * - `project`: the app's own, from the server's environment;
 * - `none`: no level has one.
 */
export type MapoAiKeyLevel =
  | "personal"
  | "user"
  | "group"
  | "all"
  | "project"
  | "none";

/** The key a provider's calls use for the user, as `status` tells it. */
export interface MapoAiKeyStatus {
  /** Which level gives the key. */
  level: MapoAiKeyLevel;
  /** For `group`: the group's name. */
  group?: string;
  /**
   * The key's last four characters, to tell keys apart: for a key of 16
   * characters or more, never with `none`.
   */
  last4?: string;
  /**
   * Whether the provider needs a key: with `none`, `run` refuses it before
   * calling. A server on the app's own network may take calls without one.
   */
  required: boolean;
  /** The user's own token for the provider. */
  personal: {
    /** Whether an admin's assignment lets the user use one. */
    allowed: boolean;
    /** Whether the user saved one; it is used only while allowed. */
    saved: boolean;
    /** Its last four characters, as for the key. */
    last4?: string;
  };
}

/**
 * Who an admin's assignment of a key is for: everyone, the users of a
 * group (by its name, as `userInfoApi` sends it), or one user (by the
 * backend's `id`, as text, with the name the admin saw when picking them,
 * `label`, only to show it: the id alone decides).
 */
export type MapoAiKeyScope =
  | { kind: "all" }
  | { kind: "group"; group: string }
  | { kind: "user"; user: string; label?: string };

/**
 * An admin's assignment, as `GET /_mapo/ai/keys` answers it: never the
 * key, only its last four characters.
 */
export interface MapoAiKeyAssignment {
  /** Its id, as `DELETE /_mapo/ai/keys/:id` names it. */
  id: string;
  scope: MapoAiKeyScope;
  /** The provider's id. */
  provider: string;
  /**
   * The models the scope may use, among those the app enables, in the
   * app's order; absent: every model the app enables. Empty: the provider
   * is closed to the scope.
   */
  models?: string[];
  /** The key, when the assignment has one: absent, the next level's applies. */
  key?: { last4?: string };
  /** Whether the users of the scope may use their own token instead. */
  personalTokens: boolean;
  /** When it last changed, and by whom. */
  updated: { at: string; by: { id: string; username?: string } };
}

/**
 * Body of `PUT /_mapo/ai/keys`: one assignment, which replaces the one of
 * the same scope and provider. On a replacement, what the body leaves out
 * stays as it was.
 */
export interface MapoAiKeyAssignmentInput {
  scope: MapoAiKeyScope;
  provider: string;
  /** The models the scope may use; `null`: every model the app enables. */
  models?: string[] | null;
  /** The key; `null`: none, the next level's applies. */
  key?: string | null;
  /** Whether the users of the scope may use their own token. New: `false`. */
  personalTokens?: boolean;
}

/** A provider the app enables, as an admin assigns it. */
export interface MapoAiKeyProvider {
  id: string;
  label?: string;
  /** The models the app enables, its default first. */
  models: string[];
  /**
   * Whether its calls take a key, and whether they need one; absent for a
   * provider that uses no key of the gateway, which takes no key and no
   * personal token in an assignment.
   */
  key?: "required" | "optional";
}

/** A user's own token, as an admin sees it: never the token. */
export interface MapoAiSavedToken {
  user: { id: string; username?: string };
  provider: string;
  /** Its last four characters, as for a key. */
  last4?: string;
  /** When the user saved it. */
  savedAt: string;
}

/** Response of `GET /_mapo/ai/keys`, for the AI's admins. */
export interface MapoAiKeysAnswer {
  /** The providers the app enables. */
  providers: MapoAiKeyProvider[];
  /** The assignments, in the order they were made. */
  assignments: MapoAiKeyAssignment[];
  /**
   * The order of the groups, highest priority first: a user in several
   * groups gets the assignment of the highest. The groups it leaves out
   * come after, by name.
   */
  groups: string[];
  /** The tokens the users saved. */
  tokens: MapoAiSavedToken[];
}

/**
 * The provider and model a user prefers: their default for `run`, while
 * they may call it. Body of `PUT /_mapo/ai/preferences`.
 */
export interface MapoAiPreference {
  provider: string;
  model: string;
}

/** Body of `POST /_mapo/ai/test`: the provider to check, and the model. */
export interface MapoAiTestInput {
  provider: string;
  /** The model to look for; without it, the user's default for the provider. */
  model?: string;
}

/**
 * What "check the connection" found, `POST /_mapo/ai/test`. The gateway
 * asks the provider's server for its models with the key the user's calls
 * use, which costs no tokens:
 * - `connected`: the server answered, and lists the model;
 * - `model-missing`: the server answered, without the model;
 * - `no-key`: the provider needs a key, and no level gives the user one;
 * - `unverifiable`: the provider cannot list its models;
 * - `failed`: the server did not answer, or refused the key: `failure` says how.
 */
export interface MapoAiTestResponse {
  provider: string;
  model: string;
  outcome: "connected" | "model-missing" | "no-key" | "unverifiable" | "failed";
  /** Milliseconds the server took to answer, when it did. */
  latencyMs?: number;
  /** For `failed`: `timeout`, `rate-limit`, `unavailable`, `refused-request`, `invalid-response`. */
  failure?: string;
}

/** Body of `PUT /_mapo/ai/token`: the user's own token for a provider. */
export interface MapoAiTokenInput {
  provider: string;
  token: string;
}

// ─── settings ────────────────────────────────────────────────────────────────

/** Instructions by task: for every task, for filling a record, for extracting records; `""` for none. */
export interface MapoAiTaskInstructions {
  all: string;
  fill: string;
  extract: string;
}

/**
 * How the AI works in the whole app, as `GET /_mapo/ai/settings` answers
 * the AI's admins: what they changed, beside what the app sets and what
 * Mapo keeps whatever happens. Never a key.
 */
export interface MapoAiSettingsAnswer {
  instructions: {
    /** The admins': layer 3 of the prompt. */
    admin: MapoAiTaskInstructions;
    /** The app's (`mapo.ai.instructions`): layer 2, which wins over the admins'. */
    app: MapoAiTaskInstructions;
  };
  verification: {
    /** The rules that apply: the admins' where they set one, else the app's. */
    rules: AiVerificationRules;
    /** The app's (`mapo.ai.verification`). */
    app: AiVerificationRules;
    /** Mapo's prudent defaults. */
    mapo: AiVerificationRules;
    /** The rules the admins set. */
    admin: Partial<AiVerificationRules>;
  };
  /** The words that name a secret, a field the AI never fills. */
  secretWords: {
    /** Mapo's: nothing removes them. */
    mapo: string[];
    /** The app's (`mapo.ai.secretWords`). */
    app: string[];
    /** The admins'. */
    admin: string[];
  };
  /** The providers the app enables, in its order. */
  providers: MapoAiProviderSettings[];
  /** The last change of the admins, when they made one. */
  updated?: { at: string; by: { id: string; username?: string } };
}

/** A provider's settings, as the AI's admins see and change them. */
export interface MapoAiProviderSettings {
  id: string;
  label?: string;
  /** For `openai` and `anthropic`: the prompt cache as the app sets it, the admins' choice, and what applies. */
  promptCache?: { app: boolean; admin?: boolean; value: boolean };
  /**
   * For `anthropic`: its fallbacks as the app sets them, the admins'
   * choice, and what applies. With `app: false` they stay off.
   */
  fallbacks?: { app: boolean; admin?: boolean; value: boolean };
  models: {
    /** The app's, or the provider's own. */
    app: string[];
    /** Those the admins added, after the app's. */
    added: string[];
    /** Whether the app lets the admins add models (`adminModels`). */
    canAdd: boolean;
  };
}

/**
 * Body of `PUT /_mapo/ai/settings`: each block it holds replaces the
 * admins' one; the blocks it leaves out stay as they are.
 */
export interface MapoAiSettingsInput {
  /** The admins' instructions; a task left out has none. */
  instructions?: Partial<MapoAiTaskInstructions>;
  /** The rules the admins set; a rule left out follows the app's, and `{}` all of them. */
  verification?: Partial<AiVerificationRules>;
  /** Words that name a secret besides Mapo's and the app's. */
  secretWords?: string[];
  /** By provider id: each one given replaces the admins' settings of that provider. */
  providers?: Record<string, MapoAiProviderSettingsInput>;
}

/** The admins' settings of one provider, in {@link MapoAiSettingsInput}. */
export interface MapoAiProviderSettingsInput {
  /** For `openai` and `anthropic`; left out, the app's applies. */
  promptCache?: boolean;
  /** For `anthropic`; left out, the app's applies; `true` only where the app leaves them on. */
  fallbacks?: boolean;
  /**
   * Models to add after the app's, where the app allows it: each one the
   * provider's server lists, with the key the admin's own calls use.
   * Left out, none.
   */
  models?: string[];
}

/** Body of `POST /_mapo/ai/settings/preview`. */
export interface MapoAiPreviewInput {
  task: "fill" | "extract";
  /** Instructions not saved yet, to see them in place; left out, the saved ones. */
  instructions?: Partial<MapoAiTaskInstructions>;
}

/** What `POST /_mapo/ai/settings/preview` answers. */
export interface MapoAiPreviewResponse {
  /** The version of Mapo's base rules. */
  version: number;
  /**
   * Layers 1–3 of the task's prompt, as the model reads them: Mapo's rules,
   * the app's, the admins'. Without the record, the source and the rules
   * the app's `mapo-ai:prompt` hooks add for a request.
   */
  text: string;
}

// ─── usage ───────────────────────────────────────────────────────────────────

/**
 * The calls of a group and their tokens, as the usage sums them from the
 * audit, and their cost where the app prices their models.
 */
export interface MapoAiUsageTotals {
  calls: number;
  answered: number;
  refused: number;
  failed: number;
  /** Tokens of the prompts, those read from or written to a cache included. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /**
   * In the answer's `currency`, for the calls of the models the app prices
   * (`mapo.ai.prices`); absent when it prices none of them.
   */
  cost?: number;
  /** Calls of models the app gives no price: not in `cost`. */
  unpricedCalls: number;
}

/** A user's calls, as the AI's admins see them. */
export interface MapoAiUsageByUser extends MapoAiUsageTotals {
  user: { id: string; username?: string };
}

/** The calls of one model of one provider: the model that answered. */
export interface MapoAiUsageByModel extends MapoAiUsageTotals {
  provider: string;
  model: string;
}

/** The calls of one day, in UTC. */
export interface MapoAiUsageByDay extends MapoAiUsageTotals {
  /** `YYYY-MM-DD`, in UTC. */
  day: string;
}

/** One call, as the usage lists the latest: never its source, instructions or values. */
export interface MapoAiUsageCall {
  /** When it started, as an ISO date and time. */
  at: string;
  user: { id: string; username?: string };
  task: "fill" | "extract";
  /** The entities, by label, else type, model or endpoint. */
  entities: string[];
  /** The provider and the model that answered. */
  provider: string;
  model: string;
  /** Where the key came from, never the key. */
  key?: { level: MapoAiKeyLevel; group?: string };
  outcome: "answered" | "refused" | "failed";
  failure?: string;
  usage: MapoAiUsage;
  durationMs: number;
  /** In the answer's `currency`, when the app prices the model. */
  cost?: number;
}

/**
 * `GET /_mapo/ai/usage` for the AI's admins, every user's calls;
 * `GET /_mapo/ai/usage/mine` for a user, their own.
 */
export interface MapoAiUsageAnswer {
  /** The period: the last `days` days, from `from` to `to`, in UTC (`YYYY-MM-DD`). */
  days: number;
  from: string;
  to: string;
  /** The currency of the costs, as `mapo.ai.prices` names it: `USD` unless set. */
  currency: string;
  totals: MapoAiUsageTotals;
  /** For the AI's admins: each user's calls, most first. */
  byUser?: MapoAiUsageByUser[];
  /** Each model's calls, most first. */
  byModel: MapoAiUsageByModel[];
  /** Each day's calls, the latest first. */
  byDay: MapoAiUsageByDay[];
  /** The latest calls, newest first. */
  recent: MapoAiUsageCall[];
  /**
   * Whether the period had more calls than the gateway reads at once: then
   * the totals are of the newest ones.
   */
  truncated: boolean;
}

/** What a change of the audit's `actions:` did. */
export type MapoAiActionKind =
  | "assignment-saved"
  | "assignment-removed"
  | "groups-ordered"
  | "token-saved"
  | "token-removed"
  | "settings-saved";

/** A change of the keys or of the AI settings, as `GET /_mapo/ai/actions` lists it: never a key or a text. */
export interface MapoAiAction {
  /** When, as an ISO date and time. */
  at: string;
  /** Who made it. */
  by: { id: string; username?: string };
  action: MapoAiActionKind;
  /** The provider of an assignment or a token. */
  provider?: string;
  /** Who an assignment is for. */
  scope?: MapoAiKeyScope;
  /** Whose token was saved or removed: their id. */
  user?: string;
  /** For a saved assignment: whether its key was set, replaced or removed. */
  keyChanged?: boolean;
  /** For saved settings: the blocks replaced. */
  blocks?: ("instructions" | "verification" | "secretWords" | "providers")[];
  /** For saved settings: the providers whose settings were replaced. */
  providers?: string[];
  /** For saved settings: the rules of verification made less prudent. */
  loosened?: string[];
}

/** `GET /_mapo/ai/actions`, for the AI's admins: the changes of the period, newest first. */
export interface MapoAiActionsAnswer {
  days: number;
  from: string;
  to: string;
  actions: MapoAiAction[];
  /** Whether the period had more changes than the gateway lists at once. */
  truncated: boolean;
}

/** The provider and the model of each task that `run` calls when the request names none. */
export interface MapoAiDefaults {
  /** The provider's id. */
  provider: string;
  /** The model of each task, among the provider's. */
  models: { fill: string; extract: string };
}

/** The limits of `run` and `read`, from `mapo.ai.limits`. */
export interface MapoAiLimits {
  /** Calls to `run` one user may make in a minute, in one server process. */
  perUserPerMinute: number;
  /**
   * Characters of the source a request of `run` may send, all its parts
   * together; `read` reads no file into more.
   */
  maxSourceChars: number;
  /** Characters of the operator's own instructions; `0` lets operators send none. */
  maxInstructionsChars: number;
  /** Bytes of a file `read` takes; `0` lets operators send none. */
  maxFileBytes: number;
}

// ─── run ─────────────────────────────────────────────────────────────────────

/** A text the operator hands the AI: pasted, or read from a file. */
export interface MapoAiTextPart {
  kind: "text";
  /** The text itself. */
  text: string;
  /** What the part is, such as a file's name: the quotes name it as where they are. */
  name?: string;
}

/** One part of a source. Today the gateway reads text only. */
export type MapoAiSourcePart = MapoAiTextPart;

/**
 * An entity as the page describes it to `run`: the two descriptions of its
 * records, and what the AI should know about it. The gateway builds from
 * them what the AI may fill and the schema of its answer, with the same
 * code the page runs (`buildAiEntity()`, then the contract compiler).
 */
export interface MapoAiRunEntity {
  /**
   * The backend's schema, in Mapo's JSON Schema dialect: from `OPTIONS`,
   * DRF metadata or an OpenAPI document, normalized by `@mapomodule/utils`.
   */
  schema?: JSONSchema;
  /** The form's fields, as `fieldsToJsonSchema()` writes them. */
  fields?: JSONSchema;
  /**
   * Keys the AI never fills in this entity: `seo` covers `seo.title` too,
   * and `speakers.*.email` the email of every item of `speakers`.
   */
  exclude?: string[];
  /** Its type in an extraction, unique in the request: `event`. */
  type?: string;
  /** Its name for people: "Event". */
  label?: string;
  /** What a record of this entity is, for the AI. */
  description?: string;
  /** Where its records are created: `/api/events/`. */
  endpoint?: string;
  /**
   * The records a relation field may point to, by field key, when they are
   * few (250 at most for one field): the AI then picks an id instead of a
   * name to search for. A field inside a list's items goes by its path, `*`
   * for the item: `speakers.*.organisation`.
   */
  relationChoices?: Record<string, AiChoice[]>;
  /** Ask the AI to quote the source for each value. Default `true`. */
  evidence?: boolean;
  /**
   * The backend model of its records, such as `article`. The gateway then
   * asks the user's permission on it: `change_article` for a record that
   * exists, `add_article` otherwise. It keeps the gateway in step with the
   * page; it is not a boundary, since a request names the model it wants.
   */
  model?: string;
}

interface MapoAiRunCommon {
  /** The language translatable values are written in, such as `it`. */
  language?: string;
  /** The source: one part at least. */
  parts: MapoAiSourcePart[];
  /**
   * The operator's own instructions for this request, such as "only the
   * first event". They narrow the task; they never change Mapo's rules or
   * the shape of the answer.
   */
  instructions?: string;
  /**
   * The provider to call and its model, among those `status` lists; the
   * app's default for each part left out.
   */
  provider?: { id?: string; model?: string };
}

/** `run` with `task: "fill"`: fill one record (Magic Fill). */
export interface MapoAiFillRequest extends MapoAiRunCommon {
  task: "fill";
  entity: MapoAiRunEntity;
  /** The record exists already: the permission asked is `change_`, else `add_`. */
  existing?: boolean;
}

/** `run` with `task: "extract"`: every record a source describes (Import AI). */
export interface MapoAiExtractRequest extends MapoAiRunCommon {
  task: "extract";
  /** The entities the source may describe, each with its own `type`. */
  entities: MapoAiRunEntity[];
}

/** The body of `POST /_mapo/ai/run`. */
export type MapoAiRunRequest = MapoAiFillRequest | MapoAiExtractRequest;

/** The tokens a call used, as the provider counts them. */
export interface MapoAiUsage {
  /** Tokens of the prompt and the source the model read. */
  inputTokens: number;
  /** Tokens of the answer the model wrote, its reasoning included. */
  outputTokens: number;
  /**
   * Of `inputTokens`, those read from the provider's prompt cache, which
   * cost a fraction of the others. Absent when none were.
   */
  cacheReadTokens?: number;
  /**
   * Of `inputTokens`, those written to the provider's prompt cache, which
   * cost more than the others, once. Absent when none were.
   */
  cacheWriteTokens?: number;
}

interface MapoAiRunAnswerBase {
  /**
   * The provider and the model that answered: another model than the one
   * asked when the provider retried the call on it, as Anthropic does when
   * its safety filters decline a request.
   */
  provider: { id: string; model: string };
  /** The version of Mapo's base rules the prompt was composed with. */
  prompt: number;
  usage: MapoAiUsage;
}

/**
 * The answer of `POST /_mapo/ai/run`: the answer of the AI read against
 * what it was asked, one outcome per field (`result`), or the refusal of
 * the model.
 */
export type MapoAiRunResponse =
  | (MapoAiRunAnswerBase & {
      task: "fill";
      status: "answered";
      result: AiFillResult;
    })
  | (MapoAiRunAnswerBase & {
      task: "extract";
      status: "answered";
      result: AiExtractResult;
    })
  | (MapoAiRunAnswerBase & {
      task: "fill" | "extract";
      status: "refused";
      /** What the model said instead of answering. */
      refusal: string;
    });

/** A field of an entity, as the preview of a call names it. */
export interface MapoAiPreviewField {
  /** Its key: a value path of the form, such as `seo.title`. */
  key: string;
  /** Its label, when the descriptions give one. */
  label?: string;
}

/** A field the AI leaves alone, and why. */
export interface MapoAiPreviewSkipped extends MapoAiPreviewField {
  /**
   * `secret`, `readonly`, `excluded`, `media`, `relation`, `unsupported` and
   * `conflict` from the entity model; `too-deep` for a list nested deeper
   * than every provider accepts.
   */
  reason: string;
}

/** One entity of a call, as the preview of the call shows it. */
export interface MapoAiPreviewEntity {
  /** Its type in an extraction. */
  type?: string;
  /** Its name for people. */
  label?: string;
  /** The fields the AI may fill, in the form's order. */
  fields: MapoAiPreviewField[];
  /** The fields kept away from the AI. */
  skipped: MapoAiPreviewSkipped[];
}

/**
 * The answer of `POST /_mapo/ai/run/preview`, which takes the body of `run`:
 * what `run` would send for it, for "What I send to the AI". The gateway
 * checks and composes as `run` does, the app's `mapo-ai:prompt` hooks
 * included, and calls no provider, counts no call and audits nothing.
 */
export interface MapoAiRunPreviewResponse {
  task: "fill" | "extract";
  /** The provider and model `run` would call. */
  provider: { id: string; model: string };
  /** The version of Mapo's base rules. */
  prompt: number;
  /**
   * Layers 1–4 of the prompt, as the model reads them: Mapo's rules, the
   * app's (those its hooks add for this request included), the admins'
   * instructions, and what the records are.
   */
  instructions: string;
  /** Layer 5: the operator's instructions, as the model reads them. */
  operator?: string;
  /**
   * Layer 6, the source: each part by its name and its characters. Its
   * text is the page's own, and never comes back.
   */
  parts: { name?: string; chars: number }[];
  /** What the AI is asked of each entity, and what it leaves alone. */
  entities: MapoAiPreviewEntity[];
}

// ─── read ────────────────────────────────────────────────────────────────────

/**
 * The answer of `POST /_mapo/ai/read`: what became of the file it was
 * sent. Only `read` gives parts, the source as `run` takes it; the others
 * say why there are none:
 * - `unsupported`: no reader takes the file's format, or the app has
 *   turned its reader off (`mapo.ai.readers`);
 * - `empty`: the reader found no text in it;
 * - `too-long`: its text has more characters than `run` takes
 *   (`maxSourceChars`), and a source goes to `run` whole or not at all;
 * - `failed`: the reader could not read it: damaged, not the format its
 *   name says, or locked.
 */
export type MapoAiReadResponse =
  | {
      status: "read";
      /** The reader that read it: `csv`, or the id of the app's own. */
      reader: string;
      /** The parts read: one at least, each with the file's name. */
      parts: MapoAiSourcePart[];
    }
  | { status: "unsupported" }
  | { status: "empty"; reader: string }
  | {
      status: "too-long";
      reader: string;
      /** The characters of its text. */
      chars: number;
    }
  | { status: "failed"; reader: string };

/**
 * The secret the storage seals with, as the server found it: `set` (the
 * app's own), `temporary` (none in development: a random one for this run),
 * or what keeps the storage closed.
 */
export type MapoAiSecretState =
  | "set"
  | "temporary"
  | "missing"
  | "too-short"
  | "not-text";

/** The state of the gateway's storage, as `status` reports it to the AI's admins. */
export interface MapoAiStorageState {
  /** Whether the gateway can read and write its state. */
  open: boolean;
  /** The secret, `NUXT_MAPO_AI_SECRET`: never its value. */
  secret: MapoAiSecretState;
  /** Whether a driver is mounted at `mapo-ai`. */
  mounted: boolean;
  /** The name of that driver, when it has one (`fs-lite`, `redis`…). */
  driver?: string;
}
