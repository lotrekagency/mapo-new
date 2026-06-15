# UIKit — Component API Reference

Complete props, emits, slots, and exposed methods for all UIKit components.

---

## MapoDetail

Full-page CRUD detail view with sidebar, language switcher, and save/delete actions.

### Props

| Prop            | Type                    | Default        | Description                                                                                                     |
| --------------- | ----------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `endpoint`      | `string`                | — **required** | REST endpoint passed to `useCrud`.                                                                              |
| `id`            | `string \| number`      | — **required** | Record ID. Pass `'new'` to create.                                                                              |
| `fields`        | `FieldDescriptor<T>[]`  | — **required** | Fields for the main body form.                                                                                  |
| `sidebarFields` | `FieldDescriptor<T>[]`  | `[]`           | Fields rendered in the sidebar form.                                                                            |
| `languages`     | `string[]`              | `[]`           | Translation language codes (e.g. `['it', 'en']`).                                                               |
| `modelName`     | `string \| null`        | `null`         | Human-readable model name shown in the page title.                                                              |
| `sidebarCols`   | `number`                | `4`            | Sidebar column span (1–11 in a 12-col grid).                                                                    |
| `sticky`        | `boolean`               | `true`         | Keep sidebar sticky while scrolling. Offset controlled by `--mapo-topbar-height` CSS variable (default `64px`). |
| `usePatch`      | `boolean`               | `true`         | Send `PATCH` (diff only) on update instead of `PUT`.                                                            |
| `readonly`      | `boolean`               | `false`        | Force read-only mode globally.                                                                                  |
| `registry`      | `FieldRegistry \| null` | `null`         | Field registry. Falls back to `$mapoFormRegistry` if omitted.                                                   |

### Emits

| Event     | Payload    | Description                      |
| --------- | ---------- | -------------------------------- |
| `saved`   | `model: T` | Fired after a successful save.   |
| `deleted` | —          | Fired after successful deletion. |

### Slots

| Slot                  | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `title`               | Replaces the page title area.                           |
| `body-lang`           | Replaces the language switcher tab bar.                 |
| `body-top`            | Extra content above the main form.                      |
| `body`                | Replaces the entire main form section.                  |
| `body-bottom`         | Extra content below the main form.                      |
| `side-buttons`        | Replaces the entire sidebar action card.                |
| `button-save`         | Overrides the Save button.                              |
| `button-savecontinue` | Overrides the Save & Continue button.                   |
| `button-back`         | Overrides the Back button.                              |
| `button-delete`       | Overrides the Delete button.                            |
| `side-top`            | Extra content at the top of the sidebar.                |
| `side-bottom`         | Extra content at the bottom of the sidebar.             |
| `field.{field.key}`   | Per-field override (forwarded to the inner `MapoForm`). |

---

## MapoDetailLangSwitch

Language tab bar used inside `MapoDetail`. Can also be used standalone.

### Props

| Prop            | Type                       | Default        | Description                                     |
| --------------- | -------------------------- | -------------- | ----------------------------------------------- |
| `modelValue`    | `string`                   | — **required** | Currently selected language code.               |
| `langs`         | `string[]`                 | — **required** | Available language codes.                       |
| `errors`        | `Record<string, string[]>` | `{}`           | Validation errors keyed by field path.          |
| `noRouteChange` | `boolean`                  | `false`        | Do not update the URL query on language change. |

### Emits

| Event               | Payload        | Description                                         |
| ------------------- | -------------- | --------------------------------------------------- |
| `update:modelValue` | `lang: string` | Emitted when the user selects a different language. |

---

## MapoList

Paginated, filterable, sortable data table with quick-edit, bulk actions, and tabs.

### Props

