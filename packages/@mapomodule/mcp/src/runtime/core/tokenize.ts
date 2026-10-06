/**
 * Tokenizer shared by the index builder and the query side.
 *
 * Both sides MUST use this function: BM25 postings are keyed by the exact
 * strings produced here, so any divergence silently breaks recall.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
]);

/** Words that must never be de-pluralised (`css` → `cs` would be nonsense). */
const NO_STEM_SUFFIX = /(?:ss|us|is|os)$/;

/**
 * Suffix rules applied after de-pluralisation, first match wins.
 * They exist to collapse morphological variants of the same concept:
 * `paginate` / `paginated` / `paginating` / `pagination` → `paginat`.
 * Only applied when the result keeps at least 4 characters.
 */
const SUFFIX_RULES: Array<[RegExp, string]> = [
  [/ation$/, "at"],
  [/ition$/, "it"],
  [/ing$/, ""],
  [/edly$/, ""],
  [/ed$/, ""],
  [/ly$/, ""],
  [/e$/, ""],
];

const MIN_STEM_LENGTH = 4;

/** Splits `MapoListFilters` into `["mapolistfilters", "mapo", "list", "filters"]`. */
function splitIdentifier(word: string): string[] {
  const parts = word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
  return parts.length > 1 ? parts : [];
}

/**
 * Light stemmer: de-pluralisation plus a short suffix table.
 *
 * Not linguistically correct and not meant to be — index and query run through
 * the same function, so what matters is that variants of one word collapse to
 * one key ("paginated" and "pagination" both reach "paginat").
 */
export function stem(word: string): string {
  let result = word;

  if (
    result.length > 3 &&
    result.endsWith("s") &&
    !NO_STEM_SUFFIX.test(result)
  ) {
    result = result.endsWith("ies")
      ? `${result.slice(0, -3)}y`
      : result.endsWith("es") && result.length > 4
        ? result.slice(0, -2)
        : result.slice(0, -1);
  }

  for (const [pattern, replacement] of SUFFIX_RULES) {
    if (!pattern.test(result)) continue;
    const candidate = result.replace(pattern, replacement);
    if (candidate.length >= MIN_STEM_LENGTH) return candidate;
    break;
  }

  return result;
}

/**
 * Lowercased, stemmed tokens. Identifiers also yield their sub-words, so a
 * query for "list filters" matches a chunk that only mentions `MapoListFilters`.
 */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  const words = input.match(/[A-Za-z][A-Za-z0-9]*|[0-9]+/g) ?? [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower.length < 2) continue;
    if (!STOPWORDS.has(lower)) out.push(stem(lower));

    for (const part of splitIdentifier(word)) {
      const lowerPart = part.toLowerCase();
      if (lowerPart.length < 2 || STOPWORDS.has(lowerPart)) continue;
      out.push(stem(lowerPart));
    }
  }

  return out;
}
