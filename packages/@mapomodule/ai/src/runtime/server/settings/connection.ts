/**
 * "Check the connection" in the AI settings: whether a provider's server
 * answers the user's calls, with the key the chain chose for them, and has
 * the model. It asks for the server's list of models, which costs no
 * tokens, instead of calling a model.
 *
 * Pure: the provider and the clock come from the caller.
 */

import type { MapoAiTestResponse } from "../../shared/gateway";
import { maskKeys } from "../providers/http";
import { MapoAiProviderError } from "../providers/types";
import type { MapoAiProviderFailure } from "../providers/types";
import { canCall } from "../run/policy";
import type { UsableProvider } from "../run/policy";

/** Milliseconds the check waits for the server's list of models. */
export const CHECK_TIMEOUT_MS = 10_000;

/** What the check needs besides the provider and the model. */
export interface CheckOptions {
  /** The clock, in milliseconds. Default `Date.now`. */
  now?: () => number;
  /** Told why a check failed, for the server's log. */
  log?: (message: string) => void;
}

/**
 * Checks that the user's calls of `usable` reach its server and that the
 * server has `model`. Never throws: every way it can go is an outcome.
 */
export async function checkConnection(
  usable: UsableProvider,
  model: string,
  options: CheckOptions = {},
): Promise<MapoAiTestResponse> {
  const { provider } = usable;
  const asked = { provider: provider.id, model };
  if (!canCall(usable)) return { ...asked, outcome: "no-key" };
  const listed = await listedModels(usable, "connection check", options);
  if (listed === undefined) return { ...asked, outcome: "unverifiable" };
  if ("failure" in listed) {
    return { ...asked, outcome: "failed", failure: listed.failure };
  }
  return {
    ...asked,
    outcome: listed.ids.includes(model) ? "connected" : "model-missing",
    latencyMs: listed.latencyMs,
  };
}

/**
 * The ids of the models `usable`'s server lists, asked with the key the
 * user's calls use, at no cost: for the check of a connection, and before
 * a model an admin adds is saved. `undefined` for a provider that cannot
 * list its models; how the list failed, with the reason in the log
 * (`what` names the step there), never the key.
 */
export async function listedModels(
  usable: UsableProvider,
  what: string,
  options: CheckOptions = {},
): Promise<
  | { ids: string[]; latencyMs: number }
  | { failure: MapoAiProviderFailure }
  | undefined
> {
  const now = options.now ?? Date.now;
  const { provider } = usable;
  if (typeof provider.listModels !== "function") return undefined;
  const started = now();
  try {
    const listed: unknown = await provider.listModels(
      AbortSignal.timeout(CHECK_TIMEOUT_MS),
      ...(usable.apiKey !== undefined ? [usable.apiKey] : []),
    );
    const latencyMs = Math.max(0, now() - started);
    // An app's provider may list anything: only ids count.
    const ids = (Array.isArray(listed) ? listed : []).flatMap(
      (info: unknown) => {
        const id =
          typeof info === "object" && info !== null
            ? Reflect.get(info, "id")
            : undefined;
        return typeof id === "string" ? [id] : [];
      },
    );
    return { ids, latencyMs };
  } catch (error) {
    const failure: MapoAiProviderFailure =
      error instanceof MapoAiProviderError
        ? error.failure
        : isTimeout(error)
          ? "timeout"
          : "unavailable";
    const message = error instanceof Error ? error.message : String(error);
    const reason = withoutKey(message, usable.apiKey);
    options.log?.(
      `[mapo-ai] The ${what} of the provider "${provider.id}" failed: ${reason.slice(0, 500)}`,
    );
    return { failure };
  }
}

/** An abort of the check's own timeout. */
function isTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * A provider's message as the log may hold it: an app's provider gets the
 * user's key and may repeat it in its error, so the key is masked, and so
 * is what looks like one (`maskKeys()`), before the message is cut.
 */
function withoutKey(message: string, apiKey: string | undefined): string {
  const named = apiKey ? message.split(apiKey).join("[a key]") : message;
  return maskKeys(named);
}
