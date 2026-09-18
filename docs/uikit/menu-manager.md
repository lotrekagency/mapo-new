# Menu Manager

A split-pane editor for hierarchical navigation menus: a drag & drop tree on the
left, a form for the selected node on the right. Use it to let editors build a
navbar, a footer or a sitemap without touching code.

```vue
<template>
  <MapoMenuManager
    endpoint="/api/menus"
    :identifier="$route.params.id"
    :languages="['it', 'en']"
    :max-depth="3"
  />
</template>
```

The component loads the menu on mount, keeps one node tree per language, and
saves the whole structure in a single request.

## The data shape

A menu is a keyed collection of recursively nested nodes:

```jsonc
{
  "id": 1,
  "key": "navbar",
  "translations": {
    "it": {
      "nodes": [
        {
          "id": "it-home",
          "title": "Home",
          "link": { "link_type": "ST", "static": "/" },
          "meta": {},
          "nodes": [],
        },
        {
          "id": "it-prodotti",
          "title": "Prodotti",
          "link": { "link_type": "RE", "content_type": 1, "url_node": 11 },
          "meta": { "target_bank": true },
          "nodes": [
            /* … recursive … */
          ],
        },
      ],
    },
    "en": { "nodes": [] },
  },
}
```

| Field                                 | Meaning                                                             |
| ------------------------------------- | ------------------------------------------------------------------- |
| `key`                                 | Menu identifier your frontend queries by (`navbar`, `footer`…).     |
| `translations.<lang>.nodes`           | Node tree for that language. Used when `translatable` is on.        |
| `nodes`                               | Node tree used when the menu is **not** translatable.               |
| `node.link.link_type`                 | `"ST"` = static URL, `"RE"` = relational (a CMS page).              |
| `node.link.static`                    | The URL, when `link_type` is `"ST"`.                                |
| `node.link.content_type` / `url_node` | Content type and routable page id, when `link_type` is `"RE"`.      |
| `node.meta`                           | Free-form per-node data (`style`, `target_bank`, anything you add). |
| `node.nodes`                          | Children.                                                           |

