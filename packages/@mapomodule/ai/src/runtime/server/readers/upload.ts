/**
 * The body of `POST /_mapo/ai/read`, read as outside data: a form
 * (`multipart/form-data`) with one file, its field `file`, read up to the
 * bytes the limits allow before it is parsed.
 */

import { createError, getRequestHeader } from "h3";
import type { H3Event } from "h3";
import { readLimitedBytes } from "../body";
import type { MapoAiReadFile } from "./types";

/** Bytes a form may have besides its file: its boundaries and its headers. */
const FORM_OVERHEAD_BYTES = 16 * 1024;
/** Characters of a file's name the gateway keeps. */
const MAX_NAME = 200;

/**
 * Reads the file of a request of `read`, or the error that refuses it:
 * - 415 when the body is not a form by its `Content-Type`;
 * - 413 when the file has more bytes than `maxFileBytes`, or the app takes
 *   no file (`0`);
 * - 400 when the form cannot be read, or holds no file or more than one as
 *   its field `file`.
 * @throws H3Error 400, 413 or 415
 */
export async function readUploadedFile(
  event: H3Event,
  maxFileBytes: number,
): Promise<MapoAiReadFile> {
  const type = getRequestHeader(event, "content-type") ?? "";
  const isForm = /^multipart\/form-data\s*;/i.test(type.trim());
  if (!isForm) {
    throw createError({
      statusCode: 415,
      statusMessage:
        "The body must be a form with the file (multipart/form-data)",
    });
  }
  const tooLarge = () =>
    createError({
      statusCode: 413,
      statusMessage:
        maxFileBytes === 0
          ? "This app takes no files"
          : `The file is larger than ${maxFileBytes} bytes`,
    });
  if (maxFileBytes === 0) throw tooLarge();
  const maxBytes = maxFileBytes + FORM_OVERHEAD_BYTES;
  const declared = Number(getRequestHeader(event, "content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  const body = await readLimitedBytes(event, maxBytes, tooLarge);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), {
      headers: { "content-type": type },
    }).formData();
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "The body is not a form that can be read",
    });
  }
  const files = form
    .getAll("file")
    .filter((entry): entry is File => typeof entry !== "string");
  const [file] = files;
  if (!file || files.length > 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Send one file, as the field "file" of the form',
    });
  }
  if (file.size > maxFileBytes) throw tooLarge();
  return {
    name: fileName(file.name),
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

/**
 * A file's name as the gateway keeps it: the last segment of a path, on one
 * line, cut to 200 characters; `file` when nothing is left.
 */
function fileName(name: string): string {
  const last = name.split(/[/\\]/).pop() ?? "";
  const plain = Array.from(last, (char) => (isControl(char) ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
  return plain || "file";
}

function isControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 32 || code === 127;
}
