/**
 * Finding a quote of the AI in the source, and a value in a quote.
 *
 * Text is compared after the differences a copy may bring: case, Unicode
 * forms, typographic quotes, dashes and spaces, and the words a PDF splits
 * at the end of a line.
 */

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

/** The text found in the reading as whole words, from `from` on: where it ends, or -1. */
function wholeWordsAt(reading: string, text: string, from: number): number {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "gu",
  );
  pattern.lastIndex = from;
  const match = pattern.exec(reading);
  return match ? match.index + match[0].length : -1;
}

/** Quotes shorter than this, in words and numbers, are found anywhere and prove nothing. */
const QUOTE_TOKENS = 2;

/**
 * The quote is in the source, as whole words: `ver` is not found inside
 * `Verdi`, nor `20` inside `2026`. A quote that skips words
 * with `...` is found when each of its parts is, in order. A quote of fewer
 * than two words or numbers is never found: it would be anywhere.
 *
 * @param readings The source from `searchableSource()`.
 */
export function isQuoted(readings: readonly string[], quote: string): boolean {
  const parts = normalizeText(quote)
    .split("...")
    .map((part) => part.trim())
    .filter(Boolean);
  const tokens = parts.flatMap((part) => part.match(TOKEN) ?? []);
  const hasWords = parts.every((part) => /[\p{L}\p{N}]/u.test(part));
  if (!parts.length || !hasWords || tokens.length < QUOTE_TOKENS) return false;
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
 * holds `Verdi` but not `ver`. A blank text holds nothing.
 */
export function holds(container: string, contained: string): boolean {
  const inner = normalizeText(contained);
  return inner !== "" && wholeWordsAt(normalizeText(container), inner, 0) >= 0;
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
