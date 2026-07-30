#!/usr/bin/env node
/**
 * Generates `dist/knowledge/docs.json` from the repository docs.
 *
 * Runs after the package build so it can reuse the compiled indexer instead of
 * duplicating the tokenizer — index and query side must agree exactly.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../../..");
const docsRoot = process.env.MAPO_DOCS_ROOT ?? join(repoRoot, "docs");
const outDir = join(packageRoot, "dist", "knowledge");

function fail(message) {
  console.error(`[mapo-mcp] ${message}`);
  process.exit(1);
}

if (!existsSync(docsRoot) || !statSync(docsRoot).isDirectory()) {
  fail(`docs root not found at ${docsRoot}. Set MAPO_DOCS_ROOT to override.`);
}

/**
 * After a real build the compiled indexer is available; in stub mode
 * (`nuxt-module-build build --stub`) `dist/runtime` is a symlink to `src`, so
 * the TypeScript source is loaded through jiti instead.
 */
async function loadIndexer() {
  const compiled = join(packageRoot, "dist", "runtime", "core", "indexer.js");
  if (existsSync(compiled)) return import(pathToFileURL(compiled).href);

  const source = join(packageRoot, "src", "runtime", "core", "indexer.ts");
  if (!existsSync(source)) {
    fail(`indexer not found at ${compiled} nor ${source}.`);
  }

  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url).import(pathToFileURL(source).href);
}

const { buildDocsKnowledge } = await loadIndexer();

const knowledge = buildDocsKnowledge(docsRoot);
mkdirSync(outDir, { recursive: true });

const outFile = join(outDir, "docs.json");
writeFileSync(outFile, JSON.stringify(knowledge));

const pages = new Set(knowledge.chunks.map((chunk) => chunk.path)).size;
const sizeKb = Math.round(statSync(outFile).size / 1024);
console.log(
  `[mapo-mcp] knowledge built: ${pages} pages, ${knowledge.chunks.length} chunks, ` +
    `${Object.keys(knowledge.index.terms).length} terms (${sizeKb} KB)`,
);
