# Custom fields

A custom field component must implement a single interface:

```ts
defineProps<{
  modelValue: unknown;
  descriptor: FieldDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: unknown] }>();
```

Nothing else. Idiomatic Vue.

## Example: VideoCutField

```vue
<!-- components/admin/VideoCutField.vue -->
<script setup lang="ts">
import type { FieldDescriptor } from "mapomodule/types";

interface VideoCut {
  url: string;
  start: number;
  end: number;
}

defineProps<{
  modelValue: VideoCut | null;
  descriptor: FieldDescriptor;
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

`injectMapoForm` is auto-imported when `@mapomodule/form` is installed.

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
