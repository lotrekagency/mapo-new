# Advanced form patterns

Deeper recipes: repeater fields, client-side validation, headless `useMapoForm()`, and form-from-JSON-schema.

## Injecting content around fields and groups

### `field.{key}.before` / `field.{key}.after`

Inject content inside a field's grid column, above or below the widget:

```vue
<MapoForm v-model="article" :fields="fields">
  <!-- Contextual tip above the excerpt textarea -->
  <template #field.excerpt.before>
    <p class="text-xs text-muted mb-1">Keep under 160 characters for SEO.</p>
  </template>

  <!-- Live character count below the excerpt textarea -->
  <template #field.excerpt.after="{ model }">
    <p
      class="mt-1 text-right text-xs"
      :class="(model?.excerpt?.length ?? 0) > 160 ? 'text-error' : 'text-muted'"
    >
      {{ model?.excerpt?.length ?? 0 }} / 160
    </p>
  </template>
</MapoForm>
```

The `before`/`after` slots receive the same `{ field, model, currentLang }` bindings as the main `field.{key}` slot.

### `group.{name}.before` / `group.{name}.after`

Wrap an entire named group card with contextual content. Groups are set via `field.group`:

```ts
const fields: FieldDescriptor[] = [
  {
    key: "published_at",
    type: "datetime",
    label: "Published at",
    group: "publishing",
  },
  { key: "is_draft", type: "switch", label: "Draft", group: "publishing" },
];
```

```vue
<MapoForm v-model="model" :fields="fields">
  <!-- Banner above the "publishing" group card -->
  <template #group.publishing.before>
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-calendar"
      title="Scheduling"
      description="Leave the date empty to save as draft without auto-publishing."
    />
  </template>
</MapoForm>
```

These slots are rendered at the `MapoFormTabs` / `MapoForm` level and wrap the group card from the outside — they are **not** forwarded into `MapoFormGroup` itself.

When used inside `<MapoDetail>`, both `field.*` and `group.*` slots are forwarded automatically to all inner `<MapoForm>` instances (main body and sidebar).

---

## Repeater field

A repeater renders a list of items, each with their own nested fields. Items can be reordered via drag-and-drop.

### Simple repeater (single type)

```ts
const fields: FieldDescriptor[] = [
  {
    key: "sections",
    type: "repeater",
    label: "Page sections",
    fields: [
      // nested fields for each item
      { key: "heading", type: "text", label: "Heading" },
      { key: "body", type: "textarea", label: "Body" },
    ],
    attrs: {
      previewLabel: (item: any) => item?.heading || "(empty section)",
      confirmDelete: true,
      allowDuplicate: true,
    },
  },
];
```

### Multi-template repeater (block editor)

Use `templates` to let the user choose a block type on creation:

```ts
{
  key: "blocks",
  type: "repeater",
  label: "Content blocks",
  attrs: {
    templates: {
      text: [
        { key: "heading", type: "text",   label: "Heading" },
        { key: "body",    type: "editor", label: "Text" },
      ],
      image: [
        { key: "caption",   type: "text", label: "Caption" },
        { key: "image_url", type: "file", label: "Image" },
      ],
      quote: [
        { key: "quote",  type: "textarea", label: "Quote text" },
        { key: "author", type: "text",     label: "Author" },
      ],
    },
    previewLabel: (item: any) => item?.heading || item?.quote || `(${item?._template})`,
    confirmDelete: true,   // confirm dialog before removing an item
    allowDuplicate: true,  // clone button on each item
  },
}
```

The chosen template name is stored in `item._template`. On backend, serialize this as a polymorphic JSON field.

### Repeater attrs reference

| Attr             | Type                                | Description                              |
| ---------------- | ----------------------------------- | ---------------------------------------- |
| `fields`         | `FieldDescriptor[]`                 | Fields for every item (simple mode)      |
| `templates`      | `Record<string, FieldDescriptor[]>` | Per-type fields (block editor mode)      |
| `previewLabel`   | `(item) => string`                  | Label shown in the collapsed item header |
| `confirmDelete`  | `boolean`                           | Show confirm dialog before removal       |
| `allowDuplicate` | `boolean`                           | Show a "clone" button per item           |

## Client-side validation

Add a `validate` function to any field descriptor. Return a string for an error, `null` for valid.

