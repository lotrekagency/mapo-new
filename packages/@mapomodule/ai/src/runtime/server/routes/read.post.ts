import { defineEventHandler, setResponseHeader } from "h3";
import type { MapoAiReadResponse } from "../../shared/gateway";
import { requireMapoAiSession } from "../auth/nitro";
import { mapoAiReadDependencies } from "../readers/nitro";
import { readSourceFile } from "../readers/read";
import { readUploadedFile } from "../readers/upload";

/**
 * `POST /_mapo/ai/read`: reads a file into the parts of a source, the text
 * `run` takes. The page sends one file, as the field `file` of a form; the
 * gateway picks the reader of its format, Mapo's or the app's, lets the
 * app's `mapo-ai:read` hooks touch up what it read, and answers the parts,
 * or why there are none: a format no reader takes, a file with no text,
 * one too long for `run`, one the reader could not read.
 *
 * The gateway keeps nothing of the file, and calls no AI: the page shows
 * the text, and sends it to `run` when the operator asks.
 */
export default defineEventHandler(
  async (event): Promise<MapoAiReadResponse> => {
    setResponseHeader(event, "cache-control", "no-store");
    const session = await requireMapoAiSession(event);
    const deps = mapoAiReadDependencies(event, session);
    const file = await readUploadedFile(event, deps.maxFileBytes);
    return readSourceFile(file, deps);
  },
);