| Prop            | Type                     | Default        | Description                                                          |
| --------------- | ------------------------ | -------------- | -------------------------------------------------------------------- |
| `endpoint`      | `string`                 | — **required** | API endpoint for data fetching.                                      |
| `columns`       | `ListColumn[]`           | — **required** | Column definitions.                                                  |
| `lookup`        | `string`                 | `'id'`         | Primary key field name.                                              |
| `filters`       | `FilterDescriptor[]`     | `[]`           | Available filter definitions.                                        |
| `actions`       | `ActionDescriptor<T>[]`  | `[]`           | Bulk action definitions.                                             |
| `tabs`          | `ListTabItem[]`          | `[]`           | Tab definitions for list segmentation.                               |
| `defaultTab`    | `string`                 | —              | Default active tab value.                                            |
| `tabQueryParam` | `string`                 | `'tab'`        | URL query parameter name for the active tab.                         |
| `searchable`    | `boolean`                | `true`         | Show the search input.                                               |
| `draggable`     | `boolean`                | `false`        | Enable drag-and-drop row reordering.                                 |
| `positionField` | `string`                 | `'position'`   | Model field updated on drag reorder.                                 |
| `editFields`    | `FieldDescriptor<T>[]`   | `[]`           | Fields shown in the quick-edit modal.                                |
| `languages`     | `string[]`               | —              | Language codes for quick-edit i18n.                                  |
| `registry`      | `Partial<FieldRegistry>` | —              | Field registry for quick-edit.                                       |
| `detailBase`    | `string`                 | —              | Base path for the per-row detail link (e.g. `'/news'` → `/news/42`). |

### Slots

| Slot                       | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `head`                     | Header area above the table.                                                                     |
| `dtable.toolbar`           | Toolbar content inside the table header.                                                         |
| `dtable.empty`             | Custom empty-state content.                                                                      |
| `dtable.loading`           | Custom loading-state content.                                                                    |
| `` `cell.${column.key}` `` | Per-column cell override. Receives `{ item, value }`. Use `#[\`cell.key\`]` syntax in templates. |
| `filter.{filter.value}`    | Per-filter custom panel. Receives `{ filter, toggleChoice, removeFilter }`.                      |
| `qedit.extra`              | Extra content inside the quick-edit modal. Receives `{ model }`.                                 |

### Exposed Methods

| Method      | Description             |
| ----------- | ----------------------- |
| `refresh()` | Refresh the table data. |

---

## MapoListTable

Inner table component used by `MapoList`. Useful if you need the table alone without filters/tabs/actions.

### Props

| Prop            | Type                     | Default        | Description                      |
| --------------- | ------------------------ | -------------- | -------------------------------- |
| `endpoint`      | `string`                 | — **required** | API endpoint.                    |
| `columns`       | `ListColumn[]`           | — **required** | Column definitions.              |
| `lookup`        | `string`                 | `'id'`         | Primary key field name.          |
| `searchable`    | `boolean`                | `true`         | Show the search input.           |
| `draggable`     | `boolean`                | `false`        | Enable drag-and-drop reordering. |
| `positionField` | `string`                 | `'position'`   | Field updated on drag reorder.   |
| `editFields`    | `FieldDescriptor<T>[]`   | `[]`           | Quick-edit form fields.          |
| `languages`     | `string[]`               | —              | Language codes for quick-edit.   |
| `registry`      | `Partial<FieldRegistry>` | —              | Field registry for quick-edit.   |
| `detailBase`    | `string`                 | —              | Base path for row detail links.  |

### Emits

| Event                   | Payload           | Description                                     |
| ----------------------- | ----------------- | ----------------------------------------------- |
| `update:selection`      | `T[] \| "all"`    | Current row selection changed.                  |
| `update:selectionQuery` | `URLSearchParams` | Query params for the current selection changed. |

### Slots

| Slot                       | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `dtable.toolbar`           | Toolbar content.                                                                                 |
| `dtable.empty`             | Empty-state content.                                                                             |
| `dtable.loading`           | Loading-state content.                                                                           |
| `` `cell.${column.key}` `` | Per-column cell override. Receives `{ item, value }`. Use `#[\`cell.key\`]` syntax in templates. |

### Exposed Methods

| Method      | Description        |
| ----------- | ------------------ |
| `refresh()` | Reload table data. |

---

## MapoListFilters

Filter sidebar rendered by `MapoList`. Can also be used standalone.

### Props

| Prop         | Type                 | Default        | Description                   |
| ------------ | -------------------- | -------------- | ----------------------------- |
| `filters`    | `FilterDescriptor[]` | — **required** | Available filter definitions. |
| `modelValue` | `ActiveFilter[]`     | — **required** | Currently active filters.     |
| `disabled`   | `boolean`            | —              | Disable all filter controls.  |

