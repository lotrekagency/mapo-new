/**
 * `mapo-mcp` — standalone MCP server over stdio.
 *
 * Exposes the same tool specs as the Nuxt module, so an IDE stays useful even
 * when the dev server is down. Anything that needs the running app (live
 * introspection) is served by the Nuxt module at `/mcp/mapo`.
 *
 * stdout is reserved for the MCP protocol: every log goes to stderr.
 */
import { readFileSync } from "node:fs";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defineCommand, runMain } from "citty";
import {
  DOCS_URI_PREFIX,
  FIELD_URI_PREFIX,
  INDEX_URI,
  docResourceList,
  fieldResourceList,
  renderDocResource,
  renderFieldResource,
  renderKnowledgeIndex,
} from "./runtime/core/resources.js";
import { apiTools } from "./runtime/core/tools/api.js";
import { docsTools } from "./runtime/core/tools/docs.js";
import {
  loadApiKnowledge,
  loadDocsKnowledge,
  resolveKnowledgeDir,
} from "./runtime/core/knowledge.js";
import type {
  AnyMapoToolSpec,
  MapoToolContext,
} from "./runtime/core/tool-spec.js";
import type { ApiKnowledge, DocsKnowledge } from "./runtime/core/types.js";

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
    );
    return String(pkg.version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
}

/** All tools that run without the Nuxt dev server. */
function staticTools(): AnyMapoToolSpec[] {
  return [...docsTools, ...apiTools];
}

function createToolContext(knowledgeDir: string | null): MapoToolContext {
  let docs: DocsKnowledge | null = null;
  let api: ApiKnowledge | null = null;
  return {
    knowledge: () => (docs ??= loadDocsKnowledge(knowledgeDir)),
    api: () => (api ??= loadApiKnowledge(knowledgeDir)),
  };
}

export async function createStdioServer(
  knowledgeDir: string | null,
): Promise<McpServer> {
  const server = new McpServer(
    { name: "mapo", version: readVersion() },
    {
      instructions:
        "Mapo admin framework (Nuxt 4). Search the docs before writing Mapo code — v2 differs " +
        "substantially from v1. Start the app's dev server and connect to /mcp/mapo for live " +
        "introspection of the project's actual configuration.",
    },
  );

  const context = createToolContext(knowledgeDir);

  for (const spec of staticTools()) {
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.inputSchema,
        ...(spec.annotations ? { annotations: spec.annotations } : {}),
      },
      async (args: Record<string, unknown>) => {
        try {
          const text = await spec.run(args, context);
          return { content: [{ type: "text" as const, text }] };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
          };
        }
      },
    );
  }

  registerResources(server, context);
  return server;
}

/**
 * Same resources as the Nuxt handler, minus `mapo://app/manifest`: the CLI has
 * no running app to describe.
 */
function registerResources(server: McpServer, context: MapoToolContext): void {
  const markdown = (uri: URL, text: string) => ({
    contents: [{ uri: uri.toString(), mimeType: "text/markdown", text }],
  });

  server.registerResource(
    "mapo-knowledge-index",
    INDEX_URI,
    {
      title: "Mapo knowledge index",
      description:
        "Recipes, documentation pages, components, field types and composables known to this server.",
      mimeType: "text/markdown",
    },
    (uri) =>
      markdown(uri, renderKnowledgeIndex(context.knowledge(), context.api())),
  );

  server.registerResource(
    "mapo-doc",
    new ResourceTemplate(`${DOCS_URI_PREFIX}{+path}`, {
      list: () => ({ resources: docResourceList(context.knowledge()) }),
    }),
    {
      title: "Mapo documentation page",
      description: "A full documentation page, addressed by its path.",
      mimeType: "text/markdown",
    },
    (uri, variables) => {
      const raw = variables.path;
      const path = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
      const text = renderDocResource(
        context.knowledge(),
        decodeURIComponent(path),
      );
      return markdown(uri, text ?? `No documentation page at "${path}".`);
    },
  );

  server.registerResource(
    "mapo-field-type",
    new ResourceTemplate(`${FIELD_URI_PREFIX}{type}`, {
      list: () => ({ resources: fieldResourceList(context.api()) }),
    }),
    {
      title: "Mapo form field type",
      description:
        "The component, attrs and descriptor contract of a field type.",
      mimeType: "text/markdown",
    },
    (uri, variables) => {
      const raw = variables.type;
      const type = Array.isArray(raw) ? raw[0]! : (raw ?? "");
      const text = renderFieldResource(context.api(), decodeURIComponent(type));
      return markdown(uri, text ?? `No field type "${type}" is registered.`);
    },
  );
}

const serve = defineCommand({
  meta: {
    name: "serve",
    description: "Run the Mapo MCP server on stdio (for IDE/agent clients)",
  },
  args: {
    knowledge: {
      type: "string",
      description:
        "Path to a prebuilt knowledge directory (defaults to the bundled one)",
    },
  },
  async run({ args }) {
    const knowledgeDir = args.knowledge
      ? String(args.knowledge)
      : resolveKnowledgeDir();

    if (!knowledgeDir) {
      console.error(
        "[mapo-mcp] knowledge base not found — docs tools will fail. " +
          "Build it with `pnpm --filter @mapomodule/mcp build`.",
      );
    }

    const server = await createStdioServer(knowledgeDir);
    await server.connect(new StdioServerTransport());
    console.error(`[mapo-mcp] ready on stdio (${staticTools().length} tools)`);
  },
});

const main = defineCommand({
  meta: {
    name: "mapo-mcp",
    version: readVersion(),
    description: "Mapo MCP server and IDE integration helper",
  },
  subCommands: { serve },
  // Bare `mapo-mcp` behaves like `mapo-mcp serve`: MCP clients spawn the bin
  // with no arguments.
  run: (context) => serve.run?.(context as never),
});

runMain(main);
