# Custom fields

A custom field component must implement a single interface:

```ts
defineProps<{
  modelValue: unknown;
  descriptor: CustomDescriptor; // or the specific built-in descriptor you override
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: unknown] }>();
```

Nothing else. Idiomatic Vue.

::: tip Which descriptor type?

- A field with a **new custom `type`** receives a `CustomDescriptor` (open `attrs`).
- A component that **overrides a built-in type** (e.g. a Vuetify text input replacing `text`) should declare the specific descriptor (`TextDescriptor`, `SelectDescriptor`, …) to get typed `attrs`.
- Pages that mix custom types into their `fields` array annotate it with `AnyFieldDescriptor<T>` instead of the strict `FieldDescriptor<T>`.
  :::

## Example: VideoCutField

```vue
<!-- components/admin/VideoCutField.vue -->
<script setup lang="ts">
import type { CustomDescriptor } from "mapomodule/types";

interface VideoCut {
  url: string;
  start: number;
  end: number;
}

defineProps<{
  modelValue: VideoCut | null;
  descriptor: CustomDescriptor;
  errors?: string[];
  readonly?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: VideoCut | null] }>();
</script>

<template>
  <div class="space-y-2">
    <UInput
      :model-value="modelValue?.url"
      placeholder="Video URL"
      :readonly="readonly"
      @update:model-value="
        emit('update:modelValue', { ...modelValue, url: $event })
      "
    />
    <!-- ... range picker for start/end ... -->
    <p v-for="err in errors" :key="err" class="text-sm text-red-500">
      {{ err }}
    </p>
  </div>
</template>
```

## Registration

### Recommended: `defineFormField()` from a plugin

`defineFormField()` is the typed extension API. It registers the component into the global `$mapoFormRegistry`, optionally supplies default attrs and an accessor, and warns if you accidentally re-register an existing type.

```ts
// app/plugins/my-fields.ts
export default defineNuxtPlugin(() => {
  defineFormField(
    "video-cut",
    () => import("~/components/admin/VideoCutField.vue"),
    {
      attrs: { aspectRatio: "16:9" },
    },
  );
});
```

Plugins inside `app/plugins/` run after module plugins, so `$mapoFormRegistry` is always available. Pass `{ override: true }` to silence the collision warning when you intentionally replace a built-in type.

### Per-page override (custom registry)

Sometimes you only want to swap a field for a single page. Build a custom registry and pass it explicitly:

```ts
// pages/videos/[id].vue
const { $mapoFormRegistry } = useNuxtApp();
import VideoCutField from "~/components/admin/VideoCutField.vue";

const registry = {
  ...$mapoFormRegistry,
  mapping: { ...$mapoFormRegistry.mapping, "video-cut": VideoCutField },
};
```

```vue
<MapoForm :registry="registry" ... />
```

When you do not pass `:registry`, `<MapoForm>` falls back to `$mapoFormRegistry`.

### Per-field override (`descriptor.is`)

```ts
import VideoCutField from "~/components/admin/VideoCutField.vue";

const fields = [{ key: "cut", type: "video-cut", is: VideoCutField }];
```

`descriptor.is` bypasses the registry entirely for that one field.

## Accessing the form context from a field

If your custom component needs the full model or the active language:

```ts
// inside your custom field
const form = injectMapoForm();
// form?.model.value      → full model
// form?.currentLang.value → active language
// form?.languages         → list of languages
```

`injectMapoForm` is not auto-imported: import it from `@mapomodule/form/runtime/composables/useMapoForm`.

## Reading the field's annotation

A custom field shows the [annotation](./annotations) mark next to its label without any code. To use the annotation inside the field too, read it with the auto-imported `useFieldAnnotation()`:

```ts
const annotation = useFieldAnnotation(() => props.descriptor);
// annotation.value?.label, .color, .description, .actions
```

It follows the same rule as the mark and works inside repeater items too. [A complete field](./annotations#a-complete-field) shows how to highlight the control and offer the actions.

## Add your own descriptor properties

A custom field may need a setting the descriptor does not have, such as a help text or a unit. Declare it on `FieldExtensions`: every descriptor type then accepts it, and TypeScript checks it like the descriptor's own properties.

```ts
// shared/types/field-extensions.d.ts, or any .d.ts the app's tsconfig includes
declare module "mapomodule/types" {
  interface FieldExtensions {
    /** A sentence that tells whoever fills the field what to write. */
    help?: string;
  }
}

export {};
```

```ts
interface Product {
  title: string;
  price: number;
}

const fields: FieldDescriptor<Product>[] = [
  { key: "price", type: "number", help: "Whole euros, 0 when free." },
  // ❌ Type error: `hlep` is not a descriptor property
  { key: "title", type: "text", hlep: "…" },
];
```

The form engine never reads these properties: whoever declares one reads it. A custom field reads it from its `descriptor` prop:

```vue
<p v-if="descriptor.help" class="text-xs text-muted">{{ descriptor.help }}</p>
```

`fieldsToJsonSchema` writes it into the schema through its [`property` option](./schema-to-form#customise-each-property).

- **Keep them optional, with names of your own**, so they cannot clash with a property Mapo adds later.
- **Declare them where you import the types from**: an app on `mapomodule/types`, a package on `@mapomodule/form/types`.
- **Keep `export {}`**: it makes the file a module, so `declare module` adds to Mapo's types instead of replacing them.
- **They exist for TypeScript only**: nothing checks them at runtime, and a field that does not use one ignores it.

## Tip: reusing built-in Mapo fields

A custom field can compose other Mapo fields internally:

```vue
<template>
  <div>
    <UInput v-model="localTitle" />
    <!-- MapoFksField used as a sub-component -->
    <MapoFksField
      :model-value="modelValue?.author"
      :descriptor="{
        key: 'author',
        type: 'fks',
        attrs: { endpoint: '/api/authors/' },
      }"
      @update:model-value="
        emit('update:modelValue', { ...modelValue, author: $event })
      "
    />
  </div>
</template>
```

> `MapoFksField` is auto-imported because the module registers it as a global component.
