# @mapomodule/form

Form engine for Mapo v2 — descriptor-driven, typesafe, headless-ready admin forms for Nuxt 4 + Django/DRF.

## Features

- **Descriptor-driven**: define fields as `FieldDescriptor[]` — layout, validation, i18n in one object
- **All field types built-in**: text, select, date/time, FK/M2M autocomplete, WYSIWYG editor, SEO preview, map, repeater, media pickers
- **Headless composable**: `useMapoForm()` for fully custom layouts; `<MapoForm>` for the default shell
- **Registry auto-injection**: `<MapoForm>` and `<MapoDetail>` resolve `$mapoFormRegistry` automatically — no boilerplate
- **Typed extension API**: `defineFormField(type, entry, opts)` to register custom fields with collision detection
- **JSON Schema bridge**: `useFormFromSchema()` generates descriptors from Pydantic v2 / DRF-spectacular schemas
- **Multilingual fields**: `translatable: true` writes to `model.translations[lang].field` automatically
- **Client validation**: `validate(value, ctx)` per descriptor + `required` shorthand
- **Tab/group layout**: declare `tab` and `group` per field — tabs render automatically (incl. nested tabs), groups are collapsible. Tab panels expose `tab.<name>.before/after`, full override, `.label` and `tab-bar-end` slots
- **Consistent repeater items**: `MapoRepeater` drives each item through `useMapoForm`, so nested-path keys, `translatable`, accessors, `descriptor.is` overrides and **client validation** behave identically inside a repeater
- **Draft persistence**: `draftKey` option on `useMapoForm()` auto-saves to localStorage every 2 s; `checkDraft()` / `draftBanner` offer restore/discard; clears on successful `submit()`
- **Fail-soft**: unknown field types render a non-destructive placeholder, never crash the form
- **Media pickers**: `media`, `media-m2m` and `enhanced-media` field types are built in; they drive the Media Manager from [`@mapomodule/uikit`](../uikit/README.md), resolved at runtime — install it to enable them

## Install

`@mapomodule/form` is included automatically when you install `mapomodule` (recommended). No additional module entry is needed.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],
  mapo: {
    form: {
      // optional — global field registry defaults
    },
  },
});
```

## Quick start

```vue
<script setup lang="ts">
import type { FieldDescriptor } from "@mapomodule/form";

interface Article {
  title: string;
  slug: string;
  is_draft: boolean;
}

const article = ref<Article>({ title: "", slug: "", is_draft: true });
const errors = ref<Record<string, string[]>>({});

const fields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "is_draft", type: "switch", label: "Draft" },
];
</script>

<template>
  <MapoForm v-model="article" :fields="fields" :errors="errors" />
</template>
```

The `registry` prop is optional — `<MapoForm>` falls back to the global `$mapoFormRegistry` provided by this module's plugin. Pass it explicitly only when you want to swap the registry for a single form.

## Field types

| Type                         | Component             | Notes                                                       |
| ---------------------------- | --------------------- | ----------------------------------------------------------- |
| `text`                       | `UInput`              |                                                             |
| `textarea`                   | `UTextarea`           |                                                             |
| `number`                     | `UInput[type=number]` |                                                             |
| `boolean`                    | `UCheckbox`           |                                                             |
| `switch`                     | `USwitch`             |                                                             |
| `color`                      | `UInput[type=color]`  |                                                             |
| `slider`                     | `USlider`             |                                                             |
| `file`                       | `MapoFileField`       | Current-file preview, image thumbnail, remove button        |
| `select`                     | `USelectMenu`         | requires `attrs.options`                                    |
| `date` / `datetime` / `time` | `MapoDateField` etc.  | ISO string in model; `tz: 'naive' \| 'utc'` for `datetime`  |
| `fks`                        | `MapoFksField`        | FK autocomplete; `attrs.endpoint` required                  |
| `m2m`                        | `MapoFksField`        | Multi-select autocomplete, removable chips                  |
| `editor`                     | `MapoWygEditor`       | Tiptap v2; sanitized output, safe `Link` validator          |
| `seo`                        | `MapoSeoPreview`      | Title / description with live SERP preview                  |
| `map`                        | `MapoMapField`        | Leaflet, `{ lat, lng }` in model, SSR-safe via `ClientOnly` |
| `repeater`                   | `MapoRepeater`        | Nested fields, drag-and-drop, undo stack, templates         |

## JSON Schema → Form

```ts
const schema = await $fetch("/api/schema/");
const fields = useFormFromSchema(schema, {
  exclude: ["id", "created_at"],
  overrides: {
    body: { type: "editor", translatable: true },
  },
});
```

## Headless

```ts
const form = useMapoForm({ model, fields, registry: $mapoFormRegistry });

// form.isDirty, form.isLoading, form.getPatch(), form.submit(handler)
```

The headless composable still requires the registry explicitly — `useNuxtApp()` is not available in every context where you might want to drive a form (tests, storybook, server-side preview).

## Draft persistence (headless)

```ts
const form = useMapoForm({
  model,
  fields,
  registry: $mapoFormRegistry,
  draftKey: `article:${route.params.id}`,
});

// After fetch:
form.checkDraft(); // populates form.draftBanner if a draft is found
```

`form.draftBanner.value` exposes `{ savedAt, restore(), discard() }`. On `submit()` success the draft is cleared automatically. When using `<MapoDetail :draft="true">`, all of this is handled for you.

## Custom fields

The recommended way to register a custom field is the typed `defineFormField()` helper, called from a Nuxt plugin:

```ts
// app/plugins/my-fields.ts
export default defineNuxtPlugin(() => {
  defineFormField("rich-text", () => import("~/components/RichText.vue"), {
    attrs: { rows: 6 },
  });
});
```

Plugins in `app/plugins/` run after module plugins, so `$mapoFormRegistry` is always available. Re-registering an existing type prints a development warning unless you pass `{ override: true }` explicitly.

Any component with `modelValue` + `descriptor` + `errors` + `readonly` props works as a field.

## Documentation

Full docs: [Form Engine — Quickstart](../../../docs/uikit/form/index.md)

- [All field types](../../../docs/uikit/form/add-fields.md)
- [Validation](../../../docs/uikit/form/validation.md)
- [i18n / multilingual fields](../../../docs/uikit/form/i18n.md)
- [`useMapoForm()` headless](../../../docs/uikit/form/composable.md)
- [Custom fields & registry](../../../docs/uikit/form/custom-fields.md)
- [Slot system](../../../docs/uikit/form/slots.md)
- [JSON Schema bridge](../../../docs/uikit/form/schema-to-form.md)

## License

MIT
