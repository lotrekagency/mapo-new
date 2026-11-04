/**
 * Who is calling the gateway, read from the user `userInfoApi` returns, and
 * what they may do: use the AI, administer it, fill a record of a model.
 * Pure: `nitro.ts` asks the backend and passes the answer in.
 */

import { userPermissions } from "@mapomodule/utils";
import type { ModelPermissions } from "@mapomodule/utils";
import type { H3Event } from "h3";
import { z } from "zod";
import { isRecord } from "../../shared/guards";

/** A user of the gateway, as it reads them from the backend. */
export interface MapoAiUser {
  /** The backend's `id`, as text. */
  readonly id: string;
  /** The backend's `username`, when it sends one. */
  readonly username?: string;
  /** Whether the backend calls the user a superuser (`is_superuser: true`). */
  readonly superuser: boolean;
  /** The group names: the strings in `groups`, as the auth store reads them. */
  readonly groups: readonly string[];
  /** The permission codenames, read as the auth store reads them. */
  readonly permissions: readonly string[];
  /** The flags of each model, from the codenames `<action>_<model>`. */
  readonly models: Readonly<Record<string, Readonly<ModelPermissions>>>;
}

/**
 * A rule that picks users: superusers always, then anyone in one of
 * `groups` or with one of `permissions` (codenames, as `userInfoApi` sends
 * them).
 */
export interface MapoAiAccessRule {
  groups?: string[];
  permissions?: string[];
}

/** What the gateway lets a user do, from `mapo.ai.admin` and `mapo.ai.users`. */
export interface MapoAiAccessRules {
  /** Who administers the AI. Without groups or permissions, superusers only. */
  admin: MapoAiAccessRule;
  /** Who may use the AI. Without a rule, every user the backend returns. */
  users?: MapoAiAccessRule;
}

/**
 * What the `mapo-ai:user` hook receives, once the backend has returned the
 * user and `mapo.ai.users` has let them in. A hook narrows who may use the
 * AI: it sets `allowed` to `false`, and `status` answers `allowed: false`,
 * every other route 403.
 */
export interface MapoAiUserContext {
  /** The request being authenticated. */
  readonly event: H3Event;
  /** The user, as the gateway reads them. */
  readonly user: MapoAiUser;
  /**
   * The user exactly as `userInfoApi` returned them, with the fields the
   * gateway does not read (`is_internal`, `is_staff`…). Outside data: check
   * a value's type before trusting it.
   */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Whether the user administers the AI (`mapo.ai.admin`). */
  readonly admin: boolean;
  /**
   * Whether the user may use the AI. Set it to `false` to refuse them. Once
   * false it stays false, whatever a later hook sets, and anything but
   * `true` counts as a refusal.
   */
  allowed: boolean;
}

/** A model permission the gateway checks before a call to the AI. */
export type MapoAiModelAction = "add" | "change";

/** The fields of a user payload the gateway relies on: an object with an id. */
const BACKEND_USER = z.looseObject({
  id: z.union([z.string().trim().min(1), z.number()]),
});

/** A rule as the runtime config holds it, where the environment may have changed it. */
const ACCESS_RULE = z.strictObject({
  groups: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
});

/**
 * The user in the payload `userInfoApi` returned, or `undefined` when it is
 * not a user: no object, or no `id`. The other fields are read leniently and
 * never grant more than they say: only `is_superuser: true` is a superuser,
 * only strings are group names, and permissions are read as the auth store
 * reads them. The payload is frozen in place, all the way down: the gateway
 * keeps it and hands it to the app's hooks.
 */
export function readBackendUser(
  payload: unknown,
):
  | { user: MapoAiUser; payload: Readonly<Record<string, unknown>> }
  | undefined {
  const parsed = BACKEND_USER.safeParse(payload);
  if (!parsed.success || !isRecord(payload)) return undefined;
  const { codenames, models } = userPermissions(payload);
  const username = payload.username;
  const user: MapoAiUser = {
    id: String(parsed.data.id),
    ...(typeof username === "string" ? { username } : {}),
    superuser: payload.is_superuser === true,
    groups: stringsIn(payload.groups),
    permissions: codenames,
    models,
  };
  // The gateway keeps both for a few seconds and hands them to the app's
  // hooks: frozen, a hook cannot change what the next request reads.
  return { user: deepFreeze(user), payload: deepFreeze(payload) };
}

/**
 * Reads `mapo.ai.admin` or `mapo.ai.users` from the runtime config, as
 * outside data: the environment can replace a value. `undefined` is no rule;
 * `"invalid"` is a value the gateway cannot read, which never grants
 * anything.
 */
export function readAccessRule(
  value: unknown,
): MapoAiAccessRule | undefined | "invalid" {
  const isUnset = value === undefined || value === null;
  if (isUnset) return undefined;
  const parsed = ACCESS_RULE.safeParse(value);
  return parsed.success ? parsed.data : "invalid";
}

/** Whether `rule` picks `user`: superusers always, then by group or permission. */
export function matchesRule(user: MapoAiUser, rule: MapoAiAccessRule): boolean {
  if (user.superuser) return true;
  const isInGroup = (rule.groups ?? []).some((group) =>
    user.groups.includes(group),
  );
  const hasPermission = (rule.permissions ?? []).some((codename) =>
    user.permissions.includes(codename),
  );
  return isInGroup || hasPermission;
}

/** Whether `user` administers the AI: superusers, and whom `mapo.ai.admin` picks. */
export function isAiAdmin(user: MapoAiUser, rules: MapoAiAccessRules): boolean {
  return matchesRule(user, rules.admin);
}

/**
 * Whether `mapo.ai.users` lets `user` use the AI: everyone when there is no
 * rule; otherwise superusers, the AI's admins and whom the rule picks.
 */
export function mayUseAi(user: MapoAiUser, rules: MapoAiAccessRules): boolean {
  if (!rules.users) return true;
  return isAiAdmin(user, rules) || matchesRule(user, rules.users);
}

/**
 * Whether `user` may fill a record of `model`: `add_<model>` for a new one,
 * `change_<model>` for one that exists; superusers always. The gateway never
 * writes to the backend, so this keeps the gateway in step with an honest
 * interface, which shows the AI only where the user may add or change. It
 * does not stop a crafted request, which can name another model or none;
 * the backend still decides every save.
 */
export function canOnModel(
  user: MapoAiUser,
  model: string,
  action: MapoAiModelAction,
): boolean {
  if (user.superuser) return true;
  const isKnownModel = Object.hasOwn(user.models, model);
  return isKnownModel && user.models[model]?.[action] === true;
}

/** `value` and everything inside it, made read-only; each object once. */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  const isObject = typeof value === "object" && value !== null;
  if (!isObject || seen.has(value)) return value;
  seen.add(value);
  for (const inner of Object.values(value)) deepFreeze(inner, seen);
  Object.freeze(value);
  return value;
}

/** The strings in a list, in order; anything that is not a list has none. */
function stringsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
