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
- [Prompts](#prompts)
- [Resources](#resources)
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
 docs/**/*.md ────┐                                      ┌──────────────────────────────┐
 uikit/form .vue ─┼─► src/build/* ────────────────────►  │ @mapomodule/mcp (Nuxt module)│
 descriptor.ts    │   dist/knowledge/docs.json           │  · installs mcp-toolkit      │
 module.ts        ┘                     /api.json        │  · injects its definitions   │
                              │                          │  · POST /mcp/mapo            │
                              ▼                          └──────────────────────────────┘
                     src/runtime/core/*
                     (specs + search + recipes)
                              │
                              └───────────────────────►  bin/mapo-mcp  (stdio, no server needed)
```

1. **Nuxt module** — auto-installed by `mapomodule` in development. It registers
   [`@nuxtjs/mcp-toolkit`](https://mcp-toolkit.nuxt.dev) and injects its own tools through the
   toolkit's `mcp:definitions:paths` hook, as a **named handler**. Result: a dedicated endpoint at
   `POST /mcp/mapo` that does not interfere with any MCP definitions your app itself may declare
   (the toolkit's default `defaultHandlerStrategy: 'orphans'` keeps them separate).
2. **stdio CLI** (`mapo-mcp`) — the same tools, spawned directly by the IDE. Works with the dev
   server down, which is exactly when you are still deciding what to build; the two live tools are
   forwarded to the app when it happens to be up.

Both adapters wrap a single set of tool specs in `src/runtime/core/tools/`, so behaviour never
diverges between the two transports.

### Why a bundled knowledge base

Everything is extracted **at package build time** into `dist/knowledge/`: `docs.json` (heading-sized
chunks plus a BM25 inverted index) and `api.json` (components, field types and composables read from
the packages' sources). That means:

- it works offline, with no API keys and no embedding service;
- the knowledge always matches the installed version of Mapo, not whatever is on the website;
- answers are _sections_, not whole files — the assistant's context stays small;
- the API surface cannot drift from the code, because it _is_ the code.

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

Every tool is prefixed `mapo_` so it stays unambiguous when several MCP servers are connected. All
are annotated `readOnlyHint: true` except `mapo_scaffold`, which can create files and says so — no
tool is ever `destructiveHint`, because nothing here deletes or replaces without an explicit flag.

| Tool                    | What it does                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mapo_search_docs`      | Ranked search over the Mapo docs. Returns the matching **sections** with their `path`, `#anchor`, matched symbols and an excerpt — plus the canonical recipe when the query matches a known task. Filters: `section` (`howto`, `guide`, `uikit`, `form`, `modules`, `migration`), `pkg` (`@mapomodule/form`, `uikit`, …), `limit`. |
| `mapo_get_doc`          | Returns the exact markdown of a page, or of a single section via `heading` (accepts the heading text or its anchor). Reports the page's full heading list so the assistant can narrow down, and truncates at `maxChars`.                                                                                                           |
| `mapo_list_recipes`     | The curated task → documentation map. With no argument it lists everything Mapo does out of the box; with `task` it returns the canonical recipe for a goal.                                                                                                                                                                       |
| `mapo_component_api`    | Props, events, slots and exposed methods of a `Mapo*` component, **extracted from its source**: real types, defaults and JSDoc. Partial names resolve (`list` → `MapoList`); `include` narrows the answer to one section.                                                                                                          |
| `mapo_list_field_types` | The form registry: every `type` a `FieldDescriptor` accepts, the component behind it, its `attrs` with types and descriptions, the registry-level default attrs, and a skeleton descriptor to copy.                                                                                                                                |
| `mapo_composable_api`   | The auto-imported composables and stores (`useCrud`, `useMapoAuth`, `useMediaStore`, …) with their real signatures, grouped by package.                                                                                                                                                                                            |

Typical sequence an assistant follows:

```
mapo_list_recipes({ task: "editors need to reorder navigation entries" })
  → "Build a navigation menu editor" → howto/menu-manager.md
mapo_get_doc({ path: "howto/menu-manager.md" })
  → writes code against the real API
mapo_component_api({ name: "MapoMenuManager" })
  → props and slots as the component actually declares them
```

**Why the API tools read source, not docs**: `docs/uikit/api.md` listed 11 props for `MapoDetail`
while the component declared 17. Prose drifts; source does not.

**The two live tools need the app.** Over HTTP they answer directly. Over stdio the CLI forwards
them to `http://localhost:3000/mcp/mapo` (override with `--app` or `MAPO_MCP_APP_URL`),
reconnecting on every call because the dev server routinely starts after the editor. When it is
down they explain how to bring it up instead of guessing.

### Scaffolding

`mapo_scaffold` is the only tool that can change the project, so its contract is deliberately
narrow:

- **Dry run by default.** It returns the files; nothing touches disk until `write: true`.
- **Field types are validated against the registry.** `fields: ["title:text", "body:wysiwyg"]`
  fails with the list of real types rather than emitting a descriptor that renders nothing.
- **Writing is guarded** by [`write.ts`](src/runtime/core/write.ts): development only, paths
  resolved and proven to stay inside the project root (symlinks followed), and an existing file is
  never replaced without `overwrite: true`. Each file reports its own outcome instead of the batch
  aborting halfway.
- The generated pages are modelled on the recipes in `docs/howto/` and on the pages that actually
  run in `apps/example-e2e`, and are verified end to end: a scaffolded list page renders in the
  example app unmodified.

After scaffolding new pages, **restart the dev server**: Nuxt hot-reloads `routes.mjs` but the
server-side router keeps the old table, so a brand-new route 404s until it restarts.

### From the backend schema to a page

`mapo_backend_schema` closes the last gap: the assistant knows Mapo _and_ the API this project
talks to.

```
mapo_backend_schema({ action: "list_models" })            # what the API exposes
mapo_backend_schema({ action: "to_fields", model: "Article" })
```

The mapping is deliberate rather than mechanical:

- `enum` → `select` with readable item labels; `format: date-time` → `datetime`; `binary` → `file`;
  a short `maxLength` stays a `text`, a long one becomes a `textarea`.
- A nested component becomes `fks` and an array of components becomes `m2m` — **with the real
  endpoint**, found by scanning `paths` for the collection route that serves that component
  (`{count, results}` pagination and bare arrays both recognised).
- `readOnly` properties are skipped, and the tool says so; `includeReadOnly: true` keeps them as
  readonly descriptors.
- Anything uncertain carries an inline comment (`// no list endpoint found for Editor`) instead of
  a confident guess.
- A property whose mapping is not registered in _this_ app is skipped, not emitted.

The response ends with a ready-made `mapo_scaffold` payload, so schema → descriptors → page is
three calls.

The source is `mapo.mcp.backend.schemaUrl`, `$MAPO_BACKEND_SCHEMA_URL`, or the tool's `url`
argument — an http(s) URL **or a local file**, so a team can commit an exported schema and work
offline. drf-spectacular serves YAML by default: the tool detects it and tells you to add
`?format=json`.

## Prompts

Slash-commands in clients that support MCP prompts. Each one names the tools to call and their
order, which is the part a model improvises worst:

| Prompt              | Workflow                                                                           |
| ------------------- | ---------------------------------------------------------------------------------- |
| `mapo-crud-page`    | inspect the app → pick field types → scaffold list + detail → check component APIs |
| `mapo-custom-field` | check no built-in type fits → read the registry contract → scaffold → implement    |
| `mapo-debug-form`   | doctor → inspect registered types → compare `attrs` → search the docs              |
| `mapo-migrate-v1`   | read the migration page → verify every symbol against the installed source         |
| `mapo-theme`        | pick the lightest layer: tokens → scaffold override → slots → MapoOverride         |

## Resources

Attachable context, for clients that support MCP resources:

| URI                      | Contents                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `mapo://knowledge/index` | Everything this server knows: recipes, doc pages, components, field types, composables.   |
| `mapo://docs/{path}`     | A full documentation page. Clients can list every page.                                   |
| `mapo://fields/{type}`   | The complete contract of one field type. Clients can list every type.                     |
| `mapo://app/manifest`    | The running app's Mapo setup — HTTP transport only, since the CLI has no app to describe. |

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

[`scripts/build-knowledge.mjs`](scripts/build-knowledge.mjs) drives the generator in
[`src/build/`](src/build/), which produces two files.

**`docs.json`** — walks `docs/**/*.md` (skipping `roadmap/` and `DECISIONS.md`, which are internal),
splits each page at its H2/H3 headings — ignoring headings inside fenced code blocks — and writes
every chunk plus the inverted index. Each chunk carries its path, section, package,
VitePress-compatible anchor, the symbols it mentions (`MapoList`, `useCrud`, field types) and
whether it is API reference.

**`api.json`** — reads the packages' sources:

| Extractor                                                    | Source                                                                                  | Produces                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`extract-components.ts`](src/build/extract-components.ts)   | `uikit` + `form` `.vue` files, via `vue-component-meta`                                 | props, events, slots, exposed, with resolved types, defaults and JSDoc               |
| [`extract-fields.ts`](src/build/extract-fields.ts)           | `registry/defaults.ts` (through jiti) + `types/descriptor.ts` (TypeScript compiler API) | every field `type`, its component, its `attrs`, and the shared descriptor properties |
| [`extract-composables.ts`](src/build/extract-composables.ts) | each module's `addImports([...])` calls                                                 | the auto-imported composables with their signatures                                  |

Each extracted symbol is cross-linked back to the doc sections that document it.

Two deliberate choices: the generator reuses the **compiled** indexer (or the TypeScript source
through jiti in stub mode) rather than reimplementing tokenisation — index and query side must
produce identical tokens or recall silently degrades — and it lives in its own bundle entry so
`vue-component-meta`, `typescript` and `jiti` never reach the runtime.

Field types are extracted from the **declared** type text, not the checker's expansion: the latter
turns `DeepKeyOf<T>` into an unreadable wall of conditional types.

`MAPO_DOCS_ROOT` overrides the docs location; `MAPO_MCP_KNOWLEDGE_DIR` overrides where the runtime
looks for the generated files.

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
   import { toMcpTool } from "../../../../nitro/to-mcp-tool.js";

   export default toMcpTool(myTool);
   ```

4. If the tool works without the dev server, add it to `staticTools()` in `src/cli.ts` too, and
   update the expected list in `src/__tests__/cli.test.ts`.

Tools return markdown on purpose: assistants read it directly, and it costs fewer tokens than JSON
wrapped in prose.

### Layout

```
src/
├── module.ts                    # Nuxt module: toolkit install, definition injection, app snapshot
├── cli.ts                       # citty CLI → MCP over stdio
├── index.ts                     # public types
├── build/                       # build-time only: docs indexing + source extraction
│   ├── index.ts                 # orchestrator → dist/knowledge/{docs,api}.json
│   ├── extract-components.ts    # vue-component-meta
│   ├── extract-fields.ts        # registry + descriptor interfaces
│   └── extract-composables.ts   # addImports declarations
└── runtime/
    ├── core/                    # transport-agnostic: tokenizer, indexer, search, recipes,
    │                            #   doctor, scaffold/, write guard, openapi, prompts, tools
    ├── nitro/                   # server-side adapters
    │   ├── context.ts           # reads the build-time context virtual module
    │   ├── to-mcp-tool.ts       # spec → defineMcpTool
    │   └── to-mcp-prompt.ts     # spec → defineMcpPrompt
    ├── mcp/handlers/mapo/       # the named handler with its tools, resources and prompts
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

**A component is missing from `mapo_component_api`**
The build logs `skipped <Name>` when `vue-component-meta` cannot resolve a component. Only `Mapo*`
components under `src/runtime/components/` of `uikit` and `form` are extracted.

---

## Status

Shipped: documentation search with curated recipes, page retrieval, component/field/composable APIs
extracted from source, live app introspection and diagnostics, guarded scaffolding, backend schema
mapping, MCP resources and prompts, the dev-only Nuxt module with its namespaced handler, and the
stdio CLI with transparent forwarding of the live tools.

Planned (see [docs/roadmap/MCP_SERVER_PLAN.md](../../../docs/roadmap/MCP_SERVER_PLAN.md)):
`mapo-mcp install` / Agent Skill / MCP App inspector.
