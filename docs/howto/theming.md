# Theming & customization

Three ways to change the look of your admin: CSS token overrides, layout slots, and the `MapoOverride` component replacement system.

## 1. CSS token overrides

Create a CSS file and point Mapo to it:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: {
    uikit: {
      css: "~/assets/css/theme.css",
    },
  },
});
```

```css
/* assets/css/theme.css */
@theme {
  /* Change the primary color to violet */
  --color-primary-50: #f5f3ff;
  --color-primary-100: #ede9fe;
  --color-primary-200: #ddd6fe;
  --color-primary-300: #c4b5fd;
  --color-primary-400: #a78bfa;
  --color-primary-500: #8b5cf6;
  --color-primary-600: #7c3aed;
  --color-primary-700: #6d28d9;
  --color-primary-800: #5b21b6;
  --color-primary-900: #4c1d95;
  --color-primary-950: #2e1065;

  /* Adjust border radius across all components */
  --ui-radius: 0.25rem;
}
```

All Nuxt UI components and Mapo components respond to these tokens automatically.

### Available tokens

| Token                      | Used for                              |
| -------------------------- | ------------------------------------- |
| `--color-primary-{50…950}` | Buttons, links, active states, badges |
| `--color-neutral-{50…950}` | Text, borders, backgrounds            |
| `--color-success-{50…950}` | Success states                        |
| `--color-error-{50…950}`   | Error states                          |
| `--color-warning-{50…950}` | Warning states                        |
| `--color-info-{50…950}`    | Info states                           |
| `--ui-bg`                  | Base page background                  |
| `--ui-bg-elevated`         | Cards, modals, sidebar                |
| `--ui-border`              | Default border color                  |
| `--ui-text`                | Default text color                    |
| `--ui-text-highlighted`    | Headings                              |
| `--ui-text-muted`          | Secondary / placeholder text          |
| `--ui-radius`              | Global border radius                  |

### Dark mode

Dark mode is controlled by the `dark` class on `<html>`. Use `useColorMode()` from `@nuxt/color-mode` (included with Nuxt UI) to toggle:

```ts
const colorMode = useColorMode();
colorMode.preference = "dark"; // 'light' | 'dark' | 'system'
```

Mapo's own `MapoThemeToggle` button is auto-available as a sidebar footer item.

## 2. Layout slots

Use named slots in `app.vue` to inject content into the admin shell without replacing any component:

```vue
<!-- app.vue -->
<template>
  <NuxtLayout>
    <!-- Custom logo -->
    <template #sidebar:logo>
      <NuxtLink to="/" class="flex items-center gap-2 px-2">
        <img src="~/assets/logo.svg" class="h-6" alt="Acme" />
        <span class="font-semibold text-sm">Acme Admin</span>
      </NuxtLink>
    </template>

    <!-- Content above the auto-generated nav -->
    <template #sidebar:nav-top>
      <div
        class="px-3 py-2 text-xs text-muted font-medium uppercase tracking-wider"
      >
        Main menu
      </div>
    </template>

    <!-- Custom topbar right side -->
    <template #topbar:right>
      <UButton icon="i-lucide-bell" variant="ghost" color="neutral" size="sm" />
      <UAvatar alt="Admin" size="xs" />
    </template>

    <!-- Center topbar content -->
    <template #topbar>
      <UInput
        icon="i-lucide-search"
        placeholder="Search…"
        size="sm"
        class="max-w-xs"
      />
    </template>

    <NuxtPage />
  </NuxtLayout>
</template>
```

### All available slots

| Slot                  | Description                              |
| --------------------- | ---------------------------------------- |
| `#sidebar:logo`       | Replace the default Mapo logo            |
| `#sidebar:nav-top`    | Above the auto-generated navigation      |
| `#sidebar:nav-bottom` | Below the auto-generated navigation      |
| `#sidebar:footer`     | Replace the entire sidebar footer        |
| `#topbar:left`        | After the drawer toggle button           |
| `#topbar`             | Center area (fills available space)      |
| `#topbar:right`       | Right side — notifications, avatar, etc. |

