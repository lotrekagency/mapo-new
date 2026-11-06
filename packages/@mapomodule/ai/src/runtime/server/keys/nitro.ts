/**
 * The routes of the keys wired to the app's Nitro server: the sealed
 * storage's purposes they use, who acts, and the audit of what they
 * change.
 */

import type { H3Event } from "h3";
import type { MapoAiUser } from "../auth/user";
import { AUDIT_RECORD_VERSION, writeKeyAction } from "../run/audit";
import type { MapoAiKeyActionRecord } from "../run/audit";
import { mapoAiRunOptions } from "../run/nitro";
import { useMapoAiStorage } from "../storage/nitro";
import type { PurposeStore } from "../storage/sealed";
import type { KeyActor } from "./assignments";

/** Bytes the body of a route of the keys may have. */
export const KEYS_BODY_BYTES = 64 * 1024;

/** The purposes of the storage the routes of the keys use. */
export interface KeyStores {
  keys: PurposeStore;
  tokens: PurposeStore;
  audit: PurposeStore;
}

/**
 * The purposes of the storage the routes of the keys use.
 * @throws H3Error 503 when the storage is closed: without it there are no
 *   assignments nor tokens, only the project's keys
 */
export function keyStores(event: H3Event): KeyStores {
  const storage = useMapoAiStorage(event);
  return {
    keys: storage.store("keys"),
    tokens: storage.store("tokens"),
    audit: storage.store("audit"),
  };
}

/** Who acts, as the record of a change names them. */
export function actorOf(user: MapoAiUser): KeyActor {
  return {
    id: user.id,
    ...(user.username !== undefined ? { username: user.username } : {}),
  };
}

/** Writes a change of the keys to the audit, kept as long as the calls' records. */
export async function auditKeyAction(
  event: H3Event,
  audit: PurposeStore,
  change: Omit<MapoAiKeyActionRecord, "v" | "at">,
): Promise<void> {
  const now = Date.now();
  await writeKeyAction(
    audit,
    { v: AUDIT_RECORD_VERSION, at: new Date(now).toISOString(), ...change },
    { retentionDays: mapoAiRunOptions(event).audit.retentionDays, now },
  );
}
