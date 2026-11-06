import { useNuxtApp } from "nuxt/app";
import type { MapoAiReadResponse } from "../shared/gateway";
import { readMapoAiFile } from "../shared/read";
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
}

/**
 * Reads the operator's files into text through the AI gateway, as `run`
 * takes it: for a page that lets the operator give the AI a file instead
 * of a pasted text. The gateway reads the file and keeps nothing of it;
 * the page shows the text, and sends it to the AI when the operator asks.
 * `status` lists the formats it takes (`readers`) and the largest file
 * (`limits.maxFileBytes`).
 *
 * @example
 * const { read } = useMapoAiRead();
 * const answer = await read(file);
 * if (answer.status === "read") await ai?.fill(answer.parts);
 */
export function useMapoAiRead(): MapoAiRead {
  const post = gatewayPoster(useNuxtApp());
  return {
    read: (file, options) => readMapoAiFile(file, { post }, options),
  };
}
