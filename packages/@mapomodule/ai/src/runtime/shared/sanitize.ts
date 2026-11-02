/**
 * The sanitizer: an answer of the AI, checked against the contract it was
 * asked with (`contract.ts`) and turned into typed values for the form.
 *
 * The answer is outside data, read as `unknown` property by property: a
 * part without the shape asked is read as empty, with a warning. A value
 * that breaks a rule of its field is discarded and kept aside with the
 * reason, for the operator to see; the field stays empty. In a list, a
 * value that breaks a rule is taken out and the rest stays, for review.
 *
 * A value is verified when a quote of it is in the source, as whole words,
 * and holds it: the whole text, the number or the label appears in the
 * quote. Dates, times, yes/no and links to an item need only the quote.
 * Without the source's text nothing is verified.
 */
import type { AiChoice } from "./entity";
import { isMultipleOf } from "./numbers";
import type {
  AiContractEntity,
  AiContractField,
  AiExtractContract,
  AiFillContract,
} from "./contract";
import { holds, isQuoted, numbersIn, searchableSource } from "./citations";
import { isRecord } from "./guards";
import { markdownToHtml, markdownToText } from "./markdown";

// ─── The result ──────────────────────────────────────────────────────────────

/** A value of a choice field, as the record saves it. */
export type AiScalar = AiChoice["value"];

/**
 * A related record as the answer names it:
 * - `{ id }`: one of the records the contract listed;
 * - `{ search }`: a name to search for in the related endpoint, and `item`,
 *   the item of the same answer to use when the search finds no record;
 * - `{ item }`: an item of the same answer, by its `ref`.
 */
export type AiRelationRef =
  | { id: AiScalar }
  | { search: string; item?: string }
  | { item: string };

/** One value of a field, typed for the form. */
export type AiSingleValue = AiScalar | AiRelationRef;

/** A field's value: a list for a multiple field. */
export type AiValue = AiSingleValue | AiSingleValue[];

/**
 * Why a value was not kept:
 * - `format`: not the kind's format (a date, a number, an address…);
 * - `not-listed`: not one of the field's choices or listed records;
 * - `too-short`, `too-long`: the length limits, in characters;
 * - `too-low`, `too-high`: the number limits;
 * - `step`: not a multiple of the field's step;
 * - `pattern`: a regular expression of the field does not match;
 * - `too-many-values`: more values than the list allows.
 */
export type AiDiscardReason =
  | "format"
  | "not-listed"
  | "too-short"
  | "too-long"
  | "too-low"
  | "too-high"
  | "step"
  | "pattern"
  | "too-many-values";

/** A quote the answer gives for a field. */
export interface AiQuote {
  /** The words of the source, as the answer copies them. */
  quote: string;
  /** Where they are, such as a page; `""` when the source has no parts. */
  where: string;
  /** Found in the source's text. */
  found: boolean;
}

/** A value of a list taken out, and why. */
export interface AiDroppedValue {
  /** What the answer wrote. */
  proposed: unknown;
  reason: AiDiscardReason;
}

/** What became of the answer for one field. */
export type AiFieldOutcome =
  | { status: "empty" }
  | {
      status: "filled";
      /** The value for the form, typed by the field's kind. */
      value: AiValue;
      /**
       * A quote found in the source holds every value, nothing was taken out
       * of a list and the list is long enough. Magic Fill applies a verified
       * value without a preview, so anything less needs the operator.
       */
      verified: boolean;
      /** The quotes the answer gives for the field, found or not. */
      quotes: AiQuote[];
      /** Values of a list taken out: the rest needs review. */
      dropped?: AiDroppedValue[];
      /** Fewer values than the list needs: kept, for review. */
      tooFew?: boolean;
    }
  | {
      status: "discarded";
      reason: AiDiscardReason;
      /** What the answer wrote, for the operator to see. */
      proposed: unknown;
      quotes: AiQuote[];
    };

