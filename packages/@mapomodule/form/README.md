# @mapomodule/form

The form engine of Mapo. A form is an array of `FieldDescriptor` objects; the engine resolves each descriptor's `type` through a field registry to a lazily loaded component, and renders the result in `MapoDetail` (from `@mapomodule/uikit`), in `MapoForm`, or headless through `useMapoForm()`.

## Installation

Installed by the meta-package [`mapomodule`](https://www.npmjs.com/package/mapomodule), which configures it under `mapo.form`. On its own it reads the `mapoForm` key:

```bash
pnpm add @mapomodule/form@next
```

| Option            | Default | Description                                                                              |
| ----------------- | ------- | ---------------------------------------------------------------------------------------- |
| `fields.attrs`    | `{}`    | Default `attrs` per field type, merged into the registry defaults                        |
| `groups.expanded` | `true`  | Whether collapsible field groups start open                                              |
| `debounce`        | `300`   | Milliseconds before a field change reaches the model; `descriptor.debounce` overrides it |

Mapo v2 is published on the `next` dist-tag while it is in beta.

## Quick start

```vue
<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

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

The built-in types cover text and numbers, choices, dates and times, files, relations (`fks`, `m2m`), rich text, SEO preview, maps, repeaters and media pickers. The media pickers drive the Media Manager of `@mapomodule/uikit` and show a notice when it is not installed. A `type` the registry does not know renders `MapoUnknownField` instead of breaking the form.

## What you get

Components and composables are auto-imported.

| API                                                        | Purpose                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapoForm`                                                 | Renders a `FieldDescriptor[]` on your model, with tabs, collapsible groups, a responsive grid and slots                                                                                     |
| `useMapoForm(options)`                                     | The same engine headless: dirty state, client validation, `getPatch()`, `submit()`, drafts. Pass `registry` explicitly                                                                      |
| `defineFormField(type, component, opts?)`                  | Registers a custom field type from a plugin: a component or a lazy `import()`, with optional default `attrs` and accessor. Re-registering a type warns unless you pass `{ override: true }` |
| `useFormFromSchema(schema, opts?)`                         | Builds descriptors from a JSON Schema, such as a DRF-spectacular or Pydantic schema                                                                                                         |
| `when`, `whenAny`, `whenNot`, `matchesField`, `isOneOf`, … | Build `visible` conditions declaratively                                                                                                                                                    |
| `useFormDraft`, `useFocusMode`, `useCurrentLang`           | Draft autosave, focus mode, the language being edited                                                                                                                                       |
| `$mapoFormRegistry`                                        | The global registry: type → component, default `attrs`, accessor                                                                                                                            |

A custom field is any component that accepts the `modelValue`, `descriptor`, `errors`, `readonly` and `disabled` props and emits `update:modelValue`.

## Documentation

- [Form Engine](https://lotrekagency.github.io/mapo-new/uikit/form/): your first form, tabs and groups, how the engine works
- [All field types](https://lotrekagency.github.io/mapo-new/uikit/form/add-fields)
- [Field registry](https://lotrekagency.github.io/mapo-new/uikit/form/registry) and [Custom fields](https://lotrekagency.github.io/mapo-new/uikit/form/custom-fields)
- [Validation](https://lotrekagency.github.io/mapo-new/uikit/form/validation), [Multilingual fields](https://lotrekagency.github.io/mapo-new/uikit/form/i18n), [Draft autosave](https://lotrekagency.github.io/mapo-new/uikit/form/draft), [Progressive Disclosure](https://lotrekagency.github.io/mapo-new/uikit/form/progressive-disclosure)
- [`useMapoForm()` reference](https://lotrekagency.github.io/mapo-new/uikit/form/composable)
- [From JSON Schema to form](https://lotrekagency.github.io/mapo-new/uikit/form/schema-to-form)
- [Form Engine — Component API Reference](https://lotrekagency.github.io/mapo-new/uikit/form/api)
