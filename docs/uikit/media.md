# Media Manager

The Mapo v2 Media Manager handles the full lifecycle of files and media: upload, cataloguing, search, folder organization, and form integration through a picker dialog.

## TL;DR

A full media library page is one component:

```vue
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Media",
  icon: "i-lucide-image",
  middleware: ["auth"],
});
</script>

<template>
  <div class="h-[calc(100vh-3.5rem)]">
    <MapoMediaManager />
  </div>
</template>
```

That renders the folder sidebar with MIME filters, breadcrumbs, a searchable paginated gallery with bulk delete, an upload tab with per-file progress, and a metadata editor drawer — all backed by `useMediaStore`.

Inside a form, media are regular field descriptors — no imports, the types are injected by `@mapomodule/uikit`:

```ts
const fields: FieldDescriptor[] = [
  {
    key: "hero_image",
    type: "media",
    label: "Hero",
    attrs: { mime: "image/*" },
  },
  {
    key: "gallery",
    type: "media-m2m",
    label: "Gallery",
    attrs: { mime: "image/*" },
  },
];
```

---

## Architecture

```
useMediaStore (Pinia)
    │
    ├── MapoMediaManager          ← orchestrator shell
    │     ├── MapoMediaFolders    ← folder sidebar + MIME filters
    │     ├── MapoMediaBreadcrumbs← path navigation
    │     ├── MapoMediaGallery    ← CSS grid + bulk ops + pagination
    │     ├── MapoMediaEditor     ← side drawer for metadata
    │     └── MapoMediaUploader   ← drop area + per-file progress
    │
    ├── MapoMediaManagerDialog    ← UModal wrapper (picker mode)
    │
    └── Form fields (in @mapomodule/uikit, injected into the registry)
          ├── MapoMediaField         type: 'media'
          ├── MapoMediaM2mField      type: 'media-m2m'
          └── MapoEnhancedMediaField type: 'enhanced-media'
```

**Placement note**: `useMediaStore` and all media components live in `@mapomodule/uikit`. The `media`, `media-m2m`, and `enhanced-media` field types are injected into `$mapoFormRegistry` by a Nuxt plugin (`media-registry.ts`) shipped by `@mapomodule/uikit`. This avoids a circular dependency between `@mapomodule/form` and `@mapomodule/uikit`.

---

## Backend contract

