# @mapomodule/mcp

An [MCP](https://modelcontextprotocol.io) server that makes AI assistants
competent at Mapo **inside your project**: grounded documentation search,
curated recipes and — with the dev server running — introspection of your real
app.

::: tip Development tool
The module registers itself only when `nuxt.options.dev` is true. Production
builds never expose the endpoint.
:::

## Why

An assistant editing a Mapo app has no way to learn Mapo on its own: the
documentation is a private workspace package it never sees, component APIs live
in `.vue` files inside `node_modules`, and the app's real configuration is only
knowable from the running Nuxt instance. Left to guess, models invent props,
invent field types and write v1 code in a v2 project.

This module removes the guessing: the assistant asks the tools instead.

## Installation

Installed by the `mapomodule` meta-package, so a standard setup needs nothing:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
});
```

Start the dev server and the endpoint is live at **`POST /mcp/mapo`**. The
startup log announces it:

```
[@nuxtjs/mcp-toolkit] ✔ /mcp enabled with 10 tools, 4 resources, 5 prompts, 1 handler
```

Then point your editor at it — see
[How-to: set up your AI assistant](/howto/ai-assistant) for the per-IDE
configuration, including the `mapo-mcp` stdio server that works with the dev
server down.

## Configuration

Everything lives under `mapo.mcp`:

```ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],

  mapo: {
    mcp: {
      // Register the server. Default: nuxt.options.dev
      enabled: true,

      // Used by the backend schema tools
      backend: {
        schemaUrl: "http://localhost:8000/api/schema/?format=json",
        tokenEnv: "MAPO_BACKEND_TOKEN",
      },
    },
  },
});
```

| Option              | Type      | Default                    | Description                                                                     |
| ------------------- | --------- | -------------------------- | ------------------------------------------------------------------------------- |
| `enabled`           | `boolean` | `nuxt.options.dev`         | Register the MCP server. Set `true` to force it outside development.            |
| `backend.schemaUrl` | `string`  | `$MAPO_BACKEND_SCHEMA_URL` | OpenAPI/DRF schema URL used by the backend tools.                               |
| `backend.tokenEnv`  | `string`  | `"MAPO_BACKEND_TOKEN"`     | Env var holding the schema bearer token. The value is never sent to the client. |

The route is fixed at `<mcp.route>/mapo` (so `/mcp/mapo` with the toolkit's
default `mcp.route`): the toolkit derives a folder handler's name from its
directory. Change the prefix with the toolkit's own `mcp.route` option if it
clashes with something in your app.

Opt out entirely with:

```ts
mapo: {
  mcp: false;
}
```

The package can also be registered on its own, without the meta-package, under
the `mapoMcp` config key:

```ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@mapomodule/mcp"],
  mapoMcp: { enabled: true },
});
```

## Tools

All tools are prefixed `mapo_` so they stay unambiguous when several MCP servers
are connected. Every one is annotated read-only except `mapo_scaffold`, which
can create files and declares it.

| Tool                    | Purpose                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mapo_search_docs`      | Ranked search over the Mapo docs. Returns matching **sections** with path, anchor, mentioned symbols and an excerpt — plus the canonical recipe when one matches. Filters: `section`, `pkg`, `limit`. |
| `mapo_get_doc`          | The exact markdown of a page, or of one section (`heading` accepts the heading text or its anchor), truncated at `maxChars`.                                                                          |
| `mapo_list_recipes`     | The curated task → documentation map. No argument lists everything Mapo does; `task` returns the recipe for a goal.                                                                                   |
| `mapo_component_api`    | Props, events, slots and exposed methods of a `Mapo*` component, extracted from its source with real types, defaults and JSDoc. Partial names work (`list` → `MapoList`).                             |
| `mapo_list_field_types` | Every `type` a `FieldDescriptor` accepts, the component behind it, its `attrs` and the registry defaults — plus a skeleton descriptor to copy.                                                        |
| `mapo_composable_api`   | The auto-imported composables and stores (`useCrud`, `useMapoAuth`, `useMediaStore`, …) with their real signatures.                                                                                   |

A typical exchange:

```
mapo_list_recipes({ task: "editors need to reorder navigation entries" })
→ "Build a navigation menu editor" → howto/menu-manager.md

mapo_get_doc({ path: "howto/menu-manager.md" })
mapo_component_api({ name: "MapoMenuManager" })
→ the assistant writes code against the real API
```

::: tip Source over prose
The API tools read the packages' sources at build time, not the documentation:
`docs/uikit/api.md` listed 11 props for `MapoDetail` while the component
declared 17. Ask them whenever you are unsure about a prop, a slot or an
`attrs` key.
:::

## Scaffolding

`mapo_scaffold` is the only tool that writes. Nine kinds: `list-page`,
`detail-page`, `standalone-form`, `custom-field`, `login-page`,
`theme-override`, `backend-proxy`, `menu-page`, `media-page`.

```
mapo_scaffold({
  kind: "detail-page",
  name: "articles",
  fields: ["title:text:Title", "body:editor:Content", "status:select:Status"],
})
```

Field types are validated against the registry: an unknown `type` fails with
the list of real ones instead of generating a descriptor that renders nothing.

