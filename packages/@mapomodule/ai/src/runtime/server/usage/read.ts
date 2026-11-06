/**
 * The audit's records of a period, read from the sealed storage for the
 * usage and the log of the changes. Every key the audit keeps is listed,
 * up to its retention, and only the records the period files are opened,
 * a batch at a time: the day is in a record's key. A record that does not open, or is
 * not one this version writes, is left out, and the sealed storage's log
 * says so; an expired one is never returned.
 */

import type { PurposeStore } from "../storage/sealed";
import {
  KEY_ACTIONS_PREFIX,
  readAuditRecord,
  readKeyActionRecord,
} from "../run/audit";
import type { MapoAiAuditRecord, MapoAiKeyActionRecord } from "../run/audit";
import { keysOfPeriod } from "./report";

/** The calls' records one reading opens at most: the newest of the period. */
export const MAX_USAGE_RECORDS = 20_000;
/** The changes one reading lists at most: the newest of the period. */
export const MAX_ACTIONS = 500;
/** Records opened at once: a driver on a network answers many together. */
export const OPEN_AT_ONCE = 50;

/**
 * The calls of the period, newest first: every user's, or one user's
 * (`userId`), from their space.
 * @param store the storage's `audit` purpose
 */
export async function readUsageRecords(
  store: PurposeStore,
  options: { from: string; userId?: string; max?: number },
): Promise<{ records: MapoAiAuditRecord[]; truncated: boolean }> {
  const max = options.max ?? MAX_USAGE_RECORDS;
  const source =
    options.userId === undefined ? store : await store.forUser(options.userId);
  // The purpose's own store lists every user's records under `u:`.
  const keys = await source.keys(
    options.userId === undefined ? "u" : undefined,
  );
  const period = keysOfPeriod(keys, options.from);
  const records = await openAll(period.slice(0, max), (key) =>
    source.get(key, readAuditRecord),
  );
  return { records, truncated: period.length > max };
}

/**
 * The changes of the keys and of the settings in the period, newest first.
 * @param store the storage's `audit` purpose
 */
export async function readActions(
  store: PurposeStore,
  options: { from: string; max?: number },
): Promise<{ records: MapoAiKeyActionRecord[]; truncated: boolean }> {
  const max = options.max ?? MAX_ACTIONS;
  const keys = await store.keys(KEY_ACTIONS_PREFIX);
  const period = keysOfPeriod(keys, options.from);
  const records = await openAll(period.slice(0, max), (key) =>
    store.get(key, readKeyActionRecord),
  );
  return { records, truncated: period.length > max };
}

/**
 * Opens the records at `keys`, {@link OPEN_AT_ONCE} at a time, keeping
 * their order and leaving out those that do not open.
 */
async function openAll<T>(
  keys: readonly string[],
  open: (key: string) => Promise<T | undefined>,
): Promise<T[]> {
  const records: T[] = [];
  for (let start = 0; start < keys.length; start += OPEN_AT_ONCE) {
    const batch = keys.slice(start, start + OPEN_AT_ONCE);
    for (const record of await Promise.all(batch.map(open))) {
      if (record !== undefined) records.push(record);
    }
  }
  return records;
}
