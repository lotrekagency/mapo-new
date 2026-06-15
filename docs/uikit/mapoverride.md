# MapoOverride System

Replace any Mapo component entirely at build time — no imports, no registration, no monkey-patching.

## How it works

The `@mapomodule/uikit` module hooks into Nuxt's `components:extend` lifecycle. At build time it scans the consuming app's `app/mapooverride/` directory and, for every `.vue` file whose name matches a registered Mapo component, swaps the default `filePath` with the override.

```
app/
└── mapooverride/
    ├── MapoTopbar.vue         ← replaces MapoTopbar everywhere
    ├── MapoSidebar.vue
    └── MapoLogin.vue
```

The file name must match the component name exactly (e.g. `MapoTopbar.vue`, not `MapoOverrideTopbar.vue`). No extra configuration needed.

## Overridable components

| Component             | Override file             | Description                     |
| --------------------- | ------------------------- | ------------------------------- |
| `MapoTopbar`          | `MapoTopbar.vue`          | Top bar — drawer toggle, slots  |
| `MapoSidebar`         | `MapoSidebar.vue`         | Collapsible sidebar shell       |
| `MapoSidebarList`     | `MapoSidebarList.vue`     | Nav tree from route meta        |
| `MapoSidebarListItem` | `MapoSidebarListItem.vue` | Single nav item (recursive)     |
| `MapoLogin`           | `MapoLogin.vue`           | Login form page                 |
| `MapoSnackBar`        | `MapoSnackBar.vue`        | Imperative snackbar             |
| `MapoConfirmDialog`   | `MapoConfirmDialog.vue`   | Promise-based confirm dialog    |
| `MapoRootComponents`  | `MapoRootComponents.vue`  | Mounts SnackBar + ConfirmDialog |

## Slot contract

Keep the same slots as the original component or your override may break layouts that pass slot content through. For example, `MapoTopbar` exposes `left`, `default`, and `right` — your override should expose the same three.

## Example — custom topbar with dark mode toggle

```vue
<!-- app/mapooverride/MapoTopbar.vue -->
<script setup lang="ts">
// useSidebarStore and useColorMode are Nuxt auto-imports — no explicit import needed
defineSlots<{ left(): unknown; default(): unknown; right(): unknown }>();

const sidebar = useSidebarStore();
const colorMode = useColorMode();
</script>

<template>
  <header
    class="flex h-14 items-center gap-4 border-b border-default px-4 shrink-0"
  >
    <UButton
      v-if="!sidebar.drawer"
      variant="ghost"
      color="neutral"
      icon="i-lucide-panel-left-open"
      size="sm"
      @click="sidebar.toggleDrawer()"
    />
    <slot name="left" />
    <div class="flex-1"><slot /></div>
    <div class="flex items-center gap-2">
      <slot name="right" />
      <UButton
        variant="ghost"
        color="neutral"
        :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
        size="sm"
        @click="
          colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
        "
      />
    </div>
  </header>
</template>
```

## Example — custom login page

```vue
<!-- app/mapooverride/MapoLogin.vue -->
<script setup lang="ts">
// useMapoAuth is a Nuxt auto-import — no explicit import needed
const { login } = useMapoAuth();
// ... your form logic
</script>

<template>
  <!-- completely custom layout, uses useMapoAuth internally -->
</template>
```

## Live demo

See [`apps/example-theme/`](https://github.com/lotrekagency/mapo-new/tree/main/apps/example-theme) for a working example with `MapoTopbar` and `MapoLogin` overrides.

## Relation to layout slots

|                     | Layout slots                      | MapoOverride                               |
| ------------------- | --------------------------------- | ------------------------------------------ |
| Scope               | Per-page or per-layout            | App-wide (replaces component globally)     |
| What you can change | Inject content into named areas   | Everything — full template freedom         |
| Complexity          | Low                               | Medium                                     |
| Use when            | Adding a logo, a button, a widget | Completely different UI/UX for a component |

See [Layout](./layout) for the full slot reference.
