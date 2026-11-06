/**
 * `read`, the operation: the reader of a file, what it reads, the app's
 * `mapo-ai:read` hooks on that, and the parts checked as outside data, the
 * reader's and the hooks' alike, since both may be the app's code. A file
 * becomes a source `run` takes whole, or an answer that says why not. Its
 * dependencies are passed in, and `nitro.ts` wires them to the server.
 */

import type {
  MapoAiReadResponse,
  MapoAiSourcePart,
} from "../../shared/gateway";
import { isRecord } from "../../shared/guards";
import { MAX_PARTS } from "../run/request";
import { readerOf } from "./registry";
import type { MapoAiReadContext, MapoAiReadFile, MapoAiReader } from "./types";

/** Characters of a part's name `run` takes. */
const MAX_PART_NAME = 200;

/** What {@link readSourceFile} needs from the server. */
export interface ReadDependencies {
  /** Every reader, in the order a file is matched against them. */
  readers: readonly MapoAiReader[];
  /** Whether a reader is on, by its id. */
  isOn(id: string): boolean;
  /** The characters `run` takes, all the parts together. */
  maxChars: number;
  /** Runs the app's `mapo-ai:read` hooks: the parts they leave, as outside data. */
  touchUp(
    facts: Pick<MapoAiReadContext, "file" | "reader" | "parts">,
  ): Promise<unknown>;
}

/**
 * Reads a file into the parts of a source: `unsupported` when no reader
 * takes it, `failed` when its reader or a hook throws, `empty` when no text
 * is left, `too-long` when `run` would not take it whole.
 */
export async function readSourceFile(
  file: MapoAiReadFile,
  deps: ReadDependencies,
): Promise<MapoAiReadResponse> {
  const reader = readerOf(deps.readers, file, deps.isOn);
  if (!reader) return { status: "unsupported" };
  const failed = { status: "failed" as const, reader: reader.id };
  const size = file.bytes.byteLength;

  let read: MapoAiSourcePart[];
  try {
    read = partsOf(await reader.read(file), `The reader "${reader.id}"`);
  } catch (error) {
    console.warn(
      `[mapo-ai] The reader "${reader.id}" could not read a file of ${size} bytes: ${describe(error)}`,
    );
    return failed;
  }
  let parts: MapoAiSourcePart[];
  try {
    const touched = await deps.touchUp({
      file: Object.freeze({ name: file.name, type: file.type, size }),
      reader: reader.id,
      parts: read,
    });
    parts = partsOf(touched, "The mapo-ai:read hooks");
  } catch (error) {
    console.warn(
      `[mapo-ai] A mapo-ai:read hook failed on what the reader "${reader.id}" read: ${describe(error)}`,
    );
    return failed;
  }

  if (!parts.length) return { status: "empty", reader: reader.id };
  if (parts.length > MAX_PARTS) {
    console.warn(
      `[mapo-ai] The reader "${reader.id}" and the mapo-ai:read hooks left ${parts.length} parts, more than the ${MAX_PARTS} run takes.`,
    );
    return failed;
  }
  const chars = parts.reduce((sum, part) => sum + part.text.length, 0);
  if (chars > deps.maxChars) {
    return { status: "too-long", reader: reader.id, chars };
  }
  return { status: "read", reader: reader.id, parts };
}

/**
 * The parts a reader or a hook gave, as outside data: text parts, their
 * text trimmed, a name cut to what `run` takes. A blank part goes; an
 * entry that is no text part goes too, and the log says so.
 * @throws Error when it is no list
 */
function partsOf(value: unknown, who: string): MapoAiSourcePart[] {
  if (!Array.isArray(value)) throw new Error(`${who} gave no list of parts`);
  let others = 0;
  const parts = value.flatMap((entry: unknown): MapoAiSourcePart[] => {
    const part = isRecord(entry) ? entry : {};
    const isText = part.kind === "text" && typeof part.text === "string";
    if (!isText) {
      others += 1;
      return [];
    }
    const text = String(part.text).trim();
    if (!text) return [];
    const name =
      typeof part.name === "string"
        ? part.name.trim().slice(0, MAX_PART_NAME)
        : "";
    return [{ kind: "text", text, ...(name ? { name } : {}) }];
  });
  if (others) {
    console.warn(
      `[mapo-ai] ${who} gave ${others} entries that are no text part: they are left out.`,
    );
  }
  return parts;
}

/** An error, for the server's log: one line, a few hundred characters at most. */
function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 300);
}
