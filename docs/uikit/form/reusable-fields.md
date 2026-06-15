# Reusable Field Sets

Large forms often share groups of fields across multiple pages or models — SEO fields, address blocks, publishing controls. Instead of duplicating descriptors, extract them into a typed constant or factory function.

---

## Pattern 1 — Typed constant (single model)

When the field set is always used with the same model, a typed constant is the simplest approach:

```ts
// composables/useArticleFields.ts
import type { FieldDescriptor } from "mapomodule/types";
import type { Article } from "~/types/api";

export const seoFields: FieldDescriptor<Article>[] = [
  { key: "seo_title", type: "text", label: "SEO Title", tab: "seo", cols: 12 },
  {
    key: "seo_description",
    type: "textarea",
    label: "SEO Description",
    tab: "seo",
    cols: 12,
  },
  { key: "og_image", type: "file", label: "OG Image", tab: "seo", cols: 12 },
];

export const publishingFields: FieldDescriptor<Article>[] = [
  {
    key: "published_at",
    type: "datetime",
    label: "Publish date",
    group: "publishing",
    cols: 6,
  },
  {
    key: "is_draft",
    type: "switch",
    label: "Draft",
    group: "publishing",
    cols: 6,
  },
];
```

```vue
<script setup lang="ts">
import { seoFields, publishingFields } from "~/composables/useArticleFields";
import type { FieldDescriptor } from "mapomodule/types";
import type { Article } from "~/types/api";

const fields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", label: "Title", tab: "content" },
  { key: "body", type: "editor", label: "Body", tab: "content" },
  ...seoFields,
  ...publishingFields,
];
</script>
```

TypeScript verifies that every `key` in both arrays exists on `Article`. Spread preserves the type — the result is still `FieldDescriptor<Article>[]`.

---

## Pattern 2 — Generic factory (cross-model reuse)

When the same field set can apply to different models (e.g., any model that has SEO fields), use a generic factory:

```ts
// composables/fieldFactories.ts
import type { FieldDescriptor } from "mapomodule/types";

export function createSeoFields<T>(): FieldDescriptor<T>[] {
  return [
    {
      key: "seo_title" as keyof T & string,
      type: "text",
      label: "SEO Title",
      tab: "seo",
      cols: 12,
    },
    {
      key: "seo_description" as keyof T & string,
      type: "textarea",
      label: "SEO Description",
      tab: "seo",
      cols: 12,
    },
    {
      key: "og_image" as keyof T & string,
      type: "file",
      label: "OG Image",
      tab: "seo",
      cols: 12,
    },
  ];
}

export function createAddressFields<T>(group?: string): FieldDescriptor<T>[] {
  return [
    {
      key: "address" as keyof T & string,
      type: "text",
      label: "Address",
      group,
      cols: 12,
    },
    {
      key: "city" as keyof T & string,
      type: "text",
      label: "City",
      group,
      cols: 6,
    },
    {
      key: "country" as keyof T & string,
      type: "text",
      label: "Country",
      group,
      cols: 6,
    },
  ];
}
```

Usage — TypeScript infers `T` from context:

```ts
const fields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", label: "Title" },
  ...createSeoFields<Article>(),
  ...createAddressFields<Article>("billing"),
];
```

> **Why `as keyof T & string`?** The factory can't know which keys `T` actually has at compile time when the keys are string literals not derived from `T`. The cast is intentional and safe here — the goal is to let callers compose field sets fluently without losing the outer `T` on the result type. If you need full key-safety inside the factory, use Pattern 1 (typed constant) instead.

---

## Pattern 3 — Scoped factory with overrides

For maximum flexibility, accept a partial override per field:

```ts
import type { FieldDescriptor } from "mapomodule/types";

export function createPublishingFields<T>(
  overrides: Partial<FieldDescriptor<T>> = {},
): FieldDescriptor<T>[] {
  return [
    {
      key: "published_at" as keyof T & string,
      type: "datetime",
      label: "Publish date",
      group: "publishing",
      cols: 6,
      ...overrides,
    },
    {
      key: "is_draft" as keyof T & string,
      type: "switch",
      label: "Draft",
      group: "publishing",
      cols: 6,
      ...overrides,
    },
  ];
}
```

```ts
// All fields in "sidebar" group instead of "publishing"
...createPublishingFields<Article>({ group: 'sidebar' })
```

---

## Combining field sets in a real form

```ts
const fields: FieldDescriptor<Article>[] = [
  // Content tab
  {
    key: "title",
    type: "text",
    label: "Title",
    tab: "content",
    required: true,
  },
  { key: "body", type: "editor", label: "Body", tab: "content" },

  // SEO tab (shared factory)
  ...createSeoFields<Article>(),

  // Publishing sidebar (shared factory, group override)
  ...createPublishingFields<Article>({ tab: "content" }),
];
```

---

## Import reference

```ts
// Recommended: meta-package aggregator
import type { FieldDescriptor } from "mapomodule/types";

// Alternative: package-specific path (useful when building a standalone plugin)
import type { FieldDescriptor } from "@mapomodule/form/types";
```

The `@mapomodule/form/types` subpath re-exports every public type from the form package including `FieldDescriptor<T>`, `RepeaterDescriptor<T>`, `SelectDescriptor<T>`, `FieldRegistry`, and more. See the [Form API reference](./api) for the full list.

---

## What goes in a field set

A field set constant or factory should only contain the descriptor data — no Vue component logic, no side effects. Think of it as a serializable configuration object.

| ✅ Put in a field set                       | ❌ Do not put in a field set       |
| ------------------------------------------- | ---------------------------------- |
| `key`, `type`, `label`, `tab`, `group`      | Vue `ref()` or `reactive()` calls  |
| `attrs`, `cols`, `required`, `translatable` | Composable calls (`useCrud`, etc.) |
| `validate` function (pure, no side effects) | Template refs or DOM access        |
| `showWhen` condition (pure)                 | Dynamic data from `$fetch`         |

For dynamic `attrs` (e.g., options loaded from an API), keep the descriptor static and fetch the data separately:

```ts
// ✅ Correct: descriptor is static; options are fetched outside
const { data: categories } = await useFetch("/api/categories/");
const fields: FieldDescriptor<Article>[] = [
  {
    key: "category",
    type: "fks",
    label: "Category",
    attrs: {
      endpoint: "/api/categories/",
      itemText: "name",
      returnObject: true,
    },
  },
];
```
