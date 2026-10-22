# mapomodule

The Mapo meta-module: one Nuxt module that installs the whole Mapo v2 stack and reads its configuration from the `mapo` key. Mapo is a Nuxt 4 admin framework that turns a REST backend following Django REST Framework conventions into a backoffice, declaratively.

## Installation

```bash
pnpm add mapomodule@next @nuxt/ui
```

Mapo v2 is in beta and published on the `next` dist-tag; `latest` still points to Mapo v1 (Nuxt 2).

```ts
// nuxt.config.ts — register @nuxt/ui before mapomodule
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],

  mapo: {
    // @mapomodule/core options (these are the defaults)
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
    loginUrl: "/login",

    uikit: { css: "~/assets/css/theme.css" }, // theme tokens, Nuxt UI defaults, media endpoints
    form: { debounce: 300 }, // field registry defaults
    i18n: { defaultLocale: "en" }, // locales
    // mcp: false, // skip the development-only MCP server
  },
});
```

Every key is optional. The app also needs an `app.vue` that wraps the page in `<UApp>` and `<NuxtLayout>`: see [Getting Started](https://lotrekagency.github.io/mapo-new/guide/getting-started).

## What it installs

| Module              | Configured under        | Provides                                                                                 |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `@mapomodule/store` | —                       | Pinia stores (auth, snack, confirm, sidebar) and `usePermissions`                        |
| `@mapomodule/i18n`  | `mapo.i18n`             | `@nuxtjs/i18n` with Mapo's English and Italian catalogs                                  |
| `@mapomodule/core`  | `mapo` (top-level keys) | `$mapoFetch`, `useCrud`, `useMapoAuth`, the `auth`, `permissions` and `roles` middleware |
| `@mapomodule/uikit` | `mapo.uikit`            | Layouts, sidebar, login, `MapoList`, `MapoDetail`, media and menu managers, theming      |
| `@mapomodule/form`  | `mapo.form`             | The form engine and its field registry                                                   |
| `@mapomodule/mcp`   | `mapo.mcp`              | An MCP server for AI assistants, in development only                                     |

`@mapomodule/utils`, `@nuxt/ui` and `@iconify-json/lucide` come along as dependencies. A module you register yourself in `modules` is not installed a second time, and it then reads its own config key (`mapoForm`, `mapoUikit`, …) instead of the `mapo` block.

## Types

Composables, stores and components are auto-imported. Types come from one aggregator:

```ts
import type { FieldDescriptor, ListColumn } from "mapomodule/types";
```

`mapomodule/types` re-exports the public types of `core`, `store`, `form`, `uikit` and `utils`.

## Documentation

- [Getting Started](https://lotrekagency.github.io/mapo-new/guide/getting-started)
- [Concepts](https://lotrekagency.github.io/mapo-new/guide/concepts): the packages, the backend contract, the form engine, the customization layers
- [How-to recipes](https://lotrekagency.github.io/mapo-new/howto/)
- [Core options](https://lotrekagency.github.io/mapo-new/modules/core#options)
- [Migration v1 → v2](https://lotrekagency.github.io/mapo-new/migration/v1-to-v2)
