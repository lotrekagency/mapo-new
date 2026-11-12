/**
 * The readers `read` reads files with: Mapo's, one for each format it reads,
 * and those the app registers from a Nitro plugin. An app's reader with the
 * id of one of Mapo's takes its place; one with an id of its own adds a
 * format. `mapo.ai.readers` turns any of them off, without code.
 */

import type { MapoAiReaderStatus } from "../../shared/gateway";
import { htmlReader } from "./html";
import { csvReader, xlsxReader } from "./sheets";
import { jsonReader, markdownReader, textReader } from "./text";
import type { MapoAiReader } from "./types";

/** Mapo's readers, in the order a file is matched against them. */
const MAPO_READERS: readonly MapoAiReader[] = [
  textReader,
  markdownReader,
  jsonReader,
  htmlReader,
  csvReader,
  xlsxReader,
];

/**
 * The id `mapo.ai.readers` turns links off with: no reader of the registry
 * has it, since a link is read by the reader of its page's format.
 */
export const MAPO_AI_LINK_READER = "link";

/** The ids of Mapo's readers: `text`, `markdown`, `json`, `html`, `csv`, `xlsx`. */
export const MAPO_AI_READER_IDS: readonly string[] = MAPO_READERS.map(
  (reader) => reader.id,
);

/** A reader's id: lowercase letters, digits and `-`, starting with a letter. */
export const READER_ID = /^[a-z][a-z0-9-]{0,63}$/;
/** An extension, lowercase and without the dot: `csv`. */
const EXTENSION = /^[a-z0-9]{1,16}$/;
/** A media type without its parameters: `text/csv`. */
const MEDIA_TYPE = /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/;

const registered = new Map<string, MapoAiReader>();

/**
 * Registers a reader the app implements, in a Nitro plugin: in place of
 * Mapo's reader with the same id (`text`, `markdown`, `json`, `html`,
 * `csv`, `xlsx`), or for a format of its own. A file goes to the reader of
 * its name's extension, the app's readers before Mapo's, and only when no
 * reader takes the extension, to the reader of its media type.
 * `mapo.ai.readers` turns a reader off by its id.
 *
 * @example
 * // server/plugins/mapo-ai-readers.ts
 * export default defineNitroPlugin(() => {
 *   registerMapoAiReader({
 *     id: "ics",
 *     label: "Calendar event",
 *     extensions: ["ics"],
 *     types: ["text/calendar"],
 *     read: (file) => [{ kind: "text", text: eventText(file.bytes), name: file.name }],
 *   });
 * });
 * @throws TypeError when the id is not a reader's, or is `link`, which
 *   turns links off; when `read` is missing, or it lists no extension and
 *   no media type, or one that is none; Error when the id is registered
 *   already
 */
export function registerMapoAiReader(reader: MapoAiReader): void {
  const id: unknown = reader?.id;
  if (typeof id !== "string" || !READER_ID.test(id)) {
    throw new TypeError(
      `A reader's id is lowercase letters, digits and "-", starting with a letter: ${JSON.stringify(id)}`,
    );
  }
  if (id === MAPO_AI_LINK_READER) {
    throw new TypeError(
      `"${MAPO_AI_LINK_READER}" is the id that turns links off, not a reader's: a link is read by the reader of its page's format`,
    );
  }
  if (typeof reader.read !== "function") {
    throw new TypeError(`The reader "${id}" has no read()`);
  }
  const extensions = listOf(reader.extensions, id, "extension", (entry) =>
    entry.replace(/^\./, "").toLowerCase(),
  );
  const types = listOf(reader.types, id, "media type", (entry) =>
    entry.toLowerCase(),
  );
  if (!extensions.length && !types.length) {
    throw new TypeError(
      `The reader "${id}" lists no extension and no media type`,
    );
  }
  if (registered.has(id)) {
    throw new Error(`A reader "${id}" is registered already`);
  }
  const label = typeof reader.label === "string" ? reader.label : undefined;
  registered.set(id, {
    id,
    ...(label ? { label } : {}),
    extensions,
    types,
    read: (file) => reader.read(file),
  });
}

/**
 * The extensions or the media types a reader lists, written as the
 * registry compares them.
 * @throws TypeError for a list that is none, or an entry that is not one
 */
function listOf(
  value: unknown,
  id: string,
  what: "extension" | "media type",
  normalize: (entry: string) => string,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new TypeError(`The reader "${id}" lists its ${what}s in no array`);
  }
  const pattern = what === "extension" ? EXTENSION : MEDIA_TYPE;
  return value.map((entry: unknown) => {
    const written = typeof entry === "string" ? normalize(entry) : "";
    if (!pattern.test(written)) {
      throw new TypeError(
        `The reader "${id}" lists ${JSON.stringify(entry)}, which is no ${what}`,
      );
    }
    return written;
  });
}

/**
 * The readers `read` uses, in the order a file is matched against them:
 * the app's, in the order it registered them, then Mapo's that no app's
 * reader replaces; without those `isOn` turns off.
 */
export function mapoAiReaders(
  isOn: (id: string) => boolean = () => true,
): MapoAiReader[] {
  const own = [...registered.values()];
  const mapo = MAPO_READERS.filter((reader) => !registered.has(reader.id));
  return [...own, ...mapo].filter((reader) => isOn(reader.id));
}

/**
 * The reader of a file: the first that is on among those that list the
 * extension of its name; when none lists it, the first that is on among
 * those that list its media type; `undefined` when there is none. A file
 * whose extension only readers that are off list has no reader: its media
 * type never brings it to another, so a format turned off stays off.
 */
export function readerOf(
  readers: readonly MapoAiReader[],
  file: { name: string; type: string },
  isOn: (id: string) => boolean = () => true,
): MapoAiReader | undefined {
  const extension = /\.([a-z0-9]{1,16})$/i.exec(file.name)?.[1]?.toLowerCase();
  const type = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const byExtension = extension
    ? readers.filter((reader) => reader.extensions.includes(extension))
    : [];
  const byType = type
    ? readers.filter((reader) => reader.types?.includes(type))
    : [];
  const candidates = byExtension.length ? byExtension : byType;
  return candidates.find((reader) => isOn(reader.id));
}

/** The readers as `status` lists them. */
export function readerStatuses(
  readers: readonly MapoAiReader[],
): MapoAiReaderStatus[] {
  return readers.map((reader) => ({
    id: reader.id,
    ...(reader.label ? { label: reader.label } : {}),
    extensions: [...reader.extensions],
    types: [...(reader.types ?? [])],
  }));
}
