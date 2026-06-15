# Standalone form

How to use `<MapoForm>` directly — outside of `<MapoDetail>` — when you need full control over save logic, layout, or multi-step flows.

## When to use this vs MapoDetail

|                                          | `<MapoDetail>` | `<MapoForm>` standalone        |
| ---------------------------------------- | -------------- | ------------------------------ |
| Fetches record by id                     | ✅ automatic   | you call `useCrud`             |
| Saves with differential PATCH            | ✅ automatic   | you call `useCrud` or `$fetch` |
| Unsaved changes guard                    | ✅ built-in    | add manually if needed         |
| Layout (main + sticky sidebar)           | ✅ built-in    | you decide                     |
| Delete button                            | ✅ built-in    | you add if needed              |
| Custom multi-step wizard                 | ❌             | ✅                             |
| Sidebar drawer / modal form              | ❌             | ✅                             |
| Form that doesn't map to a REST resource | ❌             | ✅                             |

Use `<MapoDetail>` for standard CRUD detail pages. Use `<MapoForm>` standalone when the built-in shell doesn't fit.

## Minimal example

```vue
<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

const model = ref({ title: "", slug: "", is_draft: true });
const errors = ref<Record<string, string[]>>({});

const fields: FieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "is_draft", type: "switch", label: "Draft" },
];

async function save() {
  try {
    await $fetch("/api/articles/", { method: "POST", body: model.value });
    useSnackStore().show("Saved!", "success");
  } catch (e: any) {
    errors.value = e.data ?? {}; // backend errors land on the right fields
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <MapoForm v-model="model" :fields="fields" :errors="errors" />
    <UButton class="mt-4" @click="save">Save</UButton>
  </div>
</template>
```

## Full example — with useCrud, tabs, and all common field types

This mirrors what the example app uses for `form-demo.vue`.

```vue
<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

definePageMeta({ layout: "mapo-default", label: "New article" });

interface Article {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  category: { id: number; name: string } | null;
  tags: Array<{ id: number; name: string }>;
  published_at: string | null;
  is_draft: boolean;
  rating: number;
  color: string;
  cover: File | null;
  location: { lat: number; lng: number } | null;
  seo: { title: string; description: string; url: string };
  translations: Record<string, Partial<Article>>;
}

const model = ref<Article>({
  title: "",
  slug: "",
  body: "",
  excerpt: "",
  category: null,
  tags: [],
  published_at: null,
  is_draft: true,
  rating: 3,
  color: "#3b82f6",
  cover: null,
  location: null,
  seo: { title: "", description: "", url: "" },
  translations: {},
});

const errors = ref<Record<string, string[]>>({});
const languages = ["en", "it"];
const currentLang = ref("en");

// useCrud handles POST and PATCH automatically
const crud = useCrud<Article>("/api/articles/");

const fields: FieldDescriptor<Article>[] = [
  // ── Tab: Content ─────────────────────────────────────────────────────────
  {
    key: "title",
    type: "text",
    label: "Title",
    tab: "content",
    translatable: true,
    required: true,
    cols: 8,
  },
  {
    key: "slug",
    type: "text",
    label: "Slug",
    tab: "content",
    synci18n: true,
    cols: 4,
    validate: (v) => (/\s/.test(String(v)) ? "No spaces allowed" : null),
  },
  {
    key: "body",
    type: "editor",
    label: "Content",
    tab: "content",
    translatable: true,
  },
  {
    key: "excerpt",
    type: "textarea",
    label: "Excerpt",
    tab: "content",
    translatable: true,
    attrs: { maxLength: 300 },
  },

  // ── Tab: Meta ────────────────────────────────────────────────────────────
  {
    key: "category",
    type: "fks",
    label: "Category",
    tab: "meta",
    attrs: {
      endpoint: "/api/categories",
      itemText: "name",
      returnObject: true,
    },
  },
  {
    key: "tags",
    type: "m2m",
    label: "Tags",
    tab: "meta",
    attrs: {
      endpoint: "/api/tags",
      itemText: "name",
      returnObject: true,
      multiple: true,
    },
  },
  {
    key: "published_at",
    type: "datetime",
    label: "Publish date",
    tab: "meta",
    synci18n: true,
    cols: 6,
  },
  {
    key: "is_draft",
    type: "switch",
    label: "Draft",
    tab: "meta",
    synci18n: true,
    cols: 6,
  },
  {
    key: "rating",
    type: "slider",
    label: "Rating",
    tab: "meta",
    attrs: { min: 0, max: 5, step: 0.5 },
  },
  { key: "color", type: "color", label: "Theme color", tab: "meta", cols: 4 },
  { key: "cover", type: "file", label: "Cover image", tab: "meta", cols: 8 },
  { key: "location", type: "map", label: "Location", tab: "meta" },

  // ── Tab: SEO ─────────────────────────────────────────────────────────────
  { key: "seo", type: "seo", tab: "seo" },
];

const snack = useSnackStore();

async function save() {
  try {
    await crud.create(model.value);
    snack.show("Article created.", "success");
    navigateTo("/articles");
  } catch (e: any) {
    errors.value = e.data ?? {};
    snack.show("Please fix the errors below.", "error");
  }
}
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">New article</h1>

      <!-- Language switcher (only needed when fields are translatable) -->
      <div class="flex gap-1">
        <UButton
          v-for="lang in languages"
          :key="lang"
          size="sm"
          :variant="currentLang === lang ? 'solid' : 'outline'"
          @click="currentLang = lang"
        >
          {{ lang.toUpperCase() }}
        </UButton>
      </div>
    </div>

    <MapoForm
      v-model="model"
      :fields="fields"
      :errors="errors"
      :languages="languages"
      :current-lang="currentLang"
    >
      <!-- Field slot: add a "generate" button next to the slug input -->
      <template #field.slug.append>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          icon="i-lucide-wand"
          title="Generate from title"
          @click="
            model.slug = model.title
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '')
          "
        />
      </template>
    </MapoForm>

    <div class="flex justify-end gap-3 mt-6">
      <UButton variant="ghost" color="neutral" to="/articles">Cancel</UButton>
      <UButton icon="i-lucide-save" @click="save">Save</UButton>
    </div>
  </div>
</template>
```