### Emits

| Event               | Payload          | Description                                 |
| ------------------- | ---------------- | ------------------------------------------- |
| `update:modelValue` | `ActiveFilter[]` | Emitted when the active filter set changes. |

### Slots

| Slot                    | Description                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `filter.{filter.value}` | Custom panel for a specific filter. Receives `{ filter, toggleChoice, removeFilter }`. |

---

## MapoListActions

Bulk action toolbar rendered by `MapoList`.

### Props

| Prop             | Type                    | Default        | Description                              |
| ---------------- | ----------------------- | -------------- | ---------------------------------------- |
| `actions`        | `ActionDescriptor<T>[]` | `[]`           | Custom action definitions.               |
| `selection`      | `T[] \| "all"`          | — **required** | Currently selected items (or `"all"`).   |
| `selectionQuery` | `URLSearchParams`       | — **required** | Query params representing the selection. |
| `endpoint`       | `string`                | — **required** | API endpoint for bulk operations.        |
| `lookup`         | `string`                | `'id'`         | Primary key field name.                  |

### Emits

| Event             | Payload | Description                        |
| ----------------- | ------- | ---------------------------------- |
| `actionCompleted` | —       | Fired when a bulk action finishes. |

### Slots

| Slot      | Description                         |
| --------- | ----------------------------------- |
| `prepend` | Content before the action selector. |
| `append`  | Content after the Apply button.     |

---

## MapoListTabs

Tab bar rendered above `MapoList`.

### Props

| Prop         | Type            | Default        | Description       |
| ------------ | --------------- | -------------- | ----------------- |
| `tabs`       | `ListTabItem[]` | — **required** | Tab definitions.  |
| `modelValue` | `string`        | —              | Active tab value. |

### Emits

| Event               | Payload  | Description                         |
| ------------------- | -------- | ----------------------------------- |
| `update:modelValue` | `string` | Emitted when the user switches tab. |

### Slots

| Slot  | Description                                                          |
| ----- | -------------------------------------------------------------------- |
| `tab` | Custom tab button. Receives `{ tab: ListTabItem, active: boolean }`. |

---

## MapoListQuickEdit

Modal for inline editing of a single list row.

### Props

| Prop         | Type                       | Default        | Description                     |
| ------------ | -------------------------- | -------------- | ------------------------------- |
| `open`       | `boolean`                  | — **required** | Controls modal visibility.      |
| `endpoint`   | `string`                   | — **required** | API endpoint.                   |
| `itemId`     | `string \| number \| null` | `null`         | ID of the record to edit.       |
| `editFields` | `FieldDescriptor<T>[]`     | `[]`           | Form fields.                    |
| `lookup`     | `string`                   | `'id'`         | Primary key field name.         |
| `languages`  | `string[]`                 | —              | Language codes for i18n fields. |
| `registry`   | `Partial<FieldRegistry>`   | —              | Field registry.                 |

### Emits

| Event         | Payload   | Description                                  |
| ------------- | --------- | -------------------------------------------- |
| `update:open` | `boolean` | Emitted when the modal should open or close. |
| `saved`       | `item: T` | Emitted after a successful save.             |

### Slots

| Slot    | Description                                              |
| ------- | -------------------------------------------------------- |
| `extra` | Additional content in the form. Receives `{ model: T }`. |

---

## MapoSidebar

Main sidebar shell. Wraps `MapoSidebarList` and exposes logo / footer slots.

### Props

None.

### Slots

| Slot         | Description                                    |
| ------------ | ---------------------------------------------- |
| `logo`       | Logo area at the top of the sidebar.           |
| `nav-top`    | Navigation items rendered above the main list. |
| `nav-bottom` | Navigation items rendered below the main list. |
| `footer`     | Footer area at the bottom of the sidebar.      |

---

## MapoSidebarList

Auto-built navigation list from route `meta`. Rendered by `MapoSidebar`.

### Props

| Prop     | Type      | Default | Description                                                |
| -------- | --------- | ------- | ---------------------------------------------------------- |
| `footer` | `boolean` | `false` | When `true`, renders only items with `meta.sidebarFooter`. |
| `mini`   | `boolean` | `false` | Mini (icon-only) sidebar mode.                             |

