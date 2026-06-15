# First admin page

This recipe walks you through installing Mapo and creating a working admin interface from scratch: layout, sidebar navigation, nested menus, and a settings page pinned to the footer.

## Prerequisites

- Nuxt 4 app
- Node >= 20, pnpm >= 8

## 1. Install packages

```bash
pnpm add @nuxt/ui mapomodule
```

> `@nuxt/ui` **must** be declared before `mapomodule` in `modules[]`. Reversing the order causes an SSR `Icon.vue` infinite recursion.

## 2. Configure `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: {
    authLoginUrl: "/api/auth/login",
    userInfoApi: "/api/profiles/me/",
    logoutUrl: "/api/auth/logout",
    loginUrl: "/login",
  },
});
```

## 3. Create the login page

```vue
<!-- pages/login.vue -->
<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <MapoLogin />
</template>
```

## 4. Create your first admin page

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
    <p class="text-muted mt-1">Welcome to the admin panel.</p>
  </div>
</template>
```

The `label` and `icon` fields in `definePageMeta` are the only things needed to make a page appear in the sidebar. The layout, topbar, and drawer toggle are all provided by `mapo-default`.

## 5. Add more pages

Each page with `layout: "mapo-default"` and a `label` gets its own sidebar entry automatically.

```vue
<!-- pages/articles/index.vue -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Articles",
  icon: "i-lucide-newspaper",
});
</script>
```

```vue
<!-- pages/users/index.vue -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Users",
  icon: "i-lucide-users",
});
</script>
```

## 6. Nest pages under a parent

Use `parent` to nest a route under another in the sidebar:

```vue
<!-- pages/articles/index.vue — this becomes the parent -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Articles",
  icon: "i-lucide-newspaper",
});
</script>
```

```vue
<!-- pages/articles/categories.vue — nested child -->
<script setup lang="ts">
definePageMeta({
  label: "Categories",
  icon: "i-lucide-tag",
  parent: "/articles", // path of the parent page
  middleware: ["auth"],
});
</script>
```

```vue
<!-- pages/articles/[id].vue — detail page, hidden from sidebar -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  hidden: true, // no sidebar entry, but still uses the layout
});
</script>
```

## 7. Pin a page to the sidebar footer

```vue
<!-- pages/settings.vue -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Settings",
  icon: "i-lucide-settings",
  sidebarFooter: true, // appears at the bottom of the sidebar
});
</script>
```

## 8. Customize the layout via `app.vue`

Use `app.vue` to inject a custom logo and topbar controls across all admin pages:

```vue
<!-- app.vue -->
<template>
  <NuxtLayout>
    <template #sidebar:logo>
      <NuxtLink to="/" class="flex items-center gap-2 px-2">
        <img src="~/assets/logo.svg" class="h-6" alt="Acme" />
        <span class="font-semibold text-sm">Acme Admin</span>
      </NuxtLink>
    </template>

    <template #topbar:right>
      <UButton icon="i-lucide-bell" variant="ghost" color="neutral" size="sm" />
    </template>

    <NuxtPage />
  </NuxtLayout>
</template>
```

## Route meta reference

| Field           | Type                              | Description                                   |
| --------------- | --------------------------------- | --------------------------------------------- |
| `layout`        | `"mapo-default"`                  | Activates the admin shell                     |
| `label`         | `string`                          | Sidebar display text                          |
| `icon`          | `string`                          | Iconify icon name (e.g. `i-lucide-newspaper`) |
| `hidden`        | `boolean`                         | Excludes the page from sidebar                |
| `sidebarFooter` | `boolean`                         | Moves entry to sidebar footer                 |
| `parent`        | `string`                          | Path of parent route for nesting              |
| `middleware`    | `string[]`                        | Route middleware — use `["auth"]` to protect  |
| `permissions`   | `{ model: string }` or `string[]` | Permission requirements                       |

→ See also: [CRUD list view](./crud-list), [Auth & permissions](./auth-permissions)
