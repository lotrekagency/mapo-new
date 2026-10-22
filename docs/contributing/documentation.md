# Writing documentation

How Mapo's documentation is structured and written, and why every change to it also reaches AI assistants. Anyone who adds or changes a feature, a component or a composable updates the docs in the same change, following this page.

## Docs ship with the code

A change is not done until the docs describe it. Update the pages the change touches in the same commit, and add every new page to the sidebar in `docs/.vitepress/config.mts`. A stale page is worse than a missing one, because people and assistants trust it.

The `docs/` folder has two audiences:

- **This site**, built by VitePress and published on GitHub Pages.
- **The MCP server**: `@mapomodule/mcp` indexes `docs/**/*.md` at build time and serves it to AI assistants. A wrong sentence here becomes a wrong answer in someone's editor. See [Docs and the MCP server](#docs-and-the-mcp-server).

## Writing rules

1. Write in English.
2. Document the current code, not intentions. Check every path, prop, option and command against the source.
3. Explain behaviour and trade-offs, not only where things are. Describe the happy path and the failure path.
4. Call temporary workarounds temporary, and say what removes them.
5. No dates and no people's names: they rot. Git keeps the history.
6. Use the present tense for what exists and the future tense for what is planned.
7. Use direct, technical language and the second person ("pass `endpoint` as…", "use `useCrud` to…").
8. Keep sections short, under clear headings, and open each page with what it solves.
9. Use the same terms everywhere: the ones in [Concepts](/guide/concepts).

## Two layers of documentation

Every feature has two layers.

### Narrative and how-to pages

The page you read to understand a feature: the why, the when and the how. A developer who has never used Mapo must be able to follow it.

```md
# Feature name

Short intro (1–3 lines): what it solves and where it is used.

## Quickstart

Minimal working example with code.

## Key concepts

Internal mechanics, only when they are not obvious.

## Advanced examples

Real-world use cases, non-trivial configurations, slots and overrides.

## Notes and limitations

What cannot be done, known workarounds, gotchas.
```

- Code blocks are complete and copy-pasteable.
- Every option or prop mentioned in the text links to, or names, its API reference entry.
- Describe internals only when they are needed to use the feature correctly.

### API reference pages

The page you consult for props, emits, slots, parameters and return types. Tables only, no prose.

| File                     | Covers                                |
| ------------------------ | ------------------------------------- |
| `docs/uikit/api.md`      | Every UIKit component and layout      |
| `docs/uikit/form/api.md` | Every Form Engine component           |
| `docs/modules/api.md`    | Every composable and utility function |

## Documenting a Vue component

On the narrative page (for example `docs/uikit/list.md`): one or more usage examples, prose on the most important props, slot examples for advanced cases, and a link to the API entry at the bottom: `→ [Full API](/uikit/api#mapolist)`.

In the API reference, each component follows this structure:

```md
## ComponentName

One line describing what it does.

### Props

| Prop       | Type     | Default     | Description   |
| ---------- | -------- | ----------- | ------------- |
| `propName` | `string` | `'default'` | What it does. |

### Emits

| Event        | Payload | Description         |
| ------------ | ------- | ------------------- |
| `event-name` | `T`     | When it is emitted. |

### Slots

| Slot        | Description                                        |
| ----------- | -------------------------------------------------- |
| `slot-name` | What it contains. Available props: `{ foo, bar }`. |

### Exposed Methods (only when `defineExpose` is used)

| Method    | Signature    | Description       |
| --------- | ------------ | ----------------- |
| `refresh` | `() => void` | Reloads the data. |
```

- The `Default` column is always present. Use `—` when there is no default, and `— **required**` for a required prop.
- For complex types use the TypeScript type name, not the interface body (`FieldDescriptor[]`).
- Write union types with an escaped pipe so the table does not break (`string \| null`).

## Documenting a composable or a function

Every entry goes in `docs/modules/api.md`:

```md
### `functionName(param1, param2?)`

Short description of what it does (1–2 lines).

| Parameter | Type      | Default        | Description         |
| --------- | --------- | -------------- | ------------------- |
| `param1`  | `string`  | — **required** | What it represents. |
| `param2`  | `boolean` | `false`        | What it controls.   |

**Returns:** `ReturnType` — What the returned value contains.
```

- The heading is the full signature with parameters (`` ### `useCrud(endpoint)` ``).
- The `Default` column is mandatory, with the same conventions as above.
- A function that returns an object with several members gets a second table: `Member | Type | Description`.
- A Pinia store gets three tables: State, Getters and Actions.

## Where files go

```
docs/
  guide/              ← getting started, concepts, architecture, compatibility, release
  howto/              ← task-focused recipes with complete code
  uikit/
    <feature>.md      ← narrative page for each UIKit component
    api.md            ← API reference for every UIKit component and layout
    form/
      <feature>.md    ← narrative page for each Form Engine feature
      api.md          ← API reference for every Form Engine component
  modules/
    <package>.md      ← narrative page for core, store, utils, i18n, mcp, integrations
    api.md            ← API reference for every composable and function
  migration/          ← v1 → v2
  contributing/       ← working on Mapo itself (not indexed by the MCP server)
```

## Typography conventions

| Element               | Style                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Component name        | `MapoList`, `MapoDetail` (PascalCase, backtick inline)                    |
| Prop / parameter name | `endpoint`, `modelValue` (camelCase, backtick)                            |
| Event name            | `update:modelValue`, `saved` (backtick)                                   |
| Slot name             | `field.{key}`, `dtable.toolbar` (backtick)                                |
| TypeScript type       | `FieldDescriptor<T>`, `string \| null` (backtick, `\|` escaped in tables) |
| Default value         | `'id'`, `true`, `[]` (backtick)                                           |
| No default            | `—` (em dash)                                                             |
| Required prop/param   | `— **required**`                                                          |
| Link to API section   | `→ [Full API](/uikit/api#mapolist)`                                       |

## Docs and the MCP server

`@mapomodule/mcp` builds its knowledge base from this folder:

- Each page is split at its H2 and H3 headings; each section becomes a search result with its anchor.
- `contributing/`, `roadmap/`, `DECISIONS.md` and the `AGENTS.md` / `CLAUDE.md` files are left out: they are for maintainers, not for people building apps.
- The curated recipes in `packages/@mapomodule/mcp/src/runtime/core/recipes.ts` point at pages and headings. **Renaming a page or a heading breaks them**: the MCP tests catch it, so update the recipe in the same change.
- When a change makes a new task possible (a new feature, a new how-to), add a recipe for it.
- [Concepts](/guide/concepts) is the overview the server gives assistants. Keep it true when the architecture changes.

After editing docs, rebuild the knowledge base and run the MCP tests:

```bash
pnpm --filter @mapomodule/mcp build
pnpm --filter @mapomodule/mcp test
```

The procedures for recipes, prompts and tools are in [Working on the MCP server](./mcp-server).

## VitePress pitfalls

- **Dead links do not fail the build**: the site sets `ignoreDeadLinks: true`. Check every link you add, and remember that a moved page breaks the links that point at it.
- **A bare `<word>` in prose or in a heading is parsed as an HTML tag** and breaks the build. Keep component tags and placeholders inside backticks or fenced code, and run `pnpm docs:build`.
- **Links must stay inside `docs/`.** Point at repository files with a code-formatted path (`packages/@mapomodule/form/src/module.ts`) or a GitHub URL.

## Package READMEs

Each package's `README.md` is what npm shows. Keep it consistent with the docs and link to the site for the details rather than copying them.
