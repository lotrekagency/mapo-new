# Feature Status

Current implementation status of all Mapo v2 features relative to the legacy v1 feature set.

## Implemented ✅

### Core & Auth

| Feature                                      | Notes                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useMapoAuth()` — login / logout / fetchUser | HttpOnly cookie session, no client-stored token                                                                                                                                                                                                                         |
| SSR session hydration                        | Server plugin reads session cookie, hydrates `useAuthStore` before first render                                                                                                                                                                                         |
| `auth` middleware                            | Redirects to `loginUrl` if not authenticated; appends `?redirect=`                                                                                                                                                                                                      |
| `permissions` middleware                     | Supports `{ model }` (derives CRUD actions, populates `pagePermissions`) and `string[]` (explicit codenames)                                                                                                                                                            |
| `roles` middleware                           | Checks `meta.roles` against `useAuthStore.role`                                                                                                                                                                                                                         |
| 401 auto-logout                              | `$mapoFetch` interceptor calls `auth.reset()` and redirects on 401                                                                                                                                                                                                      |
| `useCrud<T>()` — full CRUD repository        | `list`, `detail`, `create`, `update`, `partialUpdate`, `delete`, `updateOrder`                                                                                                                                                                                          |
| `useMapoFetch()` — auth-aware `$fetch`       | Returns the `$mapoFetch` instance (401/403 interceptors). Auto-imported.                                                                                                                                                                                                |
| Multipart upload with policy                 | `auto` \| `force` \| `disable` — transforms payload when files are detected                                                                                                                                                                                             |
| `@mapomodule/utils` — base helpers           | `deepMerge`, `deepClone`, `objectDiff`, `getNestedValue`, `setNestedValue`, `formatDate`, `debounce`, `normalizeEndpoint`, `slotNamespace`, `buildRouteTree`, `calcMaxMenuNestDepth`, `isFile`, `isBlob`, `isFileOrBlob`, `findPropPaths`, `filesInObject`, `filterObj` |

### State (Pinia)

| Store             | Key features                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAuthStore`    | `isAuthenticated`, `username`, `role`, `modelPermissions`, `pagePermissions` (populated by `permissions` middleware when using `{ model }` format) |
| `useSnackStore`   | `show(message, type, duration)`, `dismiss()`                                                                                                       |
| `useConfirmStore` | `ask(options): Promise<boolean>`                                                                                                                   |
| `useSidebarStore` | `drawer`, `mini` — both persisted to cookies, SSR-hydrated                                                                                         |
| `usePermissions`  | `userCan(model, action)` helper                                                                                                                    |

### UIKit Shell

| Component / Feature        | Notes                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `mapo-default` layout      | Sidebar + Topbar + content + global feedback                                                                                         |
| `MapoSidebar`              | Drawer + mini mode, cookie-persisted state, full slot API                                                                            |
| Auto-generated sidebar nav | Built from `route.meta.label` — no manual config needed                                                                              |
| Nested menu                | `meta.parent` creates hierarchical groups                                                                                            |
| Footer items               | `meta.sidebarFooter: true` moves item to sidebar footer                                                                              |
| `MapoTopbar`               | Drawer toggle + left / center / right slots                                                                                          |
| `MapoLogin`                | Split-panel form, field-level error mapping (backend 400 `{username,password}`), redirect-aware, slots: `brand` / `panel` / `footer` |
| `MapoSnackBar`             | Bridges `useSnackStore` to Nuxt UI toast notifications                                                                               |
| `MapoConfirmDialog`        | Bridges `useConfirmStore` to non-dismissible `<UModal>`                                                                              |
| `MapoRootComponents`       | Mounts SnackBar + ConfirmDialog globally                                                                                             |
| `MapoThemeToggle`          | Dark/light toggle via `useColorMode()` — drop-in for any slot                                                                        |
| `MapoLogoutButton`         | Standalone logout button — props: `variant`, `color`, `size`, `iconOnly`; slot for custom label                                      |
| `MapoSidebarProfile`       | User profile row for the sidebar footer — reads from `useAuthStore`, calls `useMapoAuth().logout()`; supports `mini` prop            |
| Theming via CSS            | Custom CSS file injected after base via `uikit.css` option                                                                           |
| Nuxt UI defaults override  | Component config via `uikit.ui` option                                                                                               |
| Component override system  | Place `MapoXxx.vue` in `app/mapooverride/` to swap any component at build time                                                       |

### Integrations

| Feature                       | Notes                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `mapo-integrations-camomilla` | Nitro proxy, path rewriting, cookie sync (`sessionid` ↔ `__mapo_session`), CSRF forwarding |
| Custom backend integration    | Pattern documented in [Writing your own](/modules/integrations-howto)                      |

### List Engine (`@mapomodule/uikit`)

