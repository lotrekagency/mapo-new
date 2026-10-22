# Concepts

How Mapo fits together: the packages, the contract it expects from your backend, and the few ideas every page is built from. Read it once before the how-to recipes; it is also what the [MCP server](/modules/mcp) hands to AI assistants as Mapo's overview.

## What Mapo is

Mapo is a set of Nuxt 4 modules for building admin interfaces (backoffices) on top of a REST API. You describe resources declaratively — an endpoint, the columns of a list, the fields of a form, the permissions of a page — and Mapo renders the list and detail pages, the forms, the login, the navigation, the media library and the menu editor.

The stack is Nuxt 4, Vue 3, Nuxt UI v4 (Tailwind CSS v4), Pinia and `@nuxtjs/i18n`. HTTP goes through Nuxt's `$fetch`. Mapo v2 is a rewrite of v1 (Nuxt 2, Vue 2, Vuex, Axios): v1 code and v1 APIs do not apply — see [Migration v1 → v2](/migration/v1-to-v2).

You install one meta-package next to Nuxt UI, in this order:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
});
```

## The packages

| Package             | Role                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mapomodule`        | Meta-module. Reads the `mapo` config key and installs every package below (`@mapomodule/mcp` only in development).                       |
| `@mapomodule/core`  | Service layer: `$mapoFetch` with 401/403 handling, `useCrud`, `useMapoAuth`, the `auth`, `permissions` and `roles` route middleware.     |
| `@mapomodule/store` | Pinia stores: `useAuthStore`, `useSnackStore`, `useConfirmStore`, `useSidebarStore`, plus `usePermissions`.                              |
| `@mapomodule/uikit` | The admin shell (layouts, sidebar, topbar, login), `MapoList`, `MapoDetail`, the media manager, the menu manager, theming, MapoOverride. |
| `@mapomodule/form`  | The form engine: `FieldDescriptor[]`, the field registry, `MapoForm`, `useMapoForm()`, the JSON Schema bridge.                           |
| `@mapomodule/i18n`  | A wrapper around `@nuxtjs/i18n` with Mapo's English and Italian catalogs and `useMapoT()`.                                               |
| `@mapomodule/utils` | Plain TypeScript helpers (`deepMerge`, `objectDiff`, `slugify`, …). Not a Nuxt module, not auto-imported.                                |
| `@mapomodule/mcp`   | A development-only MCP server that gives AI assistants Mapo's docs, real component APIs and your app's configuration.                    |

Backend integrations ship as separate packages. The Camomilla CMS one is [`@mapomodule/mapo-integrations-camomilla`](/modules/camomilla); any other backend gets [its own small integration](/modules/integrations-howto).

How the packages depend on each other:

```
mapomodule
├── @mapomodule/store    Pinia
├── @mapomodule/i18n     @nuxtjs/i18n
├── @mapomodule/core     → store, utils
├── @mapomodule/form     → store, i18n, utils
├── @mapomodule/uikit    → core, store, form, i18n, utils, @nuxt/ui
└── @mapomodule/mcp      development only
```

## How a request flows

1. A page declares its layout, middleware, sidebar entry and permissions with `definePageMeta`.
2. On the server, `@mapomodule/core` hydrates the session: it calls `userInfoApi` and fills `useAuthStore()` before any page renders.
3. The `auth`, `permissions` and `roles` middleware decide whether the route is reachable.
4. Components fetch through `useCrud()` and `$mapoFetch`. Requests go to the Nuxt server (`/api/*`), where a backend integration proxies them to the real API.
5. A 401 resets the session and redirects to the login page; a 403 shows a "Permission denied" snackbar and keeps the session.

Each step is drawn out, call by call, in [Architecture & Flows](./architecture-flows).

## What Mapo expects from your backend

Mapo follows Django REST Framework conventions. Any backend works if it speaks them, directly or through an integration that adapts it.

| Area         | Contract                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | Three Nuxt-side endpoints — `authLoginUrl`, `logoutUrl`, `userInfoApi` — with a cookie session. The user payload carries `groups` and permission codenames (`all_permissions` or `user_permissions`). |
| Lists        | `GET <endpoint>?page=&search=&ordering=` (plus your filters) returns `{ count, results }`.                                                                                                            |
| Details      | `GET <endpoint>/<id>/`, `POST` to create, `PATCH` with only the changed fields to update, `DELETE`. A 400 response keyed by field is shown on those fields.                                           |
| Permissions  | Django-style codenames such as `view_article` and `change_article`.                                                                                                                                   |
| Translations | Translatable fields read and write `translations[<lang>].<field>` on the record.                                                                                                                      |
| Media        | The media manager talks to media and folder endpoints through a replaceable adapter.                                                                                                                  |

