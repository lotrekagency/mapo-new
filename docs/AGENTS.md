# AGENTS.md — `docs/`

Local rules for the documentation. The root [`AGENTS.md`](../AGENTS.md) still applies. How to write and structure pages: [`contributing/documentation.md`](contributing/documentation.md). This file is excluded from the site (`srcExclude` in `.vitepress/config.mts`) and from the MCP index.

## Two audiences, one folder

Every page here is published on GitHub Pages **and** indexed by `@mapomodule/mcp`, which serves it section by section to AI assistants in consumer apps. Write for both: a vague or stale sentence becomes a wrong answer in someone's editor.

## Rules

1. **Facts from the current code.** Check every prop, option, path and command against the source before writing it. Component props and field `attrs` come from the source, not from memory.
2. **Same step as the code.** A behaviour change updates its narrative page and its API reference in the same change.
3. **Every new page goes in the sidebar** (`.vitepress/config.mts`), in the group of its folder.
4. **Headings are anchors for the MCP recipes.** Before renaming a page or a heading, search `packages/@mapomodule/mcp/src/runtime/core/recipes.ts` for its path and update the recipe in the same change. Moving a page also breaks the links to it, and the build does not catch dead links (`ignoreDeadLinks: true`).
5. **`guide/concepts.md` is Mapo's self-description** for people and for the MCP server. Update it when packages, config keys, the request flow or the backend contract change.
6. **Not indexed, on purpose**: `contributing/` (maintainers), `roadmap/` and `DECISIONS.md` (local, gitignored, never edited), and the `AGENTS.md` / `CLAUDE.md` files.
7. **No bare `<word>`** in prose or headings: VitePress parses it as HTML. Use backticks.
8. **Links stay inside `docs/`**; point at repository files with a code-formatted path or a GitHub URL.

## Verify

```bash
pnpm docs:build                               # the site builds
pnpm --filter @mapomodule/mcp build           # the knowledge base is regenerated from these pages
pnpm --filter @mapomodule/mcp test            # recipes still point at real pages and headings
```

Check the links you added or moved by hand: the build will not.
