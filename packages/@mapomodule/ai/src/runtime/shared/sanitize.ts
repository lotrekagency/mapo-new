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
 * quote; a date writes its day and year, a time its hours and minutes, a
 * date and time both and its time zone; an address and rich text their
 * links; a point of a map its two coordinates in a row, told apart by their
 * hemispheres or their order. Yes/no and links to an item need a found
 * quote of two words or more. A list's items quote for themselves: a list
 * is verified only when every item is. The rules of what a quote must hold
 * can be changed (`AiVerificationRules`), never so far that a value is
 * verified without a quote found in the source. Without the source's text
 * nothing is verified.
 *
 * A field's patterns are tested only when their work has a small bound
 * (`patterns.ts`): they come from schemas that may come from outside, and a
 * pattern written to backtrack would stall the process. A value whose
 * pattern could not be tested, because it is too costly or JavaScript cannot
 * read it, is kept and never verified.
 */
import type { AiChoice } from "./entity";
import { isMultipleOf } from "./numbers";
import type {
  AiContractEntity,
  AiContractField,
  AiContractItems,
  AiExtractContract,
  AiFillContract,
} from "./contract";
import { AI_TEMPLATE_PROPERTY, quotableFields } from "./contract";
import {
  holds,
  isCalendarDate,
  isOneWord,
  isQuoted,
  numbersIn,
  pointsIn,
  searchableSource,
  writesDate,
  writesDateTime,
  writesLink,
  writesTime,
} from "./citations";
import type { CalendarDay, ClockTime, OneWordQuotes } from "./citations";
import { isRecord } from "./guards";
import { markdownLinks, markdownToHtml, markdownToText } from "./markdown";
import {
  MAX_ANSWER_PATTERN_STEPS,
  MAX_PATTERN_STEPS,
  patternCost,
  patternSteps,
} from "./patterns";
import type { PatternCost } from "./patterns";

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

/** A point of a map field, as the form saves it. */
export interface AiCoordinates {
  lat: number;
  lng: number;
}

/** One value of a field, typed for the form. */
export type AiSingleValue = AiScalar | AiRelationRef | AiCoordinates;

/**
 * One item of a list, as the form saves it: each value under its key, a
 * dotted key as nested objects (`seo.title` → `{ seo: { title } }`), and
 * `_template` when the items vary.
 */
export interface AiItemValue {
  [key: string]: AiValue | AiItemValue;
}

/** A field's value: a list for a multiple field, the items for a `list`. */
export type AiValue = AiSingleValue | AiSingleValue[] | AiItemValue[];

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
  /**
   * Found in the source's text, as whole words: two words or numbers at
   * least, or one the source writes once (by the `oneWordQuotes` rule).
   */
  found: boolean;
}

/** A value of a list taken out, and why. */
export interface AiDroppedValue {
  /** What the answer wrote. */
  proposed: unknown;
  reason: AiDiscardReason;
}