The details are in [Custom backend integration](/howto/backend-integration) and in [Auth & permissions](/howto/auth-permissions).

## Pages are declarative

A Mapo page is route metadata plus one Mapo component with props. The sidebar is built from the route metadata, so a new page appears in the navigation without a menu configuration.

```vue
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Articles",
  icon: "i-lucide-newspaper",
  permissions: { model: "article" },
});
</script>

<template>
  <MapoList
    endpoint="/api/articles"
    detail-base="/articles"
    :columns="[{ key: 'title', label: 'Title', sortable: true }]"
  />
</template>
```

- **List pages** use `MapoList`: server-side pagination, search, sorting, filters, tabs, bulk actions and quick edit. → [CRUD list view](/howto/crud-list)
- **Detail pages** use `MapoDetail`: it loads the record, renders the form, saves a differential `PATCH` and maps 400 errors onto fields. `id="new"` creates. → [CRUD detail / form](/howto/crud-detail)
- **Route metadata** (`label`, `icon`, `parent`, `sidebarFooter`, `permissions`, `roles`) drives the sidebar and the guards. → [Sidebar](/uikit/sidebar)

## The form engine

A form is an array of `FieldDescriptor` objects. Each descriptor names a `key` (a dot path into the record), a `type`, a `label` and optional `attrs`, plus behaviour flags such as `required`, `translatable`, `visible` and `show`.

The `type` is resolved through the **field registry**, which maps each type to a lazily loaded component, its default `attrs` and an optional accessor. The built-in types are `text`, `textarea`, `email`, `url`, `number`, `boolean`, `switch`, `slider`, `color`, `file`, `select`, `date`, `time`, `datetime`, `fks`, `m2m`, `seo`, `editor`, `map`, `repeater`, `media`, `media-m2m` and `enhanced-media`.

- A type that is not registered renders `MapoUnknownField` instead of failing silently.
- `defineFormField()` registers a custom type. Registering an existing type replaces it and prints a development warning unless you pass `{ override: true }`. → [Registry](/uikit/form/registry)
- `MapoDetail` renders forms for you; `MapoForm` and `useMapoForm()` run the same engine on your own state. → [Standalone form](/howto/form-standalone)
- `useFormFromSchema()` builds descriptors from a JSON Schema, such as a DRF serializer. → [From JSON Schema](/uikit/form/schema-to-form)
- Validation, translatable fields, conditional fields, drafts, focus mode and slots each have their own page under **Form Engine**.

## Customization layers

Pick the lightest layer that does the job:

1. **CSS tokens** (`mapo.uikit.css`) for colours, radius and dark mode.
2. **Nuxt UI defaults** (`mapo.uikit.ui`) for component variants across the app.
3. **Slots** on the layout and on Mapo components for structural additions.
4. **MapoOverride**: a file at `app/mapooverride/<Component>.vue` replaces that Mapo component at build time. You then own its updates.

→ [Theming & customization](/howto/theming), [MapoOverride](/uikit/mapoverride)

## Configuration in one place

With the meta-module, everything lives under the `mapo` key. Core options sit at the top level (`authLoginUrl`, `userInfoApi`, `logoutUrl`, `loginUrl`, …), and each sub-module has its own block: `mapo.uikit`, `mapo.form`, `mapo.i18n` and `mapo.mcp`. A package installed on its own reads its own key instead: `mapoCore`, `mapoStore`, `mapoUikit`, `mapoForm`, `mapoI18n` or `mapoMcp`.

Every option has a default, listed in [Core options](/modules/core#options).

## Imports

- Composables, stores and components are auto-imported: never import `useCrud` or `MapoList`.
- Types need `import type`, preferably from the `mapomodule/types` aggregator.
- Helpers from `@mapomodule/utils` are imported explicitly.

→ [Import Guide](./imports)

## Where to go next

- [Getting Started](./getting-started) — install and configure a new app.
- [How-to Recipes](/howto/) — task-by-task guides with complete code.
- [Architecture & Flows](./architecture-flows) — the runtime call chains.
- [AI assistant (MCP)](/howto/ai-assistant) — let your assistant answer from these docs and your app's real configuration.
