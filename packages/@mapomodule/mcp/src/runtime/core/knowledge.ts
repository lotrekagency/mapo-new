/**
 * Loads the knowledge base generated at package build time.
 *
 * The Nitro side is handed an absolute directory (computed by the module, which
 * knows where the package lives); the CLI resolves it from its own location.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWLEDGE_VERSION } from "./indexer.js";
import type { ApiKnowledge, DocsKnowledge } from "./types.js";

export const DOCS_KNOWLEDGE_FILE = "docs.json";
export const API_KNOWLEDGE_FILE = "api.json";

const cache = new Map<string, DocsKnowledge>();
const apiCache = new Map<string, ApiKnowledge>();

/** Directory layouts we may be imported from: `dist/`, `dist/runtime/core/`, `src/…`. */
const CANDIDATE_SUFFIXES = [
  "knowledge",
  "../knowledge",
  "../../knowledge",
  "../../../knowledge",
  "../dist/knowledge",
  "../../dist/knowledge",
  "../../../dist/knowledge",
  "../../../../dist/knowledge",
];

/**
 * Finds `knowledge/docs.json`, starting from `fromUrl` (defaults to this file).
 * `MAPO_MCP_KNOWLEDGE_DIR` wins when set — used by tests and by the CLI when it
 * runs against a source checkout.
 */
export function resolveKnowledgeDir(
  fromUrl: string = import.meta.url,
): string | null {
  const override = process.env.MAPO_MCP_KNOWLEDGE_DIR;
  if (override && existsSync(join(override, DOCS_KNOWLEDGE_FILE)))
    return override;

  const base = dirname(fileURLToPath(fromUrl));
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = resolve(base, suffix);
    if (existsSync(join(candidate, DOCS_KNOWLEDGE_FILE))) return candidate;
  }
  return null;
}

export class KnowledgeNotBuiltError extends Error {
  constructor(searchedFrom: string) {
    super(
      `Mapo knowledge base not found (looked around ${searchedFrom}). ` +
        `Build it with \`pnpm --filter @mapomodule/mcp knowledge\`.`,
    );
    this.name = "KnowledgeNotBuiltError";
  }
}

/** Reads and caches `docs.json`. Throws a directive error when it is missing. */
export function loadDocsKnowledge(dir?: string | null): DocsKnowledge {
  const directory = dir ?? resolveKnowledgeDir();
  if (!directory)
    throw new KnowledgeNotBuiltError(fileURLToPath(import.meta.url));

  const cached = cache.get(directory);
  if (cached) return cached;

  const file = join(directory, DOCS_KNOWLEDGE_FILE);
  if (!existsSync(file)) throw new KnowledgeNotBuiltError(directory);

  const knowledge = JSON.parse(readFileSync(file, "utf-8")) as DocsKnowledge;
  if (knowledge.version !== KNOWLEDGE_VERSION) {
    throw new Error(
      `Mapo knowledge base version mismatch: found ${knowledge.version}, expected ${KNOWLEDGE_VERSION}. Rebuild it.`,
    );
  }

  cache.set(directory, knowledge);
  return knowledge;
}

/**
 * Reads and caches `api.json` — the component, field and composable surface
 * extracted from source at build time.
 */
export function loadApiKnowledge(dir?: string | null): ApiKnowledge {
  const directory = dir ?? resolveKnowledgeDir();
  if (!directory)
    throw new KnowledgeNotBuiltError(fileURLToPath(import.meta.url));

  const cached = apiCache.get(directory);
  if (cached) return cached;

  const file = join(directory, API_KNOWLEDGE_FILE);
  if (!existsSync(file)) throw new KnowledgeNotBuiltError(directory);

  const api = JSON.parse(readFileSync(file, "utf-8")) as ApiKnowledge;
  apiCache.set(directory, api);
  return api;
}

/** Test helper — drops the in-process cache. */
export function clearKnowledgeCache(): void {
  cache.clear();
  apiCache.clear();
}
