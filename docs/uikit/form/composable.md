# `useMapoForm()` — Reference

The headless composable that owns every piece of form logic. Use it without `<MapoForm>` for fully custom layouts.

## Signature

```ts
const form = useMapoForm<T>({
  model:        Ref<T>,
  fields:       MaybeRef<FieldDescriptor<T>[]>,
  errors?:      Ref<Record<string, string[]>>,   // backend errors
  languages?:   string[],
  currentLang?: Ref<string>,
  immediate?:   boolean,        // true = no debounce
  debounce?:    number,         // ms, default 300
  notifyErrors?: boolean,       // default true; false = no toast for server errors
  registry:     FieldRegistry,
  draftKey?:    MaybeRef<string | undefined>,    // enable draft persistence
})
```

`registry` is required — `useMapoForm()` is the headless entry point and may be invoked in environments where `useNuxtApp()` is not available (tests, SSR previews). The component-level `<MapoForm>` falls back to `$mapoFormRegistry` automatically.

## Returns

| Property / Method           | Type                                                            | Description                                                                  |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `state`                     | `ComputedRef<{model, errors, isDirty, currentLang, isLoading}>` | Reactive snapshot of the form state                                          |
| `isDirty`                   | `Ref<boolean>`                                                  | `true` when the model differs from the backup                                |
| `isLoading`                 | `Ref<boolean>`                                                  | `true` while `submit()` is running                                           |
| `currentLang`               | `Ref<string>`                                                   | Active language (synced through provide/inject)                              |
| `readonly`                  | `Ref<boolean>`                                                  | Toggle to lock every field                                                   |
| `getFieldValue(descriptor)` | `unknown`                                                       | Current value with `accessor.get` applied                                    |
| `setFieldValue(key, val)`   | `void`                                                          | Updates the model (with `initLang` if `translatable`)                        |
| `getClientError(key)`       | `string \| null`                                                | Error from `descriptor.validate()`                                           |
| `validateClient()`          | `{ valid, errors }`                                             | Runs every `validate()`                                                      |
| `resetDirty()`              | `void`                                                          | Clears the backup (after a successful save)                                  |
| `getPatch()`                | `Partial<T>`                                                    | Diff model vs backup — for differential PATCH                                |
| `submit(handler, isNew?)`   | `Promise<void>`                                                 | Validate, call handler, manage loading state, clear draft on success         |
| `ctx`                       | `MapoFormContext<T>`                                            | The reactive context object provided to descendant fields                    |
| `draftBanner`               | `Ref<{ savedAt, restore, discard } \| null>`                    | Populated after `checkDraft()` when a pending draft is found in localStorage |
| `checkDraft()`              | `void`                                                          | Read localStorage for a pending draft; call after the model is fetched       |
| `clearDraft()`              | `void`                                                          | Remove the draft from localStorage                                           |

> `useMapoForm()` provides its context to descendant fields **automatically** — you can
> render `<MapoFormField>` anywhere inside the same setup without any extra wiring.

## Headless usage

```vue
<script setup lang="ts">
const model = ref({ title: "", status: "draft" });
const { $mapoFormRegistry } = useNuxtApp();
const fields = ref([
  { key: "title", type: "text" as const, required: true },
  {
    key: "status",
    type: "select" as const,
    attrs: { options: [{ text: "Draft", value: "draft" }] },
  },
]);

const form = useMapoForm({
  model,
  fields,
  registry: $mapoFormRegistry,
  immediate: true,
});

async function save() {
  await form.submit(async (patch) => {
    await $fetch("/api/articles/1/", { method: "PATCH", body: patch });
  });
}
</script>

<template>
  <!-- Fully custom layout -->
  <div class="grid grid-cols-2 gap-4">
    <MapoFormField :descriptor="fields[0]" />
    <MapoFormField :descriptor="fields[1]" />
  </div>
  <div class="mt-4 flex justify-between">
    <span>Dirty: {{ form.isDirty.value }}</span>
    <UButton :loading="form.isLoading.value" @click="save">Save</UButton>
  </div>
</template>
```

## `submit()`

```ts
await form.submit(handler, isNew?)
```

- If `validateClient()` fails → `handler` is not called and `isLoading` is not flipped
- If `isNew = true` → `handler` receives the full model
- If `isNew = false` (default) → `handler` receives `getPatch()` only
- After `handler` resolves → `resetDirty()` is called automatically
- `isLoading` is `true` while `handler` is running

```ts
await form.submit(async (data, isNew) => {
  if (isNew) {
    await $fetch("/api/articles/", { method: "POST", body: data });
  } else {
    await $fetch(`/api/articles/${id}/`, { method: "PATCH", body: data });
  }
});
```

## Draft persistence (standalone)

When using `useMapoForm()` without `<MapoDetail>`, pass `draftKey` to enable auto-save to localStorage. The composable debounces saves every 2 s while the form is dirty and clears the draft automatically on `submit()`.

```ts
const form = useMapoForm({
  model,
  fields,
  registry: $mapoFormRegistry,
  draftKey: `article:${route.params.id}`,
});

// After your fetch resolves, offer to restore:
onMounted(async () => {
  model.value = await $fetch(`/api/articles/${id}`);
  form.checkDraft(); // populates form.draftBanner if a draft exists
});
```

```vue
<template>
  <!-- Render a banner when a draft is found -->
  <UAlert
    v-if="form.draftBanner.value"
    color="warning"
    :title="`Draft from ${form.draftBanner.value.savedAt.toLocaleString()}`"
  >
    <template #actions>
      <UButton @click="form.draftBanner.value?.restore()">Restore</UButton>
      <UButton variant="ghost" @click="form.draftBanner.value?.discard()"
        >Discard</UButton
      >
    </template>
  </UAlert>
</template>
```

> When using `<MapoDetail>` with `:draft="true"`, all of this is handled automatically — you do not need `useMapoForm` draft options.

## Sub-forms (repeater items)

`MapoRepeater` does **not** reimplement form logic: each repeater item drives its fields
through its own `useMapoForm` instance. This is why nested-path keys, `translatable`,
`synci18n`, custom accessors, `onChange` and **client-side validation** all behave inside a
repeater exactly as they do at the top level — and why a field overridden via
`descriptor.is` (or a custom registry `type`) renders correctly inside an item too.

Each item passes `notifyErrors: false` so it doesn't duplicate the root form's error toast,
and inherits `submitted` / `readonly` from the parent so the root `submit()` reveals
item-level validation errors.

> **Performance note.** One `useMapoForm` instance is created per repeater item. This is a
> few refs + computeds per item (no extra watchers — draft and the error toast are off), so
> it's cheap for typical repeaters. For very large repeaters (hundreds of simultaneously
> mounted items) keep an eye on it; collapsing items still mounts the item shell but not the
> fields.

## `MapoFormContext` (inject in child fields)

Every component inside a `<MapoForm>` (or any `useMapoForm()` setup) can read the context:

```ts
const form = injectMapoForm<Article>();
// form?.model, form?.errors, form?.currentLang, form?.registry, ...
```