::: warning Writing is opt-in and guarded
Nothing touches disk until `write: true`. Even then the write happens only in
development, only inside the project root (symlinks resolved), and never
replaces an existing file unless `overwrite: true`.
:::

After scaffolding new pages, **restart the dev server**: Nuxt hot-reloads
`routes.mjs`, but the server-side router keeps the previous table and a
brand-new route answers 404 until it restarts.

## Backend schema

`mapo_backend_schema` reads the OpenAPI document your backend already publishes
(drf-spectacular for Django REST Framework) and turns a serializer into Mapo
field descriptors.

```
mapo_backend_schema({ action: "list_models" })
mapo_backend_schema({ action: "describe_model", model: "Article" })
mapo_backend_schema({ action: "to_fields",     model: "Article" })
```

What the mapping does for you:

| Schema                                   | Field                                          |
| ---------------------------------------- | ---------------------------------------------- |
| `enum`                                   | `select` with readable item labels             |
| `format: date-time` / `date` / `time`    | `datetime` / `date` / `time`                   |
| `format: email` / `uri` / `binary`       | `email` / `url` / `file`                       |
| `type: string` with a short `maxLength`  | `text` (limit carried into `attrs`)            |
| `type: string` long or unbounded         | `textarea`                                     |
| `type: integer` with `minimum`/`maximum` | `number` with bounds                           |
| `$ref` to a component                    | `fks` **with the endpoint** taken from `paths` |
| array of `$ref`                          | `m2m`, same endpoint inference                 |

`readOnly` properties are skipped (`includeReadOnly: true` keeps them as
readonly fields), anything uncertain carries an inline comment instead of a
confident guess, and a property whose mapping is not registered in your app is
skipped rather than emitted. The response ends with a ready-made
`mapo_scaffold` payload.

::: tip Source of the schema
`mapo.mcp.backend.schemaUrl`, `$MAPO_BACKEND_SCHEMA_URL`, or the tool's `url`
argument. An http(s) URL **or a local file path**, so you can commit an exported
schema and work offline. drf-spectacular serves YAML by default — the tool
detects it and reminds you to add `?format=json`.
:::

## Prompts

Clients that support MCP prompts expose these as slash-commands:

| Prompt              | What it drives                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `mapo-crud-page`    | inspect the app → pick field types → scaffold list + detail → check APIs    |
| `mapo-custom-field` | rule out built-in types → read the registry contract → scaffold → implement |
| `mapo-debug-form`   | doctor → inspect registered types → compare `attrs` → search the docs       |
| `mapo-migrate-v1`   | read the migration page, then verify every symbol against installed source  |
| `mapo-theme`        | pick the lightest layer: tokens → override file → slots → MapoOverride      |

## Resources

For clients that support MCP resources:

| URI                      | Contents                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mapo://knowledge/index` | Everything the server knows: recipes, pages, components, field types, composables.                                                       |
| `mapo://docs/{path}`     | A full documentation page; clients can list every page.                                                                                  |
| `mapo://fields/{type}`   | The complete contract of one field type; clients can list every type.                                                                    |
| `mapo://app/manifest`    | Your app's Mapo setup: installed modules, public config, registered field types, components, admin routes, locales. HTTP transport only. |

::: tip Live tools over stdio
`mapo_inspect_app` and `mapo_doctor` describe the running project, so they are
answered by the HTTP endpoint. The `mapo-mcp` CLI still exposes them: it
forwards the call to `http://localhost:3000/mcp/mapo` (override with `--app` or
`MAPO_MCP_APP_URL`) and, when the dev server is down, explains how to start it.
:::

Still to come — `mapo-mcp install`, the Agent Skill and the MCP App inspector.

## How it works

- The module installs [`@nuxtjs/mcp-toolkit`](https://mcp-toolkit.nuxt.dev) and
  injects its own definitions through the toolkit's `mcp:definitions:paths`
  hook, as a **named handler**. Your app's own MCP definitions, if any, keep
  their own `/mcp` endpoint untouched.
- The documentation is indexed **at package build time** into a BM25 index
  bundled with the package: no network, no API keys, and the docs always match
  the installed version of Mapo.
- Answers are sections, not whole files, so the assistant's context stays small.

## Security

- Development only by default; the route does not exist in production builds.
- The app snapshot exposes public runtime config only — private keys appear as
  key names, never values.
- Backend credentials are read from the environment **per request** — only the
  name of the variable reaches the build output — and never appear in a tool
  response.
- Every tool is read-only except `mapo_scaffold`, whose writing is opt-in,
  development-only, confined to the project root and unable to replace an
  existing file without `overwrite: true`.

## Troubleshooting

**`POST /mcp/mapo` returns 404**
The dev server is not running, `mapo.mcp` is `false`, or the app is a production
build. Check the startup log for the toolkit line.

**"Mapo knowledge base not found"**
Only possible in a source checkout — run
`pnpm --filter @mapomodule/mcp build`. The published package ships the index.

**The assistant still invents props**
Verify the client actually loaded the server (`tools/list` must show the
`mapo_*` tools). Some clients ignore the server's `instructions`; in that case
add a short project rule telling the assistant to consult the `mapo_*` tools
before writing Mapo code.

## See also

- [How-to: set up your AI assistant](/howto/ai-assistant)
- [MCP Toolkit documentation](https://mcp-toolkit.nuxt.dev)
