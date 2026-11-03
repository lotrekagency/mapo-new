/**
 * Finding a quote of the AI in the source, and a value in a quote.
 *
 * Text is compared after the differences a copy may bring: case, Unicode
 * forms, typographic quotes, dashes and spaces, and the words a PDF splits
 * at the end of a line. Dates, times and links are read from the quote as
 * the source writes them.
 */
import { markdownToText } from "./markdown";

/** Typographic characters and their plain form. */
const PLAIN_FORMS: readonly [RegExp, string][] = [
  [/[\u2018\u2019\u201A\u201B\u2032`\u00B4]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, "-"],
  [/\u2026/g, "..."],
  [/\u00AD/g, ""],
];

function plainForms(text: string): string {
  return PLAIN_FORMS.reduce(
    (current, [pattern, plain]) => current.replace(pattern, plain),
    text.normalize("NFKC"),
  );
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Text as it is compared: Unicode compatibility forms, plain quotes and
 * dashes, one space for any run of white space, lower case.
 */
export function normalizeText(text: string): string {
  return collapse(plainForms(text));
}

/**
 * The source as it is searched, in two readings of a word split at the end
 * of a line (`lavo-\nri`): joined (`lavori`) and with the hyphen
 * (`lavo-ri`, for compounds such as `ex-\nministro`).
 */
export function searchableSource(source: string): string[] {
  const plain = plainForms(source);
  const joined = plain.replace(/(\p{L})-[ \t]*\r?\n\s*(\p{L})/gu, "$1$2");
  const hyphenated = plain.replace(/(\p{L})-[ \t]*\r?\n\s*(\p{L})/gu, "$1-$2");
  return [...new Set([collapse(joined), collapse(hyphenated)])];
}

/** A word or a number: what a quote must hold for it to count. */
const TOKEN = /[\p{L}\p{N}]+/gu;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The text as whole words: `ver` is not in `Verdi`, nor `20` in `2026`. */
function wholeWords(text: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(text)}(?![\\p{L}\\p{N}])`,
    "gu",
  );
}

/** The text found in the reading as whole words, from `from` on: where it ends, or -1. */
function wholeWordsAt(reading: string, text: string, from: number): number {
  const pattern = wholeWords(text);
  pattern.lastIndex = from;
  const match = pattern.exec(reading);
  return match ? match.index + match[0].length : -1;
}

/** Quotes shorter than this, in words and numbers, are found anywhere and prove nothing. */
const QUOTE_TOKENS = 2;

/**
 * When a quote of one word or number counts as found: `"unique"` when the
 * source writes that word in one place only, `"never"`.
 */
export type OneWordQuotes = "unique" | "never";

/** A quote of one word or number, or of none. */
export function isOneWord(quote: string): boolean {
  return (normalizeText(quote).match(TOKEN) ?? []).length < QUOTE_TOKENS;
}

/**
 * The quote is in the source, as whole words: `ver` is not found inside
 * `Verdi`, nor `20` inside `2026`. A quote that skips words
 * with `...` is found when each of its parts is, in order. A quote of one
 * word or number would be anywhere: it is found only with `oneWord`
 * `"unique"`, when the source writes the word once (`impilabile`, never
 * `il`).
 *
 * @param readings The source from `searchableSource()`.
 * @param oneWord When a quote of one word or number counts.
 */
export function isQuoted(
  readings: readonly string[],
  quote: string,
  oneWord: OneWordQuotes,
): boolean {
  const parts = normalizeText(quote)
    .split("...")
    .map((part) => part.trim())
    .filter(Boolean);
  const tokens = parts.flatMap((part) => part.match(TOKEN) ?? []);
  const hasWords = parts.every((part) => /[\p{L}\p{N}]/u.test(part));
  const isBlank = !parts.length || !hasWords;
  if (isBlank) return false;
  const [word = ""] = tokens;
  const isOneToken = tokens.length < QUOTE_TOKENS;
  if (isOneToken) {
    // One word means one part: the word itself, and what it is written with.
    const [part = ""] = parts;
    const isFound = readings.some(
      (reading) => wholeWordsAt(reading, part, 0) >= 0,
    );
    const timesWritten = Math.max(
      ...readings.map(
        (reading) => [...reading.matchAll(wholeWords(word))].length,
      ),
    );
    return oneWord === "unique" && isFound && timesWritten === 1;
  }
  return readings.some((reading) => {
    let from = 0;
    for (const part of parts) {
      from = wholeWordsAt(reading, part, from);
      if (from < 0) return false;
    }
    return true;
  });
}

/**
 * One text holds the other as whole words, after normalization: `Verdi`
 * holds `Verdi` but not `ver`. The container is also read without the
 * markup of restricted Markdown, as a quote of a Markdown source carries
 * it: `**Grande festa** per tutti` holds `Grande festa per tutti`. A blank
 * text holds nothing.
 */
export function holds(container: string, contained: string): boolean {
  const inner = normalizeText(contained);
  if (inner === "") return false;
  const readings = [
    normalizeText(container),
    normalizeText(markdownToText(container)),
  ];
  return readings.some((reading) => wholeWordsAt(reading, inner, 0) >= 0);
}

/** An address as a text writes it: without the scheme and a trailing slash. */
function addressOf(target: string): string {
  return normalizeText(target)
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

/**
 * Where an address ends in a text: at the end, at a space or a closing
 * bracket or quote, or at punctuation that closes a sentence. Anything else
 * goes on with the address: `?evento=42`, `#posti`, `.html`, `.example.com`.
 */
const ADDRESS_END = String.raw`(?=$|[\s)\]>"']|[.,;:!?](?:$|[\s)\]>"']))`;

/**
 * The quote writes the link's address, with the scheme or without:
 * `https://teatro.it/biglietti` or `teatro.it/biglietti`. A longer address
 * (`teatro.it/biglietti/2027`, `teatro.it/biglietti?evento=42`), another
 * host (`nuovoteatro.it`, `www.teatro.it`, `teatro.it.example.com`) or an
 * email on the host (`info@teatro.it`) is another address.
 *
 * @param target The link's address, as the value writes it.
 */
export function writesLink(quote: string, target: string): boolean {
  const address = addressOf(target);
  if (!address) return false;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}._@-])${escapeRegExp(address)}/?${ADDRESS_END}`,
    "u",
  );
  return pattern.test(normalizeText(quote));
}

/**
 * A number in digits, with the separators it may carry: dots, commas,
 * apostrophes and non-breaking spaces. A plain space separates two numbers
 * ("Via Roma 1 20121").
 */
const NUMBER = /[-+\u2212]?\d(?:[\d.,'\u00A0\u202F]*\d)?/g;

/** Thousands groups after the first: three digits each. */
function isGrouped(groups: readonly string[]): boolean {
  const [first = "", ...rest] = groups;
  return (
    /^\d{1,3}$/.test(first) && rest.every((group) => /^\d{3}$/.test(group))
  );
}

/**
 * The value of one number as written, or `undefined` when it is not a
 * number or could be two:
 * - with a dot and a comma, the last one marks the decimals (`1.234,5`);
 * - with one of them repeated, it groups thousands (`1.234.567`);
 * - with one of them once, it marks the decimals, unless three digits
 *   follow: `1.500` is 1500 or 1.5, so it is no number at all;
 * - apostrophes and non-breaking spaces group thousands (`1'200`).
 */