The Media Manager mirrors the Camomilla CMS media API. Two endpoints, both configurable (see [Configuration](#configuration)):

### Folders endpoint (default `/api/media-folders`)

Drives navigation. **Both list and detail return the explorer payload** — this is the key contract: entering a folder is a `detail(folderId)` call, not a `?folder=` query.

| Call                             | Returns                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `GET /api/media-folders/`        | Root explorer: `{ media, folders, parent_folder: null }` |
| `GET /api/media-folders/:id/`    | Folder explorer: `{ media, folders, parent_folder }`     |
| `POST /api/media-folders/`       | Create folder                                            |
| `PATCH /api/media-folders/:id/`  | Rename / move folder                                     |
| `DELETE /api/media-folders/:id/` | Delete folder                                            |

Explorer payload shape:

```json
{
  "media": { "items": [MediaItem, ...], "paginator": { "page": 1, "pages": 5 } },
  "folders": [MediaFolder, ...],
  "parent_folder": MediaFolder | null
}
```

### Media endpoint (default `/api/media`)

Single-media CRUD:

| Call                           | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `GET /api/media/:id/`          | Fetch full media detail (opens the editor) |
| `POST /api/media/` (multipart) | Upload                                     |
| `PATCH /api/media/:id/`        | Update metadata / replace file             |
| `DELETE /api/media/:id/`       | Delete                                     |

---

## Configuration

All endpoints and upload limits are configurable via `mapo.uikit.media` (or `mapoUikit.media` when using `@mapomodule/uikit` standalone). Values are forwarded to `runtimeConfig.public.mapoMedia`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    uikit: {
      media: {
        endpoints: {
          media: "/api/media", // default
          folders: "/api/media-folders", // default
        },
        maxImageSize: 10, // MB, default 10
        maxVideoSize: 100, // MB, default 100
        maxDefaultSize: 10, // MB for any other type, default 10
        permissionsModel: "media", // Django model for change/delete checks in the editor
      },
    },
  },
});
```

---

## Backend adapters

Backend-specific request/response transforms (filter syntax, response shape, language params) are handled by a **media adapter** — not hard-coded into the store. The store speaks **canonical** params (`page`, `search`, `mime`, `all`); the adapter maps them to the target backend.

The adapter is injected as `$mapoMediaAdapter` by a Nuxt plugin (functions are not serializable through `runtimeConfig`, so this mirrors the `$mapoFormRegistry` pattern). The default adapter applies plain REST semantics:

```ts
interface MediaAdapter {
  /** Map canonical list params to backend query params. */
  buildListParams?(ctx: {
    page?;
    search?;
    mime?;
    all?;
  }): Record<string, unknown>;
  /** Normalize a raw explorer response into the canonical shape. */
  parseRootResponse?(raw: unknown): MediaApiResponse;
  /** Build query params for the single-media detail fetch. */
  buildDetailParams?(ctx: { lang?: string }): Record<string, unknown>;
  /** Map a canonical folder ({ name, parent }) to the backend's create/update payload. */
  buildFolderPayload?(folder: Partial<MediaFolder>): Record<string, unknown>;
  /** Build the PATCH payload for a metadata update (default: title/alt_text/description/translations). */
  buildMediaPatchPayload?(media: MediaItem): Record<string, unknown>;
  /** Build the multipart PATCH payload for a file replacement (default REST: { file, maintain_url }). */
  buildReplaceFilePayload?(
    file: File,
    maintainUrl: boolean,
  ): Record<string, unknown>;
}
```

Every method is optional; the default adapter applies plain REST semantics.

### Camomilla adapter

`@mapomodule/mapo-integrations-camomilla` auto-registers an adapter that speaks Camomilla's dialect:

- mime filter → `fltr=mime_type=<value>`
- detail params → `language_code`
- folder create/update payload → `{ title, slug, updir }` (instead of `{ name, parent }`)
- folder reads normalized back to the canonical `{ name, parent, path }`
- file replace flag → `same_url` (instead of `maintain_url`)

Opt out with `camomilla: { mediaAdapter: false }` to keep the default REST adapter.

### How to: write a custom adapter

Create a Nuxt plugin in the consumer app that provides `$mapoMediaAdapter` (order it after the uikit default):

```ts
// plugins/my-media-adapter.ts
export default defineNuxtPlugin(() => ({
  provide: {
    mapoMediaAdapter: {
      buildListParams: (ctx) => ({
        page: ctx.page,
        q: ctx.search, // backend uses `q` instead of `search`
        type: ctx.mime?.replace("/*", ""), // backend uses `type=image`
      }),
      parseRootResponse: (raw) => ({
        media: {
          items: raw.data,
          paginator: { page: raw.page, pages: raw.total_pages },
        },
        folders: raw.dirs,
        parent_folder: raw.current ?? null,
      }),
    },
  },
}));
```

---

## TypeScript types

```ts
import type {
  MediaItem,
  MediaFolder,
  SelectMode,
  MediaApiResponse,
  MediaAdapter,
} from "@mapomodule/uikit/types/media";

interface MediaItem {
  id: number;
  file: string; // file URL
  mime_type: string;
  title: string;
  alt_text: string;
  description: string;
  size: number; // bytes
  created: string; // ISO date
  modified: string;
  folder?: number | null;
  links?: MediaLink[]; // model instances referencing this media (shown in the editor)
  translations?: Record<
    string,
    { title?: string; alt_text?: string; description?: string }
  >;
}

interface MediaLink {
  model: string; // e.g. "article"
  id: number;
  name: string;
}

interface MediaFolder {
  id: number;
  name: string;
  parent?: number | null;
  path?: string; // materialized path; breadcrumb dedups on it (falls back to id)
}

