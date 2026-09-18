# UIKit

`@mapomodule/uikit` is the visual layer of Mapo. It provides:

- A **default admin layout** (`mapo-default`) with sidebar, topbar, and global feedback components
- **Auto-generated sidebar navigation** driven by route metadata — no manual menu config
- **Authentication UI** (`MapoLogin`) with redirect and error handling
- **Global feedback** (`MapoSnackBar`, `MapoConfirmDialog`) that any page can trigger via stores
- **Full Tailwind v4 + Nuxt UI theming** with CSS overrides and Nuxt UI component defaults

## What's included

| Component                | Auto-imported | Description                                      |
| ------------------------ | ------------- | ------------------------------------------------ |
| `MapoSidebar`            | ✅            | Collapsible sidebar with drawer + mini modes     |
| `MapoSidebarList`        | ✅            | Route-driven menu list, supports footer          |
| `MapoSidebarListItem`    | ✅            | Recursive menu item with submenu support         |
| `MapoSidebarProfile`     | ✅            | Sidebar footer profile: avatar, username, logout |
| `MapoTopbar`             | ✅            | Top navigation bar with slot for custom content  |
| `MapoLangSwitcher`       | ✅            | UI locale switcher with cookie persistence       |
| `MapoThemeToggle`        | ✅            | Dark / light theme toggle button                 |
| `MapoLogin`              | ✅            | Sign-in form with redirect and error state       |
| `MapoLogoutButton`       | ✅            | Standalone logout button calling `useMapoAuth()` |
| `MapoSnackBar`           | ✅            | Toast notification bridge to `useSnackStore`     |
| `MapoConfirmDialog`      | ✅            | Modal confirm bridge to `useConfirmStore`        |
| `MapoRootComponents`     | ✅            | Wrapper that mounts SnackBar + ConfirmDialog     |
| `MapoList`               | ✅            | Paginated, filterable, sortable data table shell |
| `MapoListHead`           | ✅            | Header wrapper above a list: title, actions      |
| `MapoListTabs`           | ✅            | Tab bar rendered above the list                  |
| `MapoListFilters`        | ✅            | Filter panel rendered by `MapoList`              |
| `MapoListActions`        | ✅            | Bulk action toolbar rendered by `MapoList`       |
| `MapoListQuickEdit`      | ✅            | Modal for inline editing of a single row         |
| `MapoListTable`          | ✅            | Inner table of `MapoList`, usable standalone     |
| `MapoDetail`             | ✅            | Full-page CRUD record editor with sticky sidebar |
| `MapoDetailLangSwitch`   | ✅            | Language tab bar used inside `MapoDetail`        |
| `MapoMediaManager`       | ✅            | Full media library: folders, gallery, upload     |
| `MapoMediaManagerDialog` | ✅            | Modal wrapper of the manager, used as picker     |
| `MapoMediaGallery`       | ✅            | Media grid with single / multi selection         |
| `MapoMediaFolders`       | ✅            | Folder list with MIME filters and folder editing |
| `MapoMediaBreadcrumbs`   | ✅            | Breadcrumb trail of the current folder path      |
| `MapoMediaUploader`      | ✅            | Multi-file upload queue with per-file progress   |
| `MapoMediaEditor`        | ✅            | Media metadata editor, permission gated          |
| `MapoMediaFileChanger`   | ✅            | Replaces the file behind an existing media       |
| `MapoMediaPreview`       | ✅            | MIME-aware preview: image, video or file icon    |
| `MapoDropArea`           | ✅            | Standalone drag & drop file area                 |
| `MapoMenuManager`        | ✅            | Split-pane menu editor: tree + node form         |
| `MapoMenuTreeview`       | ✅            | Drag & drop tree of menu nodes                   |
| `MapoMenuTreeviewNode`   | ✅            | Recursive menu node renderer with nesting        |
| `MapoMenuNodeEditor`     | ✅            | Form editor for the selected menu node           |

`MapoMediaManagerDialog` and `MapoMediaPreview` are additionally registered as **global** components, so `@mapomodule/form` can resolve them by name from outside UIKit.

**Layout** registered via Nuxt layouts:

| Layout         | Key                                               |
| -------------- | ------------------------------------------------- |
| `mapo-default` | Full admin shell: sidebar + topbar + content area |

## Setup

`@mapomodule/uikit` is installed automatically by the `mapomodule` meta-package. `@nuxt/ui` must be declared **before** `mapomodule` in `modules[]` — installing it via `installModule()` from inside a module causes an `Icon.vue` SSR infinite loop due to how `@nuxt/icon` resolves component aliases. `@iconify-json/lucide` is bundled with `mapomodule` and does not need to be installed separately.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    "@nuxt/ui", // ← must come first
    "mapomodule",
  ],
});
```

## Sections

- **[Theming](./theming)** — CSS overrides, Tailwind tokens, Nuxt UI component defaults
- **[MapoOverride System](./mapoverride)** — replace any Mapo component at build time
- **[Layout](./layout)** — `mapo-default` layout, available slots
- **[Sidebar](./sidebar)** — sidebar navigation, route meta config, nesting, mini/drawer state
- **[Topbar](./topbar)** — topbar slots and customization
- **[Login](./login)** — `MapoLogin` props, slots, redirect logic
- **[Feedback](./feedback)** — snackbar and confirm dialog how-to
- **[List](./list)** — `MapoList` modes, columns, filters, tabs, bulk actions
- **[Detail](./detail)** — `MapoDetail` CRUD lifecycle, layout, language tabs
- **[Media Manager](./media)** — media library, folders, upload, picker dialog
- **[Menu Manager](./menu-manager)** — drag & drop menu tree, node editor, translations
- **[Form Engine](./form/)** — `FieldDescriptor[]`, field types, validation, i18n
