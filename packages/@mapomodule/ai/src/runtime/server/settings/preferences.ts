/**
 * A user's preferred provider and model, sealed in their space of the
 * storage's `settings` purpose. It becomes their default for `run` while
 * the app and the admins still give it to them; otherwise the app's
 * default applies, and the preference stays until they change it.
 */

import { createError } from "h3";
import { z } from "zod";
import type { MapoAiPreference } from "../../shared/gateway";
import type { PurposeStore } from "../storage/sealed";

/** The record's name in the user's space. */
const PREFERENCE_RECORD = "preferences";

const PROVIDER = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const MODEL = z.string().min(1).max(200);

const INPUT = z.strictObject({ provider: PROVIDER, model: MODEL });

const STORED = z.strictObject({
  v: z.literal(1),
  provider: PROVIDER,
  model: MODEL,
  savedAt: z.string().max(40),
});

/**
 * The body of `PUT /_mapo/ai/preferences`.
 * @param value the body: outside data
 * @throws H3Error 400
 */
export function readPreferenceInput(value: unknown): MapoAiPreference {
  const parsed = INPUT.safeParse(value);
  if (parsed.success) return parsed.data;
  const [issue] = parsed.error.issues;
  throw createError({
    statusCode: 400,
    statusMessage: "Not a preference",
    data: {
      path: issue?.path.length ? issue.path.join(".") : "body",
      problem: (issue?.message ?? "invalid").slice(0, 200),
    },
  });
}

/**
 * The user's preference; `undefined` when they saved none, or it cannot be
 * read: then the app's default applies, which gives nothing the app and
 * the admins do not.
 * @param store the storage's `settings` purpose
 */
export async function readPreference(
  store: PurposeStore,
  userId: string,
): Promise<MapoAiPreference | undefined> {
  const space = await store.forUser(userId);
  const saved = await space.get(PREFERENCE_RECORD, (value) => {
    const parsed = STORED.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  });
  return saved ? { provider: saved.provider, model: saved.model } : undefined;
}

/**
 * Saves the user's preference, replacing theirs.
 * @param store the storage's `settings` purpose
 */
export async function savePreference(
  store: PurposeStore,
  userId: string,
  preference: MapoAiPreference,
  savedAt: string,
): Promise<void> {
  const space = await store.forUser(userId);
  await space.set(PREFERENCE_RECORD, { v: 1, ...preference, savedAt });
}

/**
 * Removes the user's preference: the app's default applies again.
 * @param store the storage's `settings` purpose
 */
export async function removePreference(
  store: PurposeStore,
  userId: string,
): Promise<void> {
  const space = await store.forUser(userId);
  await space.remove(PREFERENCE_RECORD);
}
