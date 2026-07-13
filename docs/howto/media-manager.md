# How-to: Media Manager

Practical recipes for the Mapo Media Manager. For the full API reference see [UIKit → Media Manager](/uikit/media).

---

## Add a full media page

Embed the manager in a full-height page:

```vue
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Media",
  icon: "i-lucide-images",
  middleware: ["auth"],
});
</script>

<template>
  <div class="flex h-[calc(100vh-var(--mapo-topbar-height,56px))] flex-col">
    <div class="border-b px-6 py-4">
      <h1 class="text-xl font-semibold">Media</h1>
    </div>
    <div class="flex-1 overflow-hidden">
      <MapoMediaManager :languages="['it', 'en']" default-lang="it" />
    </div>
  </div>
</template>
```

---

## Pick media from a custom component

Use `MapoMediaManagerDialog` with the `activator` slot:

```vue
<script setup lang="ts">
import type { MediaItem } from "@mapomodule/uikit/types/media";

const selected = ref<MediaItem | null>(null);
const open = ref(false);

function onConfirm(sel: MediaItem | MediaItem[]) {
  selected.value = Array.isArray(sel) ? (sel[0] ?? null) : sel;
}
</script>

<template>
  <MapoMediaManagerDialog
    v-model="open"
    selection-mode="single"
    mime="image/*"
    @confirm="onConfirm"
  >
    <template #activator="{ open }">
      <UButton icon="i-lucide-image-plus" @click="open()">Choose cover</UButton>
    </template>
  </MapoMediaManagerDialog>

  <MapoMediaPreview v-if="selected" :media="selected" />
</template>
```

For multiple selection use `selection-mode="multi"` — `@confirm` then receives `MediaItem[]`.

---

## Add media fields to a form

The `media`, `media-m2m`, and `enhanced-media` field types work in any `MapoForm` / `MapoDetail`:

```ts
const fields: FieldDescriptor<Article>[] = [
  { key: "cover", type: "media", label: "Cover", attrs: { mime: "image/*" } },
  {
    key: "gallery",
    type: "media-m2m",
    label: "Gallery",
    attrs: { mime: "image/*" },
  },
  {
    key: "hero",
    type: "enhanced-media",
    label: "Hero",
    attrs: { mime: "image/*" },
  },
];
```

- `media` → stores a single `MediaItem`
- `media-m2m` → stores `MediaItem[]`
- `enhanced-media` → stores `{ media, alt, caption }`

---

## Configure endpoints and upload limits

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  mapo: {
    uikit: {
      media: {
        endpoints: {
          media: "/api/assets", // your single-media CRUD endpoint
          folders: "/api/asset-folders", // your folder explorer endpoint
        },
        maxImageSize: 5, // MB
        maxVideoSize: 200, // MB
      },
    },
  },
});
```

The folder endpoint must return the explorer payload (`{ media, folders, parent_folder }`) on **both** list and detail. See [the backend contract](/uikit/media#backend-contract).

---

## Adapt to a non-standard backend

If your backend uses different query params or response shapes, provide a `$mapoMediaAdapter` plugin instead of changing the store:

```ts
// plugins/media-adapter.ts
export default defineNuxtPlugin(() => ({
  provide: {
    mapoMediaAdapter: {
      buildListParams: (ctx) => ({
        page: ctx.page,
        q: ctx.search,
        kind: ctx.mime?.replace("/*", ""),
      }),
      parseRootResponse: (raw) => ({
        media: {
          items: raw.results,
          paginator: { page: raw.page, pages: raw.num_pages },
        },
        folders: raw.children,
        parent_folder: raw.current ?? null,
      }),
    },
  },
}));
```

With the **Camomilla** integration this is automatic — it ships an adapter that maps `mime → fltr=mime_type=` and adds `language_code`. Disable it with `camomilla: { mediaAdapter: false }`.

---

## Upload programmatically

```ts
const store = useMediaStore();

const item = await store.uploadMedia(
  { file, title: "My upload", alt_text: "Alt", folder: null },
  (pct) => console.log(`${pct}%`),
);
```

---

## Self-contained demo behind a proxy integration

When an integration (e.g. Camomilla) proxies `/api/**`, point the media endpoints at a path the proxy skips (`/api/mock/...`) to serve local mocks:

```ts
mapo: {
  uikit: {
    media: {
      endpoints: { media: '/api/mock/media', folders: '/api/mock/media-folders' },
    },
  },
}
```

This is exactly what `apps/example` does to stay runnable without a live Camomilla backend.