/**
 * Something in the answer the sanitizer could not use:
 * - `unexpected-shape`: a part without the shape the contract asks, read
 *   as empty;
 * - `unknown-property`: a property the contract does not ask, ignored;
 * - `unknown-field`: a quote for a field the contract does not ask;
 * - `unknown-type`: an extracted item of a type the contract does not have;
 * - `repeated-ref`: an item without a `ref`, or with one another item has
 *   too: nothing can point to it;
 * - `unknown-item`: a link to an item that is missing, of another type, the
 *   item itself, or named by a `ref` two items share;
 * - `unreadable-pattern`: a field's regular expression that JavaScript
 *   cannot read, not applied.
 */
export type AiAnswerWarning =
  | { kind: "unexpected-shape"; path: string }
  | { kind: "unknown-property"; path: string }
  | { kind: "unknown-field"; path: string; field: string }
  | { kind: "unknown-type"; path: string; type: string }
  | { kind: "repeated-ref"; path: string; ref: string }
  | { kind: "unknown-item"; path: string; item: string }
  | { kind: "unreadable-pattern"; key: string; pattern: string };

/** Each field the contract asks for, by field key. */
export type AiFieldOutcomes = Record<string, AiFieldOutcome>;

/** A sanitized `fill` answer. */
export interface AiFillResult {
  /** The answer had the shape asked; otherwise every field is empty. */
  readable: boolean;
  /** Each field the contract asks for, by field key. */
  fields: AiFieldOutcomes;
  /** What the answer had that could not be used. */
  warnings: AiAnswerWarning[];
}

/** One record of a sanitized `extract` answer. */
export interface AiExtractedItem {
  /** The entity type, one of the contract's. */
  type: string;
  /** Its name in the answer; `""` when it had none, or shared it with another item. */
  ref: string;
  /** Each field of its entity, by field key. */
  fields: AiFieldOutcomes;
}

/** A sanitized `extract` answer. */
export interface AiExtractResult {
  /** The answer had the shape asked; otherwise there is no item. */
  readable: boolean;
  items: AiExtractedItem[];
  warnings: AiAnswerWarning[];
}

/** Options of {@link sanitizeFillAnswer} and {@link sanitizeExtractAnswer}. */
export interface SanitizeOptions {
  /** The source's text, where the quotes are searched. Without it nothing is verified. */
  source?: string;
}

// ─── One value ───────────────────────────────────────────────────────────────

/**
 * What a quote must hold for a value to be verified: one of some texts (the
 * value, its label), a number, or nothing more than being found (dates,
 * times, yes/no, a link to an item).
 */
type Probe =
  | { kind: "found" }
  | { kind: "text"; texts: string[] }
  | { kind: "number"; value: number };

type Element =
  | { kind: "empty" }
  | { kind: "error"; reason: AiDiscardReason }
  | { kind: "value"; value: AiSingleValue; probe: Probe };

/** The items of an extraction a link may point to. */
interface LinkTargets {
  /** Each `ref` one item alone has, with its item's type. */
  refs: ReadonlyMap<string, string>;
  /** The `ref` the item being read wrote: a link never points to itself. */
  own: string;
}

/** The state of one answer being read. */
interface Reading {
  readings?: string[];
  warnings: AiAnswerWarning[];
  /** Patterns already reported as unreadable, by field key. */
  unreadable: Set<string>;
}

const empty: Element = { kind: "empty" };
const error = (reason: AiDiscardReason): Element => ({ kind: "error", reason });
const FOUND: Probe = { kind: "found" };

/** A control character but tab and line breaks: the backend refuses them, NUL first. */
function isControl(char: string): boolean {
  const code = char.charCodeAt(0);
  const isKept = char === "\t" || char === "\n" || char === "\r";
  return (code < 32 && !isKept) || code === 127;
}

function withoutControls(text: string): string {
  return [...text].filter((char) => !isControl(char)).join("");
}

function singleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** Length in characters as the backend counts them: code points, not UTF-16 units. */
function lengthOf(text: string): number {
  return [...text].length;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-](\d{2}):(\d{2}))?$/i;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function isClockTime(hours: string, minutes: string, seconds = "00"): boolean {
  return Number(hours) < 24 && Number(minutes) < 60 && Number(seconds) < 60;
}

