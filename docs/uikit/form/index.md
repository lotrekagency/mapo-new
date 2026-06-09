# Form Engine

The Mapo v2 form engine turns a data structure (`FieldDescriptor[]`) into a complete admin form — with validation, multilingual support, tab/group layout, debounce, backend error handling, and a built-in catalog of 14 field types.

A basic form is **5 lines**. A form with 30 fields, 3 tabs, translated fields, remote autocomplete, and a WYSIWYG is around 80 lines — without writing a single Vue component.

## Your first form

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule", "@mapomodule/form"],
});
```

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

That is enough. The form renders the three fields with a 300 ms debounce, surfaces backend errors under the right field, and never breaks — if a type is unknown, a yellow placeholder appears instead of crashing.

The `:registry` prop is **optional**: `<MapoForm>` falls back to the global `$mapoFormRegistry` provided by the module. Pass it explicitly only when you want to swap the registry for a single form.

## Tab and group layout

```ts
const fields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", tab: "content", group: "main" },
  { key: "body", type: "editor", tab: "content", group: "main" },
  { key: "seo", type: "seo", tab: "seo" },

  // Sidebar (collapsible group)
  { key: "is_draft", type: "switch", tab: "content", group: "sidebar" },
  { key: "published_at", type: "datetime", tab: "content", group: "sidebar" },
];
```

If more than one `tab` is present, tab navigation is rendered with a red badge on tabs that contain errors.

Tabs can be nested using an array path or a `/`-separated string:

```ts
{ key: "meta_title", type: "text", tab: ["content", "seo"] }
// equivalent:
{ key: "meta_title", type: "text", tab: "content/seo" }
```

The parent tab renders its own direct fields first, then a nested tab bar for its children. Error badges propagate upward.

Use `subtab` to place a tab bar _inside_ a group card instead:

```ts
// "seo" group card shows a "basic" / "social" tab bar inside it
{ key: "meta_title", type: "text",     group: "seo", subtab: "basic"  }
{ key: "og_image",   type: "file",     group: "seo", subtab: "social" }
```

`subtab` and `tab` are orthogonal — `subtab` organises fields within a group card; `tab` organises fields into top-level (or nested) tab panels.

## Responsive columns

Every field accepts a `cols` prop (1–12, on a 12-column grid):

```ts
{ key: 'title', type: 'text', cols: 8 },   // 2/3 of the row
{ key: 'slug',  type: 'text', cols: 4 },   // 1/3 of the row
```

You can also pass a per-breakpoint object: `{ sm: 12, md: 6, lg: 4 }`.

---

## How it works — the model behind the system

This section explains the mental model. You do not need it to use the form, but it helps to understand why the API is shaped the way it is — and what happens under the hood when you write `{ key: 'title', type: 'text' }`.

### The problem it solves

In Mapo v1 forms were stateful Vue components with deeply nested watchers. Adding a custom field required knowing the internal architecture. An unknown type broke rendering. There was no client-side validation. Debounce was hard-coded at 300 ms for everything.

The v2 form engine starts from a different premise: **the form is data, not a template**. You declare _what_ you want to render — the system figures out _how_.

### The four layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4 — JSON Schema bridge (optional)                    │
│  useFormFromSchema(schema) → FieldDescriptor[]              │
│  Generates descriptors automatically from Pydantic / DRF    │
└──────────────────────────┬──────────────────────────────────┘
                           │ produces
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — Public contract                                  │
│  FieldDescriptor<T>  —  where you spend 90% of the time     │
│  Typed key, discriminated `type` union, strict attrs        │
└──────────────────────────┬──────────────────────────────────┘
                           │ consumed by
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 — useMapoForm() (headless, stateful)               │
│  model, errors, isDirty, currentLang, debounce, accessor    │
│  Testable without a DOM, reusable outside <MapoForm>        │
└──────────────────────────┬──────────────────────────────────┘
                           │ exposed by
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 — UI components                                    │
│  <MapoForm>  <MapoFormGroup>  <MapoFormTabs>                │
│  <MapoFormField>  + 14 field components                     │
└─────────────────────────────────────────────────────────────┘
```

