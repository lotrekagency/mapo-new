# Migration guide: Mapo v1 → v2

This guide covers everything that changed between Mapo v1 (Nuxt 2 / Vue 2 / Vuex / Axios) and Mapo v2 (Nuxt 4 / Vue 3 / Pinia / `$fetch`). It documents both the breaking changes to the framework itself and the tooling changes made to the monorepo.

---

## Monorepo tooling

### Package manager: Yarn → pnpm

v1 used Yarn Workspaces + Lerna. v2 uses **pnpm Workspaces**.

```bash
# v1
yarn install
yarn add some-package

# v2
pnpm install
pnpm add some-package
```

The workspace declaration moved from `package.json` (`workspaces`) to `pnpm-workspace.yaml`:

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/@mapomodule/*"
  - "packages/mapomodule"
  - "apps/*"
  - "docs"
```

`lerna.json` has been removed. All Lerna scripts (`lerna publish`, `lerna bootstrap`) are no longer used.

### Task orchestration: Lerna → Turborepo

Build, test, and lint tasks are now orchestrated by **Turborepo** (`turbo.json`). It handles dependency ordering and incremental caching automatically.

```bash
# Run build for all packages (respects dependency order)
pnpm turbo build

# Run typecheck across the monorepo
pnpm turbo typecheck
```

### Release: `yarn pub` → multi-semantic-release

Releases are driven by **Conventional Commits** + `multi-semantic-release`. Each `fix:`, `feat:`, or `BREAKING CHANGE:` commit automatically:

1. Bumps the version of only the affected packages
2. Generates a per-package `CHANGELOG.md`
3. Publishes to npm
4. Creates a GitHub release

No more manual `yarn pub` or `lerna publish` invocations.

### TypeScript: JavaScript → TypeScript strict

v1 was plain JavaScript. v2 is **TypeScript strict** end-to-end. All packages extend a shared `tsconfig.base.json` at the root:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

---

## Package changes

### Removed packages

| Package                    | Reason                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@mapomodule/integrations` | The adapter loader pattern is unnecessary in Nuxt 4 — each integration is a standalone Nuxt module added directly to `modules[]` |
| `@mapomodule/http-client`  | Created and removed in the same session (DP-6 → DP-7). `$fetch.create()` in a plugin replaces it with zero abstraction overhead  |
| `@mapomodule/routemeta`    | Nuxt 4's `definePageMeta()` supports arbitrary typed properties via module augmentation — the AST parser is no longer needed     |

### New packages

| Package                       | Purpose                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `mapo-integrations-camomilla` | Nitro proxy middleware for Camomilla CMS — rewrites `/api/*` paths and handles Django session/cookie sync |

### Renamed / restructured

| v1                       | v2                                                                |
| ------------------------ | ----------------------------------------------------------------- |
| `packages/@mapomodule/*` | `packages/@mapomodule/*`                                          |
| `store/modules/app.js`   | `@mapomodule/store` → `useSidebarStore`, `useSnackStore`          |
| `store/modules/user.js`  | `@mapomodule/store` → `useAuthStore`                              |
| `store/modules/media.js` | `@mapomodule/store` → (media state moved into `@mapomodule/form`) |

### `mapomodule` — from re-export to real Nuxt module (DP-9)

In v1, `mapomodule` was a JavaScript file that re-exported everything from `@mapomodule/core`. In v2 it started as a TypeScript re-export (`export * from '@mapomodule/core'`) but has been refactored into a proper `defineNuxtModule`:

```ts
// mapomodule/src/module.ts
export default defineNuxtModule({
  meta: { name: "mapomodule", configKey: "mapo" },
  async setup() {
    if (!hasNuxtModule("@mapomodule/core")) {
      await installModule("@mapomodule/core");
    }
  },
}) satisfies NuxtModule;
```

Nuxt 4.1 introduced `moduleDependencies`, and Mapo uses it in compatible modules (for example `@mapomodule/store` for Pinia). The `mapomodule` meta-module currently keeps resolver-based `installModule` for pnpm strict transitive resolution compatibility.

This means `mapomodule` in `modules[]` is now sufficient to install the entire Mapo stack — no need to list `@mapomodule/core` or `@mapomodule/store` separately.

---

## Breaking changes

### Vuex → Pinia

All Vuex module access is gone. Replace with Pinia composables:

```ts
// v1 — Vuex
this.$store.commit("mapo/user/SET_TOKEN", token);
this.$store.dispatch("mapo/app/showSnackMessage", {
  message: "Saved!",
  color: "success",
});
this.$store.getters["mapo/app/drawer"];

// v2 — Pinia
const auth = useAuthStore();
// No setToken — authentication is derived from user info, not a token value
// After login, use: auth.setUser(user) — called automatically by useMapoAuth().login()

const snack = useSnackStore();
snack.show("Saved!", "success");

const sidebar = useSidebarStore();
sidebar.drawer;
```

> **Important**: `setToken()` does not exist in v2. The `__mapo_session` cookie is HttpOnly and cannot be stored in JavaScript state. `isAuthenticated` is derived from whether user info has been loaded (`!!auth.info`). You should not need to call `setUser` or `reset` directly — `useMapoAuth()` handles both.

### Axios → `$fetch`

`this.$axios` is gone. All HTTP calls now go through `$mapoFetch` (configured by `@mapomodule/core`) or via `useCrud`.

```ts
// v1
const { data } = await this.$axios.get("/api/articles/");

// v2
const data = await useCrud<Article>("/api/articles/").list();
// or direct:
const { $mapoFetch } = useNuxtApp();
const data = await $mapoFetch("/api/articles/");
```

`$mapoFetch` does not inject an `Authorization` header — auth is cookie-based. The 401/403 interceptors are handled automatically (session reset + redirect on 401, snack on 403).

### `nuxtServerInit` → init server plugin

The Vuex `nuxtServerInit` action is replaced by a Nuxt server plugin in `@mapomodule/core`:

```ts
// v1 — store/index.js
actions: {
  nuxtServerInit({ commit, dispatch }, { req }) {
    const { __mapo_session } = cookieparser.parse(req.headers.cookie)
    if (__mapo_session) {
      commit('user/SET_TOKEN', __mapo_session)
      await dispatch('user/getInfo')
    }
  }
}

// v2 — handled automatically by @mapomodule/core plugin (01.init.server.ts)
// No action required — authStore and sidebarStore are hydrated on every SSR request.
// The plugin forwards the full Cookie header to the backend and calls authStore.setUser().
```

### Route middleware

```ts
// v1 — middleware/auth.js
export default function ({ store, redirect }) {
  if (!store.getters["mapo/user/isLoggedIn"]) redirect("/login");
}

// v2 — applied via definePageMeta, implemented in @mapomodule/core
definePageMeta({
  middleware: ["auth"],
});
```

### Integration configuration

```ts
// v1 — nuxt.config.js
mapo: {
  integrations: {
    camomilla: {
      location: '@mapomodule/mapo-integrations-camomilla',
      configuration: {
        api: { target: 'http://localhost:8000' }
      }
    }
  }
}

// v2 — nuxt.config.ts
export default defineNuxtConfig({
  modules: ['mapomodule', 'mapo-integrations-camomilla'],
  mapo: {
    authLoginUrl: '/api/auth/login',
    userInfoApi: '/api/profiles/me/',
    logoutUrl: '/api/auth/logout',
  },
  camomilla: {
    server: 'http://localhost:8000',
  }
})
```

### List view: `MapoList` config object → `<MapoList>` declarative props

In v1 a list view was a Vue component reading a `mapoList` config object. In v2 it is a typed Vue component driven by props/slots that share `FieldDescriptor[]` with `<MapoDetail>`.

```vue
<!-- v1 -->
<MapoList :crud="crud" :config="{ headers, filters, actions }" />

<!-- v2 -->
<MapoList
  :crud="useCrud < Article > '/api/articles/'"
  :columns="columns"
  :filters="filters"
  :quick-edit-fields="quickEditFields"
  :tabs="[
    { key: 'draft', label: 'Drafts' },
    { key: 'published', label: 'Published' },
  ]"
  @row-click="(row) => navigateTo(`/articles/${row.id}`)"
>
  <template #cell.status="{ row }">
    <UBadge :color="row.published ? 'success' : 'neutral'">
      {{ row.published ? "Published" : "Draft" }}
    </UBadge>
  </template>
</MapoList>
```

Quick-edit reuses the same field descriptors as `<MapoDetail>` — no separate dialog code. Drag reorder calls `crud.updateOrder` once, not one `PATCH` per row.

### Detail view: `MapoDetail` config → `<MapoDetail>` + `FieldDescriptor[]`

```vue
<!-- v1 -->
<MapoDetail :crud="crud" :config="{ fields, tabs, sidebar }" />

<!-- v2 -->
<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

const fields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", required: true, tab: "content" },
  { key: "body", type: "editor", tab: "content", translatable: true },
  { key: "is_draft", type: "switch", group: "sidebar" },
];
</script>

<template>
  <MapoDetail
    :crud="useCrud<Article>('/api/articles/')"
    :fields="fields"
    :languages="['en', 'it']"
  />
</template>
```

`<MapoDetail>` automatically wires `useMapoForm()`, `useCrud`, the unsaved-changes guard, the snack/confirm bridges, and the language switcher. It sends a differential `PATCH` (only the changed keys) and surfaces field-level 400 errors on the right field.

### Form fields: declarative `fields` config (compatible)

The `fields: FieldDescriptor<T>[]` shape stays similar in spirit to v1 but is now a **TypeScript discriminated union**: typos in `key` are caught by the IDE, `type: 'select'` requires `attrs.options`, and unknown types render as a yellow placeholder instead of crashing.

Per-field i18n:

```ts
// v1 — `i18n: true` on the descriptor
// v2
{ key: 'title', type: 'text', translatable: true }       // reads/writes model.translations[lang].title
{ key: 'body',  type: 'editor', translatable: true, synci18n: true }  // also propagates to all langs
```

Custom field registration moved from "stick a Vue component into a folder" to a typed plugin call:

```ts
// v2 — app/plugins/my-fields.ts
export default defineNuxtPlugin(() => {
  defineFormField("video-cut", () => import("~/components/VideoCutField.vue"), {
    attrs: { aspectRatio: "16:9" },
  });
});
```

See [Custom fields →](/uikit/form/custom-fields) for the per-page registry override and `descriptor.is` escape hatches.

### Legacy `is:` components → v2 field equivalents

In v1 a field descriptor could use `is: 'ComponentName'` to render a fully custom field component (e.g. `is: 'AnimatedTitleFields'`). In v2 the same data is expressed as multiple standard `FieldDescriptor` objects — no custom component needed.

**Group / tab structural change:**

| v1 concept                        | v2 equivalent                          |
| --------------------------------- | -------------------------------------- |
| Top-level `group` (renders a tab) | `tab: 'name'` on each field            |
| Nested group inside a group       | `group: 'name'` on each field          |
| Sidebar group                     | `sidebarFields` prop on `<MapoDetail>` |

**Component mapping:**

| Legacy `is:`                           | v2 fields                                                             |
| -------------------------------------- | --------------------------------------------------------------------- |
| `AnimatedTitleFields`                  | 3 × `type: 'text'`: `pre_title`, `underline_title`, `post_title`      |
| `CTAField`                             | 2 × `type: 'text'`: `title`, `link`                                   |
| `IconSelect` with `coloredIconChoices` | `type: 'select'` + `attrs.items` array                                |
| `Prefooter`                            | `type: 'media'` + `type: 'media'` + `type: 'switch'` + `type: 'text'` |

**Before (v1):**

```ts
// Descriptor with is: pointing to a monolithic component
{ label: 'Hero', is: 'AnimatedTitleFields', field: 'hero' }
// → renders one widget that internally manages pre_title / underline_title / post_title

{ label: 'CTA', is: 'CTAField', field: 'cta' }
// → one widget managing title + link

{ label: 'Icona', is: 'IconSelect', field: 'icon', coloredIconChoices: true }

// Top-level groups were tabs in the UI:
groups: [
  { name: 'Contenuto', fields: [ ... ] },      // → top-level tab
  {
    name: 'SEO',
    groups: [                                   // → nested group inside tab
      { name: 'Meta', fields: [ ... ] },
    ],
  },
]
```

**After (v2):**

```ts
import type { FieldDescriptor } from "mapomodule/types";
import { KnownFieldType } from "mapomodule/types";

interface PageModel {
  hero_pre_title: string;
  hero_underline_title: string;
  hero_post_title: string;
  cta_title: string;
  cta_link: string;
  icon: string;
  prefooter_bg: string | null;
  prefooter_logo: string | null;
  prefooter_dark_mode: boolean;
  prefooter_tagline: string;
}

const fields: FieldDescriptor<PageModel>[] = [
  // ── AnimatedTitleFields → 3 plain text fields (tab: 'contenuto') ─────────
  {
    key: "hero_pre_title",
    type: "text",
    label: "Pre-titolo",
    tab: "contenuto",
    cols: 12,
  },
  {
    key: "hero_underline_title",
    type: "text",
    label: "Titolo",
    tab: "contenuto",
    cols: 12,
  },
  {
    key: "hero_post_title",
    type: "text",
    label: "Post-titolo",
    tab: "contenuto",
    cols: 12,
  },

  // ── CTAField → 2 plain text fields ───────────────────────────────────────
  {
    key: "cta_title",
    type: "text",
    label: "Testo CTA",
    tab: "contenuto",
    cols: 8,
  },
  {
    key: "cta_link",
    type: "text",
    label: "URL CTA",
    tab: "contenuto",
    cols: 4,
  },

  // ── IconSelect with coloredIconChoices → select + items ──────────────────
  {
    key: "icon",
    type: KnownFieldType.Select,
    label: "Icona",
    tab: "contenuto",
    attrs: {
      items: [
        { label: "🔵 Primario", value: "primary" },
        { label: "🟡 Accent", value: "accent" },
        { label: "⚫ Neutro", value: "neutral" },
      ],
    },
  },

  // ── Prefooter → media + media + switch + text (group card) ───────────────
  {
    key: "prefooter_bg",
    type: "media",
    label: "Sfondo",
    tab: "contenuto",
    group: "prefooter",
  },
  {
    key: "prefooter_logo",
    type: "media",
    label: "Logo",
    tab: "contenuto",
    group: "prefooter",
  },
  {
    key: "prefooter_dark_mode",
    type: "switch",
    label: "Dark mode",
    tab: "contenuto",
    group: "prefooter",
  },
  {
    key: "prefooter_tagline",
    type: "text",
    label: "Tagline",
    tab: "contenuto",
    group: "prefooter",
  },
];
```

> **Tip:** use [`flattenFieldGroups`](/uikit/form/advanced#hierarchical-field-authoring-with-flattenFieldGroups) when you have many fields sharing the same `tab` / `group` — it lets you author them as a nested tree and avoid repeating the same keys on every descriptor.

### Component override: `MapoOverride*` folder → `app/mapooverride/`

```
v1: components/MapoOverrideTopbar.vue   (prefix-based)
v2: app/mapooverride/MapoTopbar.vue     (exact name match)
```

The `MapoOverride` prefix is gone in v2 — the file must match the exact component name. See [MapoOverride System →](/uikit/mapoverride).

### Page meta

```ts
// v1 — export default {} in page script
export default {
  meta: { title: "Articles", icon: "mdi-file" },
  middleware: "auth",
};

// v2 — definePageMeta (Nuxt 4 native, no AST parser needed)
definePageMeta({
  middleware: ["auth", "permissions"],
  label: "Articles",
  icon: "mdi-file",
  permissions: { model: "article", action: "view" },
});
```