/**
 * An address as Django's `URLValidator` takes it: `http` or `https`, a host
 * with a dot (or `localhost`), no spaces, control characters or backslashes,
 * which the browser's parser would quietly fix.
 */
function isWebUrl(text: string): boolean {
  const hasOddCharacters = /[\s\\]/.test(text) || [...text].some(isControl);
  if (hasOddCharacters) return false;
  try {
    const url = new URL(text);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    const host = url.hostname;
    const isHost = host === "localhost" || /\.[^.]+$/.test(host);
    return isWeb && isHost;
  } catch {
    return false;
  }
}

/**
 * An email as Django's `EmailValidator` takes it, once the punctuation a
 * sentence or a mail header puts around it is gone (`<info@teatro.it>.`):
 * no spaces, one `@`, a domain of labels with a top level of two letters or
 * more. `undefined` when it is none.
 */
function emailOf(text: string): string | undefined {
  const email = singleLine(text)
    .replace(/^[<("'\s]+/, "")
    .replace(/[>)"'.,;:!?\s]+$/, "");
  const isEmail =
    /^[^\s@<>()[\]",;:]+@(?:[^\s@.<>()[\]",;:]+\.)+[^\s@.<>()[\]",;:\d]{2,}$/.test(
      email,
    );
  return isEmail ? email : undefined;
}

/** The choice the answer names: exactly as listed, or once trimmed. */
function listedChoice(
  choices: readonly AiChoice[] | undefined,
  raw: string,
): AiChoice | undefined {
  const exact = choices?.find((choice) => String(choice.value) === raw);
  return (
    exact ??
    choices?.find((choice) => String(choice.value).trim() === raw.trim())
  );
}

/**
 * What a quote must hold to verify a listed choice or record: its label, or
 * its value when it is a word. A number such as `2` or an id is in too
 * many quotes to prove anything.
 */
function listedProbe(choice: AiChoice): Probe {
  const value = String(choice.value);
  const isWord = /\p{L}/u.test(value);
  return { kind: "text", texts: [choice.label, ...(isWord ? [value] : [])] };
}

/** The string as a value of the field's kind, before its limits. */
function convert(field: AiContractField, raw: string): Element {
  const clean = withoutControls(raw);
  const text = clean.trim();
  if (!text) return empty;
  const asText = (value: string): Element => ({
    kind: "value",
    value,
    probe: { kind: "text", texts: [value] },
  });
  switch (field.kind) {
    case "string":
      return asText(singleLine(text));
    case "text":
      return asText(text.replace(/\r\n?/g, "\n"));
    case "html": {
      const html = markdownToHtml(text);
      if (!html) return empty;
      // The words of the rich text, as a quote of the source would hold them.
      const probe: Probe = { kind: "text", texts: [markdownToText(text)] };
      return { kind: "value", value: html, probe };
    }
    case "email": {
      const email = emailOf(text);
      return email ? asText(email) : error("format");
    }
    case "url":
      return isWebUrl(text) ? asText(text) : error("format");
    case "color":
      return /^#[0-9a-f]{6}$/i.test(text) ? asText(text) : error("format");
    case "integer": {
      const isInteger = /^[+-]?\d+$/.test(text);
      const value = Number(text);
      if (!isInteger || !Number.isSafeInteger(value)) return error("format");
      return { kind: "value", value, probe: { kind: "number", value } };
    }
    case "number": {
      const isNumber = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text);
      const value = Number(text);
      if (!isNumber || !Number.isFinite(value)) return error("format");
      return { kind: "value", value, probe: { kind: "number", value } };
    }
    case "boolean": {
      const word = text.toLowerCase();
      if (word !== "true" && word !== "false") return error("format");
      return { kind: "value", value: word === "true", probe: FOUND };
    }
    case "date": {
      const [, year, month, day] = DATE.exec(text) ?? [];
      const isDate =
        !!year && isCalendarDate(Number(year), Number(month), Number(day));
      return isDate
        ? { kind: "value", value: text, probe: FOUND }
        : error("format");
    }
    case "datetime": {
      const [
        ,
        year,
        month,
        day,
        hours = "",
        minutes = "",
        seconds = "00",
        zone = "",
        zoneHours = "00",
        zoneMinutes = "00",
      ] = DATETIME.exec(text) ?? [];
      const isDatetime =
        !!year &&
        isCalendarDate(Number(year), Number(month), Number(day)) &&
        isClockTime(hours, minutes, seconds) &&
        isClockTime(zoneHours, zoneMinutes);
      if (!isDatetime) return error("format");
      const value = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${zone.toUpperCase()}`;
      return { kind: "value", value, probe: FOUND };
    }
    case "time": {
      const [, hours = "", minutes = "", seconds] = TIME.exec(text) ?? [];
      const isTime = !!hours && isClockTime(hours, minutes, seconds);
      if (!isTime) return error("format");
      const value = [
        hours.padStart(2, "0"),
        minutes,
        ...(seconds ? [seconds] : []),
      ].join(":");
      return { kind: "value", value, probe: FOUND };
    }
    case "choice": {
      const choice = listedChoice(field.choices, clean);
      if (!choice) return error("not-listed");
      return { kind: "value", value: choice.value, probe: listedProbe(choice) };
    }
    case "relation":
      return relationRef(field, clean);
    default: {
      // A kind this version does not know, from a newer contract.
      const unknown: never = field.kind;
      void unknown;
      return error("format");
    }
  }
}

/** A relation answered by id (from the listed records) or by name. */
function relationRef(field: AiContractField, raw: string): Element {
  if (field.relationMode === "choice") {
    const record = listedChoice(field.choices, raw);
    if (!record) return error("not-listed");
    return {
      kind: "value",
      value: { id: record.value },
      probe: listedProbe(record),
    };
  }
  const name = singleLine(raw);
  if (!name) return empty;
  return {
    kind: "value",
    value: { search: name },
    probe: { kind: "text", texts: [name] },
  };
}

/**
 * A link `{ record, item }`: an existing record wins over an item of the
 * answer, and a name to search for keeps the item for when the search finds
 * nothing. A record that is not listed discards the link.
 */
function linkRef(
  field: AiContractField,
  raw: unknown,
  path: string,
  targets: LinkTargets | undefined,
  reading: Reading,
): Element {
  const recordText = isRecord(raw) ? raw.record : undefined;
  const itemText = isRecord(raw) ? raw.item : undefined;
  const isLink = typeof recordText === "string" && typeof itemText === "string";
  if (!isLink) return error("format");
  const item = itemText.trim();
  const isTarget =
    !!targets &&
    item !== targets.own &&
    targets.refs.get(item) === field.linksTo;
  if (item && !isTarget)
    reading.warnings.push({ kind: "unknown-item", path: `${path}.item`, item });
  const usableItem = isTarget ? item : "";

  const recordClean = withoutControls(recordText);
  const record = recordClean.trim() ? relationRef(field, recordClean) : empty;
  if (record.kind === "value") {
    const ref = record.value;
    const isSearch = typeof ref === "object" && "search" in ref;
    if (isSearch && usableItem)
      return { ...record, value: { search: ref.search, item: usableItem } };
    return record;
  }
  if (record.kind === "error") return record;
  if (usableItem)
    return { kind: "value", value: { item: usableItem }, probe: FOUND };
  return record;
}

/** The first limit of the field the value breaks, if any. */
function brokenLimit(
  field: AiContractField,
  value: AiSingleValue,
  reading: Reading,
): AiDiscardReason | undefined {
  const limits = field.constraints;
  if (typeof value === "number") {
    const isTooLow =
      (limits.minimum !== undefined && value < limits.minimum) ||
      (limits.exclusiveMinimum !== undefined &&
        value <= limits.exclusiveMinimum);
    if (isTooLow) return "too-low";
    const isTooHigh =
      (limits.maximum !== undefined && value > limits.maximum) ||
      (limits.exclusiveMaximum !== undefined &&
        value >= limits.exclusiveMaximum);
    if (isTooHigh) return "too-high";
    const isOffStep = (limits.steps ?? []).some(
      (step) => !isMultipleOf(value, step),
    );
    return isOffStep ? "step" : undefined;
  }
  // A relation's limits are its key's, met by the backend's records.
  const isText = typeof value === "string" && field.kind !== "relation";
  if (!isText) return undefined;
  const length = lengthOf(value);
  if (limits.minLength !== undefined && length < limits.minLength)
    return "too-short";
  if (limits.maxLength !== undefined && length > limits.maxLength)
    return "too-long";
  for (const pattern of limits.patterns ?? []) {
    const expression = regularExpression(field, pattern, reading);
    if (expression && !expression.test(value)) return "pattern";
  }
  return undefined;
}

/** A field's pattern as JavaScript reads it; reported once when it cannot. */
function regularExpression(
  field: AiContractField,
  pattern: string,
  reading: Reading,
): RegExp | undefined {
  try {
    return new RegExp(pattern);
  } catch {
    const key = `${field.key}\u0000${pattern}`;
    if (!reading.unreadable.has(key)) {
      reading.unreadable.add(key);
      reading.warnings.push({
        kind: "unreadable-pattern",
        key: field.key,
        pattern,
      });
    }
    return undefined;
  }
}

/** One value of the field, from the answer: converted, then checked against its limits. */
function element(
  field: AiContractField,
  raw: unknown,
  path: string,
  targets: LinkTargets | undefined,
  reading: Reading,
): Element {
  const converted = field.linksTo
    ? linkRef(field, raw, path, targets, reading)
    : typeof raw === "string"
      ? convert(field, raw)
      : error("format");
  if (converted.kind !== "value") return converted;
  const broken = brokenLimit(field, converted.value, reading);
  return broken ? error(broken) : converted;
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

/**
 * The quote holds the value: the whole text as words (a summary longer than
 * its quotes is never verified), the number as the source writes it in one
 * unambiguous way, or nothing more for a value that needs only the quote.
 */
function holdsProbe(probe: Probe, quote: string): boolean {
  if (probe.kind === "found") return true;
  if (probe.kind === "number")
    return numbersIn(quote).some((number) => isSameNumber(number, probe.value));
  return probe.texts.some((text) => holds(quote, text));
}

function isSameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Two values of a list are the same record or the same choice. */
function keyOf(value: AiSingleValue): string {
  return typeof value === "object"
    ? JSON.stringify(value)
    : `${typeof value}:${String(value)}`;
}

// ─── One field, one entity ───────────────────────────────────────────────────

function field(
  asked: AiContractField,
  raw: unknown,
  quotes: AiQuote[],
  path: string,
  targets: LinkTargets | undefined,
  reading: Reading,
): AiFieldOutcome {
  const found = quotes.filter((quote) => quote.found);
  const isHeld = (probe: Probe) =>
    found.some((quote) => holdsProbe(probe, quote.quote));
  const discard = (reason: AiDiscardReason): AiFieldOutcome => ({
    status: "discarded",
    reason,
    proposed: raw,
    quotes,
  });

  if (!asked.multiple) {
    const one = element(asked, raw, path, targets, reading);
    if (one.kind === "empty") return { status: "empty" };
    if (one.kind === "error") return discard(one.reason);
    return {
      status: "filled",
      value: one.value,
      verified: isHeld(one.probe),
      quotes,
    };
  }

  if (!Array.isArray(raw)) return discard("format");
  const kept = new Map<string, Extract<Element, { kind: "value" }>>();
  const dropped: AiDroppedValue[] = [];
  raw.forEach((proposed: unknown, index) => {
    const one = element(asked, proposed, `${path}[${index}]`, targets, reading);
    if (one.kind === "error") dropped.push({ proposed, reason: one.reason });
    if (one.kind === "value" && !kept.has(keyOf(one.value)))
      kept.set(keyOf(one.value), one);
  });
  const values = [...kept.values()];
  const [firstDropped] = dropped;
  if (!values.length && firstDropped) return discard(firstDropped.reason);
  if (!values.length) return { status: "empty" };
  const { minItems, maxItems } = asked.constraints;
  if (maxItems !== undefined && values.length > maxItems)
    return discard("too-many-values");
  const tooFew = minItems !== undefined && values.length < minItems;
  const isEveryHeld = values.every((one) => isHeld(one.probe));
  return {
    status: "filled",
    value: values.map((one) => one.value),
    verified: isEveryHeld && !dropped.length && !tooFew,
    quotes,
    ...(dropped.length ? { dropped } : {}),
    ...(tooFew ? { tooFew } : {}),
  };
}

function unknownProperties(
  record: Record<string, unknown>,
  known: readonly string[],
  path: string,
  reading: Reading,
): void {
  for (const name of Object.keys(record))
    if (!known.includes(name))
      reading.warnings.push({
        kind: "unknown-property",
        path: `${path}.${name}`,
      });
}

/** The quotes of an entity's answer, by property name. */
function quotesOf(
  entity: AiContractEntity,
  evidence: unknown,
  path: string,
  reading: Reading,
): Map<string, AiQuote[]> {
  const byWire = new Map<string, AiQuote[]>();
  if (!Array.isArray(evidence)) {
    reading.warnings.push({
      kind: "unexpected-shape",
      path: `${path}.evidence`,
    });
    return byWire;
  }
  const wires = new Set(entity.fields.map((asked) => asked.wire));
  evidence.forEach((entry: unknown, index) => {
    const at = `${path}.evidence[${index}]`;
    const name = isRecord(entry) ? entry.field : undefined;
    const quote = isRecord(entry) ? entry.quote : undefined;
    const written = isRecord(entry) ? entry.where : undefined;
    const isEntry = typeof name === "string" && typeof quote === "string";
    if (!isEntry) {
      reading.warnings.push({ kind: "unexpected-shape", path: at });
      return;
    }
    const wire = name.trim();
    if (!wires.has(wire)) {
      reading.warnings.push({ kind: "unknown-field", path: at, field: name });
      return;
    }
    const found = !!reading.readings && isQuoted(reading.readings, quote);
    const where = typeof written === "string" ? written : "";
    byWire.set(wire, [...(byWire.get(wire) ?? []), { quote, where, found }]);
  });
  return byWire;
}

function entityFields(
  entity: AiContractEntity,
  values: unknown,
  evidence: unknown,
  path: string,
  targets: LinkTargets | undefined,
  reading: Reading,
): AiFieldOutcomes {
  const valuesPath = `${path}.values`;
  const record = isRecord(values) ? values : {};
  if (!isRecord(values))
    reading.warnings.push({ kind: "unexpected-shape", path: valuesPath });
  unknownProperties(
    record,
    entity.fields.map((asked) => asked.wire),
    valuesPath,
    reading,
  );
  // Quotes count only when the contract asks for them.
  const quotes =
    entity.evidence && isRecord(values)
      ? quotesOf(entity, evidence, path, reading)
      : new Map<string, AiQuote[]>();
  return Object.fromEntries(
    entity.fields.map((asked): [string, AiFieldOutcome] => {
      const at = `${valuesPath}.${asked.wire}`;
      const isGiven = Object.hasOwn(record, asked.wire);
      if (!isGiven && isRecord(values))
        reading.warnings.push({ kind: "unexpected-shape", path: at });
      const raw = isGiven ? record[asked.wire] : undefined;
      if (raw === undefined) return [asked.key, { status: "empty" }];
      const outcome = field(
        asked,
        raw,
        quotes.get(asked.wire) ?? [],
        at,
        targets,
        reading,
      );
      return [asked.key, outcome];
    }),
  );
}

function readingOf(options: SanitizeOptions): Reading {
  return {
    ...(options.source !== undefined
      ? { readings: searchableSource(options.source) }
      : {}),
    warnings: [],
    unreadable: new Set(),
  };
}

// ─── Sanitizing ──────────────────────────────────────────────────────────────

/**
 * Reads the answer to a `fill` contract: one outcome per field, by key, and
 * the warnings about what could not be used.
 *
 * @param contract The contract the answer was asked with.
 * @param answer The answer, parsed from JSON: outside data, of any shape.
 * @param options `source`, the text the quotes are searched in.
 * @returns Plain JSON: the gateway sends it to the browser.
 *
 * @example
 * const result = sanitizeFillAnswer(contract, JSON.parse(text), { source });
 * // result.fields.title → { status: "filled", value: "…", verified: true, quotes: […] }
 */
export function sanitizeFillAnswer(
  contract: AiFillContract,
  answer: unknown,
  options: SanitizeOptions = {},
): AiFillResult {
  const reading = readingOf(options);
  const isObject = isRecord(answer);
  const readable = isObject && isRecord(answer.values);
  const known = contract.entity.evidence ? ["values", "evidence"] : ["values"];
  if (isObject) unknownProperties(answer, known, "$", reading);
  else reading.warnings.push({ kind: "unexpected-shape", path: "$" });
  const fields = entityFields(
    contract.entity,
    isObject ? answer.values : undefined,
    isObject ? answer.evidence : undefined,
    "$",
    undefined,
    reading,
  );
  return { readable, fields, warnings: reading.warnings };
}

/**
 * Reads the answer to an `extract` contract: its items, each with its type,
 * its `ref` and one outcome per field. A link to another item stays only
 * when that item exists, has the linked type and is not the item itself.
 *
 * @param contract The contract the answer was asked with.
 * @param answer The answer, parsed from JSON: outside data, of any shape.
 * @param options `source`, the text the quotes are searched in.
 * @returns Plain JSON: the gateway sends it to the browser.
 */
export function sanitizeExtractAnswer(
  contract: AiExtractContract,
  answer: unknown,
  options: SanitizeOptions = {},
): AiExtractResult {
  const reading = readingOf(options);
  const isObject = isRecord(answer);
  const items =
    isObject && Array.isArray(answer.items) ? answer.items : undefined;
  if (isObject) unknownProperties(answer, ["items"], "$", reading);
  if (!items) {
    reading.warnings.push({
      kind: "unexpected-shape",
      path: isObject ? "$.items" : "$",
    });
    return { readable: false, items: [], warnings: reading.warnings };
  }

  const entities = new Map(
    contract.entities.map((entity) => [entity.type ?? "", entity]),
  );
  // First the items and their refs, so a link may point forwards. An item
  // without values is no record: it is skipped, and nothing points to it.
  const read = items.flatMap((raw: unknown, index) => {
    const path = `$.items[${index}]`;
    const type = isRecord(raw) && typeof raw.type === "string" ? raw.type : "";
    const entity = isRecord(raw) ? entities.get(type) : undefined;
    if (!isRecord(raw) || !entity) {
      reading.warnings.push(
        isRecord(raw)
          ? { kind: "unknown-type", path: `${path}.type`, type }
          : { kind: "unexpected-shape", path },
      );
      return [];
    }
    if (!isRecord(raw.values)) {
      reading.warnings.push({
        kind: "unexpected-shape",
        path: `${path}.values`,
      });
      return [];
    }
    const known = [
      "type",
      "ref",
      "values",
      ...(entity.evidence ? ["evidence"] : []),
    ];
    unknownProperties(raw, known, path, reading);
    const written = typeof raw.ref === "string" ? raw.ref.trim() : "";
    return [{ raw, path, type, entity, written }];
  });

  // A ref two items share names neither: links to it are dropped.
  const counts = new Map<string, number>();
  for (const { written } of read)
    counts.set(written, (counts.get(written) ?? 0) + 1);
  const refs = new Map<string, string>();
  for (const { written, type, path } of read) {
    const isUsable = written !== "" && counts.get(written) === 1;
    if (isUsable) refs.set(written, type);
    else
      reading.warnings.push({
        kind: "repeated-ref",
        path: `${path}.ref`,
        ref: written,
      });
  }

  const extracted = read.map(
    ({ raw, path, type, entity, written }): AiExtractedItem => ({
      type,
      ref: refs.has(written) ? written : "",
      fields: entityFields(
        entity,
        raw.values,
        raw.evidence,
        path,
        { refs, own: written },
        reading,
      ),
    }),
  );
  return { readable: true, items: extracted, warnings: reading.warnings };
}
