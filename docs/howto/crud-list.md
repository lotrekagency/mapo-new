# CRUD list view

Build a full-featured resource list page using `<MapoList>`. The component handles server-side pagination, search, sorting, filters, tabs, bulk actions, and inline quick-edit — all from declarative props.

## Minimal example

```vue
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Articles",
  icon: "i-lucide-newspaper",
});
</script>

<template>
  <div class="p-6">
    <MapoList
      endpoint="/api/articles"
      detail-base="/articles"
      :columns="[
        { key: 'title', label: 'Title', sortable: true },
        { key: 'status', label: 'Status' },
      ]"
    />
  </div>
</template>
```

`endpoint` is the REST base URL — `MapoList` appends `?page=1&search=…&ordering=…` automatically.  
`detail-base` is the prefix for row clicks — clicking row with `id: 42` navigates to `/articles/42`.

## Full example

The example below covers everything: typed model, columns, filters, tabs, bulk actions, and quick-edit fields.

```vue
<script setup lang="ts">
import type {
  FieldDescriptor,
  FilterDescriptor,
  ActionDescriptor,
  ListColumn,
  ListTabItem,
} from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Articles",
  icon: "i-lucide-newspaper",
});

interface Article {
  id: number;
  title: string;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  published_at: string | null;
  priority: number;
}

// ── Columns ───────────────────────────────────────────────────────────────────
const columns: ListColumn<Article>[] = [
  {
    key: "id",
    label: "ID",
    sortable: false,
    class: "w-14 font-mono text-xs text-muted",
  },
  { key: "title", label: "Title", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "published_at", label: "Published", sortable: true },
  {
    key: "priority",
    label: "Priority",
    sortable: true,
    class: "w-20 text-center",
  },
];

// ── Filters ───────────────────────────────────────────────────────────────────
const filters: FilterDescriptor[] = [
  {
    value: "status",
    text: "Status",
    multiple: true,
    choices: [
      { text: "Published", value: "published", icon: "i-lucide-circle-check" },
      { text: "Draft", value: "draft", icon: "i-lucide-pencil" },
      { text: "Archived", value: "archived", icon: "i-lucide-archive" },
    ],
  },
];

// ── Tabs ─────────────────────────────────────────────────────────────────────
// Each tab appends ?status=<value> to the endpoint. Empty value = no filter.
const tabs: ListTabItem[] = [
  { text: "All", value: "" },
  { text: "Published", value: "published" },
  { text: "Drafts", value: "draft" },
  { text: "Archived", value: "archived" },
];

// ── Bulk actions ─────────────────────────────────────────────────────────────
const actions: ActionDescriptor<Article>[] = [
  {
    label: "Mark as published",
    permissions: "change_article", // only shown if user has this permission
    handleMultiple: true,
    handler: async ({ selection }) => {
      if (!selection) return;
      await Promise.all(
        selection.map((a) =>
          $fetch(`/api/articles/${a.id}`, {
            method: "PATCH",
            body: { status: "published" },
          }),
        ),
      );
    },
  },
  {
    label: "Delete selected",
    permissions: "delete_article",
    handleMultiple: true,
    dangerous: true, // confirm dialog with red button
    handler: async ({ selection }) => {
      if (!selection) return;
      await Promise.all(
        selection.map((a) =>
          $fetch(`/api/articles/${a.id}`, { method: "DELETE" }),
        ),
      );
    },
  },
];

// ── Quick-edit fields ─────────────────────────────────────────────────────────
// Same FieldDescriptor syntax as MapoDetail.
// Shown in a modal when the user clicks the pencil icon on a row.
const quickEditFields: FieldDescriptor<Article>[] = [
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Published", value: "published" },
        { label: "Draft", value: "draft" },
        { label: "Archived", value: "archived" },
      ],
    },
  },
  { key: "is_featured", type: "switch", label: "Featured" },
  {
    key: "priority",
    type: "number",
    label: "Priority",
    attrs: { min: 1, max: 100 },
  },
  { key: "published_at", type: "datetime", label: "Publication date" },
];
</script>

<template>
  <div class="p-6">
    <MapoList
      endpoint="/api/articles"
      detail-base="/articles"
      :columns="columns"
      :filters="filters"
      :tabs="tabs"
      tab-query-param="status"
      :actions="actions"
      :edit-fields="quickEditFields"
      lookup="id"
      :searchable="true"
    >
      <!-- Custom page header with "New" button -->
      <template #head>
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-semibold">Articles</h1>
          <UButton icon="i-lucide-plus" to="/articles/new" size="sm">
            New article
          </UButton>
        </div>
      </template>
    </MapoList>
  </div>
</template>
```

## Typed columns

Pass your model type to `ListColumn<T>` for key-safety — TypeScript will catch misspelled column keys at compile time:

