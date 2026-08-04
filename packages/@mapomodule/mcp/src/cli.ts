/**
 * `mapo-mcp` — standalone MCP server over stdio.
 *
 * Exposes the same tool specs as the Nuxt module, so an IDE stays useful even
 * when the dev server is down. The tools that need the running app are
 * forwarded to it when it is reachable (see `createAppProxy`).
 *
 * stdout is reserved for the MCP protocol: every log goes to stderr.
 */
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
import { appTools } from "./runtime/core/tools/app.js";
import { docsTools } from "./runtime/core/tools/docs.js";
import { scaffoldTools } from "./runtime/core/tools/scaffold.js";
import { PROMPTS } from "./runtime/core/prompts.js";
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

/** Default endpoint of the Nuxt module, overridable with `--app`. */
export const DEFAULT_APP_URL = "http://localhost:3000/mcp/mapo";

/** All tools that run without the Nuxt dev server. */
function staticTools(): AnyMapoToolSpec[] {
  return [...docsTools, ...apiTools, ...scaffoldTools];
}

function createToolContext(
  knowledgeDir: string | null,
  rootDir: string,
): MapoToolContext {
  let docs: DocsKnowledge | null = null;
  let api: ApiKnowledge | null = null;
  return {
    knowledge: () => (docs ??= loadDocsKnowledge(knowledgeDir)),
    api: () => (api ??= loadApiKnowledge(knowledgeDir)),
    // The CLI has no app of its own; live tools are forwarded instead.
    manifest: () => null,
    // The editor spawns this process inside the project, so the working
    // directory is the project — reported back on every write so a wrong root
    // is visible immediately.
    rootDir: () => rootDir,
    canWrite: () => true,
  };
}

function textOf(result: unknown): string {
  const content =
    (result as { content?: Array<{ type: string; text?: string }> }).content ??
    [];
  return content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");
}

/**
 * Forwards a live tool call to the app's own MCP endpoint.
 *
 * The connection is lazy and re-established on demand: the dev server is
 * routinely started *after* the editor spawned this process, and it restarts
 * whenever nuxt.config changes. A failure is reported as an actionable message
 * rather than an error, because "the dev server is down" is a normal state.
 */
function createAppProxy(appUrl: string) {
  let client: Client | null = null;

  return async function forward(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    try {
      if (!client) {
        const candidate = new Client({
          name: "mapo-mcp-cli",
          version: readVersion(),
        });
        await candidate.connect(
          new StreamableHTTPClientTransport(new URL(appUrl)),
        );
        client = candidate;
      }
      return textOf(await client.callTool({ name, arguments: args }));
    } catch (error) {
      client = null; // drop the dead connection so the next call retries
      const message = error instanceof Error ? error.message : String(error);
      return (
        `\`${name}\` needs the running app, and ${appUrl} is not answering (${message}).\n\n` +
        "Start the dev server (`pnpm dev`) and call the tool again, or point the client " +
        "directly at the app endpoint. Documentation and API tools work without it."
      );
    }
  };
}

export async function createStdioServer(
  knowledgeDir: string | null,
  appUrl: string = DEFAULT_APP_URL,
  rootDir: string = process.cwd(),
): Promise<McpServer> {
  const server = new McpServer(
    { name: "mapo", version: readVersion() },
    {
      instructions:
        "Mapo admin framework (Nuxt 4). Start from mapo_list_recipes, then mapo_search_docs / " +
        "mapo_get_doc for how-to, and mapo_component_api / mapo_list_field_types / " +
        "mapo_composable_api for exact APIs — Mapo v2 differs substantially from v1, so never " +
        "recall its API from memory. mapo_inspect_app and mapo_doctor describe the project itself " +
        "and need its dev server running.",
    },
  );

  const context = createToolContext(knowledgeDir, rootDir);

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

  // Live tools keep their schema and description here, but the app answers.
  const forward = createAppProxy(appUrl);

  for (const spec of appTools) {
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.inputSchema,
        ...(spec.annotations ? { annotations: spec.annotations } : {}),
      },
      async (args: Record<string, unknown>) => ({
        content: [
          { type: "text" as const, text: await forward(spec.name, args) },
        ],
      }),
    );
  }

  registerResources(server, context);
  registerPrompts(server);
  return server;
}

/** The same slash-commands the Nuxt handler exposes. */
function registerPrompts(server: McpServer): void {
  for (const prompt of PROMPTS) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: prompt.argsSchema,
      },
      // Same widening as the Nitro adapter: the SDK infers `unknown` from a
      // generic shape, and zod has already validated the arguments.
      (args: Record<string, unknown>) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: prompt.render(args as Record<string, string | undefined>),
            },
          },
        ],
      }),
    );
  }
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
    app: {
      type: "string",
      description: `MCP endpoint of the running app, for the live tools (default ${DEFAULT_APP_URL})`,
    },
    root: {
      type: "string",
      description:
        "Project root for scaffolding (default: the working directory)",
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

    const appUrl = String(
      args.app ?? process.env.MAPO_MCP_APP_URL ?? DEFAULT_APP_URL,
    );

    const rootDir = String(args.root ?? process.cwd());
    const server = await createStdioServer(knowledgeDir, appUrl, rootDir);
    await server.connect(new StdioServerTransport());
    console.error(
      `[mapo-mcp] ready on stdio (${staticTools().length} tools, ` +
        `${appTools.length} forwarded to ${appUrl})`,
    );
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
