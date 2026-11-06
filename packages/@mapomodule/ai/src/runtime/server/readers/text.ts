/**
 * The readers of the formats that are text already, plain text, Markdown
 * and JSON, and how a file's bytes become text for every reader of text
 * (these, HTML and CSV). The text reaches the AI as the file writes it.
 */

import type { MapoAiSourcePart } from "../../shared/gateway";
import type { MapoAiReadFile, MapoAiReader } from "./types";

/**
 * The encoding of a file that is not UTF-8: the one the spreadsheets and the
 * editors of Western Europe write, which reads any byte.
 */
const FALLBACK_ENCODING = "windows-1252";

/**
 * The text of a file's bytes: UTF-16 with its byte order mark, or UTF-8,
 * else `fallback` (Windows-1252 unless the file names another encoding, as
 * HTML does). The byte order mark goes, and every line break becomes `\n`.
 * @throws Error when the bytes are no text, as a NUL character says, or
 *   when this server has no decoder for their encoding
 */
export function decodeText(
  bytes: Uint8Array,
  fallback = FALLBACK_ENCODING,
): string {
  const text = decodedBytes(bytes, fallback);
  if (text.includes("\u0000")) {
    throw new Error("The file is not text: it holds NUL characters");
  }
  return text.replace(/\r\n?/g, "\n");
}

function decodedBytes(bytes: Uint8Array, fallback: string): string {
  const isUtf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
  const isUtf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
  // The decoders drop the byte order mark, UTF-8's included.
  if (isUtf16le) return decoder("utf-16le").decode(bytes);
  if (isUtf16be) return decoder("utf-16be").decode(bytes);
  try {
    return decoder("utf-8", true).decode(bytes);
  } catch {
    return decoder(fallback).decode(bytes);
  }
}

/** @throws Error when this server has no decoder for the encoding */
function decoder(label: string, fatal = false): TextDecoder {
  try {
    return new TextDecoder(label, { fatal });
  } catch {
    throw new Error(`This server cannot read text in ${label}`);
  }
}

/** Whether this server can read text in the encoding of `label`. */
export function isKnownEncoding(label: string): boolean {
  try {
    new TextDecoder(label);
    return true;
  } catch {
    return false;
  }
}

/**
 * The text of a file as the one part of its source, named after the file;
 * no part when the text is blank.
 */
export function textParts(
  file: MapoAiReadFile,
  text: string,
): MapoAiSourcePart[] {
  const trimmed = text.trim();
  return trimmed ? [{ kind: "text", text: trimmed, name: file.name }] : [];
}

/** Plain text, `.txt`. */
export const textReader: MapoAiReader = {
  id: "text",
  label: "Text",
  extensions: ["txt"],
  types: ["text/plain"],
  read: (file) => textParts(file, decodeText(file.bytes)),
};

/** Markdown, as it is: the AI reads its marks, and the quotes may carry them. */
export const markdownReader: MapoAiReader = {
  id: "markdown",
  label: "Markdown",
  extensions: ["md", "markdown"],
  types: ["text/markdown", "text/x-markdown"],
  read: (file) => textParts(file, decodeText(file.bytes)),
};

/**
 * JSON, as the file writes it: parsed only to tell a damaged file, never
 * written again, so a number keeps every digit the file gives it.
 */
export const jsonReader: MapoAiReader = {
  id: "json",
  label: "JSON",
  extensions: ["json"],
  types: ["application/json"],
  read(file) {
    const text = decodeText(file.bytes);
    try {
      JSON.parse(text);
    } catch {
      throw new Error("The file is not JSON");
    }
    return textParts(file, text);
  },
};
