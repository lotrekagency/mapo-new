# How-to Recipes

A collection of practical, task-focused guides for building admin interfaces with Mapo v2. Each recipe is self-contained and shows exactly what to write — no theory, just working code.

## Quick-start checklist

Get a working admin panel in 5 minutes:

**1. Install**

```bash
pnpm add mapomodule @nuxt/ui
```

**2. Configure `nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"], // @nuxt/ui MUST come first
  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
    loginUrl: "/login",
  },
});
```

**3. Create `pages/login.vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <MapoLogin />
</template>
```

**4. Create your first admin page**

```vue
<!-- pages/dashboard.vue -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Dashboard",
  icon: "i-lucide-layout-dashboard",
});
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-semibold">Dashboard</h1>
  </div>
</template>
```

Done. Navigate to `/login`, log in, and you'll see the admin shell with your page in the sidebar.

---

## Recipes

| Recipe                                              | What you'll build                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| [First admin page](./first-admin-page)              | Install Mapo, layout, sidebar menu, nested routes                         |
| [CRUD list view](./crud-list)                       | `<MapoList>` with columns, filters, tabs, bulk actions, quick-edit        |
| [CRUD detail / form](./crud-detail)                 | `<MapoDetail>` with field descriptors, translatable content, sidebar      |
| [Auth & permissions](./auth-permissions)            | Login page, protected routes, model permissions, gating UI elements       |
| [Feedback: toasts & dialogs](./feedback)            | `useSnackStore`, `useConfirmStore`, reusable delete confirm composable    |
| [Theming & customization](./theming)                | CSS tokens, `MapoOverride`, Nuxt UI component defaults, logo/topbar slots |
| [Standalone form](./form-standalone)                | `<MapoForm>` with `useCrud`, tabs, columns, field slots                   |
| [Advanced form patterns](./form-advanced)           | Repeater/block editor, client validation, `useMapoForm()` headless        |
| [Custom backend integration](./backend-integration) | Nitro proxy middleware, path rewriting, cookie aliasing                   |