```ts
const fields: FieldDescriptor[] = [
  {
    key: "title",
    type: "text",
    required: true, // shorthand: fails on empty value
  },
  {
    key: "slug",
    type: "text",
    validate: (v) => {
      if (/\s/.test(String(v))) return "No spaces allowed";
      if (!/^[a-z0-9-]+$/.test(String(v)))
        return "Lowercase, digits and dashes only";
      return null;
    },
  },
  {
    key: "end_date",
    type: "date",
    validate: (v, ctx) => {
      // ctx.model = full form model
      if (v && ctx.model.start_date && v < ctx.model.start_date) {
        return "End date must be after start date";
      }
      return null;
    },
  },
];
```

### Async validation (e.g. slug uniqueness)

```ts
{
  key: "slug",
  type: "text",
  validateAsync: async (value, ctx) => {
    if (!value) return null
    const { available } = await $fetch("/api/check-slug", {
      params: { slug: value, exclude: ctx.model.id },
    })
    return available ? null : "Slug already in use"
  },
  validateAsyncDebounce: 600,   // ms, default 600
}
```

A spinner appears next to the label while the check is running. Results are cached per value.

> **Note:** `validateAsync` is advisory — it does not block `form.submit()`. If you need to prevent save while the check is pending, gate manually:
>
> ```ts
> async function save() {
>   if (form.isAsyncValidating?.value) {
>     snack.show("Wait for validation to finish", "warning");
>     return;
>   }
>   await form.submit(handler);
> }
> ```

### Trigger validation manually

```ts
const { valid, errors } = form.validateClient();
if (!valid) return; // errors are now in the form state
```

`form.submit(handler)` already calls this internally — skip it when using `submit()`.

## Headless form with `useMapoForm()`

Use `useMapoForm()` when you need a custom layout but still want the form's state management (dirty tracking, differential patch, validation, debounce).

```vue
<script setup lang="ts">
const model = ref({ username: "", email: "", role: "editor", notify: true });
const errors = ref<Record<string, string[]>>({});
const { $mapoFormRegistry } = useNuxtApp();

const fields = ref([
  {
    key: "username",
    type: "text" as const,
    label: "Username",
    required: true,
    validate: (v: unknown) =>
      String(v).length >= 3 ? null : "At least 3 characters",
  },
  {
    key: "email",
    type: "text" as const,
    label: "Email",
    required: true,
    validate: (v: unknown) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? null : "Invalid email",
  },
  {
    key: "role",
    type: "select" as const,
    label: "Role",
    attrs: {
      options: [
        { text: "Admin", value: "admin" },
        { text: "Editor", value: "editor" },
        { text: "Viewer", value: "viewer" },
      ],
    },
  },
  { key: "notify", type: "switch" as const, label: "Email notifications" },
]);

const form = useMapoForm({
  model,
  fields,
  errors,
  registry: $mapoFormRegistry,
  immediate: true, // start dirty tracking immediately (not just after first change)
});

const snack = useSnackStore();

async function save() {
  await form.submit(async (patch) => {
    // `patch` contains only the changed fields (differential PATCH)
    await $fetch("/api/users/me/", { method: "PATCH", body: patch });
    snack.show("Profile saved.", "success");
  });
}
</script>

<template>
  <!-- Custom 2-column layout — no <MapoForm> wrapper -->
  <div class="p-6 max-w-lg">
    <h1 class="text-xl font-semibold mb-6">Edit profile</h1>

    <div class="grid grid-cols-2 gap-4 rounded-xl border border-default p-6">
      <div class="col-span-2">
        <MapoFormField :descriptor="fields[0]" />
      </div>
      <div class="col-span-2">
        <MapoFormField :descriptor="fields[1]" />
      </div>
      <div>
        <MapoFormField :descriptor="fields[2]" />
      </div>
      <div class="flex items-end pb-1">
        <MapoFormField :descriptor="fields[3]" />
      </div>
    </div>

    <div class="flex items-center justify-between mt-4">
      <div class="text-sm text-muted">
        <UBadge
          v-if="form.isDirty.value"
          color="warning"
          variant="soft"
          size="xs"
        >
          Unsaved changes
        </UBadge>
      </div>
      <UButton :loading="form.isLoading.value" @click="save">Save</UButton>
    </div>
  </div>
</template>
```

### `useMapoForm()` API

| Property / method       | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `form.isDirty`          | `Ref<boolean>` — true if model differs from initial snapshot             |
| `form.isLoading`        | `Ref<boolean>` — true while `submit()` handler is running                |
| `form.getPatch()`       | Returns only the fields that changed (for differential PATCH)            |
| `form.validateClient()` | Runs all sync validators, returns `{ valid, errors }`                    |
| `form.submit(handler)`  | Validates → sets `isLoading` → calls handler with patch → `resetDirty()` |
| `form.resetDirty()`     | Updates the snapshot — marks current state as "clean"                    |

