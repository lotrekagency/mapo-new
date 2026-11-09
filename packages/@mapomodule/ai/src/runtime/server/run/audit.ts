/**
 * The audit log, sealed in the storage's `audit` purpose and kept for
 * `mapo.ai.audit.retentionDays`:
 * - one record per call of `run` that reached a provider, in the space of
 *   the user who made it. Metadata only: who, when, the task, the
 *   entities, the provider and model, the level of the key, the version of
 *   the prompt, the tokens, the outcome and how long it took. Never the
 *   source, the instructions, the values or the refusal's text;
 * - one record per change of the keys (an admin's assignment, the order of
 *   the groups, a user's own token) or of the AI settings, under
 *   `actions:`: who, what, for whom. Never a key, an instruction or a word.
 *
 * The usage (`usage/`) reads the calls' records, and the AI settings page
 * the changes.
 */

import { z } from "zod";
import type {
  MapoAiActionKind,
  MapoAiKeyLevel,
  MapoAiKeyScope,
  MapoAiUsage,
} from "../../shared/gateway";
import type { MapoAiProviderFailure } from "../providers/types";
import type { PurposeStore } from "../storage/sealed";

/**
 * The format of an audit record: it goes up when the record changes shape.
 * Version 1 is the format of the first release, its optional fields
 * included (the cache's tokens, the model that answered, the changes of
 * the settings): no release wrote an older one. From the first change
 * after it, a new version keeps the older one readable.
 */
export const AUDIT_RECORD_VERSION = 1;

/** What became of a call: answered, refused by the model, or failed. */
export type MapoAiAuditOutcome = "answered" | "refused" | "failed";

/**
 * Why a call failed: one of the provider's failures; `cancelled` when the
 * page stopped it, closing its request; `error` for anything else.
 */
export type MapoAiAuditFailure = MapoAiProviderFailure | "cancelled" | "error";

/** One call to `run`, as the audit keeps it. */
export interface MapoAiAuditRecord {
  v: typeof AUDIT_RECORD_VERSION;
  /** When the call started, as an ISO date and time. */
  at: string;
  /** Who made it. */
  user: { id: string; username?: string };
  task: "fill" | "extract";
  /** The entities, as the request described them: names and endpoints, never their schemas. */
  entities: {
    type?: string;
    label?: string;
    endpoint?: string;
    model?: string;
  }[];
  /**
   * The provider, and the model that answered: another than the one asked
   * when the provider retried the call on it.
   */
  provider: { id: string; model: string };
  /**
   * For a provider that calls with a key: the level that gave it, and the
   * group for `group`. Never the key.
   */
  key?: { level: MapoAiKeyLevel; group?: string };
  /** The version of Mapo's base rules the prompt had. */
  prompt: number;
  usage: MapoAiUsage;
  outcome: MapoAiAuditOutcome;
  /** For a failed call, why. */
  failure?: MapoAiAuditFailure;
  /** How long the provider took, in milliseconds. */
  durationMs: number;
}

const COUNT = z.number().int().nonnegative();
const TEXT = z.string().max(1000);

/** A stored record, read back as outside data: it may come from an older version. */
const AUDIT_RECORD = z.strictObject({
  v: z.literal(AUDIT_RECORD_VERSION),
  at: z.string().max(40),
  user: z.strictObject({ id: TEXT, username: TEXT.optional() }),
  task: z.enum(["fill", "extract"]),
  entities: z
    .array(
      z.strictObject({
        type: TEXT.optional(),
        label: TEXT.optional(),
        endpoint: TEXT.optional(),
        model: TEXT.optional(),
      }),
    )
    .max(100),
  provider: z.strictObject({ id: TEXT, model: TEXT }),
  key: z
    .strictObject({
      level: z.enum(["personal", "user", "group", "all", "project", "none"]),
      group: TEXT.optional(),
    })
    .optional(),
  prompt: COUNT,
  usage: z.strictObject({
    inputTokens: COUNT,
    outputTokens: COUNT,
    cacheReadTokens: COUNT.optional(),
    cacheWriteTokens: COUNT.optional(),
  }),
  outcome: z.enum(["answered", "refused", "failed"]),
  failure: z
    .enum([
      "timeout",
      "rate-limit",
      "unavailable",
      "invalid-response",
      "refused-request",
      "too-long",
      "truncated",
      "cancelled",
      "error",
    ])
    .optional(),
  durationMs: COUNT,
}) satisfies z.ZodType<MapoAiAuditRecord>;

/**
 * An audit record read back from the storage, or `undefined` when it is
 * not one this version writes.
 * @param value the stored value: outside data
 */