type SelectMode = "none" | "single" | "multi";
```

---

## `useMediaStore`

Auto-imported Pinia store available throughout the app.

### State

| Property         | Type                               | Description                                                              |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `medias`         | `MediaItem[]`                      | Media in the current folder/page                                         |
| `folders`        | `MediaFolder[]`                    | Folders in the current directory                                         |
| `parentFolders`  | `MediaFolder[]`                    | Breadcrumb path from root                                                |
| `page` / `pages` | `number`                           | Pagination                                                               |
| `mimeType`       | `string \| null`                   | Active MIME filter                                                       |
| `lockedMime`     | `string \| null`                   | MIME constraint imposed by a picker — `setMimeType` cannot widen past it |
| `loading`        | `boolean`                          | Fetch in progress                                                        |
| `editMedia`      | `MediaItem \| null`                | Media open in the editor                                                 |
| `selection`      | `MediaItem \| MediaItem[] \| null` | Current picker selection                                                 |
| `editList`       | `number[]`                         | IDs flagged for bulk operations                                          |
| `selectMode`     | `SelectMode`                       | Selection mode                                                           |

### Getters

| Getter          | Description                                                     |
| --------------- | --------------------------------------------------------------- |
| `parentFolder`  | Last entry of `parentFolders`                                   |
| `editListSet`   | `editList` as a `Set` for O(1) lookup                           |
| `editListState` | `{ value, indeterminate, outside }` for the select-all checkbox |

### Actions

```ts
const store = useMediaStore()

await store.getRoot({ page?, search?, mime?, all? })  // fetch current folder
await store.navigateToFolder(folder | null)           // null = root; uses detail(folderId)
await store.openEditor(media)                          // fetch detail + open drawer
store.closeEditor()
store.setLang('it')                                    // language for detail metadata

await store.updateMedia(media)
await store.replaceFile(mediaId, file, maintainUrl?)
await store.deleteMedia(media)

await store.updateOrCreateFolder({ id?, name, parent? })
await store.deleteFolder(folder)

const item = await store.uploadMedia(payload, onProgress?)  // onProgress: (pct: number) => void

store.setSelectionMode('none' | 'single' | 'multi')
store.setSelection(value)
store.select(media)            // state machine driven by selectMode

store.editSelect(id | id[])    // toggle bulk selection
store.editSelectAll()
await store.deleteSelected()

store.setMimeType('image/*')   // narrows the filter; respects an active lock
store.lockMimeType('image/*')  // hard lock for picker fields — cannot be widened
store.reset()                  // called automatically on MapoMediaManager unmount
```

The editor gates **Edit** and **Delete** on the `change`/`delete` permission of the configured `permissionsModel` (see [Configuration](#configuration)), via `usePermissions()`. Superusers always pass.

---

## Components

### `<MapoMediaManager>`

Main shell. Mounts the store and calls `reset()` on `onUnmounted`.

| Prop               | Type                               | Default  | Description                                                    |
| ------------------ | ---------------------------------- | -------- | -------------------------------------------------------------- |
| `selectionMode`    | `SelectMode`                       | `'none'` | Selection mode                                                 |
| `mime`             | `string \| null`                   | `null`   | Initial MIME filter                                            |
| `noFolders`        | `boolean`                          | `false`  | Hide the folder sidebar                                        |
| `languages`        | `string[]`                         | —        | Languages for editor metadata form                             |
| `defaultLang`      | `string`                           | —        | Default editor language                                        |
| `initialSelection` | `MediaItem \| MediaItem[] \| null` | `null`   | Pre-seed the picker selection (e.g. the field's current value) |

Emits `update:selection` with `MediaItem | MediaItem[] | null` in picker mode. When `mime` is set it is treated as a **hard lock** (`lockMimeType`): the folders panel only offers the matching filter. When `defaultLang` is set, media detail fetches send it as `language_code`.

Slots: `actions` — custom buttons rendered in a footer bar below the content (v1 parity).

In `multi` mode the gallery shows a **selection strip** above the grid: click a thumbnail to deselect it, drag to reorder (the order is preserved in the emitted value).

### `<MapoMediaManagerDialog>`

`UModal` wrapper for picker usage.

```vue
<MapoMediaManagerDialog
  v-model="open"
  selection-mode="single"   <!-- 'single' | 'multi' -->
  mime="image/*"
  @confirm="onConfirm"
>
  <template #activator="{ open }">
    <UButton @click="open()">Select media</UButton>
  </template>
