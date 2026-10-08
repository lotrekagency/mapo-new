/**
 * Query side of the knowledge base: BM25 ranking plus snippet extraction.
 *
 * Deliberately dependency-free and synchronous — it runs both inside Nitro
 * (dev server) and inside the stdio CLI.
 */
import { tokenize } from "./tokenize.js";
import type { DocChunk, DocsKnowledge, SearchHit } from "./types.js";

const K1 = 1.5;
const B = 0.75;
const SNIPPET_CHARS = 360;

/** Share of a page's other matching sections added to each of its chunks. */
const PAGE_CONTEXT_WEIGHT = 0.2;
/** Per distinct query term found in the page title or path. */
const TITLE_BOOST_STEP = 0.15;
const TITLE_BOOST_CAP = 1.5;
/** A page may not take over the whole result list. */
const MAX_HITS_PER_PAGE = 2;
/** Applied to API-reference chunks unless the query is about an API surface. */
const REFERENCE_PENALTY = 0.75;
/** Words signalling the user really wants the reference tables. */
const REFERENCE_INTENT =
  /\b(prop|props|slot|slots|emit|emits|event|events|api|signature|reference|type)\b/i;
/**
 * Path segments too generic to signal topicality — boosting on them would
 * favour reference pages (`uikit/api.md`) for every query.
 */
const GENERIC_IDENTITY_TOKENS = new Set([
  "api",
  "index",
  "doc",
  "overview",
  "reference",
  "uikit",
  "modul",
  "module",
  "howto",
  "guid",
  "guide",
  "migrat",
  "migration",
  "md",
]);

export interface SearchOptions {
  /** Restrict to a docs area: `howto`, `guide`, `uikit`, `modules`, `migration`. */
  section?: string;
  /** Restrict to a package, e.g. `@mapomodule/form` (bare `form` also works). */
  pkg?: string;
  limit?: number;
}