This matches the Camomilla `menus` payload, so with the Camomilla integration it
works out of the box. See [Backend contract](#backend-contract) to wire a
different backend.

## Props

| Prop               | Type                           | Default              | Description                                                                                          |
| ------------------ | ------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `endpoint`         | `string`                       | —                    | **Required.** Menu CRUD endpoint.                                                                    |
| `identifier`       | `string \| number`             | `'new'`              | Menu id to load; `'new'` starts from an empty menu.                                                  |
| `modelValue`       | `MapoMenu \| null`             | `null`               | Menu payload (`v-model`). Seeds the model when creating.                                             |
| `translatable`     | `boolean`                      | `true`               | Manage one tree per language under `translations`.                                                   |
| `lang`             | `string`                       | first of `languages` | Active editing language (`v-model:lang`). When derived, empty until `languages` resolves.            |
| `languages`        | `string[]`                     | `[]`                 | Language codes. Derived from the endpoint's `OPTIONS` when empty. With none, the switcher is hidden. |
| `usePatch`         | `boolean`                      | `false`              | Save with `PATCH` sending only the changed keys.                                                     |
| `maxDepth`         | `number`                       | `-1`                 | Max nesting depth; `-1` = unlimited.                                                                 |
| `permissionModel`  | `string`                       | —                    | Django model for permission gating (`add_*` / `change_*`).                                           |
| `readonly`         | `boolean`                      | `false`              | Force read-only mode.                                                                                |
| `coreFields`       | `AnyFieldDescriptor[] \| null` | `null`               | Replaces the node editor's default fields entirely.                                                  |
| `additionalFields` | `AnyFieldDescriptor[]`         | `[]`                 | Extra fields appended after the core ones.                                                           |
| `availableClasses` | `Record<string, string>`       | `{}`                 | Choices for the node `style` select, as `{ label: cssClass }`.                                       |

### Events

| Event               | Payload    | When                                           |
| ------------------- | ---------- | ---------------------------------------------- |
| `update:modelValue` | `MapoMenu` | The menu model changed.                        |
| `update:lang`       | `string`   | The editing language changed.                  |
| `saved`             | `MapoMenu` | A save succeeded; carries the server response. |

### Slots

| Slot                 | Bindings                              | Purpose                                                             |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `empty`              | —                                     | Replaces the right-pane placeholder shown when no node is selected. |
| `editor-form-top`    | `{ model, fields, errors, readonly }` | Content above the node form.                                        |
| `editor-form`        | `{ model, fields, errors, readonly }` | Replaces the node form entirely.                                    |
| `editor-form-bottom` | `{ model, fields, errors, readonly }` | Content below the node form.                                        |

## Drag & drop and nesting

Grab a node by its handle and drop it anywhere in the tree — including _onto_
another node, which re-parents it. Every list in the tree belongs to the same
drag group, which is what makes cross-level moves work.

`maxDepth` caps how deep the tree can go. Because nested sortable lists mutate
the arrays in place, the check happens after the drop: the tree is snapshotted
when the drag starts and restored if the result is too deep, with a toast
explaining why. Adding a child to a node already at the limit appends it to the
root instead.

## Editing nodes

Click a node to open it in the editor. Double-click the title to rename it
inline without leaving the tree.

The default form covers what v1 offered:

- **Title** (required)
- **Link type** — relational or static
- **Style** — only rendered when you pass `availableClasses`
- **Open in a new tab** — stored as `meta.target_bank`
- **Type of page** + **Page** — the relational picker (see below)
- **Static URL** — shown when the link type is static

### Adding your own fields

`additionalFields` appends to that set. The descriptors are plain
[form field descriptors](/uikit/form/), so the whole field system is available —
including custom types you registered yourself:

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
</script>

<template>
  <MapoMenuManager
    endpoint="/api/menus"
    :identifier="id"
    :additional-fields="additionalFields"
  />
</template>
```

Pass `coreFields` instead when you want full control and none of the defaults.

### Replacing the form

For a completely custom editor, take over the `editor-form` slot:

```vue
<MapoMenuManager endpoint="/api/menus" :identifier="id">
  <template #editor-form="{ model, errors, readonly }">
    <MyNodeEditor v-model="model" :errors="errors" :readonly="readonly" />
  </template>
</MapoMenuManager>
```

## Multilingual menus

With `languages` set and `translatable` on (the default), each language gets its
own tree under `translations.<code>.nodes` and a language switcher appears above
the tree. Switching language clears the selection, since a node only exists
inside one language's tree.

Left empty, `languages` is derived from an `OPTIONS` call on `endpoint`, reading
`lang_info.languages`: a menu model not registered for translation reports none,
so no switcher appears and the tree falls back to the flat `nodes` array —
edits land there, not under `translations`, even though `translatable` is still
on. The call resolves asynchronously — `lang` stays empty until it lands, then
takes the first derived code.

A language whose nodes failed validation is flagged in the switcher, so an error
in a collapsed language isn't silently lost.

Turn `translatable` off for a menu shared across languages: the tree then lives
in a flat `nodes` array.

## Validation errors

When the backend answers `400`, the errors are matched to the nodes that caused
them: DRF mirrors the payload, so an error for the second child of the first
node arrives at the same position in a nested `nodes` array. The manager walks
both trees together, attaches the messages to each node, marks them with a red
dot in the tree, and selects the first offending node in the current language.

The expected shape, for a translatable menu:

```jsonc
{
  "detail": "Some nodes are invalid.",
  "translations": {
    "it": {
      "nodes": [
        { "title": ["This field cannot be blank."] }, // first root node
        {}, // second one is fine
        { "nodes": [{ "link": { "static": ["Enter a valid URL."] } }] },
      ],
    },
  },
}
```

Without `translatable`, drop the `translations` wrapper and put `nodes` at the
top level.

## Permissions

Pass `permissionModel` to gate editing on Django permissions: the manager
renders read-only for users lacking `add_<model>` (when creating) or
`change_<model>` (when editing). Combine it with the route middleware so the
page itself is protected:

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
    :identifier="$route.params.id"
    permission-model="menu"
  />
</template>
```

## Backend contract

All relative to `endpoint`:

| Request                                             | Purpose                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET <endpoint>/<id>`                               | Load the menu.                                                                      |
| `POST <endpoint>` / `PUT` / `PATCH <endpoint>/<id>` | Save it. `PATCH` is used when `usePatch` is on.                                     |
| `OPTIONS <endpoint>`                                | Optional. `lang_info.languages` here feeds the `languages` prop when it is empty.   |
| `GET <endpoint>/page_types`                         | Content types for the relational picker. Items need `id` and `verbose_name_plural`. |
| `GET <endpoint>/page_types/<id>`                    | Routable pages of that type. Items need `name` and `url_node_id`.                   |

The relational fields are only useful if the last two exist. For a menu of plain
URLs you can hide them by passing your own `coreFields` without the
`link.content_type` / `link.url_node` entries.

### With Camomilla

The integration rewrites `/api/menus` (and everything below it) to
`/api/camomilla/menus`, so point the component at the Mapo-side path:

```vue
<MapoMenuManager endpoint="/api/menus" :identifier="id" />
```

## Building the pages

A list plus a detail route is all you need:

```vue
<!-- pages/menus/index.vue -->
<script setup lang="ts">
definePageMeta({
  label: "Menu",
  icon: "i-lucide-network",
  middleware: ["auth"],
});
</script>

<template>
  <MapoList
    endpoint="/api/menus"
    detail-base="/menus"
    :columns="[
      { key: 'key', label: 'Key' },
      { key: 'enabled', label: 'Enabled' },
    ]"
    searchable
  />
</template>
```

```vue
<!-- pages/menus/[id].vue -->
<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });
const route = useRoute();
</script>

<template>
  <div class="h-[calc(100vh-var(--mapo-topbar-height,56px))]">
    <MapoMenuManager
      endpoint="/api/menus"
      :identifier="route.params.id as string"
      :languages="['it', 'en']"
      :max-depth="3"
    />
  </div>
</template>
```

Give the wrapper a bounded height: the manager fills its container and scrolls
the two panes independently.

## Lower-level components

`MapoMenuManager` composes three components that are registered globally and can
be used on their own — for a tree in a sidebar, or an editor in a modal:

| Component              | Role                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MapoMenuTreeview`     | The tree. `v-model` = selected node, `nodes` = the tree, `top`/`bottom` slots. Exposes `newNode()` and `deleteSelectedNode()`. |
| `MapoMenuTreeviewNode` | One node, rendered recursively. Emits `select` and `delete`.                                                                   |
| `MapoMenuNodeEditor`   | The node form. `v-model` = the node, emits `delete`.                                                                           |

Helpers for the tree shape are exported from `@mapomodule/uikit/types`:
`createMenuNode()`, `menuTreeDepth()`, `findMenuNode()`, `removeMenuNode()`.
