/**
 * What a provider is to the gateway: something that takes the composed
 * prompt, the source and the schema of the answer, and returns the model's
 * answer or its refusal. Mapo's own providers and those an app registers
 * (`registerMapoAiProvider()`) implement the same interface; the gateway
 * reads every answer as outside data, through the sanitizer.
 */

import type { JSONSchema } from "@mapomodule/utils";
import type { AiContract } from "../../shared/contract";
import type { MapoAiSourcePart, MapoAiUsage } from "../../shared/gateway";
import type { MapoAiPrompt } from "../prompts/compose";

/**
 * What a provider can do. The gateway does not read it yet: it sends text
 * only, and waits for the whole answer, which a provider may stream from
 * its server meanwhile.
 */
export interface MapoAiProviderCapabilities {
  /**
   * How the answer is held to its schema: `strict`, by the provider itself
   * (structured outputs); `json`, the model writes JSON and the gateway's
   * sanitizer is the only check.
   */
  structuredOutput: "strict" | "json";
  /** Reads PDF parts as they are. The gateway sends none yet. */
  pdf: boolean;
  /** Reads images. The gateway sends none yet. */
  images: boolean;
  /**
   * Streams the answer from its server. The gateway does not stream to the
   * browser yet: it waits for the whole answer.
   */
  streaming: boolean;
  /** Can call tools, for a conversational agent. The gateway calls none. */
  tools: boolean;
}

/** A model a provider's server has, as `listModels()` reads it. */
export interface MapoAiModelInfo {
  /** The model's id, as a request names it. */
  id: string;
  /** How many tokens the model reads at most, when the server says. */
  contextTokens?: number;
  /** Whether the model reads images, when the server says. */
  images?: boolean;
}

/** What the gateway asks a provider. */
export interface MapoAiProviderRequest {
  task: AiContract["task"];
  /** The model to call, one the app allows. */
  model: string;
  /**
   * The prompt, composed by the gateway in layers: `instructions` holds
   * Mapo's rules, the app's, the entity's context and the admin's, the
   * same from one request to the next; `input` holds the operator's
   * instructions and the source, between marks the source cannot write.
   */
  prompt: MapoAiPrompt;
  /** The source's parts, as the request sent them: already in `prompt.input`. */
  parts: readonly MapoAiSourcePart[];
  /** The JSON Schema the answer must match, in the subset every provider accepts. */
  schema: JSONSchema;
  /** What the schema was compiled from: the entities and their fields. */
  contract: AiContract;
  /**
   * Aborted when the call takes longer than the provider's `timeout`. The
   * gateway stops waiting then, whatever the provider does.
   */
  signal: AbortSignal;
  /**
   * For a provider that declares `key`: the key the gateway's chain chose
   * for the user (their own token, an admin's key, the project's). Absent
   * when no level has one. Never log it.
   */
  apiKey?: string;
}

/**
 * A provider's answer: what the model wrote, parsed from JSON (or the text
 * itself when it is not JSON), or what it said instead of answering. With
 * `model`, the model that answered, when it is not the one asked: a
 * provider that retried the call on another model, as Anthropic does when
 * its safety filters decline a request. The gateway's answer and its audit
 * name that model.
 */
export type MapoAiProviderAnswer =
  | { status: "answered"; output: unknown; usage: MapoAiUsage; model?: string }
  | { status: "refused"; refusal: string; usage: MapoAiUsage; model?: string };

/** A source of answers the gateway can call. */
export interface MapoAiProvider {
  /**
   * How requests and `mapo.ai.providers` name it: lowercase letters,
   * digits and `-`, starting with a letter, up to 64 characters.
   */
  readonly id: string;
  /** Its name for people, shown by `status`. */
  readonly label?: string;
  /**
   * Whether it calls its server with a key from the gateway's chain: the
   * user's own token, where an admin allows one; the key an admin assigned
   * to the user, a group of theirs or everyone; the project's, from the
   * environment (`NUXT_MAPO_AI_PROVIDERS_<ID>_API_KEY`). Each call gets it
   * as `apiKey`.
   * - `required`: a call without a key is refused before it is made;
   * - `optional`: it is made without one too, as a server on the app's own
   *   network takes it.
   * Absent: the provider uses no key of the gateway, as the mock.
   */
  readonly key?: "required" | "optional";
  readonly capabilities: MapoAiProviderCapabilities;
  /**
   * The models it offers when `mapo.ai.providers` lists none for it, its
   * default first.
   */
  readonly models?: readonly string[];
  /**
   * The models its server has, for a server that can list them, such as
   * a local one. The server calls it when it starts, and warns about each
   * model `mapo.ai.providers` allows that the list does not have; the
   * models a request may use stay those `mapo.ai.providers` allows. "Check
   * the connection" in the AI settings calls it too, for one user. For a
   * provider that declares `key`, `apiKey` is the key the chain chose for
   * that user, or the project's when the server starts.
   */
  listModels?(signal: AbortSignal, apiKey?: string): Promise<MapoAiModelInfo[]>;
  /**
   * Calls the model. Throw a {@link MapoAiProviderError} for a failure the
   * gateway should tell apart (a timeout, a rate limit); anything else it
   * reports as the provider failing.
   */
  run(request: MapoAiProviderRequest): Promise<MapoAiProviderAnswer>;
}

/**
 * Why a call failed, as the gateway answers it:
 * - `timeout`: no answer in time, 504;
 * - `rate-limit`: the provider asks to slow down, 503 with `Retry-After`;
 * - `unavailable`: the provider is down or failed, 502;
 * - `invalid-response`: its response could not be read at all, 502;
 * - `refused-request`: it refused the request itself (a bad schema, a key,
 *   a model it does not have), 502;
 * - `too-long`: the prompt does not fit what the model reads, so the call
 *   would cut it, or the server cut it: 413;
 * - `truncated`: the answer reached the most the model may write, and was
 *   cut: 502.
 */
export type MapoAiProviderFailure =
  | "timeout"
  | "rate-limit"
  | "unavailable"
  | "invalid-response"
  | "refused-request"
  | "too-long"
  | "truncated";

/** A failure of a provider the gateway tells apart. The message goes to the server's log. */
export class MapoAiProviderError extends Error {
  readonly failure: MapoAiProviderFailure;
  /** For `rate-limit`: in how many seconds the provider takes calls again, when it says. */
  readonly retryAfter?: number;
  /**
   * The tokens the call used before it failed, when the provider says them:
   * a cut answer is paid up to its cap. The gateway's audit keeps them.
   */
  readonly usage?: MapoAiUsage;
  /** The model that answered before the failure, when it is not the one asked. */
  readonly model?: string;

  constructor(
    failure: MapoAiProviderFailure,
    message: string,
    options: {
      retryAfter?: number;
      cause?: unknown;
      usage?: MapoAiUsage;
      model?: string;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "MapoAiProviderError";
    this.failure = failure;
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter;
    if (options.usage !== undefined) this.usage = options.usage;
    if (options.model !== undefined) this.model = options.model;
  }
}
