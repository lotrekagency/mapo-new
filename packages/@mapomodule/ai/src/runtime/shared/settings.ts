/**
 * The AI settings page's reading of the backend's users and groups, as
 * outside data: a list as Django REST Framework answers it, plain or
 * paginated (`results`); and of the user's preference in `status`. Pure,
 * shared by the page and its tests.
 */

import type { MapoAiStatus } from "./gateway";
import { isRecord } from "./guards";

/** A user or a group to pick in an assignment: the value saved, and its name for people. */
export interface MapoAiPrincipal {
  /** A user's `id` as text, or a group's name. */
  value: string;
  /** What the page shows. */
  label: string;
}

/** Principals one answer may give, at most. */
const MAX_PRINCIPALS = 50;

/**
 * The users or the groups of an answer of the backend: a user by its `id`,
 * named by `username`, else `email`, else first and last name, else the
 * id; a group by its `name`, which is how `userInfoApi` lists a user's
 * groups. An entry without them is skipped.
 * @param payload the backend's answer: outside data
 */
export function principalsOf(
  payload: unknown,
  kind: "user" | "group",
): MapoAiPrincipal[] {
  const list: unknown[] = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.results)
      ? payload.results
      : [];
  const principals: MapoAiPrincipal[] = [];
  for (const entry of list.slice(0, MAX_PRINCIPALS)) {
    if (!isRecord(entry)) continue;
    const principal = kind === "user" ? userOf(entry) : groupOf(entry);
    if (principal) principals.push(principal);
  }
  return principals;
}

function userOf(entry: Record<string, unknown>): MapoAiPrincipal | undefined {
  const { id } = entry;
  const isId =
    (typeof id === "string" && id.trim() !== "") || typeof id === "number";
  if (!isId) return undefined;
  const value = String(id);
  const name = [entry.first_name, entry.last_name]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" ");
  const label = [entry.username, entry.email, name].find(
    (text): text is string => typeof text === "string" && text.trim() !== "",
  );
  return { value, label: (label ?? value).slice(0, 150) };
}

function groupOf(entry: Record<string, unknown>): MapoAiPrincipal | undefined {
  const { name } = entry;
  if (typeof name !== "string" || name.trim() === "") return undefined;
  return { value: name, label: name };
}

/**
 * Whether the preference the user saved is what applies to them now. The
 * gateway makes it their default only while they are given its model and a
 * key reaches its provider; otherwise `status` keeps it in `preference` and
 * `default` is the app's. `false` without a preference.
 */
export function preferenceApplies(
  status: Pick<MapoAiStatus, "preference" | "default">,
): boolean {
  const { preference, default: defaults } = status;
  if (!preference || !defaults) return false;
  const sameProvider = preference.provider === defaults.provider;
  const sameModel = preference.model === defaults.models.fill;
  return sameProvider && sameModel;
}
