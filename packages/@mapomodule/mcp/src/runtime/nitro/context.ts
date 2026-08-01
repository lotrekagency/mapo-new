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

/** Loads the component/field/composable surface extracted from source. */
export function useApiKnowledge(): ApiKnowledge {
  return loadApiKnowledge(context.knowledgeDir);
}
