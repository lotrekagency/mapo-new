/**
 * Readers: what turns a file into the parts of a source, as `run` takes
 * them. Mapo has one for each format it reads (`registry.ts`); an app adds
 * its own, or puts its own in place of one of Mapo's, with
 * `registerMapoAiReader()`.
 */

import type { H3Event } from "h3";
import type { MapoAiSourcePart } from "../../shared/gateway";
import type { MapoAiUser } from "../auth/user";

/** A file, as a reader gets it. */
export interface MapoAiReadFile {
  /** Its name, as the request sent it: `listino.xlsx`. */
  readonly name: string;
  /** Its media type, as the request declared it: `text/csv`; `""` when it declared none. */
  readonly type: string;
  /** Its content. */
  readonly bytes: Uint8Array;
}

/** A reader of files: Mapo's, or the app's. */
export interface MapoAiReader {
  /**
   * Its id: lowercase letters, digits and `-`, starting with a letter. An
   * app's reader with the id of one of Mapo's (`text`, `markdown`, `json`,
   * `html`, `csv`, `xlsx`) takes its place.
   */
  id: string;
  /** Its name for people. */
  label?: string;
  /**
   * The extensions of the files it reads, without the dot: `csv`. A file
   * goes to the reader of its name's extension first.
   */
  extensions: readonly string[];
  /**
   * The media types of the files it reads, `text/csv`: for a file whose
   * extension no reader takes, or that has none.
   */
  types?: readonly string[];
  /**
   * Reads a file into the parts of a source: text, named after the file.
   * It throws when it cannot read the file, and returns no part when the
   * file holds no text.
   */
  read(file: MapoAiReadFile): MapoAiSourcePart[] | Promise<MapoAiSourcePart[]>;
}

/**
 * What the `mapo-ai:read` hook receives, once a reader has read a file and
 * before the gateway answers. A hook touches up what the reader read: it
 * changes a part's text, removes parts, or adds some.
 */
export interface MapoAiReadContext {
  /** The request. */
  readonly event: H3Event;
  /** Who sent the file, as the gateway reads them. */
  readonly user: MapoAiUser;
  /** Whether they administer the AI. */
  readonly admin: boolean;
  /** The file, without its content. */
  readonly file: {
    readonly name: string;
    readonly type: string;
    /** Its size in bytes. */
    readonly size: number;
  };
  /** The id of the reader that read it. */
  readonly reader: string;
  /**
   * What the reader read. The gateway reads the parts again after the
   * hooks, as it reads a reader's: only text parts count, and none left
   * means the file is empty.
   */
  parts: MapoAiSourcePart[];
}
