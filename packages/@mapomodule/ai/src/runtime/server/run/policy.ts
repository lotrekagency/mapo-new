/**
 * Which provider and model a call of `run` gets. A provider is usable when
 * `mapo.ai.providers` lists it and there is a provider of that id, Mapo's
 * or one the app registered, with a model to call. A request may name a
 * usable provider and one of its models; what it leaves out comes from
 * `mapo.ai.default`, or the first usable provider and its first model.
 * Pure: the providers are looked up through the function passed in.
 */

import { createError } from "h3";
import type {
  MapoAiDefaults,
  MapoAiProviderStatus,
  MapoAiRunRequest,
} from "../../shared/gateway";
import type { MapoAiProvider } from "../providers/types";
import type { MapoAiRunOptions } from "./options";

/** A provider `run` may call. */
export interface UsableProvider {
  provider: MapoAiProvider;
  /** The models a request may ask for, the default first. */
  models: string[];
  /** Milliseconds a call may take. */
  timeoutMs: number;
}

/** What `run` may call, and what it calls by default. */
export interface MapoAiPolicy {
  /** The usable providers, in the order `mapo.ai.providers` lists them. */
  providers: UsableProvider[];
  /** Absent when no provider is usable. */
  defaults?: MapoAiDefaults;
  options: MapoAiRunOptions;
}

/** Why a provider that `mapo.ai.providers` lists cannot be used. */
export interface UnusableProvider {
  id: string;
  reason: "unknown" | "no-model";
}

/**
 * The policy the options give, with the providers `lookup` finds; also the
 * providers the options list that cannot be used, for the server's log.
 */
export function policyOf(
  options: MapoAiRunOptions,
  lookup: (id: string) => MapoAiProvider | undefined,
): { policy: MapoAiPolicy; unusable: UnusableProvider[] } {
  const providers: UsableProvider[] = [];
  const unusable: UnusableProvider[] = [];
  for (const [id, enabled] of Object.entries(options.providers)) {
    const provider = lookup(id);
    if (!provider) {
      unusable.push({ id, reason: "unknown" });
      continue;
    }
    const models = enabled.models ?? [...(provider.models ?? [])];
    if (!models.length) {
      unusable.push({ id, reason: "no-model" });
      continue;
    }
    providers.push({ provider, models, timeoutMs: enabled.timeout * 1000 });
  }
  const defaults = defaultsOf(options, providers);
  return {
    policy: { providers, options, ...(defaults ? { defaults } : {}) },
    unusable,
  };
}

/**
 * The provider and model a request gets.
 * @throws H3Error 503 when no provider is usable; 403 when the request names
 *   a provider or a model the app does not enable
 */
export function chooseProvider(
  policy: MapoAiPolicy,
  task: MapoAiRunRequest["task"],
  requested: MapoAiRunRequest["provider"],
): { usable: UsableProvider; model: string } {
  const { defaults } = policy;
  if (!defaults) {
    throw createError({
      statusCode: 503,
      statusMessage: "No AI provider is enabled",
    });
  }
  const id = requested?.id ?? defaults.provider;
  const usable = policy.providers.find((one) => one.provider.id === id);
  if (!usable) {
    throw createError({
      statusCode: 403,
      statusMessage: "This AI provider is not enabled",
    });
  }
  const isDefaultProvider = id === defaults.provider;
  const model =
    requested?.model ??
    (isDefaultProvider ? defaults.models[task] : usable.models[0]);
  if (model === undefined || !usable.models.includes(model)) {
    throw createError({
      statusCode: 403,
      statusMessage: "This AI model is not enabled",
    });
  }
  return { usable, model };
}

/** The usable providers as `status` lists them. */
export function providerStatuses(policy: MapoAiPolicy): MapoAiProviderStatus[] {
  return policy.providers.map(({ provider, models }) => ({
    id: provider.id,
    ...(provider.label ? { label: provider.label } : {}),
    models: [...models],
  }));
}

/**
 * `mapo.ai.default` among the usable providers: its provider when usable,
 * else the first; for each task its model when that provider offers it,
 * else the provider's first.
 */
function defaultsOf(
  options: MapoAiRunOptions,
  providers: readonly UsableProvider[],
): MapoAiDefaults | undefined {
  const wanted = options.default.provider;
  const chosen =
    providers.find((one) => one.provider.id === wanted) ?? providers[0];
  if (!chosen) return undefined;
  const [first = ""] = chosen.models;
  const isWanted = chosen.provider.id === wanted;
  const modelFor = (task: "fill" | "extract"): string => {
    const model = isWanted ? options.default.models[task] : undefined;
    return model !== undefined && chosen.models.includes(model) ? model : first;
  };
  return {
    provider: chosen.provider.id,
    models: { fill: modelFor("fill"), extract: modelFor("extract") },
  };
}
