/**
 * `run` wired to the app's Nitro server: the options from the private
 * runtime config, the providers from the registry (Mapo's that call a
 * server built with its address and its key, read apart from the options),
 * the audit in the sealed storage, the counts of this process, and the
 * app's `mapo-ai:prompt` hooks. The logic lives in `run.ts`, `policy.ts`
 * and `options.ts`, which the tests run without Nitro.
 */

import type { H3Event } from "h3";
import { useNitroApp, useRuntimeConfig } from "nitropack/runtime";
import { mapoAiProvider } from "../providers/registry";
import type { MapoAiServerSettings } from "../providers/registry";
import { useMapoAiStorage } from "../storage/nitro";
import { createRateLimiter } from "./limiter";
import { plainKeyWarning, providerKeyOf, readRunOptions } from "./options";
import type { MapoAiRunOptions } from "./options";
import { policyOf } from "./policy";
import type { MapoAiPolicy, UnusableProvider } from "./policy";
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

/** What `run` may call for this request, and its defaults. */
export function mapoAiPolicy(event?: H3Event): MapoAiPolicy {
  return currentPolicy(event).policy;
}

/** The providers the options enable that cannot be used, for the server's log. */
export function unusableMapoAiProviders(event?: H3Event): UnusableProvider[] {
  return currentPolicy(event).unusable;
}

function currentPolicy(event?: H3Event): ReturnType<typeof policyOf> {
  const config: unknown = useRuntimeConfig(event).mapoAi;
  const options = readRunOptions(config, warnOnce);
  return policyOf(options, (id) =>
    mapoAiProvider(id, serverSettingsOf(config, options, id)),
  );
}

/** The address, the key and the context a provider that calls a server is built with. */
function serverSettingsOf(
  config: unknown,
  options: MapoAiRunOptions,
  id: string,
): MapoAiServerSettings {
  const enabled = Object.hasOwn(options.providers, id)
    ? options.providers[id]
    : undefined;
  const apiKey = providerKeyOf(config, id, noticeOnce);
  const inClear = plainKeyWarning(id, enabled?.baseURL, apiKey);
  if (inClear) noticeOnce(inClear);
  return {
    ...(enabled?.baseURL ? { baseURL: enabled.baseURL } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(enabled?.contextTokens ? { contextTokens: enabled.contextTokens } : {}),
  };
}

/**
 * What `run` needs from the server, for this request.
 * @throws H3Error 503 when the storage is closed: a call that cannot be
 *   audited is not made
 */
export function mapoAiRunDependencies(event: H3Event): RunDependencies {
  return {
    policy: mapoAiPolicy(event),
    audit: useMapoAiStorage(event).store("audit"),
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
