/**
 * The AI gateway contract: where its routes live and keep their state, which
 * version of the contract they speak, what they are sent and what they
 * answer. Pure TypeScript, shared by the module, the server routes and the
 * pages that call them.
 */

import type { JSONSchema } from "@mapomodule/utils";
import type { AiChoice } from "./entity";
import type { AiExtractResult, AiFillResult } from "./sanitize";

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
   * What `run` calls when the request names no provider or no model. For a
   * user the app lets in, when a provider is enabled.
   */
  default?: MapoAiDefaults;
  /** The limits of `run`. For a user the app lets in. */
  limits?: MapoAiLimits;
}

/** A provider `run` may call, as `status` lists it. */
export interface MapoAiProviderStatus {
  /** Its id, as the request names it: `mock`. */
  id: string;
  /** Its name for people, when it has one. */
  label?: string;
  /** The models a request may ask for, the provider's default first. */
  models: string[];
}

/** The provider and the model of each task that `run` calls when the request names none. */
export interface MapoAiDefaults {
  /** The provider's id. */
  provider: string;
  /** The model of each task, among the provider's. */
  models: { fill: string; extract: string };
}

/** The limits of `run`, from `mapo.ai.limits`. */
export interface MapoAiLimits {
  /** Calls to `run` one user may make in a minute, in one server process. */
  perUserPerMinute: number;
  /** Characters of the source a request may send, all its parts together. */
  maxSourceChars: number;
  /** Characters of the operator's own instructions; `0` lets operators send none. */
  maxInstructionsChars: number;
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
