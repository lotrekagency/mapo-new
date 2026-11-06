import {
  createError,
  defineEventHandler,
  getQuery,
  setResponseHeader,
} from "h3";
import type { MapoAiUsageAnswer } from "../../shared/gateway";
import { requireMapoAiAdmin } from "../auth/nitro";
import { mapoAiRunOptions } from "../run/nitro";
import { useMapoAiStorage } from "../storage/nitro";
import { readUsageRecords } from "../usage/read";
import { daysOf, periodOf, usageReport } from "../usage/report";

/**
 * `GET /_mapo/ai/usage?days=30`, for the AI's admins: every user's calls of
 * the last `days` days (30 unless set), summed from the audit when it is
 * read: by user, by model, by day, the latest calls, and their cost where
 * the app prices the model (`mapo.ai.prices`). Never a source, an
 * instruction or a value: the audit holds none. 400 for `days` that is not
 * a whole number from 1 to 3650, 503 when the storage is closed.
 */
export default defineEventHandler(async (event): Promise<MapoAiUsageAnswer> => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireMapoAiAdmin(event);
  const days = requireDays(getQuery(event).days);
  const store = useMapoAiStorage(event).store("audit");
  const { from, to } = periodOf(days, Date.now());
  const { records, truncated } = await readUsageRecords(store, { from });
  return usageReport(records, {
    days,
    from,
    to,
    prices: mapoAiRunOptions(event).prices,
    byUser: true,
    truncated,
  });
});

/** @throws H3Error 400 for days that cannot be read */
export function requireDays(value: unknown): number {
  const days = daysOf(value);
  if (days === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: "days is a whole number from 1 to 3650",
    });
  }
  return days;
}
