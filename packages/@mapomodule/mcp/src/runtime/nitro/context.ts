/**
 * Bridge between the Nitro-side MCP definitions and the build-time context
 * injected by the module (`#mapo-mcp/context.mjs`).
 */
import context from "#mapo-mcp/context.mjs";
import { loadApiKnowledge, loadDocsKnowledge } from "../core/knowledge.js";
import type { ApiKnowledge, DocsKnowledge } from "../core/types.js";
import type { MapoAppManifest, MapoMcpContext } from "../../index";

export function useMapoMcpContext(): MapoMcpContext {
  return context;
}

export function useMapoManifest(): MapoAppManifest {
  return context.manifest;
}

/** Loads the bundled docs index from the absolute path resolved at build time. */
export function useDocsKnowledge(): DocsKnowledge {
  return loadDocsKnowledge(context.knowledgeDir);
}

/**
 * Backend schema source. The module stores the *name* of the env var holding
 * the token; resolving it here keeps the secret out of the build output.
 */
export function useMapoBackend(): {
  schemaUrl: string | null;
  token: string | null;
} {
  const { schemaUrl, tokenEnv } = context.backend;
  return {
    schemaUrl: schemaUrl ?? process.env.MAPO_BACKEND_SCHEMA_URL ?? null,
    token: (tokenEnv ? process.env[tokenEnv] : undefined) ?? null,
  };
}

/** Loads the component/field/composable surface extracted from source. */
export function useApiKnowledge(): ApiKnowledge {
  return loadApiKnowledge(context.knowledgeDir);
}
