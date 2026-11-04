import { defineEventHandler, setResponseHeader } from "h3";
import { MAPO_AI_CONTRACT_VERSION } from "../../shared/gateway";
import type { MapoAiStatus } from "../../shared/gateway";
import { readMapoAiCaller } from "../auth/nitro";
import { mapoAiPolicy } from "../run/nitro";
import { providerStatuses } from "../run/policy";
import { mapoAiStorageState } from "../storage/nitro";

/**
 * `GET /_mapo/ai/status`: what the gateway offers the signed-in user: the
 * providers `run` may call for them, with their models, the defaults and
 * the limits; to the AI's admins also the state of its storage. Like every
 * route of the gateway it answers 401 without a session.
 *
 * A user the app's rules refuse gets an answer, not an error: `allowed:
 * false`, and nothing of what the AI offers. A page asks `status` to know
 * whether to offer the AI at all, and a refusal is a normal answer to that
 * question: as a 403, every page that asks would handle an error, and
 * through `$mapoFetch` show Mapo's permission-denied message. The routes
 * that act refuse such a user with a 403. The answer is the user's own, so
 * nothing may keep it.
 */
export default defineEventHandler(async (event): Promise<MapoAiStatus> => {
  setResponseHeader(event, "cache-control", "no-store");
  const caller = await readMapoAiCaller(event);
  const status: MapoAiStatus = {
    contract: MAPO_AI_CONTRACT_VERSION,
    allowed: caller.allowed,
    admin: caller.admin,
  };
  if (caller.admin) status.storage = mapoAiStorageState(event);
  if (!caller.allowed) return status;
  const policy = mapoAiPolicy(event);
  status.providers = providerStatuses(policy);
  if (policy.defaults) status.default = policy.defaults;
  status.limits = { ...policy.options.limits };
  return status;
});
