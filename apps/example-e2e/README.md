# @mapomodule/example-e2e

The reference app of Mapo v2: one page per scenario (auth, permissions, sidebar, layouts, form engine, lists, media, menus, i18n, feedback) on top of an in-memory mock API, so it runs without a backend. It is where changes are checked live, the test bed of the MCP server, and the target the browser end-to-end suite will be written against: there is no such suite yet.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build              # or keep `pnpm dev:packages` running in another terminal (stub mode)
pnpm dev:example-e2e    # http://localhost:3000
```

After switching packages to stub mode, regenerate this app's auto-import types with `pnpm nuxt prepare` in `apps/example-e2e`.

Log in as `admin` / `admin`. The `editor` and `viewer` accounts (password equal to the username) exercise permissions and roles; the users are defined in `server/utils/session.ts`. The mock API lives in `server/api/**`, with in-memory stores in `server/utils/`, and resets when the server restarts.

## Pages

| Route                                                                          | Scenario                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth`                                                                        | Login and logout                                                                                                                                                 |
| `/permissions-model`                                                           | `permissions: { model }`: the page permissions are populated                                                                                                     |
| `/permissions-raw`                                                             | `permissions: string[]`: a route gate only                                                                                                                       |
| `/roles-admin`                                                                 | The `roles` middleware (`admin` group required)                                                                                                                  |
| `/sidebar-parent/*`, `/sidebar-perm-filtered`, `/hidden-from-nav`, `/settings` | Sidebar: nesting, entries hidden by permission or by a missing `label`, `sidebarFooter`                                                                          |
| `/layout-slots`, `/layout-empty`                                               | The layout slots and the `mapo-empty` layout                                                                                                                     |
| `/form/*`                                                                      | Form engine: article CRUD, validation, repeater, draft, slots, schema to form, progressive disclosure, focus mode, field expand, custom fields, Nuxt UI wrappers |
| `/list/hybrid`, `/list/offline`                                                | `MapoList` loading the whole dataset once (`client-side`) or working on local items only (`v-model:items`)                                                       |
| `/media`, `/media/gallery`, `/media/picker`                                    | The media manager, the gallery and the picker dialog                                                                                                             |
| `/menu`, `/menu/[id]`, `/menu/slots`, `/menu/standalone`                       | The menu manager, its slots and its lower-level components                                                                                                       |
| `/i18n`                                                                        | Locale switching, app overrides, plurals, `useMapoT()`                                                                                                           |
| `/feedback`                                                                    | `useSnackStore` and `useConfirmStore`                                                                                                                            |
| `/store`                                                                       | Raw store state                                                                                                                                                  |

## Adding a page

1. Create `app/pages/<scenario>.vue` with `definePageMeta({ label, icon, middleware })`.
2. The sidebar picks it up from the route metadata: no menu configuration.
3. Restart the dev server: until then the new route returns 404.

A new package feature gets a scenario here, a page or a section of one, so it can be checked live.

## i18n scenario

`/i18n` covers the whole surface: the switcher (also in the topbar on every
page), imperative `setLocale`, interpolation, plurals, the escaped `@`, and
`useMapoT()` for store-like contexts.

The app ships `i18n/locales/{en,it}.json` overriding a single Mapo key
(`mapo.listTable.noItems`) to prove the deep merge: everything else keeps the
built-in text. The empty `MapoList` at the bottom of the page renders that
overridden string.

## MCP server (AI assistants)

`@mapomodule/mcp` is a dev dependency of this app, so both transports are
available here and the app doubles as the manual test bed for the server.

**HTTP**: run `pnpm dev:example-e2e` and the endpoint is live at
`POST /mcp/mapo`. This transport also answers the two tools that need the
running app (`mapo_inspect_app`, `mapo_doctor`).

**stdio**: the `.mcp.json` at the repository root starts the server from this
repository's build, rooted on this app:

```json
{
  "mcpServers": {
    "mapo": {
      "command": "node",
      "args": [
        "packages/@mapomodule/mcp/bin/mapo-mcp.mjs",
        "serve",
        "--root",
        "apps/example-e2e"
      ],
      "env": { "MAPO_BACKEND_SCHEMA_URL": "api-schema.json" }
    }
  }
}
```

Run `pnpm build` first: the server reads its knowledge base from the package
build. An editor opened on this folder alone can use a local `.mcp.json`
(gitignored) with `"command": "npx", "args": ["mapo-mcp", "serve"]`: the
binary resolves from `node_modules/.bin` because the package is a _direct_
dependency. Either way, the live tools are forwarded to
`http://localhost:3000/mcp/mapo` when the dev server happens to be up.

### The backend schema

[`api-schema.json`](api-schema.json) describes this app's own in-memory API
(`server/api/**`) the way drf-spectacular would, so `mapo_backend_schema` has
something real to map instead of a placeholder. It is a **curated subset** of
the article stress-test model, 21 properties, chosen to cover every mapping
rule: enums, length thresholds, formats, relations and server-computed fields.

`nuxt.config.ts` points the HTTP transport at it (`mapo.mcp.backend.schemaUrl`)
and `.mcp.json` does the same for stdio via `MAPO_BACKEND_SCHEMA_URL`. A
relative path resolves against the project root, which is this directory.

Relations are declared as nested components because that is how the app's own
form treats them (`/form/article/[id].vue` uses `fks` for `category` and `m2m`
for `tags`), while the wire format carries plain ids (`returnObject: false`).
Mapping `Article` therefore reproduces the descriptors that page already
declares, which is what makes it a useful check.

**Keep it in sync**: when an endpoint or a serializer changes in `server/api/**`,
update this file, or the assistant will map a shape the API no longer serves.

How the server works, its tools and how to extend it are documented in the
[package README](../../packages/@mapomodule/mcp/README.md).