/** What became of one item of a `list`. */
export interface AiItemOutcome {
  /** The template the item follows, when the items vary. */
  template?: string;
  /** Each field of the item, by its key in the item. */
  fields: AiFieldOutcomes;
  /**
   * Every value the item gives is verified and none was discarded, it has
   * every value its fields require, and it repeats no item before it. An
   * item that follows a template is never verified: no quote can prove
   * which kind of block it is.
   */
  verified: boolean;
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
       * of a list and the list is long enough; for a `list`, every item is
       * verified. `useMapoAiFill()` applies a verified value on an empty
       * field without a preview, so anything less needs the operator.
       */
      verified: boolean;
      /** The quotes the answer gives for the field, found or not; a list's are in its items. */
      quotes: AiQuote[];
      /** For a `list`: each item, with the outcome of each of its fields. */
      items?: AiItemOutcome[];
      /** Values or items of a list taken out: the rest needs review. */
      dropped?: AiDroppedValue[];
      /** Fewer values or items than the list needs: kept, for review. */
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
 *   cannot read, not applied: the field's values are not verified;
 * - `unchecked-pattern`: a field's regular expression whose work on a value
 *   has no small bound (`patterns.ts`), not applied to it: the value is not
 *   verified.
 */
export type AiAnswerWarning =
  | { kind: "unexpected-shape"; path: string }
  | { kind: "unknown-property"; path: string }
  | { kind: "unknown-field"; path: string; field: string }
  | { kind: "unknown-type"; path: string; type: string }
  | { kind: "repeated-ref"; path: string; ref: string }
  | { kind: "unknown-item"; path: string; item: string }
  | { kind: "unreadable-pattern"; key: string; pattern: string }
  | { kind: "unchecked-pattern"; key: string; pattern: string };

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

/**
 * What a quote must hold for a value to be verified, rule by rule. Each
 * rule has a prudent default ({@link DEFAULT_VERIFICATION_RULES}); the
 * app's configuration and the admin's settings may change it. No rule makes
 * a value verified without a quote found in the source.
 */
export interface AiVerificationRules {
  /** The quote of a date writes its year, not only the day: `14 ottobre` verifies no date. */
  dateYear: boolean;
  /**
   * An hour alone counts as a time (`alle 21`): from 13 to 23, when it is
   * the only number of the quote besides the date's. Off, the quote writes
   * the minutes, am/pm or `h` (`21:00`, `9 pm`, `21h`).
   */
  bareHours: boolean;
  /**
   * A date and time verifies only with the time zone of its quote: the same
   * offset, or none on either side. A model that adds an offset the source
   * does not write (`Z`, `+02:00`) needs a check.
   */
  timeZones: boolean;
  /**
   * When a quote of one word or number counts: `"unique"`, when the source
   * writes it once (`impilabile`); `"never"`. Even then it verifies only a
   * value it is whole: a text, a label, a number; never a yes/no, a date or
   * a link to an item.
   */
  oneWordQuotes: OneWordQuotes;
  /** Rich text verifies only when its quote writes the address of each of its links too. */
  richTextLinks: boolean;
}

/**
 * The rules {@link sanitizeFillAnswer} and {@link sanitizeExtractAnswer}
 * apply when they are given none. Frozen: a change here would loosen every
 * check.
 */
export const DEFAULT_VERIFICATION_RULES: Readonly<AiVerificationRules> =
  Object.freeze({
    dateYear: true,
    bareHours: false,
    timeZones: true,
    oneWordQuotes: "unique",
    richTextLinks: true,
  });

/**
 * The verification rules a value gives, such as stored settings: each rule
 * with a value of its type, the default for the rest. Anything else, `null`
 * included, keeps the defaults: a malformed setting never loosens the check.
 *
 * @param value Outside data, of any shape.
 */
export function verificationRulesOf(value: unknown): AiVerificationRules {
  const given = isRecord(value) ? value : {};
  const own = (key: keyof AiVerificationRules): unknown =>
    Object.hasOwn(given, key) ? given[key] : undefined;
  const flag = (key: keyof AiVerificationRules, fallback: boolean) => {
    const rule = own(key);
    return typeof rule === "boolean" ? rule : fallback;
  };
  const oneWord = own("oneWordQuotes");
  const defaults = DEFAULT_VERIFICATION_RULES;
  return {
    dateYear: flag("dateYear", defaults.dateYear),
    bareHours: flag("bareHours", defaults.bareHours),
    timeZones: flag("timeZones", defaults.timeZones),
    oneWordQuotes:
      oneWord === "unique" || oneWord === "never"
        ? oneWord
        : defaults.oneWordQuotes,
    richTextLinks: flag("richTextLinks", defaults.richTextLinks),
  };
}

/** Options of {@link sanitizeFillAnswer} and {@link sanitizeExtractAnswer}. */
export interface SanitizeOptions {
  /** The source's text, where the quotes are searched. Without it nothing is verified. */
  source?: string;
  /**
   * The verification rules that differ from {@link DEFAULT_VERIFICATION_RULES},
   * read with {@link verificationRulesOf}: a rule with a value of the wrong
   * type keeps its default.
   */
  rules?: Partial<AiVerificationRules>;
}

// ─── One value ───────────────────────────────────────────────────────────────

/**
 * What a quote must hold for a value to be verified: one of some texts (the
 * value, its label), an address, rich text's words and links, a number, a
 * day, a time, or nothing more than being found (yes/no, a link to an item).
 * `unchecked`: a limit of the value could not be tested, so no quote
 * verifies it.
 */
type Probe =
  | { kind: "unchecked" }
  | { kind: "found" }
  | { kind: "text"; texts: string[] }
  | { kind: "coordinates"; lat: number; lng: number }
  | { kind: "link"; target: string }
  | { kind: "rich"; text: string; links: string[] }
  | { kind: "number"; value: number }
  | { kind: "date"; day: CalendarDay }
  | { kind: "time"; time: ClockTime }
  | {
      kind: "datetime";
      day: CalendarDay;
      time: ClockTime;
      /** The UTC offset in minutes; `undefined` when the value has none. */
      offset: number | undefined;
    };

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
  rules: AiVerificationRules;
  warnings: AiAnswerWarning[];
  /** Patterns already reported, unreadable or too costly, by field key. */
  unreadable: Set<string>;
  /** Each pattern's cost, read once per answer. */
  patternCosts: Map<string, PatternCost>;
  /** The steps the pattern tests of this answer may still take. */
  patternStepsLeft: number;
}

