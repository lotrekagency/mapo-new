# CRUD detail / form

Build a detail/edit page using `<MapoDetail>`. The component fetches the object, renders the form, handles PATCH differential saves, maps 400 errors onto fields, and provides unsaved-changes protection — all from a list of field descriptors.

## Minimal example

```vue
<script setup lang="ts">
definePageMeta({ layout: "mapo-default" });

const route = useRoute();
const id = computed(() => route.params.id as string);
</script>

<template>
  <div class="p-6">
    <MapoDetail
      endpoint="/api/articles"
      :id="id"
      :fields="[
        { key: 'title', type: 'text', label: 'Title', required: true },
        { key: 'body', type: 'editor', label: 'Body' },
      ]"
    />
  </div>
</template>
```

- Pass `id="new"` to create a new record — `MapoDetail` uses `POST` and redirects to the returned `id`.
- Pass a numeric/string id to edit — `MapoDetail` uses `GET` to fetch, `PATCH` to save.

## Full example with sidebar, translatable fields, and languages

```vue
<script setup lang="ts">
import type { FieldDescriptor } from "@mapomodule/form/runtime/types/index.js";

definePageMeta({ layout: "mapo-default" });

const route = useRoute();
const id = computed(() => route.params.id as string);

interface Article {
  id: number;
  title: string;
  slug: string;
  body: string;
  status: string;
  is_featured: boolean;
  published_at: string | null;
  priority: number;
  translations: Record<string, { title?: string; body?: string }>;
}

// ── Main form (left / wide column) ───────────────────────────────────────────
const fields: FieldDescriptor<Article>[] = [
  {
    key: "title",
    type: "text",
    label: "Title",
    translatable: true, // reads/writes model.translations[lang].title
    required: true,
  },
  {
    key: "slug",
    type: "text",
    label: "Slug",
    synci18n: true, // same value across all languages
    attrs: { placeholder: "my-article-slug" },
  },
  {
    key: "body",
    type: "editor", // Tiptap WYSIWYG
    label: "Content",
    translatable: true,
  },
];

// ── Sidebar form (right sticky column) ───────────────────────────────────────
const sidebarFields: FieldDescriptor<Article>[] = [
  {
    key: "status",
    type: "select",
    label: "Status",
    synci18n: true,
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
    },
  },
  { key: "is_featured", type: "switch", label: "Featured", synci18n: true },
  {
    key: "priority",
    type: "number",
    label: "Priority",
    synci18n: true,
    attrs: { min: 1, max: 10 },
  },
  {
    key: "published_at",
    type: "datetime",
    label: "Publication date",
    synci18n: true,
  },
];
</script>

<template>
  <div class="p-6">
    <MapoDetail
      endpoint="/api/articles"
      :id="id"
      :fields="fields"
      :sidebar-fields="sidebarFields"
      :languages="['en', 'it']"
      model-name="Article"
    />
  </div>
</template>
```

## Translatable vs synci18n

| Flag                 | Behaviour                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `translatable: true` | Value lives in `model.translations[lang].{key}` — each language has its own value                     |
| `synci18n: true`     | Value lives at `model.{key}` and is shared across all languages — the lang switcher doesn't change it |
| _(neither)_          | Same as `synci18n: true` — shared value                                                               |

Use `translatable` for text content (title, body). Use `synci18n` for metadata (slug, status, dates).

## All built-in field types

```ts
const fields: FieldDescriptor[] = [
  { key: "name", type: "text" },
  { key: "bio", type: "textarea" },
  { key: "count", type: "number" },
  { key: "active", type: "boolean" },
  { key: "enabled", type: "switch" },
  { key: "hex", type: "color" },
  { key: "score", type: "slider", attrs: { min: 0, max: 100 } },
  { key: "avatar", type: "file" },
  { key: "category", type: "select", attrs: { items: [...] } },
  { key: "published_at", type: "date" },
  { key: "time", type: "time" },
  { key: "start", type: "datetime" },
  { key: "author", type: "fks" },           // foreign key select
  { key: "tags", type: "m2m" },             // many-to-many
  { key: "sections", type: "repeater" },    // repeatable group of fields
  { key: "body", type: "editor" },          // Tiptap WYSIWYG
  { key: "location", type: "map" },         // map picker
  { key: "seo", type: "seo" },              // SEO preview panel
]
```

## Custom save / delete buttons

Override any action button via slots:

```vue
<MapoDetail endpoint="/api/articles" :id="id" :fields="fields">
  <template #button-save="{ save, isSaving }">
    <UButton
      icon="i-lucide-save"
      :loading="isSaving"
      @click="save(false)"   // false = don't redirect after save
    >
      Save draft
    </UButton>
  </template>

  <template #button-save-back="{ save, isSaving }">
    <UButton
      icon="i-lucide-check"
      :loading="isSaving"
      @click="save(true)"    // true = redirect to list after save
    >
      Save & exit
    </UButton>
  </template>
</MapoDetail>
```

## Extra sidebar content

Add anything below the sidebar fields:

```vue
<MapoDetail
  endpoint="/api/articles"
  :id="id"
  :fields="fields"
  :sidebar-fields="sidebarFields"
>
  <template #side-bottom="{ model }">
    <UCard class="mt-4">
      <div class="text-xs text-muted space-y-1">
        <div>Created: {{ model.created_at }}</div>
        <div>Modified: {{ model.updated_at }}</div>
      </div>
    </UCard>
  </template>
</MapoDetail>
```

## What MapoDetail gives you for free

| Feature               | Description                                    |
| --------------------- | ---------------------------------------------- |
| Auto-fetch            | Calls `GET /api/articles/{id}` on mount        |
| Differential PATCH    | Only sends changed fields on save              |
| 400 error mapping     | Backend validation errors appear on each field |
| Unsaved changes guard | Confirm dialog before navigating away          |
| `window.beforeunload` | Alert on tab close with unsaved changes        |
| Lang switcher         | Per-language badge with error indicator        |
| Snack feedback        | Success / error toast on save                  |
| Delete confirm        | Built-in confirm dialog for delete             |
| Create mode           | `id="new"` → POST + redirect to returned id    |

## Props reference

| Prop             | Type                | Description                                   |
| ---------------- | ------------------- | --------------------------------------------- |
| `endpoint`       | `string`            | REST base URL                                 |
| `id`             | `string \| number`  | Record id, or `"new"` for creation            |
| `fields`         | `FieldDescriptor[]` | Main form fields                              |
| `sidebar-fields` | `FieldDescriptor[]` | Sidebar form fields                           |
| `languages`      | `string[]`          | Available languages (enables lang switcher)   |
| `model-name`     | `string`            | Label shown in page title and confirm dialogs |

→ See also: [CRUD list view](./crud-list), [All field types](/uikit/form/add-fields)
