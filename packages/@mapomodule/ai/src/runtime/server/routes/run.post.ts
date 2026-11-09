import { defineEventHandler, isError, setResponseHeader } from "h3";
import type { H3Event } from "h3";
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
 *
 * A page that goes away, as when the operator cancels, closes the request:
 * the provider's call stops, and the audit says `cancelled`.
 */
export default defineEventHandler(async (event): Promise<MapoAiRunResponse> => {
  setResponseHeader(event, "cache-control", "no-store");
  // Watched from the start: a page may go away while its session, the
  // admins' keys or its body are read, and the close comes once.
  const gone = clientGone(event);
  try {
    const session = await requireMapoAiSession(event);
    const deps = await mapoAiRunDependencies(event, session);
    const request = await readRunRequest(event, deps.policy.options.limits);
    return await runMapoAi(session, request, deps, { signal: gone.signal });
  } catch (error) {
    // 429 and a busy provider say when to try again.
    const data = isError(error) && isRecord(error.data) ? error.data : {};
    const retryAfter = data.retryAfter;
    if (typeof retryAfter === "number") {
      setResponseHeader(event, "retry-after", Math.ceil(retryAfter));
    }
    throw error;
  } finally {
    gone.stop();
  }
});

/**
 * A signal aborted when the client goes away before its answer is
 * written: the response closes unfinished. Where the server has no Node
 * response, as on an edge runtime, it never aborts, and a call runs until
 * it answers or its time is up.
 */
function clientGone(event: H3Event): {
  signal: AbortSignal;
  stop: () => void;
} {
  const controller = new AbortController();
  const response = event.node?.res;
  const canListen = typeof response?.once === "function";
  if (!response || !canListen) {
    return { signal: controller.signal, stop: () => undefined };
  }
  const onClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  // Closed already: the page went away before the handler ran.
  if (response.destroyed) onClose();
  else response.once("close", onClose);
  return {
    signal: controller.signal,
    stop: () => response.off("close", onClose),
  };
}