const empty: Element = { kind: "empty" };
const error = (reason: AiDiscardReason): Element => ({ kind: "error", reason });
const FOUND: Probe = { kind: "found" };
const UNCHECKED: Probe = { kind: "unchecked" };

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
      // The words and the links of the rich text, as a quote of the source would hold them.
      const probe: Probe = {
        kind: "rich",
        text: markdownToText(text),
        links: markdownLinks(text),
      };
      return { kind: "value", value: html, probe };
    }
    case "email": {
      const email = emailOf(text);
      return email ? asText(email) : error("format");
    }
    case "url":
      // The address as a whole: `teatro.it/biglietti/2027` is another one.
      return isWebUrl(text)
        ? { kind: "value", value: text, probe: { kind: "link", target: text } }
        : error("format");
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
      const calendarDay = {
        year: Number(year),
        month: Number(month),
        day: Number(day),
      };
      const isDate =
        !!year &&
        isCalendarDate(calendarDay.year, calendarDay.month, calendarDay.day);
      if (!isDate) return error("format");
      return {
        kind: "value",
        value: text,
        probe: { kind: "date", day: calendarDay },
      };
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
      const sign = zone.startsWith("-") ? -1 : 1;
      const offset =
        zone === ""
          ? undefined
          : sign * (Number(zoneHours) * 60 + Number(zoneMinutes));
      const probe: Probe = {
        kind: "datetime",
        day: { year: Number(year), month: Number(month), day: Number(day) },
        time: {
          hours: Number(hours),
          minutes: Number(minutes),
          seconds: Number(seconds),
        },
        offset,
      };
      return { kind: "value", value, probe };
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
      const time = {
        hours: Number(hours),
        minutes: Number(minutes),
        seconds: Number(seconds ?? 0),
      };
      return { kind: "value", value, probe: { kind: "time", time } };
    }
    case "choice": {
      const choice = listedChoice(field.choices, clean);
      if (!choice) return error("not-listed");
      return { kind: "value", value: choice.value, probe: listedProbe(choice) };
    }
    case "relation":
      return relationRef(field, clean);
    case "coordinates":
      return coordinatesOf(text);
    case "list":
      // A list is an array of items, read by `listOutcome()`.
      return error("format");
    default: {
      // A kind this version does not know, from a newer contract.
      const unknown: never = field.kind;
      void unknown;
      return error("format");
    }
  }
}

const COORDINATES =
  /^([+-]?\d{1,3}(?:\.\d+)?)\s*(?:,\s*|\s+)([+-]?\d{1,3}(?:\.\d+)?)$/;

