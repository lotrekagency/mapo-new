# How-to: set up your AI assistant

Goal: let Claude Code, Cursor, VS Code or any MCP client answer Mapo questions
from the real documentation and the real configuration of **your** app, instead
of guessing.

Time: about two minutes.

::: tip What you get
Grounded answers ("`MapoList` takes `endpoint` and `detail-base`") instead of
plausible inventions, plus the canonical recipe for whatever you are building.
:::

## 1. Check the server is there

Nothing to install for the HTTP endpoint: `mapomodule` registers
`@mapomodule/mcp` in development. Start your app and look at the log:

```bash
pnpm dev
```

```
[@nuxtjs/mcp-toolkit] ✔ /mcp enabled with 6 tools, 4 resources, 1 handler
```

The Mapo endpoint is at **`http://localhost:3000/mcp/mapo`**.

If you do not want it at all:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: { mcp: false },
});
```

## 2. Choose a transport

There are two ways to reach the same tools, and they answer different needs:

| Transport              | Works when                      | Knows                                    |
| ---------------------- | ------------------------------- | ---------------------------------------- |
| **stdio** (`mapo-mcp`) | always, even with no dev server | Mapo docs and recipes                    |
| **HTTP** (`/mcp/mapo`) | while `pnpm dev` is running     | the same, **plus** your app's own config |

Configuring both is fine — and recommended. You will usually keep stdio as the
always-on one and add HTTP when you want app-aware answers.

## 3. Expose the `mapo-mcp` binary

The MCP package is installed as a dependency of `mapomodule`, and package
managers only link the binaries of **direct** dependencies. Add it explicitly:

```bash
pnpm add -D @mapomodule/mcp
```

Now `npx mapo-mcp serve` runs the local copy — no download, no version drift
with the Mapo you actually use.

## 4. Configure your editor

### Claude Code

Create `.mcp.json` in the project root:

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

Restart Claude Code and check with `/mcp` that the `mapo` server is connected.

### Cursor

`.cursor/mcp.json`:

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

### VS Code (Copilot Chat, agent mode)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "mapo": {
      "type": "stdio",
      "command": "npx",
      "args": ["mapo-mcp", "serve"]
    }
  }
}
```

### Any client, over HTTP

Point it at `http://localhost:3000/mcp/mapo` (Streamable HTTP). For clients that
only speak stdio, keep the `mapo-mcp` entry above.

## 5. Verify

Ask the assistant something Mapo-specific and watch it call the tools:

> "How do I build a list of articles with filters and bulk actions?"

Expect it to call `mapo_search_docs` or `mapo_list_recipes`, land on
`howto/crud-list.md`, then check the component contract with
`mapo_component_api({ name: "MapoList" })` before writing code.

Manual check without an assistant:

```bash
curl -s -X POST http://localhost:3000/mcp/mapo \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## 6. Get better answers

**Ask like a developer, not like a search engine.** "How do I paginate a list?"
beats "pagination". The ranker demotes prop tables for task-shaped questions and
promotes them when you ask about an API surface ("what props does `MapoDetail`
accept").

**Start from the recipes.** `mapo_list_recipes` with no argument is the fastest
way to learn what Mapo already does, before designing something Mapo ships out
of the box.

**Add a project rule.** Some clients ignore the server's `instructions`. A line
in `CLAUDE.md` / `.cursorrules` / project instructions goes a long way:

```md
This project uses Mapo. Before writing Mapo code, consult the `mapo_*` MCP tools:
`mapo_list_recipes` / `mapo_search_docs` / `mapo_get_doc` for how-to, and
`mapo_component_api` / `mapo_list_field_types` / `mapo_composable_api` for exact
APIs. Never invent component props or form field types.
```

## Troubleshooting

**The tools do not show up**
Check the client actually started the server (`/mcp` in Claude Code, the MCP
panel in Cursor/VS Code), and that `npx mapo-mcp serve` runs from the project
root. If it does not, step 3 was skipped: the binary only exists once
`@mapomodule/mcp` is a direct dependency.

**`/mcp/mapo` returns 404**
The dev server is not running, or the app is a production build, or
`mapo.mcp` is `false`.

**Answers reference APIs that do not exist**
Verify the tools were actually called. Models that answer from memory are the
problem the project rule above solves.

## See also

- [@mapomodule/mcp](/modules/mcp) — module reference and configuration
- [MCP Toolkit](https://mcp-toolkit.nuxt.dev) — the underlying Nuxt module
