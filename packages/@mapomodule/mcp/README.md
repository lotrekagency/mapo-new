# @mapomodule/mcp

An [MCP](https://modelcontextprotocol.io) server that teaches AI assistants how to use **Mapo** —
the Nuxt 4 admin framework — inside your own project.

Without it, an assistant working in a Mapo app has nothing to go on: the documentation lives in a
private workspace package it never sees, component APIs are `.vue` files buried in `node_modules`,
and the app's real configuration (which field types are registered, which auth endpoints are set)
is only knowable from the running Nuxt instance. The predictable result is invented props,
invented field types, and Mapo v1 code in a v2 project.

This package gives the assistant the real thing: **grounded documentation search**, **curated
recipes**, and — when the dev server is running — **introspection of the actual app**.

---

## Table of contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Connecting your IDE](#connecting-your-ide)
- [Tools](#tools)
- [Recipes](#recipes)
- [Configuration](#configuration)
- [Security model](#security-model)
- [How the knowledge base is built](#how-the-knowledge-base-is-built)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Status](#status)

---

## How it works

The package ships **two ways to reach the same tools**:

```
                build time (this package)                 dev time (your app)
 docs/**/*.md ─────► scripts/build-knowledge.mjs ─────►  ┌──────────────────────────────┐
                     dist/knowledge/docs.json            │ @mapomodule/mcp (Nuxt module)│
                              │                          │  · installs mcp-toolkit      │
                              ▼                          │  · injects its definitions   │
                     src/runtime/core/*                  │  · POST /mcp/mapo            │
                     (specs + search + recipes)          └──────────────────────────────┘
                              │
                              └───────────────────────►  bin/mapo-mcp  (stdio, no server needed)
```

1. **Nuxt module** — auto-installed by `mapomodule` in development. It registers
   [`@nuxtjs/mcp-toolkit`](https://mcp-toolkit.nuxt.dev) and injects its own tools through the
   toolkit's `mcp:definitions:paths` hook, as a **named handler**. Result: a dedicated endpoint at
   `POST /mcp/mapo` that does not interfere with any MCP definitions your app itself may declare
   (the toolkit's default `defaultHandlerStrategy: 'orphans'` keeps them separate).
2. **stdio CLI** (`mapo-mcp`) — the same tools, spawned directly by the IDE. Works with the dev
   server down, which is exactly when you are still deciding what to build.

Both adapters wrap a single set of tool specs in `src/runtime/core/tools/`, so behaviour never
diverges between the two transports.

### Why a bundled knowledge base

The docs are indexed **at package build time** into `dist/knowledge/docs.json`: heading-sized
chunks plus a BM25 inverted index. That means:

- it works offline, with no API keys and no embedding service;
- the docs always match the installed version of Mapo, instead of whatever is on the website;
- answers are _sections_, not whole files — the assistant's context stays small.

---

## Quick start

The module is part of `mapomodule` and turns itself on in development:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: {
    // ...your usual Mapo config
    // mcp: false,           // ← opt out entirely
    // mcp: { enabled: true } // ← force it on (also outside dev)
  },
});
```

Start the app and the endpoint is live:

```bash
pnpm dev
curl -s -X POST http://localhost:3000/mcp/mapo \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

For the transport-independent variant, add the package explicitly — it ships as a dependency of
`mapomodule`, and package managers only expose the binaries of **direct** dependencies:

```bash
pnpm add -D @mapomodule/mcp
npx mapo-mcp serve      # MCP over stdio, no dev server required
```

---

## Connecting your IDE

All snippets assume `pnpm add -D @mapomodule/mcp` has been run in the app, so `npx` resolves
`mapo-mcp` from the local `node_modules/.bin`.

### Claude Code (`.mcp.json` in the project root)

```json
{
  "mcpServers": {
    "mapo": {
      "command": "npx",
      "args": ["mapo-mcp", "serve"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`) / Windsurf

```json
{
  "mcpServers": {
    "mapo": { "command": "npx", "args": ["mapo-mcp", "serve"] }
  }
}
```

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "mapo": { "type": "stdio", "command": "npx", "args": ["mapo-mcp", "serve"] }
  }
}
```

### HTTP instead of stdio

If your client speaks Streamable HTTP and you keep the dev server running, point it at
`http://localhost:3000/mcp/mapo` instead. That variant additionally exposes the tools that need
the live app.

> **stdio vs HTTP** — stdio always works and knows the docs; HTTP additionally knows _your_ app.
> Configuring both is a perfectly reasonable setup.

---

## Tools

Every tool is prefixed `mapo_` so it stays unambiguous when several MCP servers are connected, and
is annotated `readOnlyHint: true`, `destructiveHint: false`.

| Tool                | What it does                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mapo_search_docs`  | Ranked search over the Mapo docs. Returns the matching **sections** with their `path`, `#anchor`, matched symbols and an excerpt — plus the canonical recipe when the query matches a known task. Filters: `section` (`howto`, `guide`, `uikit`, `form`, `modules`, `migration`), `pkg` (`@mapomodule/form`, `uikit`, …), `limit`. |
| `mapo_get_doc`      | Returns the exact markdown of a page, or of a single section via `heading` (accepts the heading text or its anchor). Reports the page's full heading list so the assistant can narrow down, and truncates at `maxChars`.                                                                                                           |
| `mapo_list_recipes` | The curated task → documentation map. With no argument it lists everything Mapo does out of the box; with `task` it returns the canonical recipe for a goal.                                                                                                                                                                       |

Typical sequence an assistant follows:

```
mapo_list_recipes({ task: "editors need to reorder navigation entries" })
  → "Build a navigation menu editor" → howto/menu-manager.md
mapo_get_doc({ path: "howto/menu-manager.md" })
  → writes code against the real API
```

### Ranking, briefly

Plain BM25 over developer documentation has a known failure mode: prop tables win on term
frequency, so "register a custom field" returns the props of `MapoFormField` instead of the
registration recipe. The ranker therefore adds:

- **light stemming** so `paginate` / `paginated` / `pagination` collapse to one term;
- **page context** — a section gets a share of the score of its sibling sections, so a page that is
  broadly about the topic beats an incidental mention elsewhere;
- **title/path affinity**, ignoring generic segments (`api`, `index`, `uikit`, …);
- **a reference penalty** on props/slots/emits tables, lifted when the query is explicitly about an
  API surface ("what props does MapoDetail accept");
- **at most two sections per page**, so one page cannot fill the result list.

On top of that sits the recipe layer, which is the part that actually fixes _intent_.

---

## Recipes

[`src/runtime/core/recipes.ts`](src/runtime/core/recipes.ts) is a curated table mapping a task to
its canonical documentation page — the thing keyword search cannot infer. Each entry has an `id`, a
`task` phrased the way a developer would ask for it, `keywords`, the target `doc` (optionally a
`heading`), `seeAlso` links and a one-line `summary`.

**This is the file to update when a feature ships.** A test verifies that every `doc`, `heading` and
`seeAlso` in the table still exists in the generated knowledge base, so a renamed page fails CI
instead of silently sending assistants to a 404.

---

## Configuration

```ts
mapo: {
  mcp: {
    enabled: true,        // default: nuxt.options.dev
    backend: {
      schemaUrl: "http://localhost:8000/api/schema/?format=json",
      tokenEnv: "MAPO_BACKEND_TOKEN", // env var name; the value is never echoed back
    },
  },
}
```

| Option              | Default                   | Description                                                                             |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `enabled`           | `nuxt.options.dev`        | Register the server. It is a development tool; production builds skip it unless forced. |
| `backend.schemaUrl` | `MAPO_BACKEND_SCHEMA_URL` | OpenAPI/DRF schema used by the backend tools.                                           |
| `backend.tokenEnv`  | `"MAPO_BACKEND_TOKEN"`    | Name of the env var holding the schema bearer token.                                    |

The route is fixed at `<mcp.route>/mapo`: the toolkit derives a folder handler's
name from its directory. Use the toolkit's own `mcp.route` option to move the
prefix.

The module can also be used standalone (`modules: ["@mapomodule/mcp"]`, config key `mapoMcp`) if you
are not installing the `mapomodule` meta-package.

---

## Security model

- **Development only by default.** The module returns early unless `nuxt.options.dev`, so the route
  never exists in a production build.
- **No secrets in responses.** The app snapshot exposes public runtime config only; private keys
  appear as key names, never values. Backend credentials are read from the environment and are never
  included in tool output.
- **Read-only today.** Every shipped tool is annotated read-only. When scaffolding lands, writing is
  opt-in (`write: true`), development-only, refuses to escape the project root and never overwrites
  an existing file without `overwrite: true`.
- The toolkit's `security.allowedOrigins` default is left in place, so cross-site browser clients
  must present an allowed `Origin`.

---

## How the knowledge base is built

```bash
pnpm --filter @mapomodule/mcp build      # module + CLI, then the knowledge index
pnpm --filter @mapomodule/mcp knowledge  # index only
```

[`scripts/build-knowledge.mjs`](scripts/build-knowledge.mjs) walks `docs/**/*.md` (skipping
`roadmap/`, which is internal planning), splits each page at its H2/H3 headings — ignoring headings
inside fenced code blocks — and writes `dist/knowledge/docs.json` containing every chunk plus the
inverted index. Each chunk carries its path, section, package, VitePress-compatible anchor, the
symbols it mentions (`MapoList`, `useCrud`, field types) and whether it is API reference.

The script deliberately reuses the **compiled** indexer (or the TypeScript source through jiti in
stub mode) rather than reimplementing tokenisation: index and query side must produce identical
tokens or recall silently degrades.

`MAPO_DOCS_ROOT` overrides the docs location; `MAPO_MCP_KNOWLEDGE_DIR` overrides where the runtime
looks for the generated index.

---

## Development

```bash
pnpm --filter @mapomodule/mcp build
pnpm --filter @mapomodule/mcp test        # unit + real-index regressions + stdio integration
pnpm --filter @mapomodule/mcp typecheck
```

[TESTING.md](TESTING.md) walks through the full verification: build, suites, both
transports, the consumer flow, search-quality spot-checks and a troubleshooting
table.

### Adding a tool

1. Write the spec in `src/runtime/core/tools/<area>.ts` with `defineMapoTool` — an explicit `Args`
   interface, a zod `inputSchema`, annotations, `inputExamples`, and a `run` returning markdown.
2. Export it from the area's tool array.
3. Add a one-line Nitro wrapper in `src/runtime/mcp/handlers/mapo/tools/<name>.ts`:

   ```ts
   import { myTool } from "../../../../core/tools/<area>.js";
   import { toMcpTool } from "../../../to-mcp-tool.js";

   export default toMcpTool(myTool);
   ```

4. If the tool works without the dev server, add it to `staticTools()` in `src/cli.ts` too.

Tools return markdown on purpose: assistants read it directly, and it costs fewer tokens than JSON
wrapped in prose.

### Layout

```
src/
├── module.ts                    # Nuxt module: toolkit install, definition injection, app snapshot
├── cli.ts                       # citty CLI → MCP over stdio
├── index.ts                     # public types
└── runtime/
    ├── core/                    # transport-agnostic: tokenizer, indexer, search, recipes, specs
    ├── nitro/                   # server-side adapters
    │   ├── context.ts           # reads the build-time context virtual module
    │   └── to-mcp-tool.ts       # spec → defineMcpTool
    ├── mcp/handlers/mapo/       # the named handler and its tools — scanned by the toolkit
    └── types/                   # virtual module declarations
```

> `runtime/mcp/` must contain **nothing but** `handlers/`. The toolkit treats every top-level file
> of a scanned path as a handler definition, so a helper module placed there is loaded as a handler
> and breaks the Nitro build.

---

## Troubleshooting

**`POST /mcp/mapo` returns 404**
The module only registers in development. Check that the dev server is running, that
`mapo.mcp` is not `false`, and that the startup log contains the `mapo:mcp` line announcing the
endpoint.

**"Mapo knowledge base not found"**
The index was not generated. Run `pnpm --filter @mapomodule/mcp build`. Inside a consumer project
this cannot happen — the index ships in the published tarball.

**Search returns reference tables instead of a how-to**
Phrase the query as a task ("how do I …") rather than as a symbol; the ranker demotes prop tables
for task-shaped queries. If a task deserves a canonical answer, add it to `recipes.ts`.

**The assistant still invents props**
Make sure the client actually loaded the server (`tools/list` should show the `mapo_*` tools) and
that the handler `instructions` reached it — some clients ignore them, in which case a short project
rule ("always check Mapo docs with the mapo\_\* tools") does the job.

---

## Status

Shipped: documentation search, page retrieval, curated recipes, the dev-only Nuxt module with its
namespaced handler, and the stdio CLI.

Planned, in this order (see [docs/roadmap/MCP_SERVER_PLAN.md](../../../docs/roadmap/MCP_SERVER_PLAN.md)):
component and field-type APIs extracted from source · `mapo_inspect_app` and `mapo_doctor` over the
live app · `mapo_scaffold` with opt-in writing · `mapo_backend_schema` (OpenAPI → `FieldDescriptor`)
· MCP prompts and resources · `mapo-mcp install` / Agent Skill / MCP App inspector.