## Tab layout

Fields are grouped into tabs when two or more unique `tab` values are present. Each tab shows a red badge if it contains errors.

```ts
const fields: FieldDescriptor[] = [
  { key: "title", type: "text", tab: "content" },
  { key: "body", type: "editor", tab: "content" },
  { key: "seo", type: "seo", tab: "seo" }, // second tab → tab nav appears
];
```

Tab names are displayed as-is. Use readable lowercase strings (`"content"`, `"seo"`, `"meta"`).

### Nested tabs (tab inside tab)

Use an array path (or a `/`-separated string) to place a field inside a sub-tab:

```ts
const fields: FieldDescriptor[] = [
  // Top-level "settings" tab
  { key: "slug", type: "text", tab: "settings" },
  { key: "status", type: "select", tab: "settings" },

  // "seo" sub-tab nested inside "settings"
  { key: "meta_title", type: "text", tab: ["settings", "seo"] },
  { key: "meta_description", type: "textarea", tab: ["settings", "seo"] },

  // Slash-separated form (equivalent)
  { key: "og_image", type: "file", tab: "settings/social" },
];
```

The parent tab ("settings") renders its own direct fields first, then a nested tab bar for its children ("seo", "social"). Error badges propagate up — if a child tab has an error, the parent tab badge lights up too.

### Tabs inside a group card (`subtab`)

Use `subtab` to render a tab bar _inside_ a collapsible group card. All fields sharing the same `group` with different `subtab` values are presented as tabs within that card:

```ts
const fields: FieldDescriptor[] = [
  // "SEO" group card — "Basic" and "Social" sub-tabs inside it
  { key: "meta_title", type: "text", group: "seo", subtab: "basic" },
  { key: "meta_description", type: "textarea", group: "seo", subtab: "basic" },
  { key: "og_title", type: "text", group: "seo", subtab: "social" },
  { key: "og_image", type: "file", group: "seo", subtab: "social" },

  // Fields without subtab render flat above the tab bar in the same group
  { key: "canonical_url", type: "text", group: "seo" },
];
```

`subtab` and `tab` are independent: `subtab` creates tabs inside a group; `tab` (including path arrays) creates top-level or nested tab panels.

## Responsive columns

Fields share a 12-column grid. Default is full width (`cols: 12`).

```ts
{ key: "title", type: "text", cols: 8 },  // 2/3 width
{ key: "slug",  type: "text", cols: 4 },  // 1/3 width — same row
```

Responsive breakpoints:

```ts
{ key: "title", type: "text", cols: { sm: 12, md: 8, lg: 6 } }
```

## Handling backend errors

When a `POST`/`PATCH` returns a 400 with field errors, bind them to `:errors`:

```ts
const errors = ref<Record<string, string[]>>({});

try {
  await crud.create(model.value);
} catch (e: any) {
  errors.value = e.data ?? {};
  // e.g. { title: ["This field is required."], "translations.it.title": ["Required."] }
}
```

```vue
<MapoForm v-model="model" :fields="fields" :errors="errors" />
```

Nested keys like `"translations.it.title"` or `"blocks.0.title"` are resolved automatically.

## MapoForm props

| Prop           | Type                       | Description                         |
| -------------- | -------------------------- | ----------------------------------- |
| `v-model`      | `T`                        | The data model (reactive ref)       |
| `fields`       | `FieldDescriptor<T>[]`     | Field definitions                   |
| `errors`       | `Record<string, string[]>` | Backend error map                   |
| `languages`    | `string[]`                 | Enables multilingual support        |
| `current-lang` | `string`                   | Active language                     |
| `registry`     | `MapoFormRegistry`         | Override global field registry      |
| `debounce`     | `number`                   | Debounce delay in ms (default: 300) |

## Field slots

Override or extend any field's rendering:

| Slot                   | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `#field.{key}`         | Replace the entire field cell                               |
| `#field.{key}.before`  | Content injected before the field widget, within its column |
| `#field.{key}.after`   | Content injected after the field widget, within its column  |
| `#field.{key}.label`   | Replace just the label                                      |
| `#field.{key}.append`  | Append content after the input                              |
| `#field.{key}.prepend` | Prepend content before the input                            |
| `#field.{key}.hint`    | Helper text below the input                                 |

## Group slots

Inject content around a named group card (fields with `group: 'name'`):

| Slot                   | Description                                |
| ---------------------- | ------------------------------------------ |
| `#group.{name}.before` | Rendered immediately before the group card |
| `#group.{name}.after`  | Rendered immediately after the group card  |

```vue
<MapoForm v-model="model" :fields="fields">
  <!-- Tip above the "seo" group card -->
  <template #group.seo.before>
    <UAlert color="info" title="These fields are auto-filled if left blank." />
  </template>

  <!-- Character count below the excerpt field -->
  <template #field.excerpt.after="{ model }">
    <p class="text-xs text-muted text-right">{{ model?.excerpt?.length ?? 0 }} / 160</p>
  </template>
</MapoForm>
```

→ See also: [CRUD detail / form](./crud-detail), [Advanced form patterns](./form-advanced), [All field types](/uikit/form/add-fields)
