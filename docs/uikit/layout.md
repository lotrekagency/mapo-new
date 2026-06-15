# Layout

`@mapomodule/uikit` registers a Nuxt layout named `mapo-default`. It composes the full admin shell: sidebar, topbar, content area, and global feedback components.

## Activating the layout

Use `definePageMeta` in any page:

```vue
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Dashboard",
  icon: "i-lucide-layout-dashboard",
});
</script>
```

All Mapo-specific `definePageMeta` fields are fully typed — `label`, `icon`, `hidden`, `parent`, `sidebarFooter` (from `@mapomodule/uikit`) and `permissions`, `roles` (from `@mapomodule/core`) — and will appear in editor autocomplete as soon as the dev server has run once and generated `.nuxt/types/`.

For pages that should not use the admin shell (e.g. the login page), set `layout: false`:

```vue
<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <MapoLogin />
</template>
```

## Structure

```
┌─────────────────────────────────────────┐
│  MapoSidebar                            │
│  ├── Header (logo + collapse toggle)    │
│  ├── MapoSidebarList (main nav)         │
│  └── Footer                            │
│      ├── MapoSidebarList (footer nav)   │
│      └── User info + logout button     │
├─────────────────────────────────────────┤
│  MapoTopbar                             │
│  └── <slot /> (custom content)         │
│─────────────────────────────────────────│
│  <main> — page content (<slot />)      │
└─────────────────────────────────────────┘
   MapoRootComponents (SnackBar + ConfirmDialog, invisible)
```

## Slots

The layout forwards named slots to sidebar and topbar with a namespaced prefix. This lets you customize any inner section from the page or from `app.vue`:

### Sidebar slots

| Slot                 | Position                                                |
| -------------------- | ------------------------------------------------------- |
| `sidebar:logo`       | Replaces the default Mapo logo in the header            |
| `sidebar:nav-top`    | Above the main navigation list                          |
| `sidebar:nav-bottom` | Below the main navigation list                          |
| `sidebar:footer`     | Replaces the entire footer section (user info + logout) |

### Topbar slots

| Slot           | Position                                                 |
| -------------- | -------------------------------------------------------- |
| `topbar:left`  | Left side of the topbar (after the drawer toggle button) |
| `topbar`       | Center / main area of the topbar                         |
| `topbar:right` | Right side of the topbar                                 |

## Customizing from app.vue

Slots are passed from `app.vue` via `<NuxtLayout>`. Note that `<NuxtLayout>` must be wrapped in `<UApp>` — without it Nuxt UI theming and overlays do not work.

```vue
<!-- app/app.vue -->
<script setup lang="ts"></script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <template #sidebar:logo>
        <NuxtLink to="/" class="flex items-center gap-2">
          <img src="~/assets/logo.svg" class="h-6" alt="Acme" />
          <span class="font-semibold">Acme Admin</span>
        </NuxtLink>
      </template>

      <template #topbar:right>
        <UButton icon="i-lucide-bell" variant="ghost" color="neutral" />
        <UButton
          icon="i-lucide-settings"
          variant="ghost"
          color="neutral"
          to="/settings"
        />
      </template>

      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

## Customizing from a page

Slots forwarded from the layout are available on the page via `<template #sidebar:logo>` etc., but note that Nuxt page slots are scoped to the layout. For per-page topbar customization the typical pattern is to use the topbar slot from `app.vue` and react to the current route.

## Sidebar state persistence

The sidebar state (drawer open/closed, mini mode) is persisted in cookies and hydrated server-side on every request — the sidebar never flickers on page load. See [Sidebar](./sidebar) for the full state API.
