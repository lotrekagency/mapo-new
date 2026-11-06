/**
 * The admins' keys and the users' own tokens in the sealed storage: the
 * record of the assignments in the `keys` purpose, each token in its user's
 * space of the `tokens` purpose, under the provider's id.
 *
 * A record that is there but cannot be read, sealed with another secret or
 * from a newer version, is no record of nothing: an admin's assignment can
 * close models or providers, so the gateway refuses to go on without it
 * (503) instead of calling with less than the admins decided. It stays in
 * the storage, as every unreadable record does.
 */

import { createError } from "h3";
import { z } from "zod";
import type { MapoAiSavedToken } from "../../shared/gateway";
import type { PurposeStore } from "../storage/sealed";
import {
  KEYS_RECORD,
  MAX_KEY,
  emptyKeysRecord,
  last4,
  readKeysRecord,
} from "./assignments";
import type { KeyActor, KeysRecord } from "./assignments";

/** A user's own token, as their space keeps it. */
export interface StoredToken {
  v: 1;
  provider: string;
  token: string;
  /** Who saved it, so an admin can tell whose it is. */
  user: KeyActor;
  savedAt: string;
}

const STORED_TOKEN = z.strictObject({
  v: z.literal(1),
  provider: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  token: z.string().min(1).max(MAX_KEY),
  user: z.strictObject({
    id: z.string().min(1).max(150),
    username: z.string().max(150).optional(),
  }),
  savedAt: z.string().max(40),
});

/**
 * Where the record of the admins' keys is: its key in the mount, and its
 * file on a file system.
 */
const KEYS_PLACE = `keys:${KEYS_RECORD}.sealed in the mapo-ai mount, keys/${KEYS_RECORD}.sealed on a file system`;
/**
 * How long a reader waits before it reads the record a second time: enough
 * for another process to finish writing it.
 */
const REREAD_MS = 50;

/** The changes of this process, one after the other. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * The admins' keys; the empty record when no admin assigned any. A change
 * this process is writing is waited for: a driver such as the file system's
 * writes in place, so a read in the middle would find half a record.
 * @param store the storage's `keys` purpose
 * @throws H3Error 503 when the record is there and cannot be read
 */
export async function readKeys(store: PurposeStore): Promise<KeysRecord> {
  await queue;
  return readRecord(store);
}

/**
 * Reads the admins' keys, changes them and writes them back, one change at
 * a time in this process: two admins saving at once both keep their
 * change. Across processes the last write wins. `change` may refuse by
 * throwing: nothing is written then.
 * @param store the storage's `keys` purpose
 * @throws what `change` throws; H3Error 503 as {@link readKeys}
 */
export function changeKeys<T>(
  store: PurposeStore,
  change: (record: KeysRecord) => { record: KeysRecord; result: T },
): Promise<T> {
  // Inside the queue: it reads the record without waiting for itself.
  const run = queue.then(async () => {
    const { record, result } = change(await readRecord(store));
    await store.set(KEYS_RECORD, record);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * The record as the storage holds it. One that is there and cannot be read
 * is read once more after a moment, since another process may be writing
 * it; then it closes the AI.
 */
async function readRecord(
  store: PurposeStore,
  again = true,
): Promise<KeysRecord> {
  // Asked at every request: one read when no admin assigned a key, never
  // a listing of the purpose.
  if (!(await store.has(KEYS_RECORD))) return emptyKeysRecord();
  const record = await store.get(KEYS_RECORD, readKeysRecord);
  if (record) return record;
  if (again) {
    await new Promise((resolve) => setTimeout(resolve, REREAD_MS));
    return readRecord(store, false);
  }
  console.error(
    `[mapo-ai] The admins' keys (${KEYS_PLACE}) cannot be read: sealed with another secret, or by a newer version. The AI answers 503 until NUXT_MAPO_AI_SECRET is the one that sealed them, or the record is removed.`,
  );
  throw createError({
    statusCode: 503,
    statusMessage: "The AI's keys cannot be read",
  });
}

/**
 * The user's own tokens for `providers`, by provider.
 * @param store the storage's `tokens` purpose
 */
export async function readUserTokens(
  store: PurposeStore,
  userId: string,
  providers: readonly string[],
): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  if (!providers.length) return tokens;
  const space = await store.forUser(userId);
  for (const provider of providers) {
    const saved = await space.get(provider, readStoredToken);
    if (saved?.provider === provider) tokens.set(provider, saved.token);
  }
  return tokens;
}

/**
 * Saves the user's own token for a provider, replacing theirs.
 * @param store the storage's `tokens` purpose
 */
export async function saveToken(
  store: PurposeStore,
  user: KeyActor,
  provider: string,
  token: string,
  savedAt: string,
): Promise<void> {
  const space = await store.forUser(user.id);
  const record: StoredToken = { v: 1, provider, token, user, savedAt };
  await space.set(provider, record);
}

/**
 * Removes the user's own token for a provider.
 * @param store the storage's `tokens` purpose
 * @returns whether there was one
 */
export async function removeToken(
  store: PurposeStore,
  userId: string,
  provider: string,
): Promise<boolean> {
  const space = await store.forUser(userId);
  const names = await space.keys();
  if (!names.includes(provider)) return false;
  await space.remove(provider);
  return true;
}

/**
 * Every token the users saved, as the admins see them: whose, for which
 * provider, the last four characters, never the token.
 * @param store the storage's `tokens` purpose
 */
export async function listTokens(
  store: PurposeStore,
): Promise<MapoAiSavedToken[]> {
  const names = await store.keys("u");
  const tokens: MapoAiSavedToken[] = [];
  for (const name of names) {
    const saved = await store.get(name, readStoredToken);
    if (!saved) continue;
    const shown = last4(saved.token);
    tokens.push({
      user: { ...saved.user },
      provider: saved.provider,
      ...(shown ? { last4: shown } : {}),
      savedAt: saved.savedAt,
    });
  }
  return tokens;
}

/** A token read back from the storage, or `undefined` when it is none this version writes. */
export function readStoredToken(value: unknown): StoredToken | undefined {
  const parsed = STORED_TOKEN.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
