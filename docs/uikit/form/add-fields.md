# All field types

Every field has a `type` that decides which component is rendered. Simple types use Nuxt UI components directly (zero wrapper); complex types use dedicated Mapo components.

## Simple types (Nuxt UI direct mapping)

| `type`     | NUI component          | Notes                                          |
| ---------- | ---------------------- | ---------------------------------------------- |
| `text`     | `UInput`               | attrs: `placeholder`, `maxLength`, `minLength` |
| `textarea` | `UTextarea`            | attrs: same as `text`, plus `rows`             |
| `email`    | `UInput type="email"`  | attrs: same as `text`                          |
| `url`      | `UInput type="url"`    | attrs: same as `text`                          |
| `number`   | `UInput type="number"` | attrs: `min`, `max`, `step`, `placeholder`     |
| `boolean`  | `UCheckbox`            |                                                |
| `switch`   | `USwitch`              |                                                |
| `slider`   | `USlider`              | attrs: `min`, `max`, `step`                    |
| `color`    | `UInput type="color"`  |                                                |
| `file`     | `UInput type="file"`   | attrs: `accept`, `maxSize`                     |
| `select`   | `USelectMenu`          | requires `attrs` with `items` or `options`     |

```ts
// select: provide the choices via `items` (Nuxt UI shape)…
{ key: 'status', type: 'select', attrs: {
  items: [
    { label: 'Draft',     value: 'draft' },
    { label: 'Published', value: 'published' },
  ],
}}

// …or the legacy v1 `options` shape ({ text, value }); plain string arrays work too.
```

::: tip attrs vs passthrough
`attrs` is the field's **typed configuration** — unknown keys are compile errors (typos included). Anything else the underlying Nuxt UI component accepts (`icon`, `variant`, `color`, `size`…) goes through the open `passthrough` map:

```ts
{ key: 'title', type: 'text',
  attrs: { maxLength: 80 },
  passthrough: { icon: 'i-lucide-type', size: 'lg' } }
```

Both are merged into the component `v-bind` (after registry defaults; `passthrough` wins on conflicts).
:::

## Date and time

```ts
{ key: 'published_at', type: 'datetime' }  // ISO 8601, configurable timezone
{ key: 'date_only',    type: 'date' }      // YYYY-MM-DD
{ key: 'start_time',   type: 'time' }      // HH:MM
```

All three use Nuxt UI's date/time primitives at the right granularity. The model value is always an ISO string.

`datetime` accepts `attrs.tz`:

- `'naive'` (default) — the input represents a wall-clock time without timezone. The backend persists the string verbatim. Round-trip safe.
- `'utc'` — the input is interpreted and emitted as ISO with the `Z` suffix. Local ↔ UTC conversion happens explicitly; the backend stores UTC.

Pick one strategy per field and stay consistent with the backend.

## FK and M2M (remote autocomplete)

```ts
// Single foreign key
{ key: 'category', type: 'fks', attrs: {
  endpoint: '/api/categories/',
  itemText: 'name',    // field used as the dropdown label
  returnObject: true,  // default true — model holds the full object
}}

// Many-to-many
{ key: 'tags', type: 'm2m', attrs: {
  endpoint: '/api/tags/',
  itemText: 'name',
  returnObject: true,
  multiple: true,
}}
```

The endpoint must accept `?search=<query>` for filtering. Django REST Framework provides this automatically with `SearchFilter`.

## WYSIWYG editor

```ts
{ key: 'body', type: 'editor' }
```

Backed by Tiptap v2. The toolbar has bold, italic, underline, H2/H3, bullet and numbered lists, undo/redo and **Insert image**, which opens the media manager and needs `@mapomodule/uikit`. The rest of StarterKit (quotes, code blocks, horizontal rules) is kept when it is loaded or pasted, without a button. Links accept relative URLs and the `http`, `https`, `mailto` and `tel` protocols, so a `javascript:` link is rejected. The HTML the field receives is sanitized (`script` and `style` elements, `on*` handlers and unsafe URLs are removed) before the editor loads it, and the field's value is the editor's HTML.

`attrs.extensions` adds Tiptap v2 extensions, installed by the app, after the built-in ones (StarterKit, Link, Underline, Image). Tables need the four official table extensions:

```ts
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

{
  key: 'body',
  type: 'editor',
  attrs: {
    extensions: [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
  },
}
```

