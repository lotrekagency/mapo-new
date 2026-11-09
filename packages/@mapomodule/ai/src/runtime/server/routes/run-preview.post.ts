import { defineEventHandler, isError, setResponseHeader } from "h3";
import type { MapoAiRunPreviewResponse } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { requireMapoAiSession } from "../auth/nitro";
import { mapoAiPreviewDependencies } from "../run/nitro";
import { readRunRequest } from "../run/request";
import { previewMapoAiRun } from "../run/run";

/**
 * `POST /_mapo/ai/run/preview`: what `run` would send for the same body,
 * for "What I send to the AI" in Magic Fill's panel (D42). It answers the
 * provider and model, the prompt as the model reads it (Mapo's rules, the
 * app's with those its `mapo-ai:prompt` hooks add, the admins'
 * instructions, the record, the operator's instructions), the parts of the
 * source by name and length, and the fields asked and kept away. It checks
 * the user, the provider, the model and the permission as `run` does, and
 * calls no provider, counts nothing against `run`'s limit and audits
 * nothing. Previews have a limit of their own, 30 a minute. Never a key,
 * and never the source's text, which is the page's own.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiRunPreviewResponse> => {
    setResponseHeader(event, "cache-control", "no-store");
    const session = await requireMapoAiSession(event);
    const deps = await mapoAiPreviewDependencies(event, session);
    const request = await readRunRequest(event, deps.policy.options.limits);
    try {
      return await previewMapoAiRun(session, request, deps);
    } catch (error) {
      const data = isError(error) && isRecord(error.data) ? error.data : {};
      const retryAfter = data.retryAfter;
      if (typeof retryAfter === "number") {
        setResponseHeader(event, "retry-after", Math.ceil(retryAfter));
      }
      throw error;
    }
  },
);
