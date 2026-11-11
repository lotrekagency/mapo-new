/**
 * Which provider and model a call of `run` gets. A provider is usable when
 * `mapo.ai.providers` lists it and there is a provider of that id, Mapo's
 * or one the app registered, with a model to call. For one user, the
 * admins' assignments narrow the models and choose the key
 * (`keys/chain.ts`). A request may name a usable provider and one of its
 * models; what it leaves out comes from `mapo.ai.default`, or the first
 * usable provider that can be called and its first model.
 * Pure: the providers are looked up through the function passed in.
 */

import { createError } from "h3";
import type {
  MapoAiDefaults,
  MapoAiKeyStatus,
  MapoAiPreference,
  MapoAiProviderStatus,
  MapoAiRefusalReason,
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
  /**
   * For one user, and a provider that calls with a key: the key the chain
   * chose, which each call gets as `apiKey`. Never log it.
   */
  apiKey?: string;
  /** For one user, and a provider that calls with a key: where the key comes from. */
  key?: MapoAiKeyStatus;
}

/** What a provider offers one user, as {@link policyForUser} applies it. */
export interface UserOffer {
  /** The provider, built with the user's key when it is one of Mapo's. */
  provider: MapoAiProvider;
  /** The models the user may call; empty: the provider is closed to them. */
  models: string[];
  apiKey?: string;
  key?: MapoAiKeyStatus;
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
    const own = enabled.models ?? [...(provider.models ?? [])];
    // The admins' models come after the app's, once each.
    const added = [...new Set(enabled.addedModels ?? [])].filter(
      (model) => !own.includes(model),
    );
    const models = [...own, ...added];
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
 * The policy for one user: each usable provider as `offer` gives it to
 * them, with their models and their key. A provider that offers them no
 * model is left out, and the defaults are chosen again among the rest:
 * the user's `preference` first, while they may call it.
 */
export function policyForUser(
  policy: MapoAiPolicy,
  offer: (usable: UsableProvider) => UserOffer,
  preference?: MapoAiPreference,
): MapoAiPolicy {
  const providers = policy.providers.flatMap((usable): UsableProvider[] => {
    const offered = offer(usable);
    if (!offered.models.length) return [];
    return [
      {
        provider: offered.provider,
        models: offered.models,
        timeoutMs: usable.timeoutMs,
        ...(offered.apiKey !== undefined ? { apiKey: offered.apiKey } : {}),
        ...(offered.key ? { key: offered.key } : {}),
      },
    ];
  });
  const defaults =
    preferredOf(providers, preference) ?? defaultsOf(policy.options, providers);
  return {
    providers,
    options: policy.options,
    ...(defaults ? { defaults } : {}),
  };
}

/**
 * The user's preference as defaults, for every task, while the provider
 * offers them the model and can be called; `undefined` otherwise.
 */
function preferredOf(
  providers: readonly UsableProvider[],
  preference: MapoAiPreference | undefined,
): MapoAiDefaults | undefined {
  if (!preference) return undefined;
  const usable = providers.find(
    (one) => one.provider.id === preference.provider,
  );
  const isOffered = usable?.models.includes(preference.model) === true;
  if (!usable || !isOffered || !canCall(usable)) return undefined;
  const { model } = preference;
  return {
    provider: usable.provider.id,
    models: { fill: model, extract: model },
  };
}

/**
 * The provider and model a request gets.
 * @throws H3Error 503 when no provider is usable, or the one asked needs a
 *   key and no level has one; 403 when the request names a provider or a
 *   model the app does not enable for the user. `data.reason` says which
 *   ({@link MapoAiRefusalReason}).
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
      data: { reason: "no-provider" satisfies MapoAiRefusalReason },
    });
  }
  const id = requested?.id ?? defaults.provider;
  const usable = policy.providers.find((one) => one.provider.id === id);
  if (!usable) {
    throw createError({
      statusCode: 403,
      statusMessage: "This AI provider is not enabled",
      data: { reason: "provider-off" satisfies MapoAiRefusalReason },
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
      data: { reason: "model-off" satisfies MapoAiRefusalReason },
    });
  }
  if (!canCall(usable)) {
    throw createError({
      statusCode: 503,
      statusMessage: "This AI provider has no key",
      data: { reason: "no-key" satisfies MapoAiRefusalReason },
    });
  }
  return { usable, model };
}

/** The usable providers as `status` lists them. */
export function providerStatuses(policy: MapoAiPolicy): MapoAiProviderStatus[] {
  return policy.providers.map(({ provider, models, key }) => ({
    id: provider.id,
    ...(provider.label ? { label: provider.label } : {}),
    models: [...models],
    ...(key ? { key: structuredClone(key) } : {}),
  }));
}

/** Whether a call can be made: a provider that needs a key has one. */
export function canCall(usable: UsableProvider): boolean {
  const hasNoKey = usable.key?.level === "none";
  return !(usable.key?.required === true && hasNoKey);
}

/**
 * `mapo.ai.default` among the usable providers that can be called: its
 * provider when it can, else the first that can; for each task its model
 * when that provider offers it, else the provider's first. When none can
 * be called, among them all, so a call says why it is refused.
 */
function defaultsOf(
  options: MapoAiRunOptions,
  providers: readonly UsableProvider[],
): MapoAiDefaults | undefined {
  const wanted = options.default.provider;
  const callable = providers.filter(canCall);
  const pool = callable.length ? callable : providers;
  const chosen = pool.find((one) => one.provider.id === wanted) ?? pool[0];
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
