# MapoList

`<MapoList>` is the admin data-table shell. It wires together pagination, search, filters, tabs, bulk actions, drag reorder, and an inline quick-edit modal — all driven by the same descriptors you use elsewhere (CRUD endpoint, column definitions, `FieldDescriptor[]`).

It runs in three modes — pick one with the `endpoint`, `items` and `client-side` props (see [Operating modes](#operating-modes)).

## TL;DR

```vue
<script setup lang="ts">
import type {
  ListColumn,
  FilterDescriptor,
  ActionDescriptor,
  ListTabItem,
  FieldDescriptor,
} from "mapomodule/types";

interface News {
  id: number;
  title: string;
  status: string;
  published_at: string;
}

// Untyped generics (T defaults to Record<string,unknown>) work fine with the component.
// Use typed generics only when you need compile-time key validation on columns/editFields.
const columns: ListColumn[] = [
  { key: "title", label: "Title", sortable: true },
  { key: "status", label: "Status" },
  { key: "published_at", label: "Published", sortable: true },
];

const filters: FilterDescriptor[] = [
  {
    value: "status",
    text: "Status",
    choices: [
      { text: "Draft", value: "draft" },
      { text: "Published", value: "published" },
    ],
  },
];

const quickEdit: FieldDescriptor[] = [
  { key: "status", type: "select", attrs: { options: filters[0].choices } },
];

// Typed cast helper — needed because Volar resolves `item` in #cell slots as Record<string,unknown>
function asNews(row: Record<string, unknown>): News {
  return row as unknown as News;
}
</script>

<template>
  <MapoList
    endpoint="/api/models/news/"
    :columns="columns"
    :filters="filters"
    :edit-fields="quickEdit"
    detail-base="/news"
    lookup="id"
  />
</template>
```

That single component renders a paginated table, a search input, a filter dropdown, a quick-edit pencil button per row, and a "view detail" link per row — without writing any sub-component.

---

## Props

| Prop               | Type                                                     | Default          | Description                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`         | `string`                                                 | —                | REST collection endpoint. Required in **server** and **hybrid** modes; ignored when `items` is set. May include static query params (e.g. `?ordering=-date`) — they are merged into every `list()` call. CRUD operations use the clean path. |
| `items`            | `T[]`                                                    | —                | Drives **offline** mode. Pass via `v-model:items` if you want mutations (drag, delete, quick-edit) reflected back into your local array.                                                                                                     |
| `clientSide`       | `boolean`                                                | `false`          | Enables **hybrid** mode (only when `endpoint` is set and `items` is not). Fetches the full dataset once, runs filter/sort/page client-side. Mutations still hit the backend, then refetch.                                                   |
| `columns`          | `ListColumn<T>[]`                                        | —                | Column definitions. Pass the model type as generic (`ListColumn<News>[]`) to enforce that `key` is a real property of `T`.                                                                                                                   |
| `lookup`           | `string`                                                 | `'id'`           | Key used as primary key (selection, links, drag)                                                                                                                                                                                             |
| `filters`          | `FilterDescriptor[]`                                     | `[]`             | Filter dropdown items                                                                                                                                                                                                                        |
| `actions`          | `ActionDescriptor<T>[]`                                  | `[]`             | Bulk actions shown when rows are selected                                                                                                                                                                                                    |
| `tabs`             | `ListTabItem[]`                                          | `[]`             | Status / segment tab bar                                                                                                                                                                                                                     |
| `defaultTab`       | `string`                                                 | first tab        | Active tab on mount                                                                                                                                                                                                                          |
| `tabQueryParam`    | `string`                                                 | `'tab'`          | Query param used when fetching with a tab                                                                                                                                                                                                    |
| `searchable`       | `boolean`                                                | `true`           | Show the search input                                                                                                                                                                                                                        |
| `draggable`        | `boolean`                                                | `false`          | Enable drag-reorder rows                                                                                                                                                                                                                     |
| `positionField`    | `string`                                                 | `'position'`     | Field used for ordering                                                                                                                                                                                                                      |
| `editFields`       | `FieldDescriptor<T>[]`                                   | `[]`             | Inline quick-edit modal field list                                                                                                                                                                                                           |
| `languages`        | `string[]`                                               | —                | Languages for translatable quick-edit fields                                                                                                                                                                                                 |
| `registry`         | `FieldRegistry`                                          | —                | Optional registry override (auto-injected otherwise)                                                                                                                                                                                         |
| `detailBase`       | `string`                                                 | —                | If set, each row shows a link button → `${detailBase}/${row[lookup]}`                                                                                                                                                                        |
| `defaultPageSize`  | `number`                                                 | `20`             | Initial page size on mount                                                                                                                                                                                                                   |
| `pageSizeOptions`  | `number[]`                                               | `[10,20,50,100]` | Options in the per-page selector                                                                                                                                                                                                             |
| `responseAdapter`  | `(raw: unknown) => { items: T[]; total: number }`        | —                | Custom response parser — replaces built-in DRF / flat-array detection                                                                                                                                                                        |
| `paginationParams` | `(state: { page, pageSize }) => Record<string, unknown>` | —                | Custom pagination params factory — replaces default `{ page, page_size }`                                                                                                                                                                    |
| `permissionModel`  | `string`                                                 | —                | Django model label (e.g. `"news.article"`) used to gate edit and delete row actions. When set, the pencil/trash icons are hidden if the current user lacks `change_*` / `delete_*` permissions. Omit to keep actions always visible.         |

The `registry` prop is **optional** — `<MapoList>` falls back to the global `$mapoFormRegistry` automatically.

## Sub-components

`<MapoList>` is a thin orchestrator. The real work is split across:

- `<MapoListHead>` — page-level header slot
- `<MapoListTabs>` — tab bar
- `<MapoListFilters>` — filter dropdown + active chips
- `<MapoListActions>` — bulk action menu
- `<MapoListTable>` — the actual `UTable` (selection, sorting, pagination, drag, quick-edit trigger)
- `<MapoListQuickEdit>` — modal driven by `editFields`

You can compose them directly when you need a custom layout — the props mirror `<MapoList>`'s.

---

## How to: define columns

Pass the model type as the `ListColumn` generic so TypeScript enforces that `key` is an actual property of your model — typos become compile-time errors:

```ts
interface News {
  id: number;
  title: string;
  status: string;
  published_at: string;
}

const columns: ListColumn<News>[] = [
  { key: "title", label: "Title", sortable: true },
  { key: "status", label: "Status" },
  {
    key: "published_at",
    label: "Published",
    sortable: true,
    class: "text-right",
  },
  // { key: "typo" }  ← compile error: not a key of News
];
```

Without the generic (`ListColumn[]`) the key is typed as `string` and any value is accepted — still works at runtime but you lose autocomplete and typo protection.

| Field      | Description                                                               |
| ---------- | ------------------------------------------------------------------------- |
| `key`      | Property name on the row object (`keyof T & string` when `T` is provided) |
| `label`    | Header text                                                               |
| `sortable` | Adds a sort handle (server-side ordering via `?ordering=`)                |
| `class`    | CSS class applied to the `<td>`                                           |

## How to: customize a cell

Use the per-cell slot ``#[`cell.<key>`]`` — it receives `{ item, value }`:

```vue
<MapoList :columns="columns" :endpoint="…">
  <template #[`cell.status`]="{ item, value }">
    <UBadge :color="value === 'published' ? 'success' : 'neutral'">
      {{ value }}
    </UBadge>
  </template>

  <template #[`cell.published_at`]="{ value }">
    {{ formatDate(value as string) }}
  </template>

  <template #[`cell.is_featured`]="{ value }">
    <UIcon v-if="value" name="i-lucide-star" class="text-yellow-500" />
    <UIcon v-else name="i-lucide-star-off" class="text-muted" />
  </template>
</MapoList>
```

> **Dynamic slot syntax required.** `MapoList` and `MapoListTable` declare their cell slots with a template-literal type ``[`cell.${string}`]``. Volar resolves and type-checks these slots only when you use the bracket form `#[\`cell.key\`]`. The static shorthand `#cell.key`compiles fine but bypasses slot-prop type inference, so`item`and`value` will be untyped.

| Binding | Type         | Description                                                                               |
| ------- | ------------ | ----------------------------------------------------------------------------------------- |
| `item`  | `T`          | The full row object                                                                       |
| `value` | `T[keyof T]` | The value of `item[column.key]` — a union of all possible value types of `T` for that key |

> **Type note.** Due to a current Volar limitation with generic SFC inference, `item` and `value` may resolve to `Record<string, unknown>` instead of your model type. The recommended workaround is a typed cast helper in the `<script setup>`:
>
> ```ts
> function asNews(row: Record<string, unknown>): News {
>   return row as unknown as News;
> }
> ```
>
> Then in slots: `asNews(item).status`. This is explicit, reusable, and avoids repeated inline casts.

The slot system propagates from `<MapoList>` down to `<MapoListTable>` automatically.

## How to: gate row actions with permissions

Pass the Django app-model label to hide edit/delete buttons for users who lack the corresponding permissions:

```vue
<MapoList endpoint="/api/news/" :columns="columns" permission-model="article" />
```

The table reads permissions from `usePermissions()` (which proxies `useAuthStore`). For each row:

- The **pencil** (quick-edit) button is shown only when the user has `change_article`.
- The **trash** (delete) button is shown only when the user has `delete_article`.
- Superusers always see both buttons regardless of the model label.

Omit `permissionModel` to preserve the previous behavior (buttons always visible).

> **Note.** Pass the bare Django model name (e.g. `"article"`), not the app-label–prefixed form (`"news.article"`). The permission check uses `change_<model>` and `delete_<model>` directly.

---

## How to: URL state sync (pagination, sort, search, filters, tabs)

Pagination, sort order, search query, active filters, and the active tab are all stored in the URL automatically. The user can bookmark or share a filtered/paginated view and it will restore exactly.

```
/news?page=3&page_size=50&search=vue&ordering=-published_at&f_status=published&tab=active
```

URL params written by `<MapoList>` and `<MapoListTable>`:

| Param             | Written by      | Description                                     |
| ----------------- | --------------- | ----------------------------------------------- |
| `page`            | `MapoListTable` | Current page number (1-based)                   |
| `page_size`       | `MapoListTable` | Active page size                                |
| `search`          | `MapoListTable` | Current search query                            |
| `ordering`        | `MapoListTable` | Active sort; comma-separated, `-` prefix = desc |
| `f_<filterKey>`   | `MapoList`      | Active filter value(s); see encoding below      |
| `<tabQueryParam>` | `MapoList`      | Active tab value (default param name: `tab`)    |

State is read from the URL once on mount and written back via `router.replace` (no extra history entries).

### Filter URL encoding

The `f_` prefix is used **only** for URL persistence, to avoid collisions with the table's
own params (`page` / `search` / `ordering` / `tab`). Towards the backend, filters use the
bare `filter.value` key with comma-joined values — identical to the Mapo v1 contract.

- **Choice filter** — URL `?f_status=published` (single) or `?f_status=draft,published` (multi); sent to the backend as `status=draft,published`.
- **Datepicker range** — URL `?f_published_at=2024-01-01,2024-12-31`; sent to the backend as `published_at=2024-01-01,2024-12-31` (one comma-joined value, **not** split into `__gte`/`__lte`).

In **offline / hybrid** mode the same comma-joined values are matched in memory: multiple
values become an inclusion check, and two ISO dates become an inclusive `[start, end]` range.

---

## How to: add filters

```ts
const filters: FilterDescriptor[] = [
  {
    value: "status", // query param sent to backend
    text: "Status",
    multiple: true, // multi-select (default: single)
    choices: [
      { text: "Draft", value: "draft", icon: "i-lucide-edit" },
      { text: "Published", value: "published", icon: "i-lucide-globe" },
    ],
    defaultChoice: "draft", // pre-selected on mount
  },
  {
    value: "date_range",
    text: "Date",
    datepicker: true, // renders a date range picker
  },
];
```

Filters are sent as request parameters — never concatenated into the endpoint string. Selecting a filter triggers a refetch via `crud.list(params)`.

### Customize a filter panel (slots)

Each filter exposes nested override slots (named by `filter.value`). They mirror Mapo v1:

| Slot                      | Overrides                                          | Bindings                                                   |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `#filter.{value}`         | the whole filter panel (default = title + content) | `filter`, `toggleChoice`, `removeFilter`, `isChoiceActive` |
| `#filter.{value}.title`   | just the panel title                               | `filter`                                                   |
| `#filter.{value}.content` | the choices / datepicker body                      | `filter`, `toggleChoice`, `removeFilter`, `isChoiceActive` |
| `#filter.{value}.icon`    | the icon next to each choice                       | `filter`, `choice`                                         |

```vue
<MapoList :filters="filters" …>
  <template #filter.status.icon="{ choice }">
    <UIcon :name="choice.value === 'published' ? 'i-lucide-globe' : 'i-lucide-edit'" />
  </template>
</MapoList>
```

## How to: add bulk actions

```ts
const actions: ActionDescriptor<News>[] = [
  {
    label: "Publish",
    handleMultiple: true, // available with row-level selection
    handleAll: false, // not available for select-all
    permissions: "publish_news", // optional permission gate
    async handler({ selection }) {
      if (!selection) return;
      await Promise.all(
        selection.map((row) =>
          $fetch(`/api/news/${row.id}/publish/`, { method: "POST" }),
        ),
      );
    },
  },
  {
    label: "Delete permanently",
    handleMultiple: true,
    dangerous: true, // renders Apply + confirm button in error/red color
    async handler({ selection }) {
      /* … */
    },
  },
];
```

After the handler resolves, `<MapoList>` refreshes the table automatically.

`ActionContext` shape:

```ts
interface ActionContext<T> {
  selection: T[] | null; // null when "all" is selected
  selectionQuery: URLSearchParams; // current query (page_size, search, ordering) — useful for "all"
  lookup: string;
}
```

## How to: tab between segments

```ts
const tabs: ListTabItem[] = [
  { text: "All", value: "all" },
  { text: "Draft", value: "draft", count: 12 },
  { text: "Published", value: "published", count: 145 },
];
```

```vue
<MapoList
  endpoint="/api/news/"
  :columns="columns"
  :tabs="tabs"
  default-tab="all"
  tab-query-param="status"   <!-- ?status=draft -->
/>
```

The active tab value is passed as a query param in each `list()` call — it is never baked into the `endpoint` string. Switching tabs resets to page 1, clears the selection, and refetches.

## How to: enable inline quick-edit

```ts
const quickEdit: FieldDescriptor<News>[] = [
  { key: "status", type: "select", attrs: { options: statuses } },
  { key: "published_at", type: "datetime" },
];
```

```vue
<MapoList :edit-fields="quickEdit" :endpoint="…" :columns="…" />
```

A pencil icon now appears on every row. Click it → the modal renders a `<MapoForm>` populated with the row data. Save sends a PATCH for the listed fields only and refreshes the row.

## How to: enable drag reorder

```vue
<MapoList draggable position-field="position" :endpoint="…" :columns="…" />
```

The drag uses `crud.updateOrder(movedId, targetId)` — a single request. The backend (e.g. Camomilla) recomputes positions; the client does not fire one PATCH per moved item, avoiding race conditions and order inversions.

**Drop area & feedback.** The drop target is the **whole row**, not just the grip handle: drag events are delegated on the table wrapper (UTable owns the `<tr>`). While dragging, the source row dims and the row under the cursor shows a top/bottom drop line.

**When it's disabled.** Reorder only makes sense in the natural order, so it is automatically disabled while a **search or column sort** is active (the grip turns non-draggable with an explanatory tooltip). Clear the search/sort to reorder again.

## How to: configure pagination

```vue
<!-- Custom initial page size and selector options -->
<MapoList
  endpoint="/api/news/"
  :columns="columns"
  :default-page-size="10"
  :page-size-options="[10, 25, 50]"
/>
```

### Offset / limit backend

```vue
<MapoList
  endpoint="/api/news/"
  :columns="columns"
  :pagination-params="
    ({ page, pageSize }) => ({ offset: (page - 1) * pageSize, limit: pageSize })
  "
  :response-adapter="(raw) => ({ items: raw.results, total: raw.count })"
/>
```

### Custom response shape

```vue
<!-- Backend returns { data: [...], meta: { total: 120 } } -->
<MapoList
  endpoint="/api/news/"
  :columns="columns"
  :response-adapter="(raw) => ({ items: raw.data, total: raw.meta.total })"
/>
```

The default adapter handles two shapes out of the box:

- DRF: `{ results: T[]; count: number }`
- Flat array: `T[]` (total = array length)

Pass `responseAdapter` for anything else.

---

## How to: use a static default sort or filter in the endpoint

Pass query params directly in `endpoint` — they are sent on every `list()` call as base params:

```vue
<!-- Default ordering baked into the endpoint — no extra prop needed -->
<MapoList endpoint="/api/news/?ordering=-published_at" :columns="columns" />
```

Active filters, tabs, pagination, and column sorting are merged **on top** of these base params. CRUD operations (quick-edit detail load, row delete, drag reorder) automatically strip the query string and always call the clean path `/api/news/<id>/`.

> **Before this fix** (pre B2), an endpoint with query params would produce broken mutation URLs like `/api/news/?ordering=-published_at/42/` and quick-edit would open with all fields empty.

## How to: link rows to a detail page

```vue
<MapoList detail-base="/news" :endpoint="…" :columns="…" />
```

A link icon appears on each row pointing at `/news/${row[lookup]}`. Combine with `<MapoDetail>` for the matching edit page.

---

## Slots

| Slot                | Source                | Receives                                 |
| ------------------- | --------------------- | ---------------------------------------- |
| `#head`             | `<MapoListHead>`      | —                                        |
| `#dtable.toolbar`   | `<MapoListTable>`     | —                                        |
| `#dtable.empty`     | `<MapoListTable>`     | —                                        |
| `#dtable.loading`   | `<MapoListTable>`     | —                                        |
| ``#[`cell.<key>`]`` | `<MapoListTable>`     | `{ item: T, value: T[keyof T] }`         |
| `#filter.<value>`   | `<MapoListFilters>`   | `{ filter, toggleChoice, removeFilter }` |
| `#qedit.extra`      | `<MapoListQuickEdit>` | `{ model: T }`                           |

All slots are forwarded transparently from `<MapoList>` to its sub-components.

## How to: add a per-row action

`<MapoList>` does not have a dedicated `rowActions` prop. Single-row actions are modelled as regular `actions` with `handleMultiple: false` — the action appears in the bulk toolbar whenever exactly one row is selected, which keeps the surface API minimal.

```ts
const actions: ActionDescriptor<News>[] = [
  {
    label: "Duplicate",
    handleMultiple: false, // only enabled when a single row is selected
    handler: async ({ selection }) => {
      if (!selection?.length) return;
      await $fetch(`/api/news/${selection[0]!.id}/duplicate/`, {
        method: "POST",
      });
    },
  },
];
```

If you need an always-visible inline button on every row regardless of selection, use the `#dtable.toolbar` slot or a custom ``#[`cell.{key}`]`` cell with a `UButton` that reads the `item` binding directly.

---

## Operating modes

`<MapoList>` supports three operating modes — the active one is decided by which props you pass:

| Mode        | Trigger                                  | Network behavior                                            | Mutations (delete, drag, quick-edit)                       |
| ----------- | ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| **Server**  | `endpoint` set, no `items`               | One `list()` per change to filter/sort/page/search          | Hit the backend, then refetch the current page             |
| **Hybrid**  | `endpoint` set, `client-side` true       | One `list()` on mount; filter/sort/page run in memory       | Hit the backend, then refetch the full dataset             |
| **Offline** | `items` set (with or without `endpoint`) | Zero requests; everything runs in memory on the local array | Emit `update:items` so the parent owns the source of truth |

When more than one is set, **`items` wins** over `clientSide`.

### Server mode (default)

The shape you've already been using — every interaction (page, sort, filter, search, tab) translates into request params on `crud.list()`:

```vue
<MapoList endpoint="/api/news/" :columns="columns" :filters="filters" />
```

Use this whenever the dataset is too large to load at once, or the backend already supports DRF-style filtering / ordering / pagination.

### Hybrid mode (`client-side`)

The backend returns the **whole** list once on mount; from then on, all filter / sort / page / search interactions run client-side without any extra requests. Mutations still call the backend (`delete`, `updateOrder`, quick-edit `partialUpdate`) and trigger a refetch so the cache stays in sync.

```vue
<MapoList
  endpoint="/api/news/"
  client-side
  :columns="columns"
  :filters="filters"
/>
```

Use this when:

- The dataset fits comfortably in memory (a few thousand rows at most).
- You want instant UI for filter / sort / page without making the backend implement them.
- You still want create / update / delete to be real BE operations.

> **Sizing tip:** if the backend paginates by default, ask for a large page in the endpoint URL — e.g. `endpoint="/api/news/?page_size=1000"` — so the initial fetch returns everything.

### Offline mode (`v-model:items`)

There is no backend involvement at all. The component reads and writes a local array passed by the parent:

```vue
<script setup lang="ts">
const tasks = ref<Task[]>([...]);
</script>

<template>
  <MapoList
    v-model:items="tasks"
    :columns="columns"
    :filters="filters"
    :tabs="tabs"
    :edit-fields="quickEdit"
    searchable
    draggable
  />
</template>
```

What runs in memory: **everything** — search, filters, tabs, sort, pagination, drag-reorder, row delete, and quick-edit save. Each mutation emits `update:items` with the new array; the parent is the source of truth.

Use this for:

- Demo / playground pages
- Lookup tables loaded as static JSON
- Forms with a nested list (the array is just a piece of the parent form)
- Frontend-only prototypes before the BE exists

### Multi-column sort (offline / hybrid)

In server mode the sort is sent to the BE as `?ordering=`. In offline and hybrid modes, sorting is performed in JS — multi-column sort is supported, each column acting as a tiebreaker for the previous one (matches TanStack's default behavior).

---

## Pitfalls

- **Selection survives reload only with `lookup`** — the table keys selection by `row[lookup]`. If your model uses `slug` or a UUID instead of `id`, set `lookup` accordingly.
- **`tabQueryParam` collides with filters** — if your backend uses the same key both as a tab segment and a filter, the tab wins. Pick a different filter `value`.
- **Bulk actions on `selection: 'all'`** — when the user selects "all rows across pages", `selection` is `null`. Use `selectionQuery` to stream a server-side bulk endpoint, do not fetch every row client-side.
- **`columns[].class` must be static** — Tailwind v4 requires literal class names; `:class="dynamic"` does not work in column defs.
- **Hybrid mode + paginated BE** — `client-side` issues a single `list()` with no pagination params; if the backend paginates by default, you'll only get the first page. Bake a large page size into the endpoint URL (e.g. `?page_size=1000`) to receive the full set.
- **Offline mode ignores `permissionModel`** — without a Django backend there are no permissions to gate against. Hide actions yourself via column slots if needed.
