/**
 * `run` wired to the app's Nitro server: the options from the private
 * runtime config, the providers from the registry (Mapo's that call a
 * server built with its address and the key the chain chose for the user),
 * the admins' keys and the users' tokens and the audit in the sealed
 * storage, the counts of this process, and the app's `mapo-ai:prompt`
 * hooks. The logic lives in `run.ts`, `policy.ts`, `options.ts` and
 * `keys/`, which the tests run without Nitro.
 */

import type { H3Event } from "h3";
import { useNitroApp, useRuntimeConfig } from "nitropack/runtime";
import type { MapoAiKeyProvider } from "../../shared/gateway";
import type { MapoAiSession } from "../auth/nitro";
import { emptyKeysRecord } from "../keys/assignments";
import type { AssignableProvider, KeysRecord } from "../keys/assignments";
import { keyStatusOf, providerAccess } from "../keys/chain";
import type { KeyChainUser } from "../keys/chain";
import { readKeys, readUserTokens } from "../keys/store";
import { mapoAiProvider } from "../providers/registry";
import type { MapoAiServerSettings } from "../providers/registry";
import { mapoAiStorageState, useMapoAiStorage } from "../storage/nitro";
import { createRateLimiter } from "./limiter";
import { plainKeyWarning, providerKeyOf, readRunOptions } from "./options";
import type { MapoAiRunOptions } from "./options";
import { policyForUser, policyOf } from "./policy";
import type { MapoAiPolicy, UnusableProvider, UsableProvider } from "./policy";
import type { MapoAiPromptContext, RunDependencies } from "./run";

/** The counts of the users' calls, in this process. */
const limiter = createRateLimiter();
const warned = new Set<string>();

/**
 * The options of `run` in the runtime config. A value the environment
 * changed into one that cannot be read is logged once, and its default
 * applies.
 */
export function mapoAiRunOptions(event?: H3Event): MapoAiRunOptions {
  return readRunOptions(useRuntimeConfig(event).mapoAi, warnOnce);
}

/**
 * What the app enables, for every user, and its defaults: the providers
 * `mapo.ai.providers` lists, built with the project's keys. A user's own
 * policy, with the admins' keys, is {@link mapoAiUserPolicy}.
 */
export function mapoAiPolicy(event?: H3Event): MapoAiPolicy {
  return currentPolicy(event).policy;
}

/** The providers the app enables, as the admins assign them. */
export function assignableProviders(policy: MapoAiPolicy): MapoAiKeyProvider[] {
  return policy.providers.map(({ provider, models }) => ({
    id: provider.id,
    ...(provider.label ? { label: provider.label } : {}),
    models: [...models],
    ...(provider.key ? { key: provider.key } : {}),
  }));
}

/**
 * What `run` may call for one user, and its defaults: the app's providers
 * as the admins' assignments narrow them, each with the key the chain
 * chose. Without a storage that opens, as in production without
 * `NUXT_MAPO_AI_SECRET`, there are no assignments nor tokens: the project's
 * keys only.
 * @throws H3Error 503 when the admins' keys are stored and cannot be read
 */
export async function mapoAiUserPolicy(
  event: H3Event,
  user: KeyChainUser,
): Promise<MapoAiPolicy> {
  const config: unknown = useRuntimeConfig(event).mapoAi;
  const options = readRunOptions(config, warnOnce);
  const policy = policyOf(options, (id) =>
    mapoAiProvider(id, serverSettingsOf(config, options, id)),
  ).policy;
  const { record, tokens } = await keysOf(event, user, policy);
  return policyForUser(policy, (usable) => {
    const assignable = assignableOf(usable);
    const token = tokens.get(assignable.id);
    const access = providerAccess({
      provider: assignable,
      user,
      record,
      ...(token ? { token } : {}),
      ...withProjectKey(providerKeyOf(config, assignable.id)),
    });
    const key = keyStatusOf(assignable, access, token);
    if (!key) return { provider: usable.provider, models: access.models };
    const apiKey = access.key?.value;
    const settings = serverSettingsOf(config, options, assignable.id, false);
    const inClear = plainKeyWarning(assignable.id, settings.baseURL, apiKey);
    if (inClear) noticeOnce(inClear);
    return {
      // Mapo's providers hold their key from when they are built: built
      // again with the user's. An app's provider gets it with each call.
      provider:
        mapoAiProvider(assignable.id, {
          ...settings,
          ...(apiKey ? { apiKey } : {}),
        }) ?? usable.provider,
      models: access.models,
      ...(apiKey ? { apiKey } : {}),
      key,
    };
  });
}

