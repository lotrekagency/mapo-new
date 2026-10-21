# AGENTS.md — `@mapomodule/mcp`

Local rules for the MCP server that teaches AI assistants Mapo inside consumer apps. The root [`AGENTS.md`](../../../AGENTS.md) still applies; the procedures are in [`docs/contributing/mcp-server.md`](../../../docs/contributing/mcp-server.md).

## What this package is

One set of transport-agnostic tool specs, served two ways:

- a **dev-only Nuxt module** that registers a named handler of `@nuxtjs/mcp-toolkit` at `POST /mcp/mapo` (it also knows the running app's configuration);
- the **`mapo-mcp` stdio CLI**, which serves the same static tools without a dev server and forwards `mapo_inspect_app` and `mapo_doctor` to the app when it is up.

The knowledge base (`dist/knowledge/docs.json` and `api.json`) is generated at build time from `docs/**/*.md` and from the `uikit` and `form` sources. It is the package's data: **what assistants are told is only as good as the docs, the recipes, the JSDoc and the instructions.**

## Layout

```text
src/
  module.ts              Nuxt module: toolkit install, handler path injection, build-time app snapshot
  cli.ts                 citty CLI → MCP over stdio; staticTools(), resources, prompts
  index.ts               public types
  build/                 build time only: docs indexing + component/field/composable extraction
  runtime/core/          transport-agnostic: instructions, tokenizer, indexer, search, recipes,
                         prompts, resources, doctor, openapi, scaffold/, write guard, tools/
  runtime/nitro/         Nitro adapters (context, to-mcp-tool, to-mcp-prompt)
  runtime/mcp/handlers/mapo/   the named handler: index.ts, tools/, resources/, prompts/
scripts/build-knowledge.mjs    generator driver; clean-handler-dts.mjs strips .d.ts from handlers
```

## Rules

1. **Both transports stay identical.** Logic lives in `runtime/core/`; Nitro files and `cli.ts` are thin wrappers. A new tool, prompt or resource is wired in both (the steps are in the procedure page).
2. **One description of Mapo.** The server instructions come from `runtime/core/instructions.ts`, used by both the handler and the CLI. The long-form overview is `docs/guide/concepts.md`. Never inline a second copy.
3. **`runtime/mcp/` contains only `handlers/`.** The toolkit loads every top-level file of a scanned path as a handler.
4. **Build-time code stays in `src/build/`**, a separate bundle entry, so `vue-component-meta`, `typescript` and `jiti` never reach the runtime.
5. **Tools return markdown**, are prefixed `mapo_`, carry annotations and `inputExamples`. Only a tool that writes files may drop `readOnlyHint`; writes go through `runtime/core/write.ts`.
6. **No secrets in output.** The app snapshot exposes public runtime config only; the backend token is read from the env var named in `backend.tokenEnv` at request time and never echoed.
7. **Every prompt names tools that exist**, in the order the model should call them.

## Change together

| You change                         | Also change                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| A tool's name, inputs or behaviour | `README.md` tools table, `docs/modules/mcp.md`, prompts that name it, `src/__tests__/cli.test.ts` |
| The instructions                   | Nothing else, but keep them consistent with `docs/guide/concepts.md`                              |
| A recipe                           | `src/__tests__/recipes.test.ts` (a question it must win)                                          |
| The indexer's exclusions           | `src/__tests__/knowledge.test.ts`, `docs/contributing/documentation.md`                           |
| The scaffold templates             | Check the generated page still renders in `apps/example-e2e`                                      |

## Verify

```bash
pnpm --filter @mapomodule/mcp build      # module + CLI, then the knowledge base
pnpm --filter @mapomodule/mcp test       # unit tests, real-index regressions, stdio handshake
pnpm --filter @mapomodule/mcp typecheck
pnpm --filter @mapomodule/mcp lint
```

The knowledge tests are skipped when the package is not built: build first. For the HTTP transport, run `pnpm dev:example-e2e` and call `http://localhost:3000/mcp/mapo`; for stdio, `node packages/@mapomodule/mcp/bin/mapo-mcp.mjs serve --root apps/example-e2e` from the repository root. Stop the dev server afterwards.

## Gotchas

- **"Mapo knowledge base not found"** → the package is not built.
- **A search returns prop tables instead of a how-to** → phrase the query as a task, or add a recipe for it.
- **A scaffolded page 404s** → restart the dev server; Nuxt's server router keeps its route table.
- **A component is missing from `mapo_component_api`** → the build logs `skipped <Name>` when `vue-component-meta` cannot resolve it; only `Mapo*` components in `uikit` and `form` are extracted.
