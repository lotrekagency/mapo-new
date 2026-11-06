import { defineEventHandler, getQuery, setResponseHeader } from "h3";
import type { MapoAiActionsAnswer } from "../../shared/gateway";
import { requireMapoAiAdmin } from "../auth/nitro";
import { useMapoAiStorage } from "../storage/nitro";
import { readActions } from "../usage/read";
import { actionsAnswer, periodOf } from "../usage/report";
import { requireDays } from "./usage.get";

/**
 * `GET /_mapo/ai/actions?days=30`, for the AI's admins: the changes of the
 * keys and of the AI settings in the last `days` days, newest first, 500
 * at most: who, what, for whom. Never a key, an instruction or a word: the
 * audit holds none. 400 for `days` that cannot be read, 503 when the
 * storage is closed.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiActionsAnswer> => {
    setResponseHeader(event, "cache-control", "no-store");
    await requireMapoAiAdmin(event);
    const days = requireDays(getQuery(event).days);
    const store = useMapoAiStorage(event).store("audit");
    const { from, to } = periodOf(days, Date.now());
    const { records, truncated } = await readActions(store, { from });
    return actionsAnswer(records, { days, from, to, truncated });
  },
);
