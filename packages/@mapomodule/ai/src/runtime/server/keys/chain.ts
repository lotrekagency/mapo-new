/**
 * Which key a call uses, and what the user may call: the chain of keys on
 * three levels. For each provider, the assignments that apply to the user
 * come nearest first: theirs, then their groups' in the order of priority
 * the admins set, then everyone's.
 * - The nearest decides the models, among those the app enables, and
 *   whether the user may use their own token. No assignment: every model
 *   the app enables, and no personal token.
 * - The key is the user's own token, where allowed; else the first key
 *   found climbing the assignments; else the project's, from the
 *   environment.
 *
 * Pure: the record, the token and the project's key are passed in.
 */

import type { MapoAiKeyLevel, MapoAiKeyStatus } from "../../shared/gateway";
import { last4 } from "./assignments";
import type {
  AssignableProvider,
  KeysRecord,
  StoredAssignment,
} from "./assignments";

/** The user, as the chain reads them: by id and groups. */
export interface KeyChainUser {
  id: string;
  groups: readonly string[];
}

/** The key the chain chose, and the level that gave it. */
export interface ChainedKey {
  level: Exclude<MapoAiKeyLevel, "none">;
  /** For `group`: the group's name. */
  group?: string;
  /** The key. Never log it, never answer it. */
  value: string;
}

/** What a provider offers a user. */
export interface ProviderAccess {
  /** The models they may call, in the app's order; empty: none. */
  models: string[];
  /** Whether they may use their own token for it. */
  personalTokens: boolean;
  /** The key their calls use; absent when no level has one, or the provider uses none. */
  key?: ChainedKey;
}

/** What the chain reads for one provider and one user. */
export interface KeyChainInput {
  provider: AssignableProvider;
  user: KeyChainUser;
  record: KeysRecord;
  /** The user's own token for the provider, when they saved one. */
  token?: string;
  /** The project's key for the provider, from the environment. */
  projectKey?: string;
}

/** What the provider offers the user, and with which key. */
export function providerAccess(input: KeyChainInput): ProviderAccess {
  const { provider } = input;
  const applying = applyingAssignments(input.record, provider.id, input.user);
  const [nearest] = applying;
  const allowed = nearest?.models;
  const models = allowed
    ? provider.models.filter((model) => allowed.includes(model))
    : [...provider.models];
  if (provider.key === undefined) return { models, personalTokens: false };

  const personalTokens = nearest?.personalTokens === true;
  const key =
    personalTokens && input.token
      ? { level: "personal" as const, value: input.token }
      : (assignedKey(applying) ??
        (input.projectKey
          ? { level: "project" as const, value: input.projectKey }
          : undefined));
  return { models, personalTokens, ...(key ? { key } : {}) };
}

/**
 * The provider's key as `status` tells it: the level and the last four
 * characters, never the key.
 * @param token the user's own token, saved whether or not it is allowed
 */
export function keyStatusOf(
  provider: AssignableProvider,
  access: ProviderAccess,
  token: string | undefined,
): MapoAiKeyStatus | undefined {
  if (provider.key === undefined) return undefined;
  const { key } = access;
  const shown = key ? last4(key.value) : undefined;
  const tokenShown = token ? last4(token) : undefined;
  return {
    level: key?.level ?? "none",
    ...(key?.group !== undefined ? { group: key.group } : {}),
    ...(shown ? { last4: shown } : {}),
    required: provider.key === "required",
    personal: {
      allowed: access.personalTokens,
      saved: token !== undefined,
      ...(tokenShown ? { last4: tokenShown } : {}),
    },
  };
}

/**
 * The assignments of a provider that apply to the user, nearest first:
 * theirs, their groups' by priority, everyone's.
 */
export function applyingAssignments(
  record: KeysRecord,
  providerId: string,
  user: KeyChainUser,
): StoredAssignment[] {
  const ofProvider = record.assignments.filter(
    (one) => one.provider === providerId,
  );
  const mine = ofProvider.filter(
    (one) => one.scope.kind === "user" && one.scope.user === user.id,
  );
  const groups = ofProvider
    .filter(
      (one) =>
        one.scope.kind === "group" && user.groups.includes(one.scope.group),
    )
    .sort(
      (a, b) => groupRank(record, a) - groupRank(record, b) || byName(a, b),
    );
  const everyone = ofProvider.filter((one) => one.scope.kind === "all");
  return [...mine, ...groups, ...everyone];
}

/** The first key the assignments hold, nearest first, with its level. */
function assignedKey(
  applying: readonly StoredAssignment[],
): ChainedKey | undefined {
  const holder = applying.find((one) => one.key !== undefined);
  if (!holder?.key) return undefined;
  const { scope } = holder;
  return {
    level: scope.kind,
    ...(scope.kind === "group" ? { group: scope.group } : {}),
    value: holder.key,
  };
}

/**
 * A group's place in the admins' order: the groups the order leaves out
 * come after every group it names.
 */
function groupRank(record: KeysRecord, assignment: StoredAssignment): number {
  const name = assignment.scope.kind === "group" ? assignment.scope.group : "";
  const index = record.groups.indexOf(name);
  return index >= 0 ? index : record.groups.length;
}

/** Two groups the order leaves out, by name, so the choice never depends on the record's order. */
function byName(a: StoredAssignment, b: StoredAssignment): number {
  const nameA = a.scope.kind === "group" ? a.scope.group : "";
  const nameB = b.scope.kind === "group" ? b.scope.group : "";
  if (nameA === nameB) return 0;
  return nameA < nameB ? -1 : 1;
}