| Feature                                    | Notes                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `<MapoList>` shell                         | Composes `<MapoListHead>`, `<MapoListFilters>`, `<MapoListActions>`, `<MapoListTabs>`, `<MapoListTable>`, `<MapoListQuickEdit>` |
| Server-side pagination / search / ordering | Default mode: filters, tabs, and pagination all pass as `list()` params — never baked into the endpoint string                  |
| Offline mode (`v-model:items`)             | No backend: search / filter / tab / sort / paginate / drag-reorder / delete / quick-edit all run in memory on the parent array  |
| Hybrid mode (`client-side` prop)           | Single fetch on mount; filters / sort / paginate run client-side. Mutations (delete, drag, quick-edit) hit BE then refetch      |
| Multi-column sort (offline / hybrid)       | Sorting columns applied in order, each as a tiebreaker for the previous one (matches TanStack default)                          |
| Filters + sorting work simultaneously      | Active filters are preserved when sorting; sorting is preserved when filters change (B1 fix)                                    |
| `endpoint` with static query params        | Params in the endpoint URL (e.g. `?ordering=-date`) are passed to `list()` calls; CRUD ops use the clean path (B2 fix)          |
| Selection keyed by `lookup`                | Paging or sorting does not move selections                                                                                      |
| Drag reorder via `crud.updateOrder`        | Single server call — no parallel `PATCH` storm                                                                                  |
| Quick-edit modal                           | Driven by the same `FieldDescriptor[]` used by `<MapoDetail>` — no bespoke dialog code                                          |
| Column slots                               | `#cell.<key>` receives `{ item, value }`, `#dtable.toolbar`, `#dtable.empty`, `#dtable.loading`, `#qedit.extra`                 |

### Detail / Form Engine (`@mapomodule/form` + `@mapomodule/uikit`)

