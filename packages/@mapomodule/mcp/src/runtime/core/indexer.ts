/**
 * Build-time knowledge indexer.
 *
 * Turns the repository's markdown docs into heading-sized chunks plus a BM25
 * inverted index, so `mapo_search_docs` can answer with the relevant section
 * instead of dumping whole files into the model's context.
 *
 * Runs from `scripts/build-knowledge.mjs` after the package build.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tokenize } from "./tokenize.js";
import type { Bm25Index, DocChunk, DocsKnowledge } from "./types.js";

export const KNOWLEDGE_VERSION = 1;

/** Chunks larger than this are split further (H3, then paragraphs). */
const MAX_CHUNK_CHARS = 3500;

/** Directories under the docs root that are internal planning, not user docs. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "roadmap",
  ".vitepress",
  "dist",
]);

/** Field boosts baked into the term frequencies. */
const BOOST = { heading: 3, title: 2, tags: 3, text: 1 } as const;

const PKG_BY_PREFIX: Array<[string, string]> = [
  ["uikit/form", "@mapomodule/form"],
  ["uikit", "@mapomodule/uikit"],
  ["modules/core", "@mapomodule/core"],
  ["modules/store", "@mapomodule/store"],
  ["modules/utils", "@mapomodule/utils"],
  ["modules/i18n", "@mapomodule/i18n"],
  ["modules/api", "@mapomodule/core"],
  ["modules/camomilla", "mapo-integrations-camomilla"],
];

/** Pages that are pure API reference rather than task-oriented docs. */
const REFERENCE_PATH = /(?:^|\/)api\.md$/;
/** Headings that introduce a props/slots/emits table inside any page. */
const REFERENCE_HEADING = /^(props|slots|emits|events|exposed|api)\b/i;

/** GitHub-compatible heading slug (matches VitePress anchors). */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/** Recursively collects `*.md` files, skipping internal directories. */
export function collectMarkdownFiles(root: string): string[] {
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".vitepress") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(full);
      }
    }
  };

  walk(root);
  return files.sort();
}

/** Symbols worth boosting: components, composables, field types, page meta keys. */
export function extractTags(text: string): string[] {
  const tags = new Set<string>();

  for (const match of text.matchAll(/\bMapo[A-Z][A-Za-z0-9]*/g))
    tags.add(match[0]);
  for (const match of text.matchAll(/\buse[A-Z][A-Za-z0-9]*/g))
    tags.add(match[0]);
  for (const match of text.matchAll(/\btype:\s*["']([a-z0-9-]+)["']/g)) {
    if (match[1]) tags.add(match[1]);
  }

  return [...tags];
}

interface RawSection {
  heading: string;
  level: number;
  lines: string[];
}

/**
 * Splits markdown at H2 (and H3 when a section is too long), ignoring headings
 * that appear inside fenced code blocks.
 */
export function splitSections(markdown: string): {
  title: string;
  sections: RawSection[];
} {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: RawSection[] = [];
  let title = "";
  let current: RawSection = { heading: "", level: 1, lines: [] };
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      if (fence && line.trimStart().startsWith(fence)) fence = null;
      else if (!fence) fence = fenceMatch[1]!;
      current.lines.push(line);
      continue;
    }

    if (!fence) {
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        const level = heading[1]!.length;
        const text = heading[2]!.trim();
        if (level === 1 && !title) {
          title = text;
          current.heading ||= text;
          continue;
        }
        if (level >= 2) {
          if (current.lines.some((l) => l.trim())) sections.push(current);
          current = { heading: text, level, lines: [] };
          continue;
        }
      }
    }

    current.lines.push(line);
  }

  if (current.lines.some((l) => l.trim())) sections.push(current);
  return { title, sections };
}

/** Breaks an oversized section body into paragraph-aligned windows. */
function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const parts: string[] = [];
  let buffer = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    if (buffer && buffer.length + paragraph.length > MAX_CHUNK_CHARS) {
      parts.push(buffer.trim());
      buffer = "";
    }
    buffer += `${paragraph}\n\n`;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

/** Chunks a single markdown file. `path` is relative to the docs root. */
export function chunkMarkdown(path: string, markdown: string): DocChunk[] {
  const posixPath = toPosix(path);
  const segments = posixPath.split("/");
  const section = segments.length > 1 ? segments[0]! : "root";
  const group = segments.length > 2 ? segments[1] : undefined;
  const pkg = PKG_BY_PREFIX.find(([prefix]) =>
    posixPath.startsWith(prefix),
  )?.[1];

  const { title, sections } = splitSections(markdown);
  const docTitle = title || segments.at(-1)!.replace(/\.md$/, "");
  const isReferencePage = REFERENCE_PATH.test(posixPath);
  const chunks: DocChunk[] = [];
  const seenAnchors = new Map<string, number>();

  for (const rawSection of sections) {
    const heading = rawSection.heading || docTitle;
    const body = rawSection.lines.join("\n").trim();
    if (!body) continue;

    const parts = splitLongText(body);
    parts.forEach((text, partIndex) => {
      const baseAnchor = rawSection.heading ? slugify(rawSection.heading) : "";
      const seen = seenAnchors.get(baseAnchor) ?? 0;
      seenAnchors.set(baseAnchor, seen + 1);
      // Duplicate headings inside one page get `-1`, `-2`… like VitePress does.
      const anchor = `${baseAnchor}${seen > 0 ? `-${seen}` : ""}`;

      chunks.push({
        id: `${posixPath}#${anchor}${partIndex > 0 ? `~${partIndex}` : ""}`,
        path: posixPath,
        section,
        ...(group ? { group } : {}),
        ...(pkg ? { pkg } : {}),
        title: docTitle,
        heading,
        anchor,
        level: rawSection.heading ? rawSection.level : 1,
        ...(isReferencePage || REFERENCE_HEADING.test(heading)
          ? { kind: "reference" as const }
          : {}),
        text,
        tags: extractTags(text),
      });
    });
  }

  return chunks;
}

/** Builds the BM25 inverted index over already-chunked docs. */
export function buildIndex(chunks: DocChunk[]): Bm25Index {
  const terms: Record<string, Array<[number, number]>> = {};
  const lengths: number[] = [];

  chunks.forEach((chunk, chunkIndex) => {
    const counts = new Map<string, number>();
    const add = (input: string, boost: number) => {
      for (const token of tokenize(input)) {
        counts.set(token, (counts.get(token) ?? 0) + boost);
      }
    };

    add(chunk.text, BOOST.text);
    add(chunk.heading, BOOST.heading);
    add(chunk.title, BOOST.title);
    add(chunk.tags.join(" "), BOOST.tags);

    let length = 0;
    for (const [term, frequency] of counts) {
      (terms[term] ??= []).push([chunkIndex, frequency]);
      length += frequency;
    }
    lengths.push(length);
  });

  const total = chunks.length;
  const avgLength = total ? lengths.reduce((a, b) => a + b, 0) / total : 0;
  return { terms, lengths, avgLength, total };
}

/** Reads every doc under `docsRoot` and returns the full knowledge payload. */
export function buildDocsKnowledge(docsRoot: string): DocsKnowledge {
  const files = collectMarkdownFiles(docsRoot);
  const chunks: DocChunk[] = [];

  for (const file of files) {
    if (!statSync(file).isFile()) continue;
    const markdown = readFileSync(file, "utf-8");
    chunks.push(...chunkMarkdown(relative(docsRoot, file), markdown));
  }

  return {
    version: KNOWLEDGE_VERSION,
    generatedAt: new Date().toISOString(),
    docsRoot: "docs",
    chunks,
    index: buildIndex(chunks),
  };
}
