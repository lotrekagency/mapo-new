import { defineEventHandler, isError, setResponseHeader } from "h3";
import type { MapoAiRunResponse } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { requireMapoAiSession } from "../auth/nitro";
import { mapoAiRunDependencies } from "../run/nitro";
import { readRunRequest } from "../run/request";
import { runMapoAi } from "../run/run";

/**
 * `POST /_mapo/ai/run`: asks the AI to fill a record (`task: "fill"`) or to
 * extract the records of a source (`task: "extract"`), and answers what it
 * proposes, read against what it was asked: one outcome per field, empty,
 * filled (verified or to check) or discarded with a reason.
 *
 * The page sends the two descriptions of each entity, its backend schema
 * and its form's fields; the gateway builds from them what the AI may fill
 * and the schema of its answer, so a request cannot change the rules a
 * contract holds. The gateway never writes to the backend: the page shows
 * the outcomes, and the operator decides what to save.
 */
export default defineEventHandler(async (event): Promise<MapoAiRunResponse> => {
  setResponseHeader(event, "cache-control", "no-store");
  const session = await requireMapoAiSession(event);
  const deps = mapoAiRunDependencies(event);
  const request = await readRunRequest(event, deps.policy.options.limits);
  try {
    return await runMapoAi(session, request, deps);
  } catch (error) {
    // 429 and a busy provider say when to try again.
    const data = isError(error) && isRecord(error.data) ? error.data : {};
    const retryAfter = data.retryAfter;
    if (typeof retryAfter === "number") {
      setResponseHeader(event, "retry-after", Math.ceil(retryAfter));
    }
    throw error;
  }
});