export function readAuditRecord(value: unknown): MapoAiAuditRecord | undefined {
  const parsed = AUDIT_RECORD.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Where a call's record goes in its user's space: the day, then the time
 * and a random tail, `2026:11:04:t101530123-9f2c1e7a`, so a day's records
 * list together and two calls in the same millisecond do not collide.
 * @param at when the call started, in epoch milliseconds
 */
export function auditKey(at: number): string {
  const time = new Date(at).toISOString();
  const [day = "", clock = ""] = time.split("T");
  const [year, month, date] = day.split("-");
  const digits = clock.replace(/[^0-9]/g, "").slice(0, 9);
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${year}:${month}:${date}:t${digits}-${tail}`;
}

/**
 * Seals `record` in the space of its user, to expire after `retentionDays`.
 * @param store the storage's `audit` purpose
 * @param at when the call started, in epoch milliseconds
 */
export async function writeAudit(
  store: PurposeStore,
  record: MapoAiAuditRecord,
  options: { at: number; retentionDays: number; now: number },
): Promise<void> {
  const space = await store.forUser(record.user.id);
  await space.set(auditKey(options.at), record, {
    expiresAt: options.now + options.retentionDays * 24 * 60 * 60 * 1000,
  });
}

/** A change of the keys or of the AI settings, as the audit keeps it. */
export type MapoAiKeyAction = MapoAiActionKind;

/** One change of the keys, as the audit keeps it: never a key. */
export interface MapoAiKeyActionRecord {
  v: typeof AUDIT_RECORD_VERSION;
  /** When, as an ISO date and time. */
  at: string;
  /** Who made it: an admin, or a user saving or removing their own token. */
  by: { id: string; username?: string };
  action: MapoAiKeyAction;
  /** The provider of an assignment or a token. */
  provider?: string;
  /** Who an assignment is for. */
  scope?: MapoAiKeyScope;
  /** Whose token was saved or removed. */
  user?: string;
  /** For a saved assignment: whether its key was set, replaced or removed. */
  keyChanged?: boolean;
  /** For saved settings: the blocks the change replaced. */
  blocks?: ("instructions" | "verification" | "secretWords" | "providers")[];
  /** For saved settings: the providers whose settings the change replaced. */
  providers?: string[];
  /** For saved settings: the rules of verification it set less prudent than the app's or Mapo's defaults. */
  loosened?: string[];
}

const KEY_ACTION_RECORD = z.strictObject({
  v: z.literal(AUDIT_RECORD_VERSION),
  at: z.string().max(40),
  by: z.strictObject({ id: TEXT, username: TEXT.optional() }),
  action: z.enum([
    "assignment-saved",
    "assignment-removed",
    "groups-ordered",
    "token-saved",
    "token-removed",
    "settings-saved",
  ]),
  provider: TEXT.optional(),
  scope: z
    .discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("all") }),
      z.strictObject({ kind: z.literal("group"), group: TEXT }),
      z.strictObject({
        kind: z.literal("user"),
        user: TEXT,
        label: TEXT.optional(),
      }),
    ])
    .optional(),
  user: TEXT.optional(),
  keyChanged: z.boolean().optional(),
  blocks: z
    .array(z.enum(["instructions", "verification", "secretWords", "providers"]))
    .max(4)
    .optional(),
  providers: z.array(TEXT).max(100).optional(),
  loosened: z.array(TEXT).max(20).optional(),
}) satisfies z.ZodType<MapoAiKeyActionRecord>;

/** Where the changes of the keys go, in the purpose's own space. */
export const KEY_ACTIONS_PREFIX = "actions";

/**
 * A change of the keys read back from the storage, or `undefined` when it
 * is not one this version writes.
 * @param value the stored value: outside data
 */
export function readKeyActionRecord(
  value: unknown,
): MapoAiKeyActionRecord | undefined {
  const parsed = KEY_ACTION_RECORD.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Seals a change of the keys under `actions:`, to expire after
 * `retentionDays`. A failure to write is logged, not thrown: the change is
 * made, and an admin should not see it fail for its record.
 * @param store the storage's `audit` purpose
 */
export async function writeKeyAction(
  store: PurposeStore,
  record: MapoAiKeyActionRecord,
  options: { retentionDays: number; now: number },
): Promise<void> {
  try {
    await store.set(`${KEY_ACTIONS_PREFIX}:${auditKey(options.now)}`, record, {
      expiresAt: options.now + options.retentionDays * 24 * 60 * 60 * 1000,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[mapo-ai] The audit record of a change of the keys could not be written: ${reason}`,
    );
  }
}