## 3. Nuxt UI component defaults

Override the default props of any Nuxt UI component via the `uikit.ui` config key. These are deep-merged, so you only need to specify what you want to change:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: {
    uikit: {
      ui: {
        button: {
          defaultVariants: {
            color: "primary",
            variant: "solid",
          },
        },
        card: {
          slots: {
            root: "ring-0 shadow-sm",
          },
        },
        notifications: {
          position: "bottom-right", // move snackbar position
        },
      },
    },
  },
});
```

## 4. MapoOverride — full component replacement

Drop a `.vue` file in `app/mapooverride/` to replace a Mapo component entirely. The file name must match the component name exactly.

```
app/
  mapooverride/
    MapoTopbar.vue    ← replaces MapoTopbar everywhere
    MapoLogin.vue     ← replaces MapoLogin
    MapoSidebar.vue   ← replaces MapoSidebar
```

### Example: custom topbar with dark mode toggle

```vue
<!-- app/mapooverride/MapoTopbar.vue -->
<script setup lang="ts">
import { useSidebarStore } from "@mapomodule/store/runtime/stores/sidebar";

defineSlots<{
  left(): unknown;
  default(): unknown;
  right(): unknown;
}>();

const sidebar = useSidebarStore();
const colorMode = useColorMode();

function toggleDark() {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
}
</script>

<template>
  <header
    class="flex h-14 items-center gap-4 border-b border-default px-4"
    style="background: linear-gradient(90deg, var(--ui-bg-elevated), color-mix(in oklch, var(--color-primary-500) 8%, var(--ui-bg-elevated)))"
  >
    <!-- Drawer toggle (keep this — it's expected by the layout) -->
    <UButton
      v-if="!sidebar.drawer"
      variant="ghost"
      color="neutral"
      icon="i-lucide-panel-left-open"
      size="sm"
      @click="sidebar.toggleDrawer()"
    />

    <slot name="left" />

    <div class="flex-1">
      <slot />
    </div>

    <div class="flex items-center gap-2">
      <slot name="right" />

      <UButton
        variant="ghost"
        color="neutral"
        :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
        size="sm"
        @click="toggleDark()"
      />
    </div>
  </header>
</template>
```

### Example: custom login page

```vue
<!-- app/mapooverride/MapoLogin.vue -->
<script setup lang="ts">
const { login } = useMapoAuth();
const loading = ref(false);
const error = ref<string | null>(null);
const username = ref("");
const password = ref("");
const route = useRoute();

async function submit() {
  loading.value = true;
  error.value = null;
  try {
    await login({ username: username.value, password: password.value });
    await navigateTo(String(route.query.redirect ?? "/"));
  } catch {
    error.value = "Invalid credentials.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-elevated">
    <UCard class="w-full max-w-sm">
      <div class="text-center mb-6">
        <img src="~/assets/logo.svg" class="h-10 mx-auto mb-3" />
        <h1 class="text-xl font-semibold">Sign in</h1>
      </div>
      <UAlert v-if="error" color="error" :description="error" class="mb-4" />
      <UFormField label="Username">
        <UInput v-model="username" type="text" />
      </UFormField>
      <UFormField label="Password" class="mt-3">
        <UInput v-model="password" type="password" @keydown.enter="submit" />
      </UFormField>
      <UButton class="w-full mt-4" :loading="loading" @click="submit">
        Sign in
      </UButton>
    </UCard>
  </div>
</template>
```

### Overridable components

Any `Mapo*` component can be replaced. Common candidates:

| File                     | Replaces                               |
| ------------------------ | -------------------------------------- |
| `MapoTopbar.vue`         | Admin topbar                           |
| `MapoLogin.vue`          | Login form                             |
| `MapoSidebar.vue`        | Side drawer                            |
| `MapoSidebarProfile.vue` | User profile section in sidebar footer |
| `MapoLogoutButton.vue`   | Logout button in sidebar footer        |

→ See also: [UIKit — Theming](/uikit/theming), [UIKit — Layout slots](/uikit/layout), [MapoOverride system](/uikit/mapoverride)
