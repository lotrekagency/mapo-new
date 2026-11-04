/**
 * Build time: the `admin` and `users` options, read before they reach the
 * private runtime config. A value that cannot be read is narrowed, never
 * widened: a mistake in `users` must not open the AI to everyone.
 */

import type { MapoAiAccessRule } from "./runtime/server/auth/user";
import { isRecord } from "./runtime/shared/guards";

const RULE_KEYS = new Set(["groups", "permissions"]);

/** Whom a rule picks once nothing in it can be read, by option. */
const LEFT_WITH: Record<"admin" | "users", string> = {
  admin: "superusers only",
  users: "superusers and the AI's admins only",
};

/**
 * `mapo.ai.admin` or `mapo.ai.users`, keeping what it can read and warning
 * about the rest; `undefined` when the option is not set.
 * @param warn where the build's warnings go
 */
export function accessRuleOption(
  value: unknown,
  name: "admin" | "users",
  warn: (message: string) => void,
): MapoAiAccessRule | undefined {
  if (value === undefined) return undefined;
  const option = `mapo.ai.${name}`;
  if (!isRecord(value)) {
    warn(
      `${option} is not { groups?: string[], permissions?: string[] }, so it picks ${LEFT_WITH[name]}.`,
    );
    return {};
  }

  const unknownKeys = Object.keys(value).filter((key) => !RULE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    warn(
      `${option} has no ${unknownKeys.map((key) => `"${key}"`).join(", ")}: only "groups" and "permissions" pick users, so the rest is ignored.`,
    );
  }

  const rule: MapoAiAccessRule = {};
  for (const key of ["groups", "permissions"] as const) {
    const names = namesIn(value[key], `${option}.${key}`, warn);
    if (names) rule[key] = names;
  }
  const isEmpty = !rule.groups?.length && !rule.permissions?.length;
  if (name === "users" && isEmpty) {
    warn(
      `${option} names no group and no permission, so it picks ${LEFT_WITH.users}. Leave it unset to let every signed-in user in.`,
    );
  }
  return rule;
}

/** The strings of a list of names, warning about anything else. */
function namesIn(
  value: unknown,
  option: string,
  warn: (message: string) => void,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    warn(`${option} is not a list of names, so it names none.`);
    return [];
  }
  const names = value.filter(
    (item): item is string => typeof item === "string" && item !== "",
  );
  if (names.length < value.length) {
    warn(`${option} has entries that are not names: they are ignored.`);
  }
  return names;
}