The editor then keeps the tables it loads or receives by pasting. The toolbar gets no button for them: add yours with [`attrs.toolbar`](#custom-toolbar-buttons).

### HTML source view

`attrs.source: true` adds a toggle at the end of the toolbar that shows the field's HTML in a textarea, one block per line, indented by nesting:

```ts
{ key: 'body', type: 'editor', attrs: { source: true } }
```

- What is typed reaches the editor after a short pause, or as soon as the textarea loses the focus. The editor sanitizes it and parses it with its schema, and the field's value becomes the editor's HTML: the value is sanitized and normalized even when the form is saved from the source view.
- Tags and attributes that no extension supports are removed, and a note under the textarea says so. A `<div>` becomes a paragraph, a `<span>` and a `style` attribute go, an `<iframe>` is dropped, and a table comes out as Tiptap writes it: with `colgroup`, `tbody`, a `<p>` in each cell and `colspan`/`rowspan`.
- The other toolbar buttons are disabled while the source is shown. The editor stays mounted behind the textarea, so undo steps back through the changes made in the source.
- A read-only field shows its source without letting it change. A value set from outside, such as a reset after saving or a restored draft, replaces what the textarea holds.

### Custom toolbar buttons

`attrs.toolbar` adds buttons after the built-in ones, past a separator, with the same look. Each item is an `EditorToolbarItem`:

| Key          | Type                  | Description                                                                                  |
| ------------ | --------------------- | -------------------------------------------------------------------------------------------- |
| `key`        | `string`              | Unique among the custom buttons.                                                             |
| `label`      | `string`              | Tooltip and accessible name; the button's text when it has no `icon`.                        |
| `icon`       | `string`              | Icon name, e.g. `i-lucide-table`.                                                            |
| `action`     | `(editor) => void`    | Runs on click.                                                                               |
| `isActive`   | `(editor) => boolean` | Shows the button as active, like the built-in ones on bold text or a heading.                |
| `isDisabled` | `(editor) => boolean` | Disables the button. It is also disabled when the field is read-only and in the source view. |

`editor` is the field's Tiptap editor, typed as `EditorToolbarEditor` with the members a button needs (`chain()`, `can()`, `commands`, `isActive()`); cast it to Tiptap's `Editor` for the rest of its API. A predicate that throws, for example because the field does not load the extension of its command, leaves the button inactive and disabled. Buttons for the table extensions above:

```ts
{
  key: 'body',
  type: 'editor',
  attrs: {
    source: true,
    extensions: [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    toolbar: [
      {
        key: 'table',
        icon: 'i-lucide-table',
        label: 'Insert table',
        action: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        key: 'row',
        icon: 'i-lucide-between-horizontal-end',
        label: 'Add row',
        action: e => e.chain().focus().addRowAfter().run(),
        isDisabled: e => !e.can().addRowAfter(),
      },
    ],
  },
}
```

The labels are the app's own: in a multilingual backoffice, take them from the app's translations.

## SEO preview

```ts
{ key: 'seo', type: 'seo' }
```

The model for this field is `{ title, description, url }`. The component shows character counters (60 / 155) and a live SERP preview. The registry accessor provides default values when the field is `null`.

## Map

```ts
{ key: 'location', type: 'map', attrs: {
  defaultLat: 41.9,
  defaultLng: 12.5,
  zoom: 6,
}}
```

The model value is `{ lat: number, lng: number } | null`. Leaflet is loaded only client-side (SSR-safe) via dynamic import — apps that do not use a map field pay no bundle cost.

## Repeater

```ts
{
  key: 'blocks',
  type: 'repeater',
  fields: [
    { key: 'title', type: 'text' },
    { key: 'body',  type: 'editor' },
  ],
  attrs: {
    previewLabel: (item) => item?.title ?? '(empty block)',
    confirmDelete: true,    // ask before deleting
    allowDuplicate: true,   // duplicate button on each item
    maxItems: 10,
    minItems: 1,
  },
}
```

With **multiple templates** (heterogeneous items):

```ts
{
  key: 'blocks',
  type: 'repeater',
  // `fields` can be omitted when `attrs.templates` is set
  attrs: {
    templates: {
      hero:  [{ key: 'title', type: 'text' }, { key: 'image_url', type: 'text' }],
      quote: [{ key: 'text', type: 'textarea' }, { key: 'author', type: 'text' }],
    },
    previewLabel: (item) => `${item._template}: ${item.title ?? ''}`,
  },
}
```

The chosen template is stored in `item._template`.

A template value can also be a `RepeaterTemplate` object, which adds a label, description, icon, preview and category. The add control then shows these, and each item shows a badge with the template label and icon in its header:

```ts
attrs: {
  picker: 'auto', // 'select' | 'modal' | 'auto' (modal when more than 3 templates)
  templates: {
    hero: {
      label: 'Hero',
      description: 'Large title with a background image',
      icon: 'i-lucide-image',
      category: 'Layout',
      wireframe: true, // schematic preview; `image: '/previews/hero.png'` wins over it
      // imageFit: 'cover', // how `image` fits the card; `contain` (whole image) by default
      fields: [{ key: 'title', type: 'text' }, { key: 'image_url', type: 'text' }],
    },
    quote: [{ key: 'text', type: 'textarea' }], // bare arrays still work
  },
}
```

With the modal picker the user can search blocks and filter by category; holding Shift while choosing a block keeps the modal open to add several in a row. See [`RepeaterTemplate`](./api.md#repeatertemplate).

The repeater uses stable per-item UIDs (a `WeakMap<item, string>`), so reordering, undo, and splices never reuse a child component on the wrong item — even when several items share the same shape.

## Custom field (non-built-in type)

```ts
// app/plugins/my-fields.ts
export default defineNuxtPlugin(() => {
  defineFormField(
    "video-cut",
    () => import("~/components/admin/VideoCutField.vue"),
  );
});

// descriptor — custom types live in the wider AnyFieldDescriptor union
const fields: AnyFieldDescriptor<Video>[] = [
  { key: "video_cut", type: "video-cut" },
];
```

Arrays that mix in custom types must be annotated with `AnyFieldDescriptor<T>` (the strict `FieldDescriptor<T>` union covers built-in types only). If the type is not registered, `MapoUnknownField` (yellow placeholder) is rendered instead of breaking the form.

→ [Full guide to custom fields](./custom-fields)
