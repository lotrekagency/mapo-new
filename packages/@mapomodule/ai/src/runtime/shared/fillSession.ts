/**
 * The session of a form's fill as a draft keeps it: what `snapshot()` of
 * `useMapoAiFill()` writes and `resume()` reads back. Only what the session
 * knows of the form: the AI's values with their quotes, what became of
 * each, what undoing puts back, and who answered. Never the source, the
 * files or the operator's instructions. It comes back from the browser's
 * storage, so it is read as outside data.
 */

import type {
  MapoAiFillAction,
  MapoAiFillReview,
  MapoAiModelWrite,
} from "./fill";
import { isSafePath, readMapoAiFieldOutcome } from "./fill";
import { isRecord } from "./guards";
import type { AiFieldOutcome } from "./sanitize";

/** The format of a kept session: a draft of another one is not read. */
export const MAPO_AI_FILL_SESSION_FORMAT = 1;

/** An answer that joined a session: who gave it, and when. */
export interface MapoAiFillAnswer {
  /** Its place in the session, from 1: the `round` of the fields it gave. */
  round: number;
  /** The provider and the model that answered. */
  provider: { id: string; model: string };
  /** The version of Mapo's base rules of the prompt it answered. */
  prompt: number;
  /** When it arrived, in milliseconds since 1970. */
  at: number;
}

/** One value the session wrote at a path, and what undoes it. */
export interface MapoAiFillSessionRecord {
  path: string;
  /** What the path held before. */
  before?: unknown;
  write: MapoAiModelWrite;
  /** The data written, as JSON text. */
  written?: string;
}

/** One write of a field's value, at each of its paths. */
export interface MapoAiFillSessionWrite {
  /** When it was made in the session: undoing goes back newest first. */
  order: number;
  records: MapoAiFillSessionRecord[];
}

/** A field of a kept session, and what became of the AI's value. */
export interface MapoAiFillSessionField {
  key: string;
  path: string;
  action: MapoAiFillAction;
  replaces: boolean;
  shown: boolean;
  outcome: AiFieldOutcome;
  applied: boolean;
  review?: MapoAiFillReview;
  undoable: boolean;
  round: number;
  /** What the field held when its answer came, while it waits. */
  held?: string;
  /** Its writes, oldest first: what `restore()` and `undo()` put back. */
  writes: MapoAiFillSessionWrite[];
}

/** A session as a draft keeps it. */
export interface MapoAiFillSession {
  format: typeof MAPO_AI_FILL_SESSION_FORMAT;
  /** How many answers joined it. */
  rounds: number;
  answers: MapoAiFillAnswer[];
  fields: MapoAiFillSessionField[];
}

const ACTIONS: ReadonlySet<string> = new Set<MapoAiFillAction>([
  "apply",
  "confirm",
  "manual",
  "discard",
  "empty",
]);

const REVIEWS: ReadonlySet<string> = new Set<MapoAiFillReview>([
  "kept",
  "edited",
  "ignored",
]);

/**
 * A kept session read as outside data; `undefined` for another format, or
 * for no session. A field or an answer that cannot be read is left out,
 * and so is a second field at the same path. A field whose writes cannot
 * be read stays, with no writes: nothing undoes it.
 */
export function readMapoAiFillSession(
  value: unknown,
): MapoAiFillSession | undefined {
  if (!isRecord(value)) return undefined;
  if (value.format !== MAPO_AI_FILL_SESSION_FORMAT) return undefined;
  const { rounds } = value;
  if (!isCount(rounds)) return undefined;
  const answers: MapoAiFillAnswer[] = [];
  for (const raw of listOf(value.answers)) {
    const answer = answerOf(raw, rounds);
    if (answer) answers.push(answer);
  }
  const paths = new Set<string>();
  const fields: MapoAiFillSessionField[] = [];
  for (const raw of listOf(value.fields)) {
    const field = fieldOf(raw, rounds);
    if (!field) continue;
    if (paths.has(field.path)) continue;
    paths.add(field.path);
    fields.push(field);
  }
  return { format: MAPO_AI_FILL_SESSION_FORMAT, rounds, answers, fields };
}

/**
 * A value JSON writes and reads back as it is: text, a finite number, a
 * boolean, `null`, and lists and plain objects of them. `undefined` stands
 * for a key that was not there. Not public: `snapshot()` keeps a write only
 * when what it puts back is such a value, and the reader takes no other.
 */