</MapoMediaManagerDialog>
```

| Prop            | Type                               | Default    |
| --------------- | ---------------------------------- | ---------- |
| `modelValue`    | `boolean`                          | `false`    |
| `selectionMode` | `'single' \| 'multi'`              | `'single'` |
| `mime`          | `string \| null`                   | `null`     |
| `noFolders`     | `boolean`                          | `false`    |
| `selected`      | `MediaItem \| MediaItem[] \| null` | `null`     |

`selected` pre-seeds the picker with the host field's current value. Emits `update:modelValue` and `confirm` (`MediaItem | MediaItem[]`). Slot `activator` receives `{ open: () => void }`.

In `single` mode the first pick **confirms and closes immediately** (v1 parity) — the pre-seeded `selected` value does not trigger this. In `multi` mode the user confirms explicitly with the footer button.

### `<MapoDropArea>`

Standalone drag-and-drop area, reusable outside the media manager.

```vue
<MapoDropArea accept="image/*" :multiple="true" @files="onFiles">
  <template #default="{ triggerPick, isDragging }">
    <div @click="triggerPick">{{ isDragging ? 'Drop here' : 'Drag or click' }}</div>
  </template>
</MapoDropArea>
```

Props: `accept` (default `*/*`), `multiple` (default `true`), `disabled`. Emits `files` (`File[]`). Slot `default` receives `{ triggerPick, isDragging }`.

### `<MapoMediaPreview>`

MIME-aware renderer: `image` → `<img>`, `video` → `<video>`, otherwise a file icon.

```vue
<MapoMediaPreview
  :media="item"
  size="md"
  :contain="false"
  :show-filename="false"
/>
```

---

## Form fields

The three field types are auto-registered in `$mapoFormRegistry` by `@mapomodule/uikit`. No imports needed.

### `type: 'media'` — `MapoMediaField`

Single picker. Value: `MediaItem | null`.

```ts
{ key: 'cover_image', type: 'media', label: 'Cover Image', attrs: { mime: 'image/*' } }
```

### `type: 'media-m2m'` — `MapoMediaM2mField`

Multi picker. Value: `MediaItem[]`. Selected thumbnails can be **reordered by drag** (the order is preserved in the value, matching v1).

```ts
{ key: 'gallery', type: 'media-m2m', label: 'Gallery', attrs: { mime: 'image/*', maxItems: 10 } }
```

### `type: 'enhanced-media'` — `MapoEnhancedMediaField`

Single picker with inline `alt` and `caption` fields. Value: `{ media: MediaItem | null, alt: string, caption: string }`.

```ts
{ key: 'hero', type: 'enhanced-media', label: 'Hero Image', attrs: { mime: 'image/*' } }
```

All media fields accept `attrs.mime` to filter the gallery by MIME type.

---

## WYG Editor — image insertion

The Tiptap editor's "Insert image" toolbar button is enabled when `@mapomodule/uikit` is installed. It uses `resolveComponent('MapoMediaManagerDialog')` at runtime (no direct import — this breaks the form → uikit cycle). Clicking it opens an `image/*`-filtered picker; the selection is inserted as an `<img>` node.

---

## How to: open the picker from your own button

Use the `activator` slot — the dialog stays closed until `open()` is called:

```vue
<script setup lang="ts">
import type { MediaItem } from "@mapomodule/uikit/types/media";

const cover = ref<MediaItem | null>(null);

function onConfirm(selection: MediaItem | MediaItem[]) {
  cover.value = Array.isArray(selection) ? (selection[0] ?? null) : selection;
}
</script>

<template>
  <MapoMediaManagerDialog selection-mode="single" @confirm="onConfirm">
    <template #activator="{ open }">
      <UButton icon="i-lucide-image-plus" @click="open()">
        {{ cover ? "Change media" : "Select media" }}
      </UButton>
    </template>
  </MapoMediaManagerDialog>
</template>
```

You can also control it programmatically with `v-model` instead of the slot:

```vue
<MapoMediaManagerDialog
  v-model="dialogOpen"
  selection-mode="multi"
  @confirm="onConfirm"
/>
```

In `single` mode the first pick confirms and closes immediately; in `multi` mode the user builds the selection (strip above the grid, drag to reorder) and confirms with the footer button.

## How to: preselect the current value

Pass the field's current value as `selected` — the picker opens with it highlighted, and the auto-confirm guard ignores it (so reopening doesn't immediately close):

```vue
<MapoMediaManagerDialog
  selection-mode="single"
  :selected="cover"
  @confirm="onConfirm"
/>
```

For multi mode pass the `MediaItem[]` array. The built-in form fields already do this.

## How to: restrict the picker to a MIME type

The `mime` prop is a hard lock: the gallery only shows matching files, the folders panel only offers that filter, and the user cannot widen it.

```vue
<MapoMediaManagerDialog
  selection-mode="single"
  mime="image/*"
  @confirm="onConfirm"
/>
```

Families (`image/*`, `video/*`, `audio/*`, `application/*`) and exact types (`application/pdf`) both work. In form fields the same constraint is `attrs: { mime: "image/*" }`.

## How to: handle multilingual media metadata

Pass the language list to the manager — the editor drawer shows a language switch and writes per-language values into `media.translations[lang]`:

```vue
<MapoMediaManager :languages="['it', 'en']" default-lang="it" />
```

`defaultLang` is also sent as `language_code` on detail fetches (the Camomilla adapter maps it). The "Default" tab edits the untranslated base fields.

## How to: gate editing with permissions

The editor's **Edit** and **Delete** buttons check the `change` / `delete` Django permissions on the configured model (default `"media"`), via `usePermissions()`. Point it at your model if it differs:

```ts
// nuxt.config.ts
mapo: {
  uikit: {
    media: { permissionsModel: "camomilla.media" },
  },
},
```

Users without `change_<model>` see a read-only drawer; without `delete_<model>` the Delete button is hidden. Superusers always pass.

## How to: build a custom upload zone with MapoDropArea

`MapoDropArea` is standalone — combine it with `store.uploadMedia()` for a bespoke upload UI with progress:

```vue
<script setup lang="ts">
const store = useMediaStore();
const progress = ref(0);

async function onFiles(files: File[]) {
  for (const file of files) {
    await store.uploadMedia(
      { file, title: file.name, folder: store.parentFolder?.id ?? null },
      (pct) => (progress.value = pct),
    );
  }
  await store.getRoot({ page: 1 });
}
</script>

<template>
  <MapoDropArea accept="image/*" multiple @files="onFiles">
    <template #default="{ triggerPick, isDragging }">
      <UButton :variant="isDragging ? 'solid' : 'soft'" @click="triggerPick">
        Upload images
      </UButton>
    </template>
  </MapoDropArea>
  <UProgress v-if="progress > 0 && progress < 100" :model-value="progress" />
</template>
```

`accept` filters both the file picker and dropped files; rejected files are silently discarded.

## How to: point the manager at a different backend

Two knobs, independent of each other:

1. **Endpoints** (serializable config) — where requests go:

   ```ts
   mapo: { uikit: { media: { endpoints: { media: "/api/assets", folders: "/api/asset-dirs" } } } }
   ```

2. **Adapter** (Nuxt plugin) — how requests/responses are shaped. See [How to: write a custom adapter](#how-to-write-a-custom-adapter). If you use the Camomilla integration, both are already configured.

---

## Differences from v1

| Area               | v1                                          | v2                                                      |
| ------------------ | ------------------------------------------- | ------------------------------------------------------- |
| Store              | Vuex module `mapo/media` (global)           | Pinia `useMediaStore`, auto-reset on unmount            |
| Folder navigation  | `detail(folderId)` on `media-folders`       | Same contract preserved                                 |
| Endpoints          | Hard-coded `api/media`, `api/media-folders` | Configurable via `mapo.uikit.media.endpoints`           |
| Backend transforms | Inline in store (`fltr=mime_type=`)         | Pluggable `$mapoMediaAdapter` (Camomilla ships its own) |
| Gallery layout     | v-masonry (external dep)                    | CSS Grid `auto-fill` — zero deps                        |
| Editor             | Tab switch inside gallery                   | `USlideover` side drawer                                |
| Upload progress    | Two bars (buffer + process)                 | `XMLHttpRequest` upload progress, one bar per file      |
| Upload destination | Folder `v-select`                           | Folder `USelect` (current folder + subfolders)          |
| Form fields        | In `@mapomodule/form` (coupled)             | In `@mapomodule/uikit`, injected via plugin             |
| m2m reorder        | `vuedraggable`                              | Native HTML5 drag                                       |
| Editor permissions | `hasModelPermission` getter                 | `usePermissions()` on `permissionsModel`                |
| Upload limits      | Hard-coded (1 MB images)                    | `mapo.uikit.media.maxImageSize` etc.                    |
