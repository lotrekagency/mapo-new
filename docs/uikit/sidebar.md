# Sidebar

The sidebar is fully automatic: it reads Nuxt's route registry and builds a hierarchical navigation tree from route metadata. No manual menu configuration is needed.

## Route metadata

Add `label` and `icon` to any page to make it appear in the sidebar:

```vue
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Articles",
  icon: "i-lucide-file-text",
});
</script>
```

### Available meta fields

All fields below are fully typed — editor autocomplete is available after the first `nuxt dev` run.

| Field           | Type                            | Description                                                                                                               |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `label`         | `string`                        | Display text. **Required** for the route to appear in the menu.                                                           |
| `icon`          | `string`                        | Any Nuxt UI / Iconify icon name (`i-lucide-*`, `i-heroicons-*`, etc.). Defaults to `mdi-alpha-{firstLetter}-box-outline`. |
| `hidden`        | `boolean`                       | When `true`, excludes the route from the sidebar even if `label` is set.                                                  |
| `sidebarFooter` | `boolean`                       | When `true`, the item appears in the sidebar footer section instead of the main nav.                                      |
| `parent`        | `string`                        | Path of the parent route. Makes this item a child of the given route in the tree.                                         |
| `permissions`   | `{ model: string } \| string[]` | Passed to the `permissions` middleware. See [Permissions](/modules/core#permissions-field--two-formats).                  |
| `roles`         | `string[]`                      | Passed to the `roles` middleware. Blocks navigation if the user's group is not in the list.                               |
| `middleware`    | `string \| string[]`            | Middleware names applied to this route. Read by `useCanAccessRoute` to determine sidebar visibility.                      |

### Hiding a page from the menu

Omit `label` (route has no menu entry) or set `hidden: true` (route has a label but should not appear):

```vue
// No sidebar entry at all: definePageMeta({ layout: "mapo-default", middleware:
["auth"] }) // Has a label (e.g. for breadcrumbs) but hidden from sidebar:
definePageMeta({ layout: "mapo-default", label: "Edit Article", hidden: true })
```

## Nested menu

Set `parent` to the path of the parent route to create a submenu:

```
pages/
  articles/
    index.vue    ← parent, label: "Articles"
    create.vue   ← child of /articles
    [id].vue     ← child of /articles
```

```vue
<!-- pages/articles/index.vue -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Articles",
  icon: "i-lucide-file-text",
});
</script>
```

```vue
<!-- pages/articles/create.vue -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "New Article",
  icon: "i-lucide-plus",
  parent: "/articles",
});
</script>
```

The parent item renders as a collapsible group. Child items are indented under it.

## Footer items

Items with `sidebarFooter: true` appear at the bottom of the sidebar, separated from the main navigation:

```vue
<!-- pages/settings.vue -->
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Settings",
  icon: "i-lucide-settings",
  sidebarFooter: true,
});
</script>
```

## Sidebar state

State is managed by `useSidebarStore` (from `@mapomodule/store`) and persisted to cookies on every change — the sidebar never flickers on SSR.

```ts
const sidebar = useSidebarStore();

sidebar.drawer; // boolean — sidebar visible or hidden
sidebar.mini; // boolean — collapsed to icon-only mode

sidebar.toggleDrawer(); // show/hide sidebar
sidebar.toggleMini(); // expand/collapse to mini mode
```

### Controlling the sidebar programmatically

```vue
<script setup lang="ts">
const sidebar = useSidebarStore();
</script>

<template>
  <UButton
    icon="i-lucide-sidebar"
    variant="ghost"
    @click="sidebar.toggleDrawer()"
  />
  <UButton
    icon="i-lucide-minimize-2"
    variant="ghost"
    @click="sidebar.toggleMini()"
  />
</template>
```

## Component API

### `MapoSidebar`

The main sidebar shell. Used internally by `mapo-default` layout — you typically don't render it directly.

**Slots:**

| Slot           | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `logo`         | Replaces the default Mapo logo and title in the header                                                |
| `nav-top`      | Content injected above the main navigation list                                                       |
| `nav-bottom`   | Content injected below the main navigation list                                                       |
| `footer-extra` | Content between the footer nav (sidebarFooter routes) and the user profile row — add extra links here |
| `footer`       | Replaces the entire user profile row at the very bottom                                               |

Example — custom logo:

```vue
<MapoSidebar>
  <template #logo>
    <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
      <img src="~/assets/logo.svg" class="h-6" />
      <span>Acme</span>
    </NuxtLink>
  </template>
</MapoSidebar>
```

Example — custom footer with `MapoSidebarProfile` and `MapoLogoutButton`:

```vue
<!-- Use MapoSidebarProfile standalone or override the footer slot entirely -->
<MapoSidebar>
  <template #footer>
    <MapoSidebarProfile :mini="sidebar.mini" />
    <!-- or replace completely with a custom logout button -->
    <MapoLogoutButton icon-only size="xs" />
  </template>
</MapoSidebar>
```

Example — extra nav section:

```vue
<MapoSidebar>
  <template #nav-bottom>
    <div class="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
      External
    </div>
    <a href="https://docs.example.com" target="_blank" class="...">
      Documentation ↗
    </a>
  </template>
</MapoSidebar>
```

### `MapoSidebarList`

Renders the route tree as a `<nav>` list. Filters routes by `sidebarFooter`.

**Props:**

| Prop     | Type      | Default | Description                                                 |
| -------- | --------- | ------- | ----------------------------------------------------------- |
| `footer` | `boolean` | `false` | When `true`, renders only routes with `sidebarFooter: true` |
| `mini`   | `boolean` | `false` | When `true`, hides labels and shows icons only              |

### `MapoSidebarListItem`

Renders a single menu item. Recursively renders children as a collapsible submenu.

**Props:**

| Prop   | Type       | Description                      |
| ------ | ---------- | -------------------------------- |
| `node` | `MenuNode` | Route node from `buildRouteTree` |
| `mini` | `boolean`  | Icon-only mode                   |

**`MenuNode` shape:**

```ts
import type { RouteMeta } from "vue-router";

interface MenuNode {
  link: string;
  label: string;
  icon: string;
  children: MenuNode[];
  meta: RouteMeta; // typed — includes label, icon, hidden, permissions, roles, etc.
  sidebarFooter: boolean;
}
```

Leaf items render as `<NuxtLink>` with `active-class="bg-primary/10 text-primary"` for the active route highlight. Parent items render as collapsible `<button>` + nested `<ul>`.

## How the route tree is built

`buildRouteTree` (from `@mapomodule/utils`) iterates over `router.getRoutes()`:

1. Skips routes without a `label` meta field
2. Builds a flat `Map<path, MenuNode>`
3. Attaches nodes to their parent via the `meta.parent` path
4. Returns top-level roots (no parent, or parent not found)

This runs reactively on the computed property in `MapoSidebarList` — adding a new route with a `label` automatically appears in the menu without any manual registration.

---

## Spider / non-tree menu layouts

> **TODO** — v1 supported a visual "spider" layout for flat or cross-linked menu structures. This is not yet designed for v2. If you need a custom menu layout, override `MapoSidebarList` via the `app/mapooverride/` system (see [Component Override](/guide/feature-status#component-override-system)).
