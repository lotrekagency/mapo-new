# @mapomodule/uikit

The UI shell of Mapo. Provides the admin layout, sidebar, topbar, login page, feedback components, and the **MapoOverride** system for full component replacement.

Built on [Nuxt UI v3](https://ui.nuxt.com) + [Tailwind v4](https://tailwindcss.com).

## Installation

Typically installed via the meta-package [`mapomodule`](../../mapomodule/). Standalone:

```bash
pnpm add @mapomodule/uikit @nuxt/ui
```

```ts
// nuxt.config.ts — @nuxt/ui MUST come before mapomodule
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@mapomodule/uikit"],
  mapoUikit: {
    css: "~/assets/css/theme.css", // optional CSS token override
    ui: { button: { defaultVariants: { color: "primary" } } }, // optional Nuxt UI defaults
  },
});
```

When installed via `mapomodule`, configure under `mapo.uikit` instead.

## What you get

### Layouts

| Layout         | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `mapo-default` | Full admin shell: collapsible sidebar + topbar + scrollable content area |
| `mapo-empty`   | Bare wrapper — used for the login page                                   |

### Components (auto-imported)

#### Layout & navigation

| Component             | Description                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `MapoSidebar`         | Collapsible sidebar with mini mode, auto-nav from route meta, footer section |
| `MapoSidebarList`     | Recursive nav tree built from `route.meta.label` / `meta.parent`             |
| `MapoSidebarListItem` | Single nav item with permission filtering and nested collapse                |
| `MapoSidebarProfile`  | User profile row (avatar + username + logout) for the sidebar footer         |
| `MapoTopbar`          | Top bar with drawer toggle and left/default/right slots                      |
| `MapoThemeToggle`     | Dark/light mode toggle via `useColorMode()` — drop-in for any slot           |
| `MapoLogoutButton`    | Standalone logout button with `variant`, `color`, `size`, `iconOnly` props   |

#### Feedback

| Component            | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `MapoLogin`          | Split-panel login form; slots: `brand`, `panel`, `footer` |
| `MapoSnackBar`       | Imperative snackbar driven by `useSnackStore`             |
| `MapoConfirmDialog`  | Promise-based confirm dialog driven by `useConfirmStore`  |
| `MapoRootComponents` | Mounts `MapoSnackBar` + `MapoConfirmDialog` in the layout |

#### List engine

| Component           | Description                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapoList`          | Full list shell: composes head, filters, actions, tabs, table, and quick-edit. URL state (page, sort, search, filters, tab) synced automatically.                                                              |
| `MapoListHead`      | Title, search bar, and primary action button row                                                                                                                                                               |
| `MapoListFilters`   | Filter panel driven by `FilterDescriptor[]`. v1 backend contract (`key=v1,v2`); per-filter override slots (`filter.{value}` / `.title` / `.content` / `.icon`)                                                 |
| `MapoListActions`   | Bulk-action toolbar (delete, reorder) — appears on selection. Supports `ActionDescriptor.dangerous` to render Apply/confirm with error styling for destructive actions.                                        |
| `MapoListTabs`      | Tabbed status filter via `meta.tabs`                                                                                                                                                                           |
| `MapoListTable`     | Data table with server-side pagination, sort, selection, and whole-row drag reorder (drop-line feedback; auto-disabled while a search/sort is active). Pass `permissionModel` to gate edit/delete row actions. |
| `MapoListQuickEdit` | Quick-edit modal driven by the same `FieldDescriptor[]` as the detail form                                                                                                                                     |

#### Detail shell

| Component              | Description                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapoDetail`           | Two-column detail shell: `useCrud` lifecycle, differential PATCH, error mapping, draft auto-save (`:draft="true"`). Supports permission gating (`permissionModel`), multipart control (`multipart`), live preview (`previewField`), and backend-derived languages (`forceLanguages`). |
| `MapoDetailLangSwitch` | Language tabs with per-language error badge — syncs the `?lang=` query param                                                                                                                                                                                                          |

### Layout slots (`mapo-default`)

| Slot                 | Renders in                                           |
| -------------------- | ---------------------------------------------------- |
| `sidebar:logo`       | Sidebar header — replaces the default logo/name link |
| `sidebar:nav-top`    | Above the auto-generated nav list                    |
| `sidebar:nav-bottom` | Below the nav list, above the footer row             |
| `sidebar:footer`     | Replaces the user avatar + logout row                |
| `topbar:left`        | Immediately after the drawer toggle button           |
| `topbar`             | Center area of the topbar (flex-1)                   |
| `topbar:right`       | Right cluster of the topbar                          |

## Theming

### ① CSS token override

Pass a CSS file via `mapo.uikit.css`. It is loaded **after** the base uikit CSS so your values always win:

```css
/* assets/css/theme.css */
@import "tailwindcss";
@import "@nuxt/ui";

:root {
  --color-primary-500: oklch(0.59 0.25 290); /* violet */
  --ui-radius: var(--radius-lg);
  --ui-bg: var(--color-neutral-50);
}

.dark {
  --ui-bg: var(--color-neutral-950);
}
```

### ② Nuxt UI component defaults

Pass a partial Nuxt UI config via `mapo.uikit.ui`. Deep-merged into `nuxt.options.ui`:

```ts
mapo: {
  uikit: {
    ui: {
      button: { defaultVariants: { color: "primary", variant: "solid" } },
      card:   { slots: { root: "rounded-xl shadow-md" } },
      input:  { defaultVariants: { variant: "outline" } },
    },
  },
},
```

## MapoOverride — component replacement

Create a file in `app/mapooverride/` matching any Mapo component name to replace it entirely at build time:

```
app/
└── mapooverride/
    ├── MapoTopbar.vue       ← replaces MapoTopbar globally
    ├── MapoSidebar.vue
    └── MapoLogin.vue
```

The `@mapomodule/uikit` module hooks into Nuxt's `components:extend` and swaps the `filePath` — no imports, no registration needed. Keep props and slots compatible with the original.

Overridable components: `MapoTopbar`, `MapoSidebar`, `MapoSidebarList`, `MapoSidebarListItem`, `MapoSidebarProfile`, `MapoLogin`, `MapoLogoutButton`, `MapoThemeToggle`, `MapoSnackBar`, `MapoConfirmDialog`, `MapoRootComponents`, `MapoDetail`, `MapoDetailLangSwitch`, `MapoList`, `MapoListTable`, `MapoListFilters`, `MapoListActions`, `MapoListHead`, `MapoListQuickEdit`.

## Dev workflow

```bash
# watch mode — rebuilds dist/ on every src/ change
pnpm --filter @mapomodule/uikit dev

# or from the monorepo root
pnpm dev:uikit
```

Run alongside a demo app:

```bash
# terminal 1
pnpm dev:uikit

# terminal 2
pnpm dev:example-theme   # theming demo at http://localhost:3001
```

## Reference

See [docs/uikit/](../../../docs/uikit/) for the full component and theming documentation.
