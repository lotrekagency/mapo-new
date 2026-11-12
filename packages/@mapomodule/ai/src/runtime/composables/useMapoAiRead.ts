import { useNuxtApp } from "nuxt/app";
import type {
  MapoAiReadLinkResponse,
  MapoAiReadResponse,
} from "../shared/gateway";
import { readMapoAiFile, readMapoAiLink } from "../shared/read";
import type { MapoAiReadOptions } from "../shared/read";
import { gatewayPoster } from "./poster";

/** What `useMapoAiRead()` gives a page. */
export interface MapoAiRead {
  /**
   * Sends a file to the gateway's `read`, which reads it with the reader of
   * its format, Mapo's or the app's, into the parts of a source: the text
   * `run` takes, such as `useMapoAiFill().fill(parts)`. When there are no
   * parts the answer says why: `unsupported`, `empty`, `too-long`,
   * `failed`.
   * @throws The error of the call (413 for a file larger than
   *   `mapo.ai.limits.maxFileBytes`, 403 for a user the app keeps out), or
   *   `MapoAiReadAnswerError` for an answer that cannot be read.
   */
  read(file: Blob, options?: MapoAiReadOptions): Promise<MapoAiReadResponse>;
  /**
   * Sends a link to the gateway's `read/link`, which fetches its page, as a
   * stranger would, without the operator's cookies, and reads it with the
   * reader of its format into the parts of a source, each named after the
   * page's address. When there are no parts the answer says why: `off`,
   * `blocked`, `unreachable`, `http-error`, `too-large`, or what `read`
   * answers for a file.
   * @throws The error of the call (429 past
   *   `mapo.ai.limits.linksPerUserPerMinute`, 403 for a user the app keeps
   *   out), or `MapoAiReadAnswerError` for an answer that cannot be read.
   */
  readLink(
    url: string,
    options?: { signal?: AbortSignal },
  ): Promise<MapoAiReadLinkResponse>;
}

/**
 * Reads the operator's files, and the pages of their links, into text
 * through the AI gateway, as `run` takes it: for a page that lets the
 * operator give the AI a file or a link instead of a pasted text. The
 * gateway reads the file or the page and keeps nothing of it; the page
 * shows the text, and sends it to the AI when the operator asks. `status`
 * lists the formats it takes (`readers`), the largest file
 * (`limits.maxFileBytes`) and whether it reads links (`links`).
 *
 * @example
 * const { read, readLink } = useMapoAiRead();
 * const answer = await read(file); // or: await readLink("https://example.org/news/1")
 * if (answer.status === "read") await ai?.fill(answer.parts);
 */
export function useMapoAiRead(): MapoAiRead {
  const post = gatewayPoster(useNuxtApp());
  return {
    read: (file, options) => readMapoAiFile(file, { post }, options),
    readLink: (url, options) => readMapoAiLink(url, { post }, options),
  };
}