export function isPlainData(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === undefined) return depth === 0;
  if (value === null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((item) => isPlainData(item, depth + 1));
  }
  if (!isRecord(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  const isLiteral = prototype === Object.prototype;
  const isBare = prototype === null;
  if (!isLiteral && !isBare) return false;
  return Object.values(value).every(
    (item) => item === undefined || isPlainData(item, depth + 1),
  );
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isRound(value: unknown, rounds: number): value is number {
  if (!isCount(value)) return false;
  const isFirst = value >= 1;
  const isKnown = value <= rounds;
  return isFirst && isKnown;
}

function isAction(value: unknown): value is MapoAiFillAction {
  return typeof value === "string" && ACTIONS.has(value);
}

function isReview(value: unknown): value is MapoAiFillReview {
  return typeof value === "string" && REVIEWS.has(value);
}

function isPathText(value: unknown): value is string {
  return typeof value === "string" && isSafePath(value);
}

function answerOf(
  value: unknown,
  rounds: number,
): MapoAiFillAnswer | undefined {
  if (!isRecord(value)) return undefined;
  const { round, prompt, at } = value;
  const provider = isRecord(value.provider) ? value.provider : {};
  const { id, model } = provider;
  const isId = typeof id === "string";
  const isModel = typeof model === "string";
  const isPrompt = typeof prompt === "number" && Number.isFinite(prompt);
  const isTime = typeof at === "number" && Number.isFinite(at);
  if (!isRound(round, rounds) || !isId || !isModel) return undefined;
  if (!isPrompt || !isTime) return undefined;
  return { round, provider: { id, model }, prompt, at };
}

function fieldOf(
  value: unknown,
  rounds: number,
): MapoAiFillSessionField | undefined {
  if (!isRecord(value)) return undefined;
  const { key, path, action, round, review, held } = value;
  const { replaces, shown, applied, undoable } = value;
  const outcome = readMapoAiFieldOutcome(value.outcome);
  const isNamed = isPathText(key) && isPathText(path);
  const isFlagged = [replaces, shown, applied, undoable].every(
    (flag) => typeof flag === "boolean",
  );
  const isReviewed = review === undefined || isReview(review);
  const isHeld = held === undefined || typeof held === "string";
  if (!isNamed || !isAction(action) || !isRound(round, rounds)) {
    return undefined;
  }
  if (!isFlagged || !isReviewed || !isHeld || !outcome) return undefined;
  return {
    key,
    path,
    action,
    replaces: replaces === true,
    shown: shown === true,
    outcome,
    applied: applied === true,
    ...(isReview(review) ? { review } : {}),
    undoable: undoable === true,
    round,
    ...(typeof held === "string" ? { held } : {}),
    writes: writesOf(value.writes) ?? [],
  };
}

/** A field's writes; `undefined` when one of them cannot be read. */
function writesOf(value: unknown): MapoAiFillSessionWrite[] | undefined {
  const writes: MapoAiFillSessionWrite[] = [];
  for (const raw of listOf(value)) {
    if (!isRecord(raw)) return undefined;
    const { order } = raw;
    const records = recordsOf(raw.records);
    if (!isCount(order) || !records) return undefined;
    writes.push({ order, records });
  }
  return writes;
}

function recordsOf(value: unknown): MapoAiFillSessionRecord[] | undefined {
  const raws = listOf(value);
  if (raws.length === 0) return undefined;
  const records: MapoAiFillSessionRecord[] = [];
  for (const raw of raws) {
    if (!isRecord(raw)) return undefined;
    const { path, written } = raw;
    if (!isPathText(path)) return undefined;
    const write = modelWriteOf(raw.write, path);
    const isWritten = written === undefined || typeof written === "string";
    // What undoing puts back is data, as a draft carries it.
    const isBefore = isPlainData(raw.before);
    if (!write || !isWritten || !isBefore) return undefined;
    records.push({
      path,
      before: raw.before,
      write,
      ...(typeof written === "string" ? { written } : {}),
    });
  }
  return records;
}

/** What a write did, where every object it made is on the way to its path. */
function modelWriteOf(
  value: unknown,
  path: string,
): MapoAiModelWrite | undefined {
  if (!isRecord(value)) return undefined;
  const { existed } = value;
  if (typeof existed !== "boolean") return undefined;
  const made: MapoAiModelWrite["made"] = [];
  for (const raw of listOf(value.made)) {
    if (!isRecord(raw)) return undefined;
    const { path: at, wasNull } = raw;
    const isOnTheWay = isPathText(at) && path.startsWith(`${at}.`);
    if (!isOnTheWay || typeof wasNull !== "boolean") return undefined;
    made.push({ path: at, wasNull });
  }
  return { existed, made };
}
