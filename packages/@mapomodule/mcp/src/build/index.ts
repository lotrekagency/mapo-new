/**
 * Build-time knowledge generation.
 *
 * Bundled as its own entry (`dist/build.mjs`) so the heavy, source-reading
 * dependencies — `vue-component-meta`, `typescript`, `jiti` — never end up in
 * the Nitro or CLI bundles.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDocsKnowledge } from "../runtime/core/indexer.js";
import { API_KNOWLEDGE_VERSION } from "../runtime/core/knowledge.js";
import { extractComponents } from "./extract-components.js";
import { extractComposables } from "./extract-composables.js";
import { extractFieldTypes } from "./extract-fields.js";
import type {
  ApiKnowledge,
  DocChunk,
  DocsKnowledge,
} from "../runtime/core/types.js";

export const DOCS_FILE = "docs.json";
export const API_FILE = "api.json";

/** How many doc references to attach to a symbol. */
const MAX_DOC_LINKS = 3;

/**
 * Resolves "which documentation sections talk about this symbol".
 * Heading matches beat body mentions, so `MapoList` resolves to the section
 * that documents it rather than to every page that happens to use it.
 */
function makeDocsResolver(knowledge: DocsKnowledge) {
  const chunks = knowledge.chunks;

  return (symbol: string, pathPrefix?: string): string[] => {
    const needle = symbol.toLowerCase();
    const scored: Array<{ chunk: DocChunk; score: number }> = [];

    for (const chunk of chunks) {
      if (pathPrefix && !chunk.path.startsWith(pathPrefix)) continue;

      const heading = chunk.heading.toLowerCase();
      const tags = chunk.tags.map((tag) => tag.toLowerCase());

      let score = 0;
      if (heading === needle || heading === `\`${needle}\``) score = 3;
      else if (heading.includes(needle)) score = 2;
      else if (tags.includes(needle)) score = 1;

      if (score) scored.push({ chunk, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DOC_LINKS)
      .map(({ chunk }) =>
        chunk.anchor ? `${chunk.path}#${chunk.anchor}` : chunk.path,
      );
  };
}

export interface BuildKnowledgeOptions {
  docsRoot: string;
  repoRoot: string;
  outDir: string;
}

export interface BuildKnowledgeResult {
  docs: DocsKnowledge;
  api: ApiKnowledge;
}

/** Generates `docs.json` and `api.json` into `outDir`. */
export async function buildKnowledge({
  docsRoot,
  repoRoot,
  outDir,
}: BuildKnowledgeOptions): Promise<BuildKnowledgeResult> {
  const docs = buildDocsKnowledge(docsRoot);
  const docsFor = makeDocsResolver(docs);

  const components = extractComponents(repoRoot, (name) => docsFor(name));
  const { fieldTypes, fieldCommon } = await extractFieldTypes(
    repoRoot,
    (type) => docsFor(type, "uikit/form"),
  );
  const composables = extractComposables(repoRoot, (name) => docsFor(name));

  const api: ApiKnowledge = {
    version: API_KNOWLEDGE_VERSION,
    generatedAt: new Date().toISOString(),
    components,
    fieldTypes,
    fieldCommon,
    composables,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, DOCS_FILE), JSON.stringify(docs));
  writeFileSync(join(outDir, API_FILE), JSON.stringify(api));

  return { docs, api };
}