/** The providers the options enable that cannot be used, for the server's log. */
export function unusableMapoAiProviders(event?: H3Event): UnusableProvider[] {
  return currentPolicy(event).unusable;
}

/**
 * The admins' keys, and the user's own tokens for the providers that take
 * one; nothing when the storage is closed.
 */
async function keysOf(
  event: H3Event,
  user: KeyChainUser,
  policy: MapoAiPolicy,
): Promise<{ record: KeysRecord; tokens: Map<string, string> }> {
  if (!mapoAiStorageState(event).open) {
    return { record: emptyKeysRecord(), tokens: new Map() };
  }
  const storage = useMapoAiStorage(event);
  const record = await readKeys(storage.store("keys"));
  const keyed = policy.providers
    .filter((usable) => usable.provider.key !== undefined)
    .map((usable) => usable.provider.id);
  const tokens = await readUserTokens(storage.store("tokens"), user.id, keyed);
  return { record, tokens };
}

function assignableOf(usable: UsableProvider): AssignableProvider {
  const { provider, models } = usable;
  return {
    id: provider.id,
    models,
    ...(provider.key ? { key: provider.key } : {}),
  };
}

function withProjectKey(key: string | undefined): { projectKey?: string } {
  return key ? { projectKey: key } : {};
}

function currentPolicy(event?: H3Event): ReturnType<typeof policyOf> {
  const config: unknown = useRuntimeConfig(event).mapoAi;
  const options = readRunOptions(config, warnOnce);
  return policyOf(options, (id) =>
    mapoAiProvider(id, serverSettingsOf(config, options, id)),
  );
}

/**
 * The address, the project's key and the settings (the context, a cloud's
 * effort and prompt cache) a provider that calls a server is built with;
 * without the key when `withKey` is `false`.
 */
function serverSettingsOf(
  config: unknown,
  options: MapoAiRunOptions,
  id: string,
  withKey = true,
): MapoAiServerSettings {
  const enabled = Object.hasOwn(options.providers, id)
    ? options.providers[id]
    : undefined;
  const apiKey = withKey ? providerKeyOf(config, id, noticeOnce) : undefined;
  const inClear = plainKeyWarning(id, enabled?.baseURL, apiKey);
  if (inClear) noticeOnce(inClear);
  return {
    ...(enabled?.baseURL ? { baseURL: enabled.baseURL } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(enabled?.contextTokens ? { contextTokens: enabled.contextTokens } : {}),
    ...(enabled?.effort ? { effort: enabled.effort } : {}),
    ...(enabled?.promptCache ? { promptCache: true } : {}),
  };
}

/**
 * What `run` needs from the server, for this request and its user.
 * @throws H3Error 503 when the storage is closed: a call that cannot be
 *   audited is not made; or when the admins' keys cannot be read
 */
export async function mapoAiRunDependencies(
  event: H3Event,
  session: MapoAiSession,
): Promise<RunDependencies> {
  const audit = useMapoAiStorage(event).store("audit");
  return {
    policy: await mapoAiUserPolicy(event, session.user),
    audit,
    limiter,
    promptRules: (facts) => askPromptHooks(event, facts),
  };
}

/** Runs the app's `mapo-ai:prompt` hooks: what they add, in order. */
async function askPromptHooks(
  event: H3Event,
  facts: Omit<MapoAiPromptContext, "event" | "addRule">,
): Promise<string[]> {
  const rules: string[] = [];
  // Frozen, with its own list: a hook can only add, never change what the
  // next hook, the prompt or the audit reads.
  const context: MapoAiPromptContext = {
    ...facts,
    entities: Object.freeze([...facts.entities]),
    event,
    addRule(rule: string) {
      if (typeof rule === "string" && rule.trim() !== "") rules.push(rule);
    },
  };
  await useNitroApp().hooks.callHook("mapo-ai:prompt", Object.freeze(context));
  return rules;
}

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.error(`[mapo-ai] In the runtime config, ${message}`);
}

/** Says once in the log what the server found about a provider's key. */
function noticeOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[mapo-ai] ${message}`);
}
