import { defineEventHandler, getQuery, setResponseHeader } from "h3";
import type { MapoAiUsageAnswer } from "../../shared/gateway";
import { requireMapoAiSession } from "../auth/nitro";
import { mapoAiRunOptions } from "../run/nitro";
import { useMapoAiStorage } from "../storage/nitro";
import { readUsageRecords } from "../usage/read";
import { periodOf, usageReport } from "../usage/report";
import { requireDays } from "./usage.get";

/**
 * `GET /_mapo/ai/usage/mine?days=30`: the user's own calls of the last
 * `days` days, from their space of the audit, as `GET /_mapo/ai/usage`
 * sums them, without the other users. For every user the app lets use the
 * AI. 400 for `days` that cannot be read, 503 when the storage is closed.
 */
export default defineEventHandler(async (event): Promise<MapoAiUsageAnswer> => {
  setResponseHeader(event, "cache-control", "no-store");
  const session = await requireMapoAiSession(event);
  const days = requireDays(getQuery(event).days);
  const store = useMapoAiStorage(event).store("audit");
  const { from, to } = periodOf(days, Date.now());
  const { records, truncated } = await readUsageRecords(store, {
    from,
    userId: session.user.id,
  });
  return usageReport(records, {
    days,
    from,
    to,
    prices: mapoAiRunOptions(event).prices,
    byUser: false,
    truncated,
  });
});
