/** Adapter: shared tool spec → `@nuxtjs/mcp-toolkit` definition. */
import { defineMcpTool } from "@nuxtjs/mcp-toolkit/server";
import {
  useApiKnowledge,
  useDocsKnowledge,
  useMapoBackend,
  useMapoManifest,
} from "./context.js";
import type { AnyMapoToolSpec } from "../core/tool-spec.js";
// NOTE: this file must stay OUT of `runtime/mcp/`. The toolkit treats every
// top-level file of a scanned handler path as a handler definition, so a helper
// living there would be loaded as one and fail the Nitro build.

export function toMcpTool(spec: AnyMapoToolSpec) {
  return defineMcpTool({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    inputExamples: spec.inputExamples,
    handler: async (args: Record<string, unknown>) =>
      spec.run(args, {
        knowledge: useDocsKnowledge,
        api: useApiKnowledge,
        manifest: useMapoManifest,
        rootDir: () => useMapoManifest().rootDir,
        // The module only registers in development, but be explicit: a write
        // tool reachable from a production build is a remote code execution
        // primitive.
        canWrite: () => useMapoManifest().dev,
        backend: useMapoBackend,
      }),
  });
}
