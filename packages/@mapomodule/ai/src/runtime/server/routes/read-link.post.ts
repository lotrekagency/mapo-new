import {
  createError,
  defineEventHandler,
  isError,
  setResponseHeader,
} from "h3";
import type { H3Event } from "h3";
import { MAPO_AI_MAX_LINK } from "../../shared/gateway";
import type { MapoAiReadLinkResponse } from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { requireMapoAiSession } from "../auth/nitro";
import { readJsonBody } from "../body";
import { readSourceLink } from "../links/link";
import { mapoAiLinkDependencies } from "../links/nitro";

/** Bytes of the body of `read/link`: a link, and room for its JSON. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * `POST /_mapo/ai/read/link`: reads the page of a link into the parts of a
 * source, the text `run` takes. The page sends `{ url }`; the gateway
 * checks the link, fetches its page as a stranger would, without the
 * operator's cookies, and reads it with the reader of its format, Mapo's
 * or the app's, as `read` reads a file. It answers the parts with the
 * page's address, or why there are none: the app reads no link, the guard
 * refused it, the page could not be reached, its server answered an
 * error, it is too large, or what `read` answers for a file.
 *
 * The gateway keeps nothing of the page, and calls no AI.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiReadLinkResponse> => {
    setResponseHeader(event, "cache-control", "no-store");
    try {
      const session = await requireMapoAiSession(event);
      const deps = mapoAiLinkDependencies(event, session);
      const url = await readLinkRequest(event);
      return await readSourceLink(url, deps);
    } catch (error) {
      // Past the limit, the answer says when to try again.
      const data = isError(error) && isRecord(error.data) ? error.data : {};
      const retryAfter = data.retryAfter;
      if (typeof retryAfter === "number") {
        setResponseHeader(event, "retry-after", Math.ceil(retryAfter));
      }
      throw error;
    }
  },
);

/**
 * The link of a request: `{ url }`, a text of up to 2048 characters.
 * @throws H3Error 415, 413 or 400
 */
async function readLinkRequest(event: H3Event): Promise<string> {
  const body = await readJsonBody(event, MAX_BODY_BYTES);
  const url = isRecord(body) ? body.url : undefined;
  const isLink =
    typeof url === "string" &&
    url.trim() !== "" &&
    url.length <= MAPO_AI_MAX_LINK;
  if (!isLink) {
    throw createError({
      statusCode: 400,
      statusMessage: `Send the link as { "url": "https://…" }, up to ${MAPO_AI_MAX_LINK} characters`,
    });
  }
  return url;
}