function matchesFilters(chunk: DocChunk, options: SearchOptions): boolean {
  if (options.section) {
    const wanted = options.section.toLowerCase();
    if (chunk.section !== wanted && chunk.group !== wanted) return false;
  }
  if (options.pkg) {
    const wanted = options.pkg.toLowerCase().replace(/^@mapomodule\//, "");
    if (!chunk.pkg || !chunk.pkg.toLowerCase().includes(wanted)) return false;
  }
  return true;
}

/** Builds a short excerpt centred on the densest run of query terms. */
export function extractSnippet(text: string, query: string): string {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);

  const haystack = text.toLowerCase();
  let best = -1;
  for (const word of words) {
    const at = haystack.indexOf(word);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }

  if (best === -1) {
    return text.length > SNIPPET_CHARS
      ? `${text.slice(0, SNIPPET_CHARS).trimEnd()}…`
      : text;
  }

  const start = Math.max(0, best - Math.floor(SNIPPET_CHARS / 3));
  const end = Math.min(text.length, start + SNIPPET_CHARS);
  const slice = text.slice(start, end).trim();

  return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`;
}

/** Ranked search over the bundled docs. Returns sections, never whole files. */
export function searchDocs(
  knowledge: DocsKnowledge,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const { chunks, index } = knowledge;
  const limit = options.limit ?? 5;
  const queryTerms = tokenize(query);
  if (!queryTerms.length || !index.total) return [];

  const scores = new Map<number, number>();
  const seenTerms = new Set<string>();

  for (const term of queryTerms) {
    if (seenTerms.has(term)) continue;
    seenTerms.add(term);

    const postings = index.terms[term];
    if (!postings) continue;

    // Standard BM25 idf, floored so very common terms still contribute a little.
    const idf = Math.max(
      0.05,
      Math.log(
        1 + (index.total - postings.length + 0.5) / (postings.length + 0.5),
      ),
    );

    for (const [chunkIndex, frequency] of postings) {
      const chunk = chunks[chunkIndex];
      if (!chunk || !matchesFilters(chunk, options)) continue;

      const length = index.lengths[chunkIndex] ?? 0;
      const norm = 1 - B + (B * length) / (index.avgLength || 1);
      const score = idf * ((frequency * (K1 + 1)) / (frequency + K1 * norm));
      scores.set(chunkIndex, (scores.get(chunkIndex) ?? 0) + score);
    }
  }

  // Sections of a page that is broadly about the topic beat an incidental
  // mention elsewhere: give every chunk a share of its siblings' scores.
  const pageTotals = new Map<string, number>();
  for (const [chunkIndex, score] of scores) {
    const { path } = chunks[chunkIndex]!;
    pageTotals.set(path, (pageTotals.get(path) ?? 0) + score);
  }

  const phrase = query.trim().toLowerCase();
  const distinctTerms = [...seenTerms];
  const wantsReference = REFERENCE_INTENT.test(query);

  const ranked = [...scores.entries()].map(([chunkIndex, score]) => {
    const chunk = chunks[chunkIndex]!;
    let final =
      score +
      PAGE_CONTEXT_WEIGHT * ((pageTotals.get(chunk.path) ?? score) - score);

    // A query term in the title or the file path is a strong topical signal
    // that BM25 dilutes across the whole section.
    const identity = new Set(
      tokenize(`${chunk.title} ${chunk.path.replace(/[/.\-_]/g, " ")}`),
    );
    const matched = distinctTerms.filter(
      (term) => identity.has(term) && !GENERIC_IDENTITY_TOKENS.has(term),
    ).length;
    if (matched)
      final *= Math.min(TITLE_BOOST_CAP, 1 + TITLE_BOOST_STEP * matched);

    // Prop tables answer "what props does X take", not "how do I do Y".
    if (chunk.kind === "reference" && !wantsReference)
      final *= REFERENCE_PENALTY;

    // Exact-phrase presence is a signal the bag of words misses entirely.
    if (phrase.length > 6 && chunk.text.toLowerCase().includes(phrase))
      final *= 1.5;

    return [chunkIndex, final] as const;
  });

  const perPage = new Map<string, number>();

  return ranked
    .sort((a, b) => b[1] - a[1])
    .filter(([chunkIndex]) => {
      const { path } = chunks[chunkIndex]!;
      const used = perPage.get(path) ?? 0;
      if (used >= MAX_HITS_PER_PAGE) return false;
      perPage.set(path, used + 1);
      return true;
    })
    .slice(0, limit)
    .map(([chunkIndex, score]) => {
      const chunk = chunks[chunkIndex]!;
      return {
        id: chunk.id,
        path: chunk.path,
        section: chunk.section,
        title: chunk.title,
        heading: chunk.heading,
        anchor: chunk.anchor,
        score: Number(score.toFixed(3)),
        snippet: extractSnippet(chunk.text, query),
        tags: chunk.tags.slice(0, 8),
      };
    });
}

export interface GetDocResult {
  path: string;
  title: string;
  /** Every heading of the page, so the caller can request a narrower slice. */
  headings: string[];
  content: string;
  truncated: boolean;
}

/**
 * Returns a whole page or a single section, rebuilt from its chunks.
 * `heading` accepts the heading text or its anchor.
 */
export function getDoc(
  knowledge: DocsKnowledge,
  path: string,
  options: { heading?: string; maxChars?: number } = {},
): GetDocResult | null {
  const wantedPath = path.replace(/^\/+/, "").replace(/^docs\//, "");
  const pageChunks = knowledge.chunks.filter(
    (chunk) => chunk.path === wantedPath,
  );
  if (!pageChunks.length) return null;

  const maxChars = options.maxChars ?? 8000;
  const headings = [...new Set(pageChunks.map((chunk) => chunk.heading))];

  let selected = pageChunks;
  if (options.heading) {
    const wanted = options.heading.toLowerCase();
    selected = pageChunks.filter(
      (chunk) =>
        chunk.heading.toLowerCase() === wanted ||
        chunk.anchor === wanted.replace(/^#/, ""),
    );
    if (!selected.length) selected = pageChunks;
  }

  const body = selected
    .map((chunk) =>
      chunk.level > 1
        ? `${"#".repeat(chunk.level)} ${chunk.heading}\n\n${chunk.text}`
        : chunk.text,
    )
    .join("\n\n");

  return {
    path: wantedPath,
    title: pageChunks[0]!.title,
    headings,
    content:
      body.length > maxChars
        ? `${body.slice(0, maxChars)}\n\n…[truncated]`
        : body,
    truncated: body.length > maxChars,
  };
}

/** Doc tree for the `mapo://knowledge/index` resource and `mapo_list_recipes`. */
export function listDocs(
  knowledge: DocsKnowledge,
): Array<{ path: string; title: string; section: string; headings: string[] }> {
  const byPath = new Map<
    string,
    { path: string; title: string; section: string; headings: string[] }
  >();

  for (const chunk of knowledge.chunks) {
    const entry = byPath.get(chunk.path) ?? {
      path: chunk.path,
      title: chunk.title,
      section: chunk.section,
      headings: [],
    };
    if (chunk.level > 1 && !entry.headings.includes(chunk.heading))
      entry.headings.push(chunk.heading);
    byPath.set(chunk.path, entry);
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
