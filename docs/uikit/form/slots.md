# Form slots

`<MapoForm>` exposes slots to customize every aspect of rendering without rewriting components.

## TL;DR

```vue
<MapoForm v-model="article" :fields="fields">
  <template #field.slug.append>
    <UButton size="xs" @click="generateSlug">Auto</UButton>
  </template>
</MapoForm>
```

Slots are addressed by field key. They propagate automatically through `MapoForm → MapoFormGroup → MapoFormField`.

---

## Per-field slots

For every field with `key: 'myField'`, the following slots are available:

| Slot                     | Position                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `#field.myField`         | Replaces the entire field component (last-resort override) |
| `#field.myField.label`   | Replaces the label                                         |
| `#field.myField.before`  | Before the field widget, inside its grid column            |
| `#field.myField.after`   | After the field widget, inside its grid column             |
| `#field.myField.prepend` | Inside the field, leading (NUI `leading` slot)             |
| `#field.myField.append`  | Inside the field, trailing (NUI `trailing` slot)           |
| `#field.myField.hint`    | Helper text under the field                                |

### Slot props

Every `field.*` slot receives the following bindings:

| Prop          | Type              | Description                                                  |
| ------------- | ----------------- | ------------------------------------------------------------ |
| `field`       | `FieldDescriptor` | The full descriptor for this field.                          |
| `model`       | `T \| undefined`  | The form's current model value (reactive, read-only).        |
| `currentLang` | `string`          | The active language code (empty string when i18n is unused). |

`model` and `currentLang` are injected from the parent `MapoForm` context via `provide/inject` — they are always up to date even inside nested `MapoFormGroup` / `MapoFormFlatSection` sections.

```vue
<MapoForm v-model="article" :fields="fields">
  <!-- Custom label for the slug field -->
  <template #field.slug.label>
    <span class="flex items-center gap-1">
      <UIcon name="i-heroicons-link" />
      Slug URL
    </span>
  </template>

  <!-- Inline auto-generate button -->
  <template #field.slug.append>
    <UButton size="xs" @click="generateSlug">Auto</UButton>
  </template>

  <!-- Helper text under the title -->
  <template #field.title.hint>
    <span class="text-xs text-gray-400">
      Visible in the browser tab and in search results.
    </span>
  </template>

  <!-- Section after the price field -->
  <template #field.price.after>
    <p class="text-xs text-amber-600 mt-1">
      Price includes 22% VAT.
    </p>
  </template>
</MapoForm>
```

## Global slots

Beyond per-field slots, `<MapoForm>` exposes:

| Slot       | Position                                   |
| ---------- | ------------------------------------------ |
| `#header`  | Above the tabs / first group               |
| `#footer`  | Below the last group                       |
| `#actions` | Action area below the form (Save / Cancel) |

```vue
<MapoForm v-model="article" :fields="fields">
  <template #header>
    <div class="mb-4 p-3 bg-amber-50 rounded border border-amber-200 text-sm">
      You are editing a published article.
    </div>
  </template>

  <template #actions="{ isDirty, isLoading }">
    <div class="flex justify-end gap-2">
      <UButton variant="ghost" :disabled="!isDirty">Cancel</UButton>
      <UButton :loading="isLoading" @click="save">Save</UButton>
    </div>
  </template>
</MapoForm>
```

## Slot props

Slots expose the form context through `slotProps`:

```ts
// #actions slotProps:
{
  isDirty: boolean;
  isLoading: boolean;
  currentLang: string;
  model: T;
}
```

Use them to wire interactive UI without re-implementing state tracking:

```vue
<template #field.title.hint="{ model }">
  <span>{{ model.title.length }}/200 characters</span>
</template>
```

## How to: add a copy-to-clipboard button next to a field

```vue
<template #field.public_url.append="{ model }">
  <UButton
    size="xs"
    variant="ghost"
    icon="i-lucide-copy"
    @click="copyToClipboard(model.public_url)"
  />
</template>
```

## How to: render a complex helper in `hint`

```vue
<template #field.password.hint>
  <ul class="text-xs text-gray-400 list-disc pl-4">
    <li>At least 8 characters</li>
    <li>One uppercase letter</li>
    <li>One number</li>
  </ul>
</template>
```

