/**
 * Transport-agnostic tool specs.
 *
 * One implementation, two adapters: the Nitro definitions under
 * `runtime/mcp/handlers/mapo/tools/` wrap these with `defineMcpTool`, and the
 * stdio CLI registers the very same specs on an SDK server. Tool behaviour can
 * therefore never drift between "dev server running" and "dev server down".
 */
import type { ZodRawShape } from "zod";
import type { DocsKnowledge } from "./types.js";

/** Everything a tool may need, provided lazily so unused sources are never read. */
export interface MapoToolContext {
  /** Bundled docs index. Throws `KnowledgeNotBuiltError` when not generated. */
  knowledge: () => DocsKnowledge;
}

export interface MapoToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * `Args` is declared explicitly by each tool and must mirror `inputSchema`;
 * the schema stays the single runtime source of truth (the MCP SDK validates
 * against it before `run` is called).
 */
export interface MapoToolSpec<
  Args = Record<string, unknown>,
  Shape extends ZodRawShape = ZodRawShape,
> {
  /** Prefixed with `mapo_` so it stays unambiguous alongside other MCP servers. */
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  annotations?: MapoToolAnnotations;
  inputExamples?: Array<Partial<Args>>;
  /** Returns markdown — agents read it directly, no client-side parsing needed. */
  run: (args: Args, context: MapoToolContext) => string | Promise<string>;
}

/** Tool slot for heterogeneous registries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMapoToolSpec = MapoToolSpec<any, any>;

export function defineMapoTool<Args, Shape extends ZodRawShape>(
  spec: MapoToolSpec<Args, Shape>,
): MapoToolSpec<Args, Shape> {
  return spec;
}
