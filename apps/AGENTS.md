# AGENTS.md — `apps/`

Local rules for the demo and reference apps. The root [`AGENTS.md`](../AGENTS.md) still applies. The apps are private workspace packages: they are never released, and they consume the packages through `workspace:*`.

## The apps

| App                   | Port | Backend                              | Use it for                                                                 |
| --------------------- | ---- | ------------------------------------ | -------------------------------------------------------------------------- |
| `example-e2e`         | 3000 | In-memory mock in `server/api/**`    | The reference app: one page per scenario, the live check, the MCP test bed |
| `example`             | 3000 | A real Camomilla instance on `:8000` | The core demo with the published `@mapomodule/mapo-integrations-camomilla` |
| `example-theme`       | 3001 | None                                 | Theming layers, layout slots, MapoOverride                                 |
| `example-custom-form` | 3001 | Mock routes in `server/`             | Replacing the field registry with Vuetify components                       |

Agents run live checks in `example-e2e` only (`pnpm dev:example-e2e`), and stop the server afterwards. `example` needs a backend that is not part of this repository.

## `example-e2e`

- **Accounts**: `admin`, `editor` and `viewer`, password equal to the username (`server/utils/session.ts`).
- **Pages**: one per scenario under `app/pages/` (auth, permissions, roles, `form/*`, `list/*`, `media/*`, `menu/*`, i18n, feedback, sidebar). The sidebar is built from each page's `definePageMeta`, so a new page needs no menu configuration.
- **Mock API**: `server/api/**` with in-memory stores in `server/utils/`. It resets when the server restarts.
- **`api-schema.json`** describes that mock API the way drf-spectacular would, for `mapo_backend_schema`. When an endpoint or a payload in `server/api/**` changes, update it in the same change.
- **`devtools.componentInspector` is off** on purpose: its tracer injects an import that does not resolve under pnpm's isolated layout and breaks the dev server.
- **A new page 404s** until the dev server restarts.

## Rules

1. **Apps show the documented way.** Code here is copied by people and read by assistants as an example: use the public APIs exactly as the docs describe them, with no private imports from package internals.
2. **A new package feature gets a scenario** in `example-e2e` (a page or a section of one), so it can be checked live.
3. **No secrets.** Apps read backend settings from `nuxt.config.ts`; never commit `.env` values.
4. **Type-check the app you change**: the root `pnpm typecheck` covers the packages, not the apps.

   ```bash
   cd apps/example-e2e
   npx nuxt prepare
   npx vue-tsc --noEmit -p .nuxt/tsconfig.app.json
   ```

## Gotchas

- **A workspace package change does not show up** → the package was not rebuilt, or is not in stub mode (`pnpm dev:packages`); then run `pnpm nuxt prepare` in the app.
- **`apps/example` fails to log in** → no Camomilla backend on `:8000`.
- **`[nuxt-i18n]` warns that `mapo-i18n.config.mjs` is not found** → known build notice, printed by every app.