---

## MapoSidebarListItem

Recursive navigation item. Renders children as a nested group.

### Props

| Prop   | Type       | Default        | Description                                                             |
| ------ | ---------- | -------------- | ----------------------------------------------------------------------- |
| `node` | `MenuNode` | — **required** | Navigation node with `label`, `icon`, `route`, and optional `children`. |
| `mini` | `boolean`  | `false`        | Mini (icon-only) mode.                                                  |

---

## MapoTopbar

Top application bar.

### Props

None.

### Slots

| Slot      | Description                      |
| --------- | -------------------------------- |
| `left`    | Left area (e.g. hamburger menu). |
| `default` | Center content.                  |
| `right`   | Right area (e.g. user menu).     |

---

## MapoLogin

Login page component. Handles credential submission via `useMapoAuth`.

### Props

None.

### Slots

| Slot     | Description                                      |
| -------- | ------------------------------------------------ |
| `brand`  | Brand/logo area above the form card.             |
| `panel`  | Left decorative panel (visible on wide screens). |
| `footer` | Footer content below the form card.              |

---

## MapoSnackBar

Global toast notification bar. Driven by `useSnackStore`. Mount once in your layout via `MapoRootComponents`.

### Props / Emits / Slots

None — state is fully managed by `useSnackStore`.

---

## MapoConfirmDialog

Global confirmation dialog. Driven by `useConfirmStore`. Mount once via `MapoRootComponents`.

### Props / Emits / Slots

None — state is fully managed by `useConfirmStore`.

---

## MapoRootComponents

Convenience wrapper that mounts `MapoSnackBar` and `MapoConfirmDialog` in one place.

### Props / Emits / Slots

None.

---

## MapoThemeToggle

Dark / light theme toggle button (pending design decision — UI only, no persistence yet).

### Props / Emits / Slots

None.

---

## MapoLogoutButton

Standalone logout button that calls `useMapoAuth().logout()`. Drop it anywhere in the layout.

### Props

| Prop       | Type                                                  | Default     | Description                          |
| ---------- | ----------------------------------------------------- | ----------- | ------------------------------------ |
| `variant`  | `'solid' \| 'outline' \| 'soft' \| 'ghost' \| 'link'` | `'ghost'`   | Nuxt UI button variant.              |
| `color`    | `string`                                              | `'neutral'` | Nuxt UI button color.                |
| `size`     | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'`                | `'sm'`      | Nuxt UI button size.                 |
| `iconOnly` | `boolean`                                             | `false`     | Render only the icon, no label text. |

### Slots

| Slot      | Description                                             |
| --------- | ------------------------------------------------------- |
| `default` | Label text. Default: `Logout`. Ignored when `iconOnly`. |

---

## MapoSidebarProfile

User profile row for the sidebar footer. Shows avatar, username, and a logout button. In mini mode shows only the avatar with a tooltip.

### Props

| Prop   | Type      | Default | Description                                                   |
| ------ | --------- | ------- | ------------------------------------------------------------- |
| `mini` | `boolean` | `false` | Compact (icon-only) mode, used when the sidebar is collapsed. |

### Props / Emits / Slots

No emits or slots — reads from `useAuthStore` and calls `useMapoAuth().logout()` directly.

---

## Layouts

### `mapo-default`

Main admin layout. Composes `MapoSidebar`, `MapoTopbar`, `<slot />`, and `MapoRootComponents`.

| Slot                 | Description                            |
| -------------------- | -------------------------------------- |
| `default`            | Main page content.                     |
| `sidebar:logo`       | Forwarded to `MapoSidebar#logo`.       |
| `sidebar:nav-top`    | Forwarded to `MapoSidebar#nav-top`.    |
| `sidebar:nav-bottom` | Forwarded to `MapoSidebar#nav-bottom`. |
| `sidebar:footer`     | Forwarded to `MapoSidebar#footer`.     |
| `topbar:left`        | Forwarded to `MapoTopbar#left`.        |
| `topbar`             | Forwarded to `MapoTopbar#default`.     |
| `topbar:right`       | Forwarded to `MapoTopbar#right`.       |

### `mapo-empty`

Bare-bones layout with no chrome. Useful for login pages and error pages.
