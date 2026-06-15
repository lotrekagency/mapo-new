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

Backed by Tiptap v2 with Bold, Italic, Underline, H2/H3, lists, Link, and undo/redo. The `Link` extension is configured with a strict protocol allowlist (`http`, `https`, `mailto`) and a URL validator that rejects `javascript:` payloads. Inbound HTML is sanitized before being passed to `setContent`.

You can add extensions:

```ts
import { Image } from '@tiptap/extension-image'

{ key: 'body', type: 'editor', attrs: { extensions: [Image] } }
```

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