## How to: replace an entire field with a custom block

`#field.<key>` (no suffix) overrides the field component itself. Use it as a last resort — `descriptor.is` is usually cleaner because it preserves error/label rendering automatically.

```vue
<template #field.location="{ model }">
  <div class="rounded border p-4">
    <p class="text-sm font-medium">Pick a location on the map below</p>
    <MyCustomMap v-model="model.location" />
  </div>
</template>
```

## How to: place content above or below a single field

Use `before` / `after` — rendered stacked within the field's grid column:

```vue
<template #field.tags.before>
  <p class="text-xs text-gray-500">Press Enter to add a tag.</p>
</template>
<template #field.tags.after>
  <UAlert v-if="tagsCount > 10" color="warning" title="Too many tags?" />
</template>
```

## Per-group slots

For every named group (set via `field.group`), two surrounding slots are available:

| Slot                   | Position                                   |
| ---------------------- | ------------------------------------------ |
| `#group.<name>.before` | Rendered immediately before the group card |
| `#group.<name>.after`  | Rendered immediately after the group card  |

```vue
<!-- Banner above the SEO group card -->
<template #group.seo.before>
  <UAlert color="info" title="These fields are auto-filled if left blank." />
</template>

<!-- Note below the SEO group card -->
<template #group.seo.after>
  <p class="text-xs text-muted">Changes take effect on next publish.</p>
</template>
```

> `group.*` slots are forwarded from `MapoForm → MapoFormTabs` but are **not** passed into `MapoFormGroup` itself — they wrap the group from the outside.

## Per-tab slots

When fields declare a `tab` (see [tabs & nested tabs](./index)), each tab panel exposes slots
addressed by the tab `name`. They work both in a standalone `<MapoForm>` and inside
`<MapoDetail>`, and propagate into **nested** tabs (addressed by their leaf name).

| Slot                 | Position                                                 | Bindings |
| -------------------- | -------------------------------------------------------- | -------- |
| `#tab.<name>.before` | Top of the tab panel, before its groups                  | `tab`    |
| `#tab.<name>.after`  | Bottom of the tab panel, after its groups                | `tab`    |
| `#tab.<name>`        | Replaces the panel's content entirely (default = groups) | `tab`    |
| `#tab.<name>.label`  | The tab button label                                     | `tab`    |
| `#tab-bar-end`       | Extra content appended to the tab bar (actions, badges)  | —        |

```vue
<MapoDetail :fields="fields" …>
  <!-- Intro banner at the top of the "seo" tab -->
  <template #tab.seo.before>
    <UAlert color="info" title="Search-engine metadata" />
  </template>

  <!-- A custom action in the tab bar -->
  <template #tab-bar-end>
    <UButton size="xs" variant="ghost" icon="i-lucide-sparkles">Auto-fill</UButton>
  </template>
</MapoDetail>
```

## Automatic propagation

Slots cascade through the hierarchy `MapoForm → MapoFormTabs → MapoFormGroup → MapoFormField`. You **do not** need to redeclare them at each level — drop them on `<MapoForm>` (or `<MapoDetail>`) and they reach the right field, group, or tab.

The propagation is whitelisted to `field.*`, `group.*`, `tab.*` and `tab-bar-end` slots only, so host slots (`#header`, `#footer`, `#actions`) are never injected into intermediate layers.

## How to: combine slots with `descriptor.is`

For full control over the field component:

```ts
import MyCustomEditor from "~/components/MyCustomEditor.vue";

const fields = [{ key: "body", type: "editor", is: MyCustomEditor }];
```

The custom component receives the standard field props: `modelValue`, `descriptor`, `errors`, `readonly`. See [Custom fields](./custom-fields) for the full interface.

## Pitfalls

- **Slot names use the descriptor `key`, not the label** — always reference `#field.<key>` exactly.
- **Dotted keys** (`'meta.title'`) — Vue treats the dot as part of the slot name. Always use the bracket form: `#[\`field.${'meta.title'}.append\`]`.
- **Slots inside `MapoRepeater` items** — the per-item slots are scoped to the inner sub-form, not the outer one. Pass slots through the repeater item only when you need to.