function readNumber(token: string): number | undefined {
  const signed = token.replace("\u2212", "-");
  const sign = /^[-+]/.test(signed) ? signed.charAt(0) : "";
  const body = signed.slice(sign.length);
  const grouped = body.split(/['\u00A0\u202F]/);
  const dots = (body.match(/\./g) ?? []).length;
  const commas = (body.match(/,/g) ?? []).length;
  const hasSpacers = grouped.length > 1;

  let decimal: "." | "," | undefined;
  if (dots && commas)
    decimal = body.lastIndexOf(".") > body.lastIndexOf(",") ? "." : ",";
  else if (dots === 1 || commas === 1) {
    const separator = dots ? "." : ",";
    const after = body.slice(body.indexOf(separator) + 1);
    const isAmbiguous = /^\d{3}$/.test(after) && !hasSpacers;
    if (isAmbiguous) return undefined;
    decimal = separator;
  }
  const [whole = "", fraction] = decimal ? body.split(decimal) : [body];
  const thousands = whole.split(/[.,'\u00A0\u202F]/);
  const isWritten =
    (thousands.length === 1 ? /^\d+$/.test(whole) : isGrouped(thousands)) &&
    (fraction === undefined || /^\d+$/.test(fraction));
  if (!isWritten) return undefined;
  return Number(
    `${sign}${thousands.join("")}${fraction ? `.${fraction}` : ""}`,
  );
}

/**
 * The numbers a text writes in digits, each read only if it can mean one
 * number: `12,5` is 12.5, `1.234,56` is 1234.56, `1'200` is 1200; `1.500`
 * (1500 or 1.5) is left out, so it verifies nothing.
 */
export function numbersIn(text: string): number[] {
  const found = new Set<number>();
  // The raw text: Unicode forms would turn a non-breaking space into a space.
  for (const [token] of text.matchAll(NUMBER)) {
    const value = readNumber(token);
    if (value !== undefined) found.add(value);
  }
  return [...found];
}

// ─── Points of a map ─────────────────────────────────────────────────────────

/** A point of a map, in decimal degrees. */
export interface MapPoint {
  lat: number;
  lng: number;
}

/** The letters of the hemispheres, with the axis and the sign each gives: `O` is west in Italian, Spanish and French. */
const HEMISPHERES: Readonly<
  Record<string, { axis: "lat" | "lng"; sign: number }>
> = {
  N: { axis: "lat", sign: 1 },
  S: { axis: "lat", sign: -1 },
  E: { axis: "lng", sign: 1 },
  W: { axis: "lng", sign: -1 },
  O: { axis: "lng", sign: -1 },
};

/**
 * A coordinate: a sign, up to three digits, decimals after a dot or a
 * comma, a degree sign. A comma after decimals with a dot separates (`45.46,9.19`);
 * after decimals with a comma it could go on (`45,46,9`), so it reads nothing.
 */
const DEGREES = String.raw`([-+−]?)(\d{1,3}(?:\.\d+(?!\.\p{N})|,\d+(?![.,]\p{N})|(?![.,]\p{N}))(?!\p{N}))(\s?[°º])?`;
const LETTER_BEFORE = String.raw`(?:([NSEWO])\s*)?`;
const LETTER_AFTER = String.raw`(?:(\s*)([NSEWO])(?![\p{L}\p{N}]))?`;
/** Between the two coordinates: a comma, a semicolon, a slash, spaces, or "and". */
const BETWEEN = String.raw`(?:\s*[,;/]\s*|\s+(?:e|and|et|y|und|en)\s+|\s+)`;
const POINT = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,])${LETTER_BEFORE}${DEGREES}${LETTER_AFTER}${BETWEEN}${LETTER_BEFORE}${DEGREES}${LETTER_AFTER}`,
  "gu",
);

/** A coordinate as the quote writes it. */
interface WrittenCoordinate {
  degrees: number;
  letter?: string;
  /** It reads as a coordinate: with decimals, a degree sign or a letter. */
  isMarked: boolean;
  /** A minus or a plus: with a letter too, the two could disagree. */
  isSigned: boolean;
}

function coordinate(
  sign: string | undefined,
  number: string,
  degree: string | undefined,
  letter: string | undefined,
): WrittenCoordinate {
  const magnitude = Number(number.replace(",", "."));
  const isNegative = sign === "-" || sign === "−";
  return {
    degrees: isNegative ? -magnitude : magnitude,
    ...(letter ? { letter } : {}),
    isMarked: /[.,]/.test(number) || !!degree || !!letter,
    isSigned: !!sign,
  };
}

/** The point two coordinates in a row write: their letters say which is which, otherwise the latitude comes first. */
function pointOf(
  first: WrittenCoordinate,
  second: WrittenCoordinate,
): MapPoint | undefined {
  const isCoordinate = (one: WrittenCoordinate) =>
    one.isMarked && !(one.isSigned && one.letter);
  if (!isCoordinate(first) || !isCoordinate(second)) return undefined;
  const hemisphereOf = (one: WrittenCoordinate) =>
    one.letter ? HEMISPHERES[one.letter] : undefined;
  const firstHemisphere = hemisphereOf(first);
  const secondHemisphere = hemisphereOf(second);
  const isSameAxis =
    !!firstHemisphere && firstHemisphere.axis === secondHemisphere?.axis;
  if (isSameAxis) return undefined;
  const firstValue = first.degrees * (firstHemisphere?.sign ?? 1);
  const secondValue = second.degrees * (secondHemisphere?.sign ?? 1);
  const isLongitudeFirst =
    firstHemisphere?.axis === "lng" || secondHemisphere?.axis === "lat";
  const lat = isLongitudeFirst ? secondValue : firstValue;
  const lng = isLongitudeFirst ? firstValue : secondValue;
  const isOnGlobe = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return isOnGlobe ? { lat, lng } : undefined;
}

/**
 * The points a text writes: two coordinates in a row, read left to right.
 * Each coordinate has decimals, a degree sign or a hemisphere letter
 * (`N`, `S`, `E`, `W`, `O`), before it or after it; the letters, or else
 * the order, say which is the latitude: `45,4642 N e 9,1900 E`,
 * `N 45.4642, E 9.1900` and `9.19 E, 45.46 N` write one point each, while
 * `45 posti, 9 euro` and degrees with minutes and seconds write none.
 */
export function pointsIn(text: string): MapPoint[] {
  const points: MapPoint[] = [];
  // A pattern of its own: the scan moves its `lastIndex`.
  const pattern = new RegExp(POINT.source, POINT.flags);
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const [
      written,
      firstBefore,
      firstSign,
      firstNumber = "",
      firstDegree,
      ,
      firstAfter,
      secondBefore,
      secondSign,
      secondNumber = "",
      secondDegree,
      secondSpaces = "",
      secondAfter,
    ] = match;
    // Letters written before the numbers: the one after the first is the second's.
    const isLetterFirst = firstBefore !== undefined;
    const firstLetter = isLetterFirst ? firstBefore : firstAfter;
    const secondLetters = (
      isLetterFirst ? [firstAfter, secondBefore] : [secondBefore, secondAfter]
    ).filter((letter) => letter !== undefined);
    const point =
      secondLetters.length > 1
        ? undefined
        : pointOf(
            coordinate(firstSign, firstNumber, firstDegree, firstLetter),
            coordinate(
              secondSign,
              secondNumber,
              secondDegree,
              secondLetters[0],
            ),
          );
    const end = match.index + written.length;
    if (!point) {
      // The second coordinate may start a point of its own; the first is
      // never read again, without the letter it has before it.
      const firstEnd = written.indexOf(firstNumber) + firstNumber.length;
      pattern.lastIndex = match.index + firstEnd;
      continue;
    }
    points.push(point);
    // With letters first, a letter after the second belongs to what follows.
    const isNextLetter = isLetterFirst && secondAfter !== undefined;
    pattern.lastIndex = isNextLetter
      ? end - secondSpaces.length - secondAfter.length
      : end;
  }
  return points;
}

// ─── Dates and times ─────────────────────────────────────────────────────────

/** A day of the calendar. */
export interface CalendarDay {
  year: number;
  /** From 1 to 12. */
  month: number;
  /** From 1 to 31. */
  day: number;
}

/** A time of day, on the 24-hour clock. */
export interface ClockTime {
  hours: number;
  minutes: number;
  seconds: number;
}

/** The day exists: not 30 February, not month 13. */
export function isCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** A day a quote writes. */
interface WrittenDay {
  day: number;
  month: number;
  /** The year in four digits; `undefined` when the quote gives none. */
  year?: number;
  /** The last two digits, when the quote writes only those: `26`. */
  shortYear?: number;
}

/** A time a quote writes, with the time zone written right after it. */
interface WrittenTime extends ClockTime {
  /**
   * The UTC offset in minutes (`Z`, `+02:00`, `UTC+2`), `"named"` for a zone
   * named by letters (`CET`), `undefined` when none follows the time.
   */
  zone: number | "named" | undefined;
}

/** What a quote writes about a moment. */
interface WrittenMoment {
  /** The days written in digits that read one way, and those written with a month in words. */
  days: WrittenDay[];
  /** The times written with their minutes or with am/pm. */
  times: WrittenTime[];
  /** A time zone written apart from any time: `orari in UTC`. */
  hasZoneApart: boolean;
  /** The whole numbers left once the rest is read, each as often as written. */
  numbers: number[];
}

/** `2026-10-14`, `2026/10/14`, `2026.10.14`: the year first. */
const YEAR_FIRST =
  /(?<![\p{N}./-])(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?!\p{N}|[./-]\p{N})/gu;
/** `14/10/2026`, `10/14/26`, `14.10.2026`, `14-10-2026`: the year last. */
const YEAR_LAST =
  /(?<![\p{N}./-])(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})(?!\p{N}|[./-]\p{N})/gu;
/** Three numbers joined like a date that is none of the above: `14/10/2026-16`. */
const NUMBERS_LIKE_A_DATE = /\d+([-/.])\d+\1\d+(?:\1\d+)*/gu;
/**
 * `21:00`, `21.30`, `9:30:15`, `21:00:00.000`, `21h30`. Never the digits of
 * an offset: `+01:00`, `GMT-05:00`.
 */
const CLOCK =
  /(?<![\p{N}.:+])(?<!(?:UTC|GMT) ?-)(\d{1,2})(?:([:.])(\d{2})(?:\2(\d{2})(?:[.,]\d{1,9})?)?|h(\d{2}))(?!\p{N}|[.:]\p{N})/giu;
/** An hour of the 12-hour clock: `9 pm`, `9pm`, `9 p.m.`. */
const MERIDIEM_HOUR =
  /(?<![\p{N}.:])(\d{1,2}) ?([ap])\.? ?m\.?(?![\p{L}\p{N}])/giu;
/** am or pm right after a time: ` pm`, `p.m.`. */
const MERIDIEM_AFTER = /^ ?([ap])\.? ?m\.?(?![\p{L}\p{N}])/iu;
/** UTC right after a time: `21:00Z`, `21:00 Z`. */
const ZULU_AFTER = /^ ?Z(?![\p{L}\p{N}])/u;
/**
 * An offset glued to a time: `21:00+02:00`, `T21:00:00-0500`. A minus
 * counts only after the time of an ISO date and time: in prose,
 * `21:00-23:00` is a range.
 */
const PLUS_OFFSET_AFTER = /^(\+)(\d{2}):?(\d{2})(?!\p{N})/u;
const MINUS_OFFSET_AFTER = /^(-)(\d{2}):?(\d{2})(?!\p{N})/u;
/** `UTC` or `GMT` after a time, with an offset or not: ` UTC+2`, ` (GMT+01:00)`. */
const UTC_AFTER =
  /^ ?\(?(?:UTC|GMT)(?: ?([+-])(\d{1,2})(?::?(\d{2}))?)?\)?(?![\p{L}\p{N}])/iu;
/** A time zone named by letters after a time: ` CET`, ` (CEST)`. */
const NAMED_AFTER = /^ ?\(?(?!GMT)[A-Z]{2,4}T\)?(?!\p{L})/u;
/** `UTC` or `GMT` anywhere, with an offset or not. */
const UTC_ANYWHERE =
  /(?<!\p{L})(?:UTC|GMT)(?: ?[+-]\d{1,2}(?::?\d{2})?)?(?![\p{L}\p{N}])/giu;
/** A time zone named by letters anywhere: `CET`, `EST`. */
const NAMED_ANYWHERE = /(?<!\p{L})(?!GMT)[A-Z]{2,4}T(?!\p{L})/u;
/**
 * A day with its month in words, and its year or not: `14 ottobre 2026`,
 * `1° ottobre`, `14. Oktober 2026`, `14th of October 2026`,
 * `14 de octubre de 2026`.
 */
const DAY_MONTH =
  /(?<![\p{N}.,:])(\d{1,2})(?:st|nd|rd|th|er|°|o|\.)? (?:of |de )?(\p{L}{3,}\.?)(?:,? (?:de )?(\d{4}))?(?![\p{L}\p{N}])/giu;
/** A month in words, then the day, and the year or not: `October 14th, 2026`, `Oct. 14`. */
const MONTH_DAY =
  /(?<!\p{L})(\p{L}{3,}\.?) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?(?![\p{L}\p{N}])/giu;
/** A whole number: not a part of `1.500`, `12,5` or `4.25`. */
const WHOLE_NUMBER = /(?<![\p{N}.,])\d+(?!\p{N}|[.,]\p{N})/gu;

/** The languages whose month names a date in words may use. */
const MONTH_LOCALES = ["it", "en", "fr", "de", "es", "pt", "nl"];

let monthNames: ReadonlyMap<string, number> | undefined;

function monthKey(word: string): string {
  return plainForms(word).toLowerCase().replace(/\.$/, "");
}

/**
 * Every month name of {@link MONTH_LOCALES}, full and short, as the
 * runtime's `Intl` writes them: `ottobre`, `oct`, `okt`. A name two
 * languages give to two months names neither.
 */
function readMonthNames(): ReadonlyMap<string, number> {
  const names = new Map<string, number>();
  for (const locale of MONTH_LOCALES)
    for (const length of ["long", "short"] as const) {
      const format = new Intl.DateTimeFormat(locale, {
        month: length,
        timeZone: "UTC",
      });
      for (let month = 1; month <= 12; month += 1) {
        const name = monthKey(format.format(Date.UTC(2026, month - 1, 15)));
        const known = names.get(name);
        names.set(name, known === undefined || known === month ? month : 0);
      }
    }
  return names;
}

/** The month a word names, or `undefined`. */
function monthOf(word: string): number | undefined {
  monthNames ??= readMonthNames();
  const month = monthNames.get(monthKey(word));
  return month ? month : undefined;
}

/**
 * A day written with the year last: `14/10/2026` is 14 October, and
 * `10/14/2026` too; `03/04/2026`, 3 April or 4 March, is no day at all.
 */
function yearLastDay(
  first: number,
  second: number,
  year: string,
): WrittenDay | undefined {
  const isShortYear = year.length === 2;
  // Two digits: the calendar of this century decides the 29 February.
  const calendarYear = isShortYear ? 2000 + Number(year) : Number(year);
  const isDayMonth = isCalendarDate(calendarYear, second, first);
  const isMonthDay = isCalendarDate(calendarYear, first, second);
  const isAmbiguous = isDayMonth && isMonthDay && first !== second;
  const isNoDay = !isDayMonth && !isMonthDay;
  if (isAmbiguous || isNoDay) return undefined;
  const [month, day] = isDayMonth ? [second, first] : [first, second];
  return isShortYear
    ? { day, month, shortYear: Number(year) }
    : { day, month, year: Number(year) };
}

/** The hour of a 12-hour clock on the 24-hour one: `12 am` is 0, `9 pm` is 21. */
function fromMeridiem(hours: number, meridiem: string): number | undefined {
  const isTwelveHour = hours >= 1 && hours <= 12;
  if (!isTwelveHour) return undefined;
  const isAfternoon = meridiem.toLowerCase() === "p";
  return (hours % 12) + (isAfternoon ? 12 : 0);
}

function offsetOf(sign: string, hours: string, minutes = "0"): number {
  const size = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -size : size;
}

/**
 * The text with what each match of the pattern takes blanked out: the
 * match, and what follows it when `read` gives a later end. `read` returns
 * `false` to leave a match as it is. A match inside what was taken is not
 * read. One pass, so the cost grows with the text, not with the matches.
 */
function take(
  text: string,
  pattern: RegExp,
  read: (match: RegExpMatchArray, end: number) => number | false | undefined,
): string {
  let out = "";
  let taken = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const isInsideTaken = start < taken;
    if (isInsideTaken) continue;
    const matchEnd = start + match[0].length;
    const result = read(match, matchEnd);
    if (result === false) continue;
    const end = result ?? matchEnd;
    out += text.slice(taken, start) + " ".repeat(end - start);
    taken = end;
  }
  return out + text.slice(taken);
}

/**
 * Reads what a quote writes about a moment, in an order that keeps each
 * piece from being read twice: dates in digits, then times with what
 * follows them (am/pm, a time zone), then time zones written apart, then
 * days with a month in words, and last the whole numbers that are left.
 * Each piece read is blanked out: `14.10.2026` is no time, and the `01:00`
 * of `GMT+01:00` is no time either.
 */
function readMoment(quote: string): WrittenMoment {
  const moment: WrittenMoment = {
    days: [],
    times: [],
    hasZoneApart: false,
    numbers: [],
  };
  let text = plainForms(quote).replace(/\s+/g, " ");

  text = take(text, YEAR_FIRST, ([, year, , month, day]) => {
    const isDay = isCalendarDate(Number(year), Number(month), Number(day));
    if (isDay)
      moment.days.push({
        day: Number(day),
        month: Number(month),
        year: Number(year),
      });
    return undefined;
  });
  text = take(text, YEAR_LAST, ([, first, , second, year = ""]) => {
    const day = yearLastDay(Number(first), Number(second), year);
    if (day) moment.days.push(day);
    return undefined;
  });
  // What looks like a date and is none gives no loose numbers either.
  text = take(text, NUMBERS_LIKE_A_DATE, () => undefined);

  // A time, then what is written right after it: am/pm, then a time zone.
  const readTime = (
    hours: number,
    minutes: number,
    seconds: number,
    end: number,
    isIso = false,
  ): number => {
    let at = end;
    let clock: number | undefined = hours;
    const meridiem = MERIDIEM_AFTER.exec(text.slice(at));
    if (meridiem) {
      clock = fromMeridiem(hours, meridiem[1] ?? "");
      at += meridiem[0].length;
    }
    const after = text.slice(at);
    const zulu = ZULU_AFTER.exec(after);
    const glued =
      PLUS_OFFSET_AFTER.exec(after) ??
      (isIso ? MINUS_OFFSET_AFTER.exec(after) : null);
    const utc = UTC_AFTER.exec(after);
    const named = NAMED_AFTER.exec(after);
    let zone: WrittenTime["zone"];
    if (zulu) {
      zone = 0;
      at += zulu[0].length;
    } else if (glued) {
      const [whole, sign = "+", offsetHours = "0", offsetMinutes] = glued;
      zone = offsetOf(sign, offsetHours, offsetMinutes);
      at += whole.length;
    } else if (utc) {
      const [whole, sign, offsetHours, offsetMinutes] = utc;
      zone =
        sign && offsetHours ? offsetOf(sign, offsetHours, offsetMinutes) : 0;
      at += whole.length;
    } else if (named) {
      zone = "named";
      at += named[0].length;
    }
    const isClock =
      clock !== undefined && clock < 24 && minutes < 60 && seconds < 60;
    if (isClock && clock !== undefined)
      moment.times.push({ hours: clock, minutes, seconds, zone });
    return at;
  };
  text = take(text, CLOCK, (match, end) => {
    const [, hours, , minutes, seconds, hMinutes] = match;
    // `T21:00` or `21:00:00`: the time of an ISO date and time.
    const isAfterT = /t/i.test(text.charAt((match.index ?? 0) - 1));
    const isIso = isAfterT || seconds !== undefined;
    return readTime(
      Number(hours),
      Number(minutes ?? hMinutes),
      Number(seconds ?? 0),
      end,
      isIso,
    );
  });
  text = take(text, MERIDIEM_HOUR, ([, hours, meridiem = ""], end) => {
    const clock = fromMeridiem(Number(hours), meridiem);
    return clock === undefined ? false : readTime(clock, 0, 0, end);
  });

  // A zone left once the times have taken theirs is written apart from them.
  text = take(text, UTC_ANYWHERE, () => {
    moment.hasZoneApart = true;
    return undefined;
  });
  if (NAMED_ANYWHERE.test(text)) moment.hasZoneApart = true;

  const readDayInWords = (day: string, word: string, year?: string) => {
    const month = monthOf(word);
    const isDay = !!month && isCalendarDate(2000, month, Number(day));
    if (!isDay) return false;
    moment.days.push({
      day: Number(day),
      month,
      ...(year ? { year: Number(year) } : {}),
    });
    return undefined;
  };
  text = take(text, DAY_MONTH, ([, day = "", word = "", year]) =>
    readDayInWords(day, word, year),
  );
  text = take(text, MONTH_DAY, ([, word = "", day = "", year]) =>
    readDayInWords(day, word, year),
  );

  moment.numbers = [...text.matchAll(WHOLE_NUMBER)].map(([digits]) =>
    Number(digits),
  );
  return moment;
}

/** The written day is the day: day and month always, the year as the rule asks. */
function isSameDay(
  written: WrittenDay,
  day: CalendarDay,
  checksYear: boolean,
): boolean {
  const isSameMonthDay = written.day === day.day && written.month === day.month;
  if (!isSameMonthDay) return false;
  if (written.year !== undefined) return written.year === day.year;
  // No year, or only two digits of it: the century is a guess.
  if (checksYear) return false;
  return (
    written.shortYear === undefined || written.shortYear === day.year % 100
  );
}

/**
 * The times of the moment that are the time. An hour alone (`alle 21`)
 * counts only with `bareHours`, from 13 to 23 (the 24-hour clock), when the
 * quote writes no other time and no other number besides the date's.
 */
function timesOf(
  moment: WrittenMoment,
  time: ClockTime,
  bareHours: boolean,
): WrittenTime[] {
  const written = moment.times.filter(
    (one) =>
      one.hours === time.hours &&
      one.minutes === time.minutes &&
      one.seconds === time.seconds,
  );
  if (written.length) return written;
  const isRoundHour = time.minutes === 0 && time.seconds === 0;
  const isAfternoonHour = time.hours >= 13 && time.hours <= 23;
  const hasNoTime = moment.times.length === 0;
  const [only, ...others] = moment.numbers;
  const isOnlyNumber = only === time.hours && others.length === 0;
  const isBareHour =
    bareHours && isRoundHour && isAfternoonHour && hasNoTime && isOnlyNumber;
  return isBareHour ? [{ ...time, zone: undefined }] : [];
}

/**
 * The quote writes the day:
 * - in digits, read one way only: `2026-10-14`, `14/10/2026`, `10/14/2026`,
 *   `14.10.2026`; `03/04/2026` (3 April or 4 March) writes no day;
 * - or with its month in words, in one of {@link MONTH_LOCALES}:
 *   `14 ottobre 2026`, `October 14th, 2026`, `14. Oktober 2026`.
 *
 * With `year: true` the year must be written in four digits; with `false`
 * a quote without a year (`14 ottobre`, `14/10/26`) is enough, but a year
 * written differently is not.
 */
export function writesDate(
  quote: string,
  day: CalendarDay,
  rules: { year: boolean },
): boolean {
  return readMoment(quote).days.some((written) =>
    isSameDay(written, day, rules.year),
  );
}

/**
 * The quote writes the time: hours and minutes (`21:00`, `21.30`, `21h30`,
 * `9:30 pm`) or an hour with am/pm (`9 pm`), and the seconds when they are
 * not zero. With `bareHours`, also an hour alone from 13 to 23 (`alle 21`),
 * when the quote writes no other time and no other number.
 */
export function writesTime(
  quote: string,
  time: ClockTime,
  rules: { bareHours: boolean },
): boolean {
  return timesOf(readMoment(quote), time, rules.bareHours).length > 0;
}

/**
 * The quote writes the day as {@link writesDate} reads it, and only that
 * day: with two days a time could belong to either. It writes the time as
 * {@link writesTime} reads it and, with `timeZone`, that same time carries
 * the value's time zone: the same offset (`21:00Z`, `T21:00:00+02:00`,
 * `21:00 UTC+2`), or none, with no zone written elsewhere in the quote. A
 * zone named by letters (`CET`) cannot be compared, so it matches nothing.
 *
 * @param offset The value's UTC offset in minutes; `undefined` when it has none.
 */
export function writesDateTime(
  quote: string,
  day: CalendarDay,
  time: ClockTime,
  offset: number | undefined,
  rules: { year: boolean; bareHours: boolean; timeZone: boolean },
): boolean {
  const moment = readMoment(quote);
  const days = new Set(
    moment.days.map(
      (written) =>
        `${written.day}-${written.month}-${written.year ?? `'${written.shortYear ?? ""}`}`,
    ),
  );
  const [written] = moment.days;
  const hasOneDay = days.size === 1 && written !== undefined;
  if (!hasOneDay || !isSameDay(written, day, rules.year)) return false;
  const times = timesOf(moment, time, rules.bareHours);
  if (!rules.timeZone) return times.length > 0;
  return times.some((one) =>
    offset === undefined
      ? one.zone === undefined && !moment.hasZoneApart
      : one.zone === offset,
  );
}