## Form from JSON Schema

Generate `FieldDescriptor[]` automatically from a Pydantic or DRF schema:

```ts
import { useFormFromSchema } from "@mapomodule/form/types";

// Fetch the schema from your backend
const schema = await $fetch("/api/articles/schema/");

// Convert to FieldDescriptor[] automatically
const { fields, model } = useFormFromSchema(schema);
```

The generated fields use the closest matching type:

| Schema type                    | Generated field type |
| ------------------------------ | -------------------- |
| `string`                       | `text`               |
| `string` + `format: date-time` | `datetime`           |
| `string` + `enum`              | `select`             |
| `boolean`                      | `switch`             |
| `number` / `integer`           | `number`             |
| `array`                        | `repeater`           |
| `object`                       | nested `repeater`    |

Override specific fields after generation:

```ts
const { fields, model } = useFormFromSchema(schema);

// Find and override the body field to use the WYSIWYG editor
const bodyField = fields.value.find((f) => f.key === "body");
if (bodyField) bodyField.type = "editor";
```

→ Full reference: [From JSON Schema to form](/uikit/form/schema-to-form)

## Adding a custom field type globally

Register a custom Vue component as a new field type via a Nuxt plugin:

```ts
// plugins/my-fields.ts
import { defineFormField } from "@mapomodule/form/types";
import MyColorPickerField from "~/components/fields/MyColorPickerField.vue";

export default defineNuxtPlugin(() => {
  defineFormField("color-picker", MyColorPickerField, {
    // Optional default attrs merged with descriptor.attrs
    attrs: { format: "hex" },
  });
});
```

Use it in any form:

```ts
{ key: "brand_color", type: "color-picker", label: "Brand color" }
```

Unknown types show a yellow placeholder in development — so typos are immediately visible.

## Hierarchical field authoring with `flattenFieldGroups`

When a form has many fields, repeating `group: 'seo'` or `tab: 'content'` on every descriptor becomes noisy. `flattenFieldGroups` lets you author descriptors as a nested tree and flattens them into the `FieldDescriptor[]` array the form engine expects.

```ts
import { flattenFieldGroups } from "@mapomodule/form/types";
import type {
  FieldGroupDescriptor,
  FieldDescriptor,
} from "@mapomodule/form/types";
import type { Article } from "~/types/api";

const fields: FieldDescriptor<Article>[] = flattenFieldGroups<Article>([
  // Flat descriptors pass through unchanged
  {
    key: "title",
    type: "text",
    label: "Title",
    tab: "content",
    required: true,
  },
  { key: "body", type: "editor", label: "Body", tab: "content" },

  // FieldGroupDescriptor — group and tab are propagated to all children
  {
    group: "seo",
    tab: "seo",
    fields: [
      { key: "seo_title", type: "text", label: "SEO Title" },
      { key: "seo_description", type: "textarea", label: "SEO Description" },
      { key: "og_image", type: "file", label: "OG Image" },
    ],
  },

  // Nested groups: the outer tab propagates inward
  {
    group: "publishing",
    tab: "content",
    fields: [
      { key: "published_at", type: "datetime", label: "Publish date", cols: 6 },
      { key: "is_draft", type: "switch", label: "Draft", cols: 6 },
    ],
  },
]);
```

**Propagation rules:**

- A field already declaring `group` keeps its own value — the parent's `group` is not applied.
- Same for `tab`: a field's explicit `tab` wins over the parent's.
- Groups can be arbitrarily nested; the function recurses until every item is a leaf `FieldDescriptor`.

### `FieldGroupDescriptor` shape

```ts
interface FieldGroupDescriptor<T = Record<string, unknown>> {
  group: string;
  tab?: string | string[]; // propagated to children that don't have their own tab
  fields: Array<FieldDescriptor<T> | FieldGroupDescriptor<T>>;
}
```

### Import

```ts
import { flattenFieldGroups } from "@mapomodule/form/types";
import type { FieldGroupDescriptor } from "@mapomodule/form/types";
// or via the meta-package
import { flattenFieldGroups } from "mapomodule/types";
```

→ See also: [Standalone form](./form-standalone), [Custom fields reference](/uikit/form/custom-fields), [Registry reference](/uikit/form/registry)
