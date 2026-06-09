# From JSON Schema to form

`useFormFromSchema` produces an array of `FieldDescriptor` from a JSON Schema (Pydantic v2, DRF-spectacular, hand-written, …). The generated descriptors can be used directly or extended manually.

## TL;DR

```ts
// useFormFromSchema is a Nuxt auto-import — no explicit import needed
const schema = await $fetch("/api/schema/");

const fields = useFormFromSchema(schema, {
  exclude: ["id", "created_at", "updated_at"],
  overrides: {
    body: { type: "editor", translatable: true },
  },
});
```

The returned array is a regular `FieldDescriptor[]` — you can splice, sort, and extend it before handing it to `<MapoForm>`.

---

## How it maps types

| Schema                                          | → FieldType                              |
| ----------------------------------------------- | ---------------------------------------- |
| `type: string`, `format: date`                  | `date`                                   |
| `type: string`, `format: date-time`             | `datetime`                               |
| `type: string`, `format: time`                  | `time`                                   |
| `type: string`, `format: color`                 | `color`                                  |
| `type: string`, `maxLength > 200`               | `textarea`                               |
| `enum: [...]`                                   | `select` (options derived from the enum) |
| `type: integer` / `number`                      | `number`                                 |
| `type: boolean`                                 | `boolean`                                |
| `type: array, items: object`                    | `repeater` (recursive)                   |
| `type: array, items: relation`                  | `m2m`                                    |
| `type: relation`                                | `fks` or `m2m`                           |
| `type: object` with `title + description + url` | `seo`                                    |
| Anything else                                   | `text`                                   |

Properties shaped as `anyOf: [type, null]` (the Pydantic nullable pattern) are unwrapped automatically.

## How to: handle `if/then/else` conditionals

JSON Schema conditionals become reactive `visible()` callbacks:

```json
{
  "if": { "properties": { "type": { "const": "video" } } },
  "then": { "properties": { "url": {} } },
  "else": { "properties": { "content": {} } }
}
```

becomes:

```ts
{ key: 'url',     visible: (ctx) => ctx.model.type === 'video' }
{ key: 'content', visible: (ctx) => ctx.model.type !== 'video' }
```

`allOf[].if` (Pydantic `model_validator`, DRF nested conditionals) and `dependentSchemas` are supported.

## How to: extend the generated array

Generate, then mutate. This is the recommended pattern — it keeps the schema-derived skeleton authoritative while you layer on UI niceties:

```ts
const generated = useFormFromSchema(schema, { exclude: ["id"] });

// 1. Add virtual fields not in the schema
const fields = [
  ...generated,
  {
    key: "blocks",
    type: "repeater",
    fields: [
      /* ... */
    ],
  },
];

// 2. Promote a textarea to a WYSIWYG editor
const body = fields.find((f) => f.key === "body");
if (body) body.type = "editor";

// 3. Reorder
const titleIdx = fields.findIndex((f) => f.key === "title");
fields.unshift(...fields.splice(titleIdx, 1));

// 4. Group
fields.find((f) => f.key === "seo")!.tab = "SEO";
```

## How to: use it with DRF-spectacular

DRF-spectacular emits OpenAPI 3. Point at the JSON Schema embedded in the OpenAPI doc:

```ts
const openApiSchema = await $fetch("/api/schema/?format=json");
const articleSchema = openApiSchema.components.schemas.Article;

const fields = useFormFromSchema(articleSchema, {
  exclude: ["id", "created_at", "updated_at"],
});
```

## How to: use it with Pydantic v2

Pydantic v2 emits `$defs` for nested types. `resolveSchema` follows them automatically (with a cycle guard):

```python
# Django view
from pydantic import BaseModel

class ArticleSchema(BaseModel):
    title: str
    body: str | None = None

# In a DRF view or dedicated endpoint:
return Response(ArticleSchema.model_json_schema())
```

```ts
const schema = await $fetch("/api/article-schema/");
const fields = useFormFromSchema(schema);
```

## How to: override individual fields

Use `overrides` to change a single field's descriptor without rebuilding the array:

```ts
const fields = useFormFromSchema(schema, {
  overrides: {
    body: { type: "editor", translatable: true },
    slug: { validate: (v) => (/\s/.test(String(v)) ? "No spaces" : null) },
    status: {
      attrs: {
        options: [
          { text: "Draft", value: "draft" },
          { text: "Published", value: "published" },
        ],
      },
    },
  },
});
```

`overrides[key]` is shallow-merged onto the generated descriptor. Set `attrs` explicitly if you want to override only some attrs — anything you do not list is preserved.

## How to: skip noisy fields

```ts
const fields = useFormFromSchema(schema, {
  exclude: ["id", "created_at", "updated_at", "created_by", "updated_by"],
});
```

## How to: add a virtual `repeater`

Schemas often hide a `blocks: ARRAY` field behind a polymorphic shape that the generator cannot handle perfectly. Add the repeater manually:

```ts
const fields = [
  ...useFormFromSchema(schema, { exclude: ["blocks"] }),
  {
    key: "blocks",
    type: "repeater",
    label: "Page blocks",
    attrs: {
      templates: {
        hero: [
          { key: "title", type: "text" },
          { key: "image_url", type: "text" },
        ],
        quote: [
          { key: "text", type: "textarea" },
          { key: "author", type: "text" },
        ],
      },
      previewLabel: (item) => `${item._template}: ${item.title ?? ""}`,
    },
  },
];
```

## Pitfalls

- **Cycle-safe but lossy** — `$ref` cycles are caught and trimmed. If two schemas refer to each other, the inner one becomes a `text` placeholder. Add an explicit override.
- **`oneOf` collapses** — the resolver picks the first non-null branch. For discriminated unions, model the schema with `discriminator` so the resolver can keep `oneOf` intact.
- **Dotted paths in errors** — when the schema nests properties under `translations` or `meta`, error keys reach the form as `translations.it.title`. The default error matcher handles this; do not flatten manually.
- **`maxLength > 200` triggers textarea** — if you want a single-line input for long strings, override the type explicitly.