/** A point as `latitude, longitude`, in decimal degrees with a dot, on the globe. */
function coordinatesOf(text: string): Element {
  const [, latText, lngText] = COORDINATES.exec(singleLine(text)) ?? [];
  if (!latText || !lngText) return error("format");
  const lat = Number(latText);
  const lng = Number(lngText);
  const isLatitude = Math.abs(lat) <= 90;
  const isLongitude = Math.abs(lng) <= 180;
  if (!isLatitude || !isLongitude) return error("format");
  return {
    kind: "value",
    value: { lat, lng },
    probe: { kind: "coordinates", lat, lng },
  };
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

/**
 * The first limit of the field the value breaks, if any; `unchecked` when
 * it breaks none of those tested but a pattern could not be tested.
 */
function brokenLimit(
  field: AiContractField,
  value: AiSingleValue,
  reading: Reading,
): AiDiscardReason | "unchecked" | undefined {
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
  let isUnchecked = false;
  for (const pattern of limits.patterns ?? []) {
    const expression = testablePattern(field, pattern, value, reading);
    const matches = expression ? tested(expression, value) : undefined;
    if (matches === false) return "pattern";
    if (matches === undefined) {
      isUnchecked = true;
      if (expression) reportUnchecked(field, pattern, reading);
    }
  }
  return isUnchecked ? "unchecked" : undefined;
}

/**
 * Whether `value` matches, or `undefined` when the matcher throws, as it
 * does when a value is long enough to exhaust its stack.
 */
function tested(expression: RegExp, value: string): boolean | undefined {
  try {
    return expression.test(value);
  } catch {
    return undefined;
  }
}

/**
 * A field's pattern, ready to test on `value`, when its work there has a
 * small bound and the answer's tests have steps left; otherwise
 * `undefined`, reported once per field and pattern.
 */
function testablePattern(
  field: AiContractField,
  pattern: string,
  value: string,
  reading: Reading,
): RegExp | undefined {
  const expression = regularExpression(field, pattern, reading);
  if (!expression) return undefined;
  let cost = reading.patternCosts.get(pattern);
  if (!cost) {
    cost = patternCost(pattern);
    reading.patternCosts.set(pattern, cost);
  }
  const steps = patternSteps(cost, value.length);
  const isCheap = steps <= MAX_PATTERN_STEPS;
  const isWithinAnswer = steps <= reading.patternStepsLeft;
  if (isCheap && isWithinAnswer) {
    reading.patternStepsLeft -= steps;
    return expression;
  }
  reportUnchecked(field, pattern, reading);
  return undefined;
}

/** Says once per field and pattern that the pattern could not be tested. */
function reportUnchecked(
  field: AiContractField,
  pattern: string,
  reading: Reading,
): void {
  const key = `${field.key}\u0000${pattern}`;
  if (reading.unreadable.has(key)) return;
  reading.unreadable.add(key);
  reading.warnings.push({ kind: "unchecked-pattern", key: field.key, pattern });
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
  if (broken === "unchecked") return { ...converted, probe: UNCHECKED };
  return broken ? error(broken) : converted;
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

/**
 * The quote holds the value: the whole text as words (a summary longer than
 * its quotes is never verified), with rich text's links; the number as the
 * source writes it in one unambiguous way; the day, the time and the time
 * zone as the rules ask; or nothing more for a value that needs only the
 * quote. A quote of one word holds only a value it is whole.
 */
function holdsProbe(
  probe: Probe,
  quote: string,
  rules: AiVerificationRules,
): boolean {
  const isOneWordQuote = isOneWord(quote);
  switch (probe.kind) {
    case "unchecked":
      return false;
    case "found":
      return !isOneWordQuote;
    case "text":
      return probe.texts.some((text) => holds(quote, text));
    case "link":
      return writesLink(quote, probe.target);
    case "rich": {
      const hasWords = holds(quote, probe.text);
      const hasLinks =
        !rules.richTextLinks ||
        probe.links.every((link) => writesLink(quote, link));
      return hasWords && hasLinks;
    }
    case "number":
      return numbersIn(quote).some((number) =>
        isSameNumber(number, probe.value),
      );
    case "coordinates":
      // The pair the quote writes, in its order and with its hemispheres.
      return pointsIn(quote).some(
        (point) =>
          isSameNumber(point.lat, probe.lat) &&
          isSameNumber(point.lng, probe.lng),
      );
    case "date":
      return (
        !isOneWordQuote &&
        writesDate(quote, probe.day, { year: rules.dateYear })
      );
    case "time":
      return (
        !isOneWordQuote &&
        writesTime(quote, probe.time, { bareHours: rules.bareHours })
      );
    case "datetime":
      return (
        !isOneWordQuote &&
        writesDateTime(quote, probe.day, probe.time, probe.offset, {
          year: rules.dateYear,
          bareHours: rules.bareHours,
          timeZone: rules.timeZones,
        })
      );
  }
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
  if (asked.kind === "list")
    return listOutcome(asked, raw, path, targets, reading);
  const found = quotes.filter((quote) => quote.found);
  const isHeld = (probe: Probe) =>
    found.some((quote) => holdsProbe(probe, quote.quote, reading.rules));
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

// ─── Lists ───────────────────────────────────────────────────────────────────

type ItemRead =
  | { kind: "empty" }
  | { kind: "error"; reason: AiDiscardReason }
  | { kind: "item"; outcome: AiItemOutcome; value: AiItemValue };

/**
 * A list, item by item: each item is read against its fields (its
 * template's, when the items vary) with its own quotes. An item without a
 * value is no item and is skipped; one that is not an object, names no
 * template of the list or has every value discarded is taken out. An item
 * that repeats one before it rests on the same quotes, so it is not
 * verified. The list is verified only when every item is, none was taken
 * out and it is long enough.
 */
function listOutcome(
  asked: AiContractField,
  raw: unknown,
  path: string,
  targets: LinkTargets | undefined,
  reading: Reading,
): AiFieldOutcome {
  const discard = (reason: AiDiscardReason): AiFieldOutcome => ({
    status: "discarded",
    reason,
    proposed: raw,
    quotes: [],
  });
  const items = asked.items;
  if (!items || !Array.isArray(raw)) return discard("format");

  const outcomes: AiItemOutcome[] = [];
  const values: AiItemValue[] = [];
  const dropped: AiDroppedValue[] = [];
  const seen = new Set<string>();
  raw.forEach((proposed: unknown, index) => {
    const read = readItem(
      items,
      proposed,
      `${path}[${index}]`,
      targets,
      reading,
    );
    if (read.kind === "error") dropped.push({ proposed, reason: read.reason });
    if (read.kind !== "item") return;
    const written = JSON.stringify(read.value);
    const isRepeated = seen.has(written);
    seen.add(written);
    outcomes.push(
      isRepeated ? { ...read.outcome, verified: false } : read.outcome,
    );
    values.push(read.value);
  });
  const [firstDropped] = dropped;
  if (!outcomes.length && firstDropped) return discard(firstDropped.reason);
  if (!outcomes.length) return { status: "empty" };
  const { minItems, maxItems } = asked.constraints;
  if (maxItems !== undefined && outcomes.length > maxItems)
    return discard("too-many-values");
  const tooFew = minItems !== undefined && outcomes.length < minItems;
  const isEveryItemVerified = outcomes.every((item) => item.verified);
  return {
    status: "filled",
    value: values,
    verified: isEveryItemVerified && !dropped.length && !tooFew,
    quotes: [],
    items: outcomes,
    ...(dropped.length ? { dropped } : {}),
    ...(tooFew ? { tooFew } : {}),
  };
}

/**
 * One item: verified when every value it gives is, it has every value its
 * fields require, and it follows no template, since no quote can prove
 * which kind of block it is.
 */
function readItem(
  items: AiContractItems,
  raw: unknown,
  path: string,
  targets: LinkTargets | undefined,
  reading: Reading,
): ItemRead {
  if (!isRecord(raw)) return { kind: "error", reason: "format" };
  const known = [
    ...(items.templates ? [AI_TEMPLATE_PROPERTY] : []),
    ...items.fields.map((asked) => asked.wire),
    ...(items.evidence ? ["evidence"] : []),
  ];
  unknownProperties(raw, known, path, reading);

  let fields = items.fields;
  let template: string | undefined;
  if (items.templates) {
    const named = raw[AI_TEMPLATE_PROPERTY];
    const key = typeof named === "string" ? named.trim() : "";
    const chosen = items.templates.find((one) => one.key === key);
    if (!chosen) return { kind: "error", reason: "not-listed" };
    template = chosen.key;
    const wires = new Set(chosen.wires);
    fields = items.fields.filter((asked) => wires.has(asked.wire));
  }

  const quotes = items.evidence
    ? quotesOf(quotableFields(fields), raw.evidence, path, reading)
    : new Map<string, AiQuote[]>();
  const outcomes = outcomesOf(fields, raw, quotes, path, targets, reading);
  const given = Object.values(outcomes).filter(
    (outcome) => outcome.status !== "empty",
  );
  // A model pads lists: an item without a value is no item.
  if (!given.length) return { kind: "empty" };
  const hasFilled = given.some((outcome) => outcome.status === "filled");
  const firstDiscarded = given.find(
    (outcome) => outcome.status === "discarded",
  );
  // Nothing of the item is left: it is taken out, with the first reason.
  if (!hasFilled && firstDiscarded?.status === "discarded")
    return { kind: "error", reason: firstDiscarded.reason };
  const isEveryValueVerified = given.every(
    (outcome) => outcome.status === "filled" && outcome.verified,
  );
  const isComplete = fields.every(
    (asked) => !asked.required || outcomes[asked.key]?.status === "filled",
  );
  return {
    kind: "item",
    outcome: {
      ...(template ? { template } : {}),
      fields: outcomes,
      verified: isEveryValueVerified && isComplete && !template,
    },
    value: itemValue(outcomes, template),
  };
}

/** An item as the form saves it: each filled value under its key, a dotted key as nested objects. */
function itemValue(
  outcomes: AiFieldOutcomes,
  template: string | undefined,
): AiItemValue {
  const item: AiItemValue = {};
  if (template) defineOwn(item, AI_TEMPLATE_PROPERTY, template);
  for (const [key, outcome] of Object.entries(outcomes)) {
    if (outcome.status === "filled") setAt(item, key.split("."), outcome.value);
  }
  return item;
}

/**
 * A property of the object's own, whatever its name: assigning `__proto__`
 * would change the object's prototype, or `Object.prototype` itself one
 * level down, instead of holding the value.
 */
function defineOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function setAt(
  target: AiItemValue,
  segments: readonly string[],
  value: AiValue,
): void {
  const [head, ...rest] = segments;
  if (head === undefined) return;
  if (!rest.length) {
    defineOwn(target, head, value);
    return;
  }
  const existing = Object.hasOwn(target, head) ? target[head] : undefined;
  const next: AiItemValue = isNestedObject(existing) ? existing : {};
  defineOwn(target, head, next);
  setAt(next, rest, value);
}

/**
 * An object `setAt()` built for a dotted key. Keys of one item never make a
 * value and a path of the same name, so an object there is one of these.
 */
function isNestedObject(
  value: AiValue | AiItemValue | undefined,
): value is AiItemValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every outcome of a result by the path of its value in the form, as the
 * form's annotations are keyed: a field inside a list's items under
 * `<list>.<index>.<key>` (`speakers.0.name`), at any depth, after the
 * outcome of the list itself. Indexes are those of the list's value, the
 * items left out and taken out aside.
 *
 * A value inside a list is applied with its list: only the list's own
 * `verified` lets it skip the preview, even when the outcome of a value
 * inside it is verified.
 *
 * @param fields The `fields` of a fill result, or of an extracted item.
 */
export function outcomesByPath(
  fields: AiFieldOutcomes,
): Record<string, AiFieldOutcome> {
  // A map, so a key such as `__proto__` stays data.
  const byPath = new Map<string, AiFieldOutcome>();
  const visit = (outcomes: AiFieldOutcomes, prefix: string): void => {
    for (const [key, outcome] of Object.entries(outcomes)) {
      const path = prefix ? `${prefix}.${key}` : key;
      byPath.set(path, outcome);
      if (outcome.status !== "filled" || !outcome.items) continue;
      outcome.items.forEach((item, index) =>
        visit(item.fields, `${path}.${index}`),
      );
    }
  };
  visit(fields, "");
  return Object.fromEntries(byPath);
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

/** The quotes of an entity's or an item's answer for `fields`, by property name. */
function quotesOf(
  fields: readonly AiContractField[],
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
  const wires = new Set(fields.map((asked) => asked.wire));
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
    const found =
      !!reading.readings &&
      isQuoted(reading.readings, quote, reading.rules.oneWordQuotes);
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
      ? quotesOf(quotableFields(entity.fields), evidence, path, reading)
      : new Map<string, AiQuote[]>();
  return outcomesOf(
    entity.fields,
    isRecord(values) ? record : undefined,
    quotes,
    valuesPath,
    targets,
    reading,
  );
}

/**
 * One outcome per field, from the object that holds the values: an
 * entity's `values` or an item. A property the object lacks is a warning,
 * unless the object itself is missing (already reported).
 */
function outcomesOf(
  fields: readonly AiContractField[],
  record: Record<string, unknown> | undefined,
  quotes: ReadonlyMap<string, AiQuote[]>,
  path: string,
  targets: LinkTargets | undefined,
  reading: Reading,
): AiFieldOutcomes {
  return Object.fromEntries(
    fields.map((asked): [string, AiFieldOutcome] => {
      const at = `${path}.${asked.wire}`;
      const isGiven = !!record && Object.hasOwn(record, asked.wire);
      if (!isGiven && record)
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
    rules: verificationRulesOf(options.rules),
    warnings: [],
    unreadable: new Set(),
    patternCosts: new Map(),
    patternStepsLeft: MAX_ANSWER_PATTERN_STEPS,
  };
}

// ─── Sanitizing ──────────────────────────────────────────────────────────────

/**
 * Reads the answer to a `fill` contract: one outcome per field, by key, and
 * the warnings about what could not be used.
 *
 * @param contract The contract the answer was asked with.
 * @param answer The answer, parsed from JSON: outside data, of any shape.
 * @param options `source`, the text the quotes are searched in; `rules`,
 * the verification rules that differ from the defaults.
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
 * @param options `source`, the text the quotes are searched in; `rules`,
 * the verification rules that differ from the defaults.
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