| Feature                                                                 | Notes                                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FieldDescriptor<T>` typed discriminated union                          | `KnownFieldType` enum + escape hatch for custom string types (`CustomDescriptor`)                                                                           |
| `FieldRegistry` (`mapping` / `attrs` / `accessor`)                      | Configurable via `nuxt.config.mapoForm`; global `$mapoFormRegistry` provided by the module plugin                                                           |
| `defineFormField(type, entry, opts)` plugin API                         | Typed helper for registering or overriding field components — collision warning unless `{ override: true }`                                                 |
| `<MapoForm>` / `<MapoDetail>` auto-inject the global registry           | The `:registry` prop is optional — pass it only to scope a swap                                                                                             |
| `useMapoForm()` headless composable                                     | Dirty tracking (incremental), diff/patch, touched/submitted gate, per-field debounce, i18n (`translatable` + `synci18n` + auto `initLang`), readonly toggle |
| `<MapoForm>` / `<MapoFormField>` / `<MapoFormGroup>` / `<MapoFormTabs>` | Tab navigation with per-tab error badge; collapsible groups; `<MapoUnknownField>` fail-soft fallback                                                        |
| Full slot system                                                        | `field.<key>`, `field.<key>.label`, `.append`, `.prepend`, `.hint`, `.before`, `.after`                                                                     |
| `MapoFocusPortal` + `useFocusMode()`                                    | Focus / expand mode for repeater items, editors, maps                                                                                                       |
| `useFormDraft()` / `useUnsavedChangesGuard()`                           | Local-storage draft autosave + `beforeunload` + `onBeforeRouteLeave` guard                                                                                  |
| `useProgressiveDisclosure()`                                            | Show/hide fields based on `visible()` / `show()` predicates with smooth transitions                                                                         |
| `useFormFromSchema(schema, options)`                                    | JSON Schema → `FieldDescriptor[]` (Pydantic / DRF), `if/then/else` → `visible()`, `exclude`, `overrides`, cycle-safe `$ref`                                 |
| Devtools panel                                                          | `/_mapo/devtools/forms` inside Nuxt DevTools — registry inventory & live form inspector                                                                     |
| `<MapoDetail>` shell                                                    | Two-column layout, `useCrud` lifecycle, differential PATCH, unsaved-changes guard, 400 → field errors, integrated snack/confirm                             |
| `<MapoDetailLangSwitch>`                                                | Language tabs with per-language error badge — syncs the `?lang=` query param                                                                                |

### Form fields library (`@mapomodule/form`)

| Field                                                        | Status | Notes                                                                                                                                                                           |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| text / textarea / number / boolean / switch / color / slider | ✅     | NUI direct mapping via thin wrappers (`NuiInput`, `NuiTextarea`, `NuiCheckbox`, `NuiSwitch`, `NuiSlider`)                                                                       |
| file                                                         | ✅     | `MapoFileField` with current-file preview, image thumbnail, and remove button                                                                                                   |
| select                                                       | ✅     | `USelectMenu` with `value-key` / `label-key` via registry                                                                                                                       |
| `MapoDateField` / `MapoTimeField` / `MapoDateTimeField`      | ✅     | ISO ↔ `@internationalized/date`; `datetime` accepts `tz: 'naive' \| 'utc'`                                                                                                      |
| `MapoFksField` (fks / m2m)                                   | ✅     | `USelectMenu` + debounced remote fetch, removable M2M chips                                                                                                                     |
| `MapoRepeater`                                               | ✅     | Drag-and-drop (`vue-draggable-plus`), stable item UIDs, undo stack, templates, contextual mini-card collapse, focus mode                                                        |
| `MapoSeoPreview`                                             | ✅     | 60 / 155 char counters, live SERP preview                                                                                                                                       |
| `MapoWygEditor`                                              | ✅     | Tiptap v2, custom toolbar, safe `Link` validator + HTML sanitizer, extensions via `attrs.extensions`                                                                            |
| `MapoMapField`                                               | ✅     | Leaflet SSR-safe via `ClientOnly` + dynamic import (`MapoMapFieldClient`)                                                                                                       |
| `media` / `media-m2m` / `enhanced-media`                     | ✅     | `MapoMediaField` (single), `MapoMediaM2mField` (multi, drag-reorder), `MapoEnhancedMediaField` (single + alt/caption); injected into `$mapoFormRegistry` by `@mapomodule/uikit` |

### Media Manager (`@mapomodule/uikit`)

File upload, gallery browsing, folder management, and a picker dialog. Full port of the v1 MediaManager. See [Media Manager](/uikit/media).

| Feature                                               | Status | Notes                                                                                           |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `useMediaStore`                                       | ✅     | Pinia store: gallery items, folders, breadcrumb, pagination, selection, bulk edit, MIME lock    |
| `MapoMediaManager` / `MapoMediaManagerDialog`         | ✅     | Orchestrator shell + `UModal` picker (single/multi), pre-seedable selection                     |
| Gallery (`MapoMediaGallery`)                          | ✅     | CSS-grid, picker selection, bulk select-all/delete, pagination                                  |
| Folders (`MapoMediaFolders` / `MapoMediaBreadcrumbs`) | ✅     | MIME filters, inline create/rename/delete, breadcrumb navigation                                |
| Editor (`MapoMediaEditor`)                            | ✅     | Slideover: info, linked models, open-in-new-tab, i18n metadata, file replace, permission gating |
| Uploader (`MapoMediaUploader`)                        | ✅     | Drop area + queue, per-file progress (XHR), inline metadata, destination folder                 |
| `MapoDropArea`                                        | ✅     | Generic drag-and-drop zone (reusable outside media)                                             |
| Backend adapter (`$mapoMediaAdapter`)                 | ✅     | Pluggable request/response/payload transforms; Camomilla ships its own                          |
| WYG image insertion                                   | ✅     | Tiptap toolbar "Insert image" via the media picker                                              |

---

## Not yet implemented 🔲

These features existed in Mapo v1 and are planned for v2 but have not been built yet.

### Menu Manager

Drag-and-drop reordering of navigation items for end users.

**v1 had:** `MapoMenuManager` with tree-drag via `vue-draggable`, nested items up to 2 levels, live preview of menu structure.

**v2 target:** Phase 7, using `vue-draggable-plus`.

### i18n

Multi-language content switching and UI translation.

**v1 had:** `@nuxtjs/i18n` integration, per-field language switching in Detail, `DetailLangSwitch`, translation sync helpers, base locale files overridable by the consuming app.

**v2 target:** `@mapomodule/i18n` module using `@nuxtjs/i18n` v9. See roadmap Phase 7.

### Standalone UIKit components

| Component             | Status | Description                                                          |
| --------------------- | ------ | -------------------------------------------------------------------- |
| `MapoLogoutButton`    | ✅     | Reusable logout button wrapping `useMapoAuth().logout()`             |
| `MapoSidebarProfile`  | ✅     | User profile row (avatar + username + logout) for the sidebar footer |
| `MapoDropArea`        | ✅     | Generic drag-and-drop zone — shared by Form fields and Media Manager |
| `MapoLangSwitcher` 🔲 | 🔲     | UI language selector (depends on `@mapomodule/i18n` — Phase 7)       |
| `MapoPagePreview` 🔲  | 🔲     | Page/template preview panel                                          |

---

## Removed from v2 (intentional)

| v1 feature                                | Reason removed                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@mapomodule/routemeta` package           | `definePageMeta()` in Nuxt 4 natively supports arbitrary meta fields. No parser needed.                                     |
| `@mapomodule/integrations` adapter loader | In Nuxt 4, each integration is a standalone Nuxt module. A central loader is unnecessary abstraction.                       |
| `$mapo` global facade                     | Replaced by individual composables (`useMapoAuth`, `useCrud`, `useSnackStore`, etc.) — tree-shakable and TypeScript-native. |
| Axios                                     | Replaced by Nuxt's native `$fetch` / `ofetch`.                                                                              |
| Vuex                                      | Replaced by Pinia.                                                                                                          |
| `setToken` / client-stored JWT            | Sessions are HttpOnly cookies. No token ever reaches client JS.                                                             |