The layers are **decoupled**: you can use `useMapoForm` without `<MapoForm>`, and you can hand `<MapoForm>` a descriptor written by hand or generated from JSON Schema. Layer 4 is fully optional.

### The descriptor is the contract

`FieldDescriptor<T>` is a **TypeScript discriminated union**. The `type` field drives the system:

```ts
// ❌ Select WITHOUT options: TypeScript error — caught in the IDE, not at runtime
{ key: 'status', type: 'select' }

// ✅ Select with options: compiles
{ key: 'status', type: 'select', attrs: { options: [...] } }

// ✅ Custom type not in the registry: still compiles (escape hatch)
//    At runtime → yellow placeholder instead of a crash
{ key: 'widget', type: 'my-unknown-type' }
```

The generic `<T>` type-checks `key` against your model, but also accepts dotted strings for nested fields (`'blocks.0.title'`) or dynamic models. Typo errors in field names are caught by the IDE, not after deploy.

### The pipeline of every field

When `<MapoFormField>` renders a field, it walks this cascade:

```
1. descriptor.is?           → use that component directly
2. registry.mapping[type]?  → use the mapped component
3. Unknown type?            → MapoUnknownField (yellow placeholder)
```

Then for each field:

```
final attrs    = registry.attrs.All  ⊕  registry.attrs[type]  ⊕  descriptor.attrs
accessor       = registry.accessor[type]  ⊕  descriptor.accessor
value path     = translatable + lang → model.translations[lang][key]
emit           = debounce(descriptor.debounce ?? form.debounce ?? 300ms)
```

Each step is a pure function (`resolveFieldComponent`, `resolveFieldAttrs`, `resolveFieldAccessor`), testable in isolation.

### The composable is the brain

`useMapoForm()` owns all the state:

- **`model`** — the ref updated every time a field changes
- **`backup`** — snapshot at mount time, used to compute `getPatch()` (differential PATCH)
- **`isDirty`** — `true` as soon as the model diverges from `backup`
- **`errors`** — backend error map (`{ title: ['Too long.'] }`), passed in from outside
- **`currentLang`** — active language (synced via provide/inject with `<MapoForm>`)
- **`validateClient()`** — runs every per-field `validate()`, returns `{ valid, errors }`
- **`submit(handler)`** — validates → flips `isLoading` → calls the handler → `resetDirty()`

The composable knows nothing about Vue templates. It can drive a fully custom form (two-column layout, wizard, drawer) without touching `<MapoForm>`. That is what **headless** means here.

### The registry is the extension point

The registry is an object with three keys (`mapping`, `attrs`, `accessor`) that maps every `type` to its behavior. The global registry (`$mapoFormRegistry`) is created at boot by the module plugin. You can:

1. **Add types** globally with `defineFormField()` from a Nuxt plugin
2. **Override defaults** per page by passing a custom registry to `<MapoForm>`
3. **Bypass the registry** entirely for a single field with `descriptor.is`

No layer is mandatory. A simple form uses only layer 3 (descriptor) and layer 1 (`<MapoForm>`). A complex form may touch all four.

### Fail-soft by design

The system never breaks on malformed descriptors or unknown types. In **development** it emits `console.warn` with the full path of the unresolved field — and the devtools panel (`/_mapo/devtools/forms`, available inside Nuxt DevTools) lists the full registry inventory. In **production** the warning is silent and the value is preserved.

---

## Next steps

- [All field types →](./add-fields)
- [Client-side validation →](./validation)
- [Translated fields (i18n) →](./i18n)
- [Slots and customization →](./slots)
- [Registry and custom fields →](./registry)
- [Reusable field sets →](./reusable-fields)
- [`useMapoForm()` headless →](./composable)
- [From JSON Schema to form →](./schema-to-form)
