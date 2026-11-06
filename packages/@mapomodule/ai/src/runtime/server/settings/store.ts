/**
 * The AI's admins' settings in the sealed storage: one record in the
 * `settings` purpose, outside every user's space.
 *
 * A record that is there but cannot be read, sealed with another secret or
 * by a newer version, is no record of nothing: it can hold words that keep
 * a field from the AI, or a model the admins closed, so the gateway refuses
 * to go on without it (503) instead of calling with less than the admins
 * decided. It stays in the storage, as every unreadable record does.
 */

import { createError } from "h3";
import type { PurposeStore } from "../storage/sealed";
import {
  ADMIN_SETTINGS_RECORD,
  emptyAdminSettings,
  readAdminSettingsRecord,
} from "./admin";
import type { AdminSettingsRecord } from "./admin";

/** Where the record is: its key in the mount, and its file on a file system. */
const SETTINGS_PLACE = `settings:${ADMIN_SETTINGS_RECORD}.sealed in the mapo-ai mount, settings/${ADMIN_SETTINGS_RECORD}.sealed on a file system`;
/** How long a reader waits before it reads the record a second time. */
const REREAD_MS = 50;

/** The changes of this process, one after the other. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * The admins' settings; the empty record when no admin changed any. A
 * change this process is writing is waited for.
 * @param store the storage's `settings` purpose
 * @throws H3Error 503 when the record is there and cannot be read
 */
export async function readAdminSettings(
  store: PurposeStore,
): Promise<AdminSettingsRecord> {
  await queue;
  return readRecord(store);
}

/**
 * Reads the settings, changes them and writes them back, one change at a
 * time in this process. Across processes the last write wins. `change` may
 * refuse by throwing: nothing is written then.
 * @param store the storage's `settings` purpose
 * @throws what `change` throws; H3Error 503 as {@link readAdminSettings}
 */
export function changeAdminSettings<T>(
  store: PurposeStore,
  change: (record: AdminSettingsRecord) => {
    record: AdminSettingsRecord;
    result: T;
  },
): Promise<T> {
  const run = queue.then(async () => {
    const { record, result } = change(await readRecord(store));
    await store.set(ADMIN_SETTINGS_RECORD, record);
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
): Promise<AdminSettingsRecord> {
  // Asked at every request: one read when no admin saved anything, never
  // a listing of the purpose, which holds every user's space.
  if (!(await store.has(ADMIN_SETTINGS_RECORD))) return emptyAdminSettings();
  const record = await store.get(
    ADMIN_SETTINGS_RECORD,
    readAdminSettingsRecord,
  );
  if (record) return record;
  if (again) {
    await new Promise((resolve) => setTimeout(resolve, REREAD_MS));
    return readRecord(store, false);
  }
  console.error(
    `[mapo-ai] The admins' AI settings (${SETTINGS_PLACE}) cannot be read: sealed with another secret, or by a newer version. The AI answers 503 until NUXT_MAPO_AI_SECRET is the one that sealed them, or the record is removed.`,
  );
  throw createError({
    statusCode: 503,
    statusMessage: "The AI settings cannot be read",
  });
}
