# example-e2e

Nuxt 4 app used as the target for Mapo's E2E test suite. It exercises every major feature area — auth, permissions, sidebar, form engine, feedback, etc. — with one dedicated page per scenario.

## Running locally

From the monorepo root:

```bash
# Stub packages (required for correct IDE types)
pnpm dev:packages

# Generate Nuxt auto-import types
cd apps/example-e2e && pnpm nuxt prepare && cd ../..

# Start the dev server
pnpm dev:example-e2e
```

The app is available at `http://localhost:3000`.

## Pages

| Route                     | What it tests                                                   |
| ------------------------- | --------------------------------------------------------------- |
| `/auth`                   | Login / logout flow                                             |
| `/permissions-model`      | `permissions: { model }` middleware — pagePermissions populated |
| `/permissions-raw`        | `permissions: string[]` middleware — route gate only            |
| `/roles-admin`            | Role-based access (`admin` group required)                      |
| `/form/*`                 | Form engine scenarios (validation, repeater, draft, etc.)       |
| `/i18n`                   | Locale switching, app overrides, plurals, `useMapoT()`          |
| `/feedback`               | `useSnackStore` + `useConfirmStore`                             |
| `/settings`               | `sidebarFooter` meta                                            |
| `/sidebar-parent/*`       | Nested sidebar navigation                                       |
| `/store`                  | Raw store state inspection                                      |
| `/camomilla-integrations` | Camomilla proxy integration                                     |

## Adding a new page

1. Create `app/pages/<scenario>.vue` with `definePageMeta({ label, icon, middleware })`.
2. The page is automatically added to the sidebar (no manual menu config needed).
3. Document the E2E plan in `e2e/modules/<area>.md`.

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

**HTTP** — `pnpm dev:example-e2e` and the endpoint is live at
`POST /mcp/mapo`. This transport also answers the two tools that need the
running app (`mapo_inspect_app`, `mapo_doctor`).

**stdio** — `.mcp.json` (gitignored, so it stays local) points editors at the
bundled binary:

```json
{
  "mcpServers": {
    "mapo": {
      "command": "npx",
      "args": ["mapo-mcp", "serve"],
      "env": { "MAPO_BACKEND_SCHEMA_URL": "api-schema.json" }
    }
  }
}
```

The binary resolves from `node_modules/.bin` because the package is a _direct_
dependency; the live tools are forwarded to `http://localhost:3000/mcp/mapo`
when the dev server happens to be up.

### The backend schema

[`api-schema.json`](api-schema.json) describes this app's own in-memory API
(`server/api/**`) the way drf-spectacular would, so `mapo_backend_schema` has
something real to map instead of a placeholder. It is a **curated subset** of
the article stress-test model — 21 properties out of ~150 — chosen to cover
every mapping rule: enums, length thresholds, formats, relations and
server-computed fields.

`nuxt.config.ts` points the HTTP transport at it (`mapo.mcp.backend.schemaUrl`)
and `.mcp.json` does the same for stdio via `MAPO_BACKEND_SCHEMA_URL`. Both
paths are relative to this directory.

Relations are declared as nested components because that is how the app's own
form treats them — `/form/article/[id].vue` uses `fks` for `category` and `m2m`
for `tags` — while the wire format carries plain ids (`returnObject: false`).
Mapping `Article` therefore reproduces the descriptors that page already
declares, which is what makes it a useful check.

**Keep it in sync**: when an endpoint or a serializer changes in `server/api/**`,
update this file, or the assistant will map a shape the API no longer serves.

How the server works, its tools and how to extend it are documented in the
[package README](../../packages/@mapomodule/mcp/README.md).
