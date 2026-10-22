# Working on the MCP server

How to keep `@mapomodule/mcp` accurate as Mapo changes, and how to extend it with recipes, prompts, resources and tools. What the server does for app developers is in [@mapomodule/mcp](/modules/mcp); this page is about its source.

## What the server is made of

| Part           | Source                                                          | Kept in sync by                                    |
| -------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Docs search    | `docs/**/*.md`, indexed into `dist/knowledge/docs.json`         | Rebuilding the package after a docs change         |
| Component APIs | `uikit` and `form` `.vue` files, read with `vue-component-meta` | Rebuilding; JSDoc on props and events              |
| Field types    | `form` registry and descriptor interfaces                       | Rebuilding; JSDoc on `attrs`                       |
| Composables    | Every module's `addImports([...])` calls                        | Rebuilding                                         |
| Overview       | `docs/guide/concepts.md` and `src/runtime/core/instructions.ts` | Editing them by hand when the architecture changes |
| Recipes        | `src/runtime/core/recipes.ts`                                   | Editing it by hand; the tests check every link     |
| Prompts        | `src/runtime/core/prompts.ts`                                   | Editing it by hand                                 |

Everything under "Rebuilding" follows the code by itself, as long as the package is rebuilt (`pnpm build` does it). The rest is written by people and drifts unless someone updates it.

## What to update when Mapo changes

| You changed                                         | Also update                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A docs page path or a heading                       | The recipes that point at it (the MCP tests fail until you do)                           |
| A feature that makes a new task possible            | A recipe for the task; a prompt if the workflow takes several tools in a fixed order     |
| The package list, the config keys, the request flow | `docs/guide/concepts.md` and, if the summary changes, `src/runtime/core/instructions.ts` |
| A component's props, events or slots                | Nothing by hand: keep the JSDoc accurate and rebuild                                     |
| A field type                                        | `src/runtime/core/openapi.ts` if a schema shape should map to it                         |
| A composable                                        | Nothing by hand, as long as it is registered with `addImports`                           |
| A tool, a prompt or a resource                      | `README.md` of the package, `docs/modules/mcp.md` and the CLI test (see below)           |

Then verify:

```bash
pnpm --filter @mapomodule/mcp build
pnpm --filter @mapomodule/mcp test
pnpm --filter @mapomodule/mcp typecheck
```

## Adding a recipe

A recipe maps a task, phrased the way a developer asks for it, to the page that answers it. Keyword search cannot infer that intent, so the recipes are curated by hand in `src/runtime/core/recipes.ts`:

```ts
{
  id: "form-draft",
  task: "Autosave form drafts",
  keywords: ["draft", "autosave", "useFormDraft", "restore", "unsaved"],
  doc: "uikit/form/draft.md",
  seeAlso: ["howto/crud-detail.md"],
  summary:
    "useFormDraft keeps unsaved edits in localStorage and offers to restore them on the next visit.",
}
```

- `id` is unique; `keywords` has at least three entries; `summary` is one sentence.
- `doc`, `heading` and every `seeAlso` must exist in the generated knowledge base: `src/__tests__/knowledge.test.ts` checks them against the real docs.
- Add a case to `src/__tests__/recipes.test.ts` with a question the recipe must win, and run the suite: new keywords can steal another recipe's questions.

## Adding a prompt

Prompts are slash-commands: the model receives them as if the user had typed them. Each one names the tools to call and their order.

1. Add a `MapoPrompt` to `src/runtime/core/prompts.ts` and to the `PROMPTS` array. Every tool it names must exist.
2. Add the Nitro wrapper `src/runtime/mcp/handlers/mapo/prompts/<name>.ts`:

   ```ts
   import { myPrompt } from "../../../../core/prompts.js";
   import { toMcpPrompt } from "../../../../nitro/to-mcp-prompt.js";

   export default toMcpPrompt(myPrompt);
   ```

The stdio CLI registers everything in `PROMPTS` on its own.

## Adding a resource

1. Write the render function in `src/runtime/core/resources.ts`, so both transports share it.
2. Add the Nitro definition in `src/runtime/mcp/handlers/mapo/resources/<name>.ts` with `defineMcpResource`.
3. Register it in `registerResources()` in `src/cli.ts`, unless it needs the running app (as `mapo://app/manifest` does).
4. Test the render function in `src/__tests__/resources.test.ts`, and the listing in `src/__tests__/cli.test.ts`.

## Adding a tool

1. Write the spec in `src/runtime/core/tools/<area>.ts` with `defineMapoTool`: an explicit `Args` interface, a zod `inputSchema`, annotations, `inputExamples`, and a `run` that returns markdown.
2. Export it from the area's tool array.
3. Add a one-line Nitro wrapper in `src/runtime/mcp/handlers/mapo/tools/<name>.ts`:

   ```ts
   import { myTool } from "../../../../core/tools/<area>.js";
   import { toMcpTool } from "../../../../nitro/to-mcp-tool.js";

   export default toMcpTool(myTool);
   ```

4. If the tool works without the dev server, add it to `staticTools()` in `src/cli.ts`, and update the expected list in `src/__tests__/cli.test.ts`.
5. Mention it in the instructions (`src/runtime/core/instructions.ts`) if assistants should reach for it unprompted.

Tools return markdown on purpose: assistants read it directly, and it costs fewer tokens than JSON wrapped in prose. Names start with `mapo_`, and only a tool that writes files may drop `readOnlyHint`.

## Rules the toolkit imposes

- `src/runtime/mcp/` contains nothing but `handlers/`. The toolkit loads every top-level file of a scanned path as a handler, so a helper placed there breaks the Nitro build.
- The build-time extractors live in `src/build/`, a separate bundle entry, so `vue-component-meta`, `typescript` and `jiti` never reach the runtime.
- Writing is guarded by `src/runtime/core/write.ts`: development only, inside the project root, never over an existing file without `overwrite: true`.

## Trying it by hand

Over stdio, against the reference app, from the repository root:

```bash
node packages/@mapomodule/mcp/bin/mapo-mcp.mjs serve --root apps/example-e2e
```

Over HTTP, with `pnpm dev:example-e2e` running, at `http://localhost:3000/mcp/mapo`. This transport also answers `mapo_inspect_app` and `mapo_doctor`. The commands are in [Testing](./testing#live-verification-in-the-reference-app).
