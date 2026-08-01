#!/usr/bin/env node
/**
 * Generates `dist/knowledge/{docs,api}.json`.
 *
 * Runs after the package build so it can reuse the compiled generator instead
 * of duplicating the tokenizer — index and query side must agree exactly.
 */
import { existsSync, statSync } from "node:fs";
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
 * After a real build the compiled generator is available; in stub mode
 * (`nuxt-module-build build --stub`) `dist` holds jiti stubs, so the
 * TypeScript source is loaded through jiti instead.
 */
async function loadGenerator() {
  const compiled = join(packageRoot, "dist", "build.mjs");
  if (existsSync(compiled)) {
    const module_ = await import(pathToFileURL(compiled).href);
    // Stub builds write a jiti re-export here; it resolves to the same API.
    if (module_.buildKnowledge) return module_;
  }

  const source = join(packageRoot, "src", "build", "index.ts");
  if (!existsSync(source)) fail(`generator not found at ${compiled} nor ${source}.`);

  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url).import(pathToFileURL(source).href);
}

const { buildKnowledge } = await loadGenerator();
const { docs, api } = await buildKnowledge({ docsRoot, repoRoot, outDir });

const pages = new Set(docs.chunks.map((chunk) => chunk.path)).size;
const docsSize = Math.round(statSync(join(outDir, "docs.json")).size / 1024);
const apiSize = Math.round(statSync(join(outDir, "api.json")).size / 1024);

console.log(
  `[mapo-mcp] docs: ${pages} pages, ${docs.chunks.length} chunks, ` +
    `${Object.keys(docs.index.terms).length} terms (${docsSize} KB)`,
);
console.log(
  `[mapo-mcp] api: ${api.components.length} components, ${api.fieldTypes.length} field types, ` +
    `${api.composables.length} composables (${apiSize} KB)`,
);
