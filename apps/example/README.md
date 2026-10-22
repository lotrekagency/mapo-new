# @mapomodule/example

The core demo of Mapo v2, wired to a real [Camomilla CMS](https://github.com/lotrekagency/camomilla) backend through the published [`@mapomodule/mapo-integrations-camomilla`](https://github.com/camomillacms/mapo-integrations-camomilla) package.

## Prerequisites

A Camomilla instance at `http://localhost:8000`. Login and the session go through the Camomilla proxy, so every page needs it. The content pages (articles, menus, media, categories, tags) read the local mock endpoints in `server/api/mock/`, which the proxy leaves alone.

## Run

From the monorepo root:

```bash
pnpm install
pnpm build              # once after cloning
pnpm dev:example        # http://localhost:3000
```

## What's demonstrated

| Page                    | Feature                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `/login`                | The built-in login page of `@mapomodule/uikit`: the app ships none                              |
| `/`                     | Dashboard                                                                                       |
| `/articles`             | `MapoList` with tabs, filters, bulk actions and an endpoint carrying its own `?ordering`        |
| `/articles/[id]`        | `MapoDetail` with tabs, nested tabs, groups and field slots                                     |
| `/authexample`          | The `auth` and `permissions` middleware with `permissions: { model }`, and the page permissions |
| `/feedback`             | `useSnackStore` and `useConfirmStore`                                                           |
| `/form-demo`            | `MapoForm` on local state, with `fks` and `m2m` fields fed by mock endpoints                    |
| `/form-headless`        | `useMapoForm()` with a custom layout                                                            |
| `/form-schema`          | `useFormFromSchema()` on a DRF-spectacular style schema, with conditional fields                |
| `/form-test`            | Grid layout, progressive disclosure, async validation, repeater, focus mode                     |
| `/media`                | `MapoMediaManager` on the endpoints set in `mapo.uikit.media`                                   |
| `/menus`, `/menus/[id]` | `MapoList` and `MapoMenuManager`: drag-and-drop tree, per-language trees, link picker           |
| `/settings`             | `sidebarFooter: true`: the page sits in the sidebar footer                                      |

## Configuration

Point `camomilla.server` in `nuxt.config.ts` at your backend:

```ts
camomilla: {
  server: "http://localhost:8000",
  syncCamomillaSession: false,
},
```

The integration's options are documented in [`docs/modules/camomilla.md`](../../docs/modules/camomilla.md).

## See also

- [`apps/example-e2e/`](../example-e2e/): the reference app, with an in-memory mock API instead of a backend
- [`apps/example-theme/`](../example-theme/): theming and MapoOverride, no backend
- [`apps/example-custom-form/`](../example-custom-form/): `core` and `form` with Vuetify fields
