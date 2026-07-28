# How-to: build a navigation menu editor

Goal: give editors a page where they can build the site navbar — add entries,
drag them into a hierarchy, point them at pages or external URLs, in two
languages.

We'll do it in four steps: the list page, the editor page, custom node fields,
and the backend contract. The full working example lives in
`apps/example/app/pages/menus/`.

## 1. List the menus

A menu is a normal CRUD resource, so `MapoList` handles this page:

```vue
<!-- app/pages/menus/index.vue -->
<script setup lang="ts">
import type { ListColumn } from "@mapomodule/uikit/types";

definePageMeta({
  layout: "mapo-default",
  label: "Menu", // shows up in the sidebar
  icon: "i-lucide-network",
  middleware: ["auth"],
});

interface MenuRow {
  id: number;
  key: string;
  enabled: boolean;
}

const columns: ListColumn<MenuRow>[] = [
  { key: "key", label: "Key" },
  { key: "enabled", label: "Enabled" },
];
</script>

<template>
  <div class="p-6">
    <MapoList
      endpoint="/api/menus"
      detail-base="/menus"
      :columns="columns"
      searchable
    />
  </div>
</template>
```

`detail-base` makes the first column link to `/menus/<id>` — the page we build
next.

## 2. The editor page

```vue
<!-- app/pages/menus/[id].vue -->
<script setup lang="ts">
definePageMeta({ layout: "mapo-default", middleware: ["auth"] });

const route = useRoute();
const id = computed(() => route.params.id as string);
</script>

<template>
  <div class="flex h-[calc(100vh-var(--mapo-topbar-height,56px))] flex-col">
    <div class="border-b border-default bg-default px-6 py-4">
      <h1 class="text-xl font-semibold">Menu Manager</h1>
    </div>

    <div class="min-h-0 flex-1">
      <MapoMenuManager
        endpoint="/api/menus"
        :identifier="id"
        :languages="['it', 'en']"
        :max-depth="3"
      />
    </div>
  </div>
</template>
```

That's the whole editor. What you get:

- a drag & drop tree — drop a node **onto** another one to nest it
- nesting capped at 3 levels: a deeper drop is reverted with an explanatory toast
- a language switcher, with an independent tree per language
- double-click a node title to rename it inline
- a Save button that persists the whole structure

::: tip Give the wrapper a height
The manager fills its container and scrolls each pane on its own. Without a
bounded height (`h-[calc(...)]` above, or any `h-*` on the parent) the panes
have nothing to scroll inside.
:::

## 3. Add your own fields to a node

Each node already has a title, a link (page or URL) and a new-tab toggle. To
attach anything else — an icon, a badge, a cover image — pass
`additionalFields`. They're regular [form descriptors](/uikit/form/), so any
registered field type works:

```vue
<script setup lang="ts">
import type { AnyFieldDescriptor } from "@mapomodule/form/types";

const additionalFields: AnyFieldDescriptor[] = [
  { key: "meta.icon", label: "Icon", type: "text", cols: { md: 6 } },
  {
    key: "meta.highlight",
    label: "Highlight",
    type: "switch",
    cols: { md: 6 },
  },
  { key: "meta.cover", label: "Cover", type: "media" },
];

// Offered by the node "Style" select as { label: cssClass }
const availableClasses = {
  Default: "",
  "Call to action": "menu-cta",
  Muted: "menu-muted",
};
</script>

<template>
  <MapoMenuManager
    endpoint="/api/menus"
    :identifier="id"
    :languages="['it', 'en']"
    :max-depth="3"
    :additional-fields="additionalFields"
    :available-classes="availableClasses"
  />
</template>
```

Keep custom keys under `meta.*` — that object is the free-form bag the backend
round-trips untouched.

Need to drop the defaults entirely? Pass `coreFields` with your own list. That
also hides the relational page picker, which is handy when your menu only ever
points at external URLs.

## 4. What the backend must expose

```
GET   /api/menus/<id>              → the menu
PUT   /api/menus/<id>              → save it (PATCH if you set `use-patch`)
POST  /api/menus                   → create (when identifier is "new")
GET   /api/menus/page_types        → linkable content types
GET   /api/menus/page_types/<id>   → routable pages of that type
```

The menu payload nests per-language trees:

```jsonc
{
  "id": 1,
  "key": "navbar",
  "translations": {
    "it": {
      "nodes": [
        {
          "id": "n1",
          "title": "Home",
          "link": { "link_type": "ST", "static": "/" },
          "meta": {},
          "nodes": [],
        },
      ],
    },
    "en": { "nodes": [] },
  },
}
```

The last two endpoints only feed the relational picker: `page_types` returns
items with `id` + `verbose_name_plural`, its detail returns items with `name` +
`url_node_id`.

**With Camomilla** you get all of this for free — the integration rewrites
`/api/menus/*` to `/api/camomilla/menus/*`. Just use `/api/menus` as endpoint.

**Without a backend yet**, mock it: `apps/example/server/api/mock/menus/` in the
repo is a complete in-memory implementation, validation errors included.

## Surfacing validation errors

Return `400` with the errors positioned like the payload, and the manager places
each message on the node that caused it — red dot in the tree, the first
offending node auto-selected, the language flagged in the switcher:

```jsonc
{
  "detail": "Some nodes are invalid.",
  "translations": {
    "it": {
      "nodes": [
        { "title": ["This field cannot be blank."] }, // 1st root node
        {}, // 2nd is fine
        { "nodes": [{ "link": { "static": ["Enter a valid URL."] } }] },
      ],
    },
  },
}
```

The array positions do the matching, so send an empty object for the nodes that
validated.

## Restricting who can edit

Gate the page with the permission middleware and tell the manager which model to
check — it renders read-only for users without `change_menu`:

```vue
<script setup>
definePageMeta({
  middleware: ["auth", "permissions"],
  permissions: { model: "menu" },
});
</script>

<template>
  <MapoMenuManager
    endpoint="/api/menus"
    :identifier="id"
    permission-model="menu"
  />
</template>
```

## See also

- [Menu Manager reference](/uikit/menu-manager) — every prop, event and slot
- [Form fields](/uikit/form/add-fields) — the descriptor types you can add to a node
- [Camomilla integration](/modules/camomilla) — path rewrites and proxy behaviour
