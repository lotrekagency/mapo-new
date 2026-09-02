# Getting Started

Mapo is a Vue 3 / Nuxt 4 admin framework. This guide gets you from zero to a running Nuxt app with Mapo's core, store, and Camomilla integration wired up.

## Prerequisites

- Node.js >= 20
- pnpm >= 8 (or npm / yarn — examples below use pnpm)
- A Nuxt 4 application

## Install

Install the meta-package, `@nuxt/ui`, and (optionally) the Camomilla integration:

```bash
pnpm add mapomodule @nuxt/ui
pnpm add @mapomodule/mapo-integrations-camomilla   # optional — only if you use Camomilla CMS
```

The `mapomodule` meta-package transparently installs `@mapomodule/core`, `@mapomodule/store`, and `@mapomodule/uikit`. You don't need to add them as separate dependencies. `@iconify-json/lucide` is bundled with `mapomodule` — no need to install it separately.

## Configure

Add the modules to your `nuxt.config.ts` and configure them under the `mapo` and `camomilla` keys:

```ts
export default defineNuxtConfig({
  modules: [
    "@nuxt/ui", // must come before mapomodule — see note below
    "mapomodule",
    "@mapomodule/mapo-integrations-camomilla", // optional
  ],

  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
    loginUrl: "/login",
  },

  camomilla: {
    server: "http://localhost:8000",
    syncCamomillaSession: false,
  },
});
```

All `mapo` keys are optional — they fall back to the [defaults defined in `MAPO_DEFAULTS`](/modules/core#configuration).

## Create app.vue

Nuxt 4 requires an explicit `app.vue`. Mapo needs two wrappers to work correctly:

- **`<UApp>`** — provides Nuxt UI context (design tokens, toast, overlays). Without it theming and Nuxt UI components break.
- **`<NuxtLayout>`** — activates the layout system. The `mapo-default` layout (sidebar + topbar) is only applied if this wrapper is present.

```vue
<!-- app/app.vue -->
<script setup lang="ts"></script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

### Customizing logo and topbar

Pass content into the layout via named slots on `<NuxtLayout>`. The full slot reference is in [Layout slots](../uikit/layout#slots).

```vue
<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <template #sidebar:logo>
        <NuxtLink to="/" class="flex items-center gap-2.5 min-w-0">
          <img src="~/assets/logo.svg" class="h-6" alt="Acme" />
          <span class="font-semibold text-sm truncate">Acme Admin</span>
        </NuxtLink>
      </template>

      <template #topbar:right>
        <MapoThemeToggle />
      </template>

      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

## Use it

Mapo auto-imports its composables and stores. In any Vue component or page:

```vue
<script setup lang="ts">
const { login, logout } = useMapoAuth();
const auth = useAuthStore();
const repo = useCrud<{ id: number; title: string }>("/api/contents/");

async function loadContents() {
  const { results, count } = await repo.list({ page: 1 });
  return results;
}
</script>
```

Protect a page with the auth middleware:

```vue
<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });
</script>
```

## TypeScript types

Composables and stores are **auto-imported** — no explicit import is ever needed. Types require an explicit `import type`.

```ts
// ✅ No import — composables are auto-imported by Nuxt
const { list } = useCrud<Article>("/api/articles/");
const snack = useSnackStore();

// Types — import from the meta-package aggregator (preferred)
import type { FieldDescriptor, ListColumn } from "mapomodule/types";

// Or from individual packages when needed
import type { FieldDescriptor } from "@mapomodule/form/types";
import type { ListColumn } from "@mapomodule/uikit/types";

// Camomilla types are always package-specific (it's an optional module)
import type { CamomillaPathRewrite } from "@mapomodule/mapo-integrations-camomilla/types";
```

`mapomodule/types` aggregates all types from `@mapomodule/core`, `@mapomodule/store`, `@mapomodule/form`, `@mapomodule/uikit`, and `@mapomodule/utils`.

Utility functions from `@mapomodule/utils` (e.g. `debounce`, `deepMerge`) are **not** auto-imported and require explicit imports.

→ See the full **[Import Guide](./imports)** for the complete API → import mapping table.

---

## Next steps

- **[Import Guide](./imports)** — full API → import mapping table (composables, types, utils)
- **[Architecture & Flows](./architecture-flows)** — how SSR hydration, the fetch interceptor, and auth wire together
- **[Core module](/modules/core)** — full API reference for `useCrud`, `useMapoAuth`, the auth middleware
- **[Store module](/modules/store)** — auth, snack, confirm, sidebar stores + `usePermissions`
- **[Camomilla integration](/modules/camomilla)** — proxy setup, path rewriting, cookie sync
- **[Writing your own integration](/modules/integrations-howto)** — adapt Mapo to any backend
- **[Known limitations](./known-limitations)** — what to expect during migration to v2

## Reference examples

The repo ships two demo apps:

| App                   | Script                   | Port | What it covers                                                         |
| --------------------- | ------------------------ | ---- | ---------------------------------------------------------------------- |
| `apps/example/`       | `pnpm dev:example`       | 3000 | Login, CRUD, multipart upload, permissions, snackbar, confirm, sidebar |
| `apps/example-theme/` | `pnpm dev:example-theme` | 3001 | CSS tokens, Nuxt UI config, MapoOverride, layout slots, dark mode      |

```bash
pnpm install
pnpm dev:example          # core feature demo
pnpm dev:example-theme    # theming & override demo
```

## Developing packages

When working on the packages themselves, use the per-package watch scripts so `dist/` stays in sync without a full rebuild:

```bash
pnpm dev:uikit        # @mapomodule/uikit  — nuxt-module-build --stub --watch
pnpm dev:core         # @mapomodule/core   — nuxt-module-build --stub --watch
pnpm dev:store        # @mapomodule/store  — nuxt-module-build --stub --watch
pnpm dev:utils        # @mapomodule/utils  — tsc --watch
pnpm dev:mapomodule   # mapomodule         — nuxt-module-build --stub --watch
```

Or start all package watchers at once with Turborepo:

```bash
pnpm dev:packages     # runs `dev` across all packages in parallel
```

Run a package watcher alongside a demo app in two terminals:

```bash
# terminal 1
pnpm dev:uikit

# terminal 2
pnpm dev:example-theme
```
