/**
 * The audit log of `run`: one record per call that reached a provider,
 * sealed in the storage's `audit` purpose, in the space of the user who
 * made it, and kept for `mapo.ai.audit.retentionDays`. Metadata only: who,
 * when, the task, the entities, the provider and model, the version of the
 * prompt, the tokens, the outcome and how long it took. Never the source,
 * the instructions, the values or the refusal's text.
 */

import { z } from "zod";
import type { MapoAiUsage } from "../../shared/gateway";
import type { MapoAiProviderFailure } from "../providers/types";
import type { PurposeStore } from "../storage/sealed";

/** The format of an audit record: it goes up when the record changes shape. */
export const AUDIT_RECORD_VERSION = 1;

/** What became of a call: answered, refused by the model, or failed. */
export type MapoAiAuditOutcome = "answered" | "refused" | "failed";

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
  provider: { id: string; model: string };
  /** The version of Mapo's base rules the prompt had. */
  prompt: number;
  usage: MapoAiUsage;
  outcome: MapoAiAuditOutcome;
  /** For a failed call, why: one of the provider's failures, or `error` for anything else. */
  failure?: MapoAiProviderFailure | "error";
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
  prompt: COUNT,
  usage: z.strictObject({ inputTokens: COUNT, outputTokens: COUNT }),
  outcome: z.enum(["answered", "refused", "failed"]),
  failure: z
    .enum([
      "timeout",
      "rate-limit",
      "unavailable",
      "invalid-response",
      "refused-request",
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