```ts
import type { ListColumn } from "mapomodule/types";

interface Article {
  id: number;
  title: string;
  status: "draft" | "published" | "archived";
  published_at: string | null;
}

// ✅ Type-safe: 'title' is checked against Article
const columns: ListColumn<Article>[] = [
  { key: "id", label: "ID", sortable: false },
  { key: "title", label: "Title", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "published_at", label: "Published", sortable: true },
  // ❌ { key: 'tiitle', label: 'Title' }  ← TypeScript error: typo caught
];
```

---

## Custom cell rendering

Use ``#[`cell.{key}`]`` slots to override how any column renders. The slot receives `{ item, value }` where `item` is the full row object and `value` is the cell value:

```vue
<MapoList endpoint="/api/articles" :columns="columns">
  <template #[`cell.status`]="{ item }">
    <UBadge
      :color="item.status === 'published' ? 'success' : item.status === 'archived' ? 'neutral' : 'warning'"
      variant="subtle"
      size="xs"
    >
      {{ item.status }}
    </UBadge>
  </template>

  <template #[`cell.published_at`]="{ item }">
    <span class="text-sm text-muted">
      {{ item.published_at ? new Date(item.published_at).toLocaleDateString() : '—' }}
    </span>
  </template>
</MapoList>
```

> **Use the bracket form.** Cell slots are declared with a template-literal type ``[`cell.${string}`]`` in `defineSlots`. Write `#[\`cell.key\`]`(dynamic bracket syntax) rather than`#cell.key`(static shorthand) so that Volar can resolve the slot and infer the`item`/`value` types correctly.

### Row actions via a custom cell

`MapoList` has no dedicated row-action API — the idiomatic pattern is a custom cell at the end of the column list:

```ts
const columns: ListColumn<Article>[] = [
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "actions" as keyof Article, label: "" }, // sentinel column
];
```

```vue
<MapoList endpoint="/api/articles" :columns="columns">
  <template #[`cell.actions`]="{ item }">
    <div class="flex justify-end gap-1">
      <UButton
        size="xs"
        variant="ghost"
        icon="i-lucide-pencil"
        :to="`/articles/${item.id}`"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="error"
        icon="i-lucide-trash-2"
        @click="deleteRow(item)"
      />
    </div>
  </template>
</MapoList>
```

## Listening to list events

`MapoList` exposes `refresh()` via a template ref. Selection state is managed internally; to react to selection changes, use the `update:selection` event on the underlying `MapoListTable` if you need direct access. For most use cases, bulk `actions` are sufficient.

```vue
<script setup lang="ts">
const listRef = ref<{ refresh: () => void } | null>(null);
</script>
```

---

## Programmatic refresh

Expose a ref and call `refresh()` from outside the component:

```vue
<script setup lang="ts">
const listRef = ref<{ refresh: () => void } | null>(null);

async function afterBulkOperation() {
  await doSomething();
  listRef.value?.refresh();
}
</script>

<template>
  <MapoList ref="listRef" endpoint="/api/articles" :columns="columns" />
</template>
```

## Props reference

| Prop              | Type                 | Description                         |
| ----------------- | -------------------- | ----------------------------------- |
| `endpoint`        | `string`             | REST base URL                       |
| `detail-base`     | `string`             | Prefix for row-click navigation     |
| `columns`         | `ListColumn[]`       | Column definitions                  |
| `filters`         | `FilterDescriptor[]` | Filter chips                        |
| `tabs`            | `ListTabItem[]`      | Tab navigation                      |
| `tab-query-param` | `string`             | Query param name for active tab     |
| `actions`         | `ActionDescriptor[]` | Bulk actions                        |
| `edit-fields`     | `FieldDescriptor[]`  | Quick-edit modal fields             |
| `lookup`          | `string`             | Primary key field (default: `"id"`) |
| `searchable`      | `boolean`            | Show search input                   |

## Slots reference

| Slot                | Description                                 |
| ------------------- | ------------------------------------------- |
| `#head`             | Above the table — page title, toolbar       |
| `#dtable.toolbar`   | Extra controls next to the search input     |
| `#dtable.empty`     | Custom empty state                          |
| ``#[`cell.{key}`]`` | Override a specific column's cell rendering |
| `#filter.{value}`   | Custom filter UI for a specific filter key  |

## Import reference

```ts
// Types
import type {
  ListColumn,
  FilterDescriptor,
  FilterChoice,
  ActiveFilter,
  ActionDescriptor,
  ActionContext,
  ListTabItem,
} from "mapomodule/types";

// Or from the specific package
import type { ListColumn } from "@mapomodule/uikit/types";
```

→ See also: [CRUD detail / form](./crud-detail), [Import Guide](/guide/imports)
