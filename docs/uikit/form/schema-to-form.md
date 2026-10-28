# JSON Schema and forms

`useFormFromSchema` produces an array of `FieldDescriptor` from a JSON Schema (Pydantic v2, DRF-spectacular, hand-written, …). The generated descriptors can be used directly or extended manually. `fieldsToJsonSchema` goes the other way: it describes a form as a JSON Schema that `useFormFromSchema` reads back into the same descriptors.

## TL;DR

```ts
// Both are Nuxt auto-imports — no explicit import needed
const schema = await $fetch("/api/schema/");

const fields = useFormFromSchema(schema, {
  exclude: ["id", "created_at", "updated_at"],
  overrides: {
    body: { type: "editor", translatable: true },
  },
});

// And back: the form as a JSON Schema
const formSchema = fieldsToJsonSchema(fields);
```

The returned array is a regular `FieldDescriptor[]` — you can splice, sort, and extend it before handing it to `<MapoForm>`.

---

## How it maps types

| Schema                                                                                 | → FieldType                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `x-mapo-field: "<type>"` (checked first)                                               | `<type>`                                                                  |
| `enum: [...]`, or `oneOf` / `anyOf` of `{ const, title }` (any type)                   | `select`, one option per value, labelled by its `title` when there is one |
| `type: string`, `format: textarea`                                                     | `textarea`                                                                |
| `type: string`, `format: date`                                                         | `date`                                                                    |
| `type: string`, `format: date-time`                                                    | `datetime`                                                                |
| `type: string`, `format: time`                                                         | `time`                                                                    |
| `type: string`, `format: color`                                                        | `color`                                                                   |
| `type: string`, `format: email`                                                        | `email`                                                                   |
| `type: string`, `format: uri` (or `url`)                                               | `url`                                                                     |
| `type: string`, `format: binary`                                                       | `file`                                                                    |
| `type: string`, `contentMediaType: text/html`                                          | `editor`                                                                  |
| `type: string`, `maxLength > 255`                                                      | `textarea`                                                                |
| `type: integer` / `number`                                                             | `number`                                                                  |
| `type: boolean`                                                                        | `boolean`                                                                 |
| `type: array, items: relation`                                                         | `m2m`                                                                     |
| `type: array, items: object` (inline, or a `$ref` into `$defs` or `definitions`)       | `repeater` (recursive)                                                    |
| `type: array`, `items` with `oneOf` and `discriminator: { propertyName: "_template" }` | `repeater` with `attrs.templates`, one per branch                         |
| `type: array` of choices (`items` with `enum` or `oneOf` of `const`)                   | `select` with `multiple: true` and the options                            |
| `type: array` of other scalars                                                         | `select` with `multiple: true`, no derived options — set `attrs` yourself |
| `type: relation`                                                                       | `fks` or `m2m`                                                            |
| `type: object` with `title + description` and `url`, `slug` or `permalink`             | `seo`                                                                     |
| `type: object`, any other shape                                                        | `object:<key>`                                                            |
| Anything else                                                                          | `text`                                                                    |

Properties shaped as `anyOf: [type, null]` (the Pydantic nullable pattern) are unwrapped automatically.

Other keywords ride along onto the descriptor rather than choosing a type:

| Keyword                                        | → Descriptor                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                                        | `label`                                                                                                                                                     |
| `required` (on the object)                     | `required: true` on the fields it lists                                                                                                                     |
| `readOnly: true`                               | `readonly: true`, which stops server-computed fields (`id`, `date_created`) from rendering as editable inputs whose values the backend discards             |
| `writeOnly: true`                              | `noDraft: true`: a value the backend never sends back, such as a password, stays out of draft snapshots                                                     |
| `translatable: true`                           | `translatable: true`. Camomilla publishes it on its `OPTIONS` schema for a property that holds one value per language: the field binds to the language tabs |
| `minimum` / `maximum`                          | `attrs.min` / `attrs.max` of `number` and `slider`                                                                                                          |
| `minLength` / `maxLength`                      | `attrs.minLength` / `attrs.maxLength` of `text`, `textarea`, `email` and `url`                                                                              |
| `minItems` / `maxItems`                        | `attrs.minItems` / `attrs.maxItems` of `repeater` and `media-m2m`                                                                                           |
| `endpoint`, `multiple` (with `type: relation`) | `attrs.endpoint`, `attrs.multiple`; a relation also gets `returnObject: true`                                                                               |
| `x-mapo-attrs: { … }`                          | merged into `attrs` last, so its values win                                                                                                                 |

## From DRF metadata and OpenAPI

Two normalizers in `@mapomodule/utils` read what a Django REST Framework backend already publishes, and write the dialect of the tables above, so `useFormFromSchema` turns it into fields:

- `drfMetadataToJsonSchema(metadata, options?)` reads the `OPTIONS` response of an endpoint: DRF's standard metadata, `actions.POST`;
- `openApiToJsonSchema(document, model, options?)` reads a component of an OpenAPI 3 document, such as the one DRF-spectacular serves. `openApiModels(document)` lists the components, each with the endpoint that lists it.

`metadataToJsonSchema(metadata, options?)` reads an `OPTIONS` response either way: the `schema` it publishes, as Camomilla does, otherwise its DRF metadata. It is what `<MapoDetail>` reads with `experimentalFieldsFromSchema` ([Detail page](/uikit/detail#how-to-derive-the-fields-from-the-backend-schema-experimental)).

```ts
import {
  drfMetadataToJsonSchema,
  openApiToJsonSchema,
} from "@mapomodule/utils/jsonSchema";

// DRF metadata, from the endpoint itself
const metadata = await useCrud("/api/events/").options();
const fromMetadata = drfMetadataToJsonSchema(metadata);

// OpenAPI, from the schema endpoint
const document = await $fetch("/api/schema/?format=json");
const fromOpenApi = openApiToJsonSchema(document, "Event");

const fields = fromMetadata ? useFormFromSchema(fromMetadata) : [];
```

Both return `undefined` when there is nothing to read: DRF publishes `actions.POST` only to users who can create, and a document may not have the component.

### DRF metadata

| DRF `type`                    | Schema                                                           | → FieldType                                                |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `string`, `regex`             | `type: string`, with `minLength` / `maxLength`                   | `text` (`textarea` above 255 characters)                   |
| `email`                       | `format: email`                                                  | `email`                                                    |
| `url`                         | `format: uri`                                                    | `url`                                                      |
| `slug`                        | `type: string` with the slug `pattern`                           | `text`                                                     |
| `integer`, `float`, `decimal` | `integer` or `number`, with `minimum` / `maximum`                | `number`                                                   |
| `boolean`                     | `type: boolean`                                                  | `boolean`                                                  |
| `date`, `datetime`, `time`    | `format: date`, `date-time`, `time`                              | `date`, `datetime`, `time`                                 |
| `duration`                    | `format: duration`                                               | `text`                                                     |
| `choice`                      | `oneOf` of `{ const, title }` from `choices`                     | `select` with the labels                                   |
| `multiple choice`             | an array of those choices                                        | `select` with `multiple: true`                             |
| `file upload`, `image upload` | `format: binary`; `accept: "image/*"` for an image               | `file`                                                     |
| `list`                        | an array of its `child`; `min_length` / `max_length` count items | `select` with `multiple: true`, or a `repeater` of objects |
| `nested object`               | an object of its `children`                                      | `object:<key>`                                             |
| `field`, and any other type   | a placeholder, `x-mapo-field: "field:<key>"`                     | `field:<key>`                                              |

`label` becomes `title`, `help_text` `description`, and `read_only` `readOnly`; `required` lists the required fields that are not read-only. `method: "PUT"` reads the update metadata of a detail endpoint instead.

### OpenAPI

- `$ref`s are followed, also through the `allOf: [{ $ref }]` wrapper DRF-spectacular writes around a nullable relation, and the members of an `allOf` composition are merged.
- A property that points to another object component is a relation: `type: relation` with the endpoint that lists that component, read from the document's `paths`; an array of them is an `m2m`. Without an endpoint it becomes a placeholder.
- `nullable: true` becomes a type list, a `decimal` sent as a string a number, and a property with no type, such as a JSON field, a placeholder.
- Labels come from `title`, otherwise from the property name: `published_at` → "Published at".

With DRF-spectacular's `COMPONENT_SPLIT_REQUEST`, read the `…Request` component: it describes what a client sends.

### Placeholders

DRF says `"type": "field"` for relations (`PrimaryKeyRelatedField`, `ManyRelatedField`) and for any field it does not name, without an endpoint or the shape of the value. A text input would send an id, or a list of ids, back as a string. The normalizers write a placeholder type instead, `field:<key>`: the form renders `MapoUnknownField`, which edits the value as JSON, keeps its type, and shows the developer what is left to describe.

Describe a placeholder in one of these ways:

- the `overrides` of `useFormFromSchema` (`schemaFieldOptions` on `<MapoDetail>`): `{ author: { type: "fks", attrs: { endpoint: "/api/users/" } } }`;
- the `property` or `types` option of the normalizer (below);
- `defineFormField("field:author", …)`, a component for that placeholder in every form.

### Customise the reading

Everything the normalizers decide can be changed from outside:

| Option                          | Of                        | What it does                                                                                                                               |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `property(schema, source, key)` | both                      | Rewrites the schema of each field, nested ones included; `undefined` leaves the field out                                                  |
| `types`                         | `drfMetadataToJsonSchema` | The schema of each DRF type, merged over the built-in ones: a type a custom metadata class publishes, or another reading of a built-in one |
| `method`                        | `drfMetadataToJsonSchema` | `"POST"` or `"PUT"`; by default `POST`, then `PUT`                                                                                         |
| `endpoints`                     | `openApiToJsonSchema`     | The endpoint of each component the paths do not tell                                                                                       |
| `schemaFromMetadata`            | `<MapoDetail>`            | Replaces the reading of the `OPTIONS` response, for example with `metadataToJsonSchema` and options                                        |

```ts
const schema = drfMetadataToJsonSchema(metadata, {
  types: {
    // A type your metadata class publishes
    "rich text": () => ({ type: "string", contentMediaType: "text/html" }),
  },
  property: (schema, field, key) =>
    key === "author"
      ? { title: schema.title, type: "relation", endpoint: "/api/users/" }
      : schema,
});
```

## From form to JSON Schema

`fieldsToJsonSchema(fields, options?)` describes a form as a JSON Schema of type `object`: one property per field, named by its key, in the dialect of the tables above. `useFormFromSchema` reads it back into equivalent descriptors. Use it to hand the structure of a form to anything that speaks JSON Schema: a validator, a code generator, an assistant that fills the form, or storage that keeps a form as JSON.

It is a pure function, auto-imported in Nuxt and exported from `mapomodule/types`.

```ts
interface Festival {
  title: string;
  status: string;
  featured: boolean;
  venue: number | null;
}

const fields: FieldDescriptor<Festival>[] = [
  {
    key: "title",
    type: "text",
    label: "Title",
    required: true,
    attrs: { maxLength: 120, placeholder: "Summer festival" },
  },
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
    },
  },
  { key: "featured", type: "switch", label: "Featured" },
  {
    key: "venue",
    type: "fks",
    label: "Venue",
    attrs: { endpoint: "/api/venues/", itemText: "title" },
  },
];

const schema = fieldsToJsonSchema(fields);
```

```json
{
  "type": "object",
  "properties": {
    "title": {
      "title": "Title",
      "type": "string",
      "maxLength": 120,
      "x-mapo-attrs": { "placeholder": "Summer festival" }
    },
    "status": {
      "title": "Status",
      "type": "string",
      "oneOf": [
        { "const": "draft", "title": "Draft" },
        { "const": "published", "title": "Published" }
      ]
    },
    "featured": {
      "title": "Featured",
      "type": "boolean",
      "x-mapo-field": "switch"
    },
    "venue": {
      "title": "Venue",
      "type": "relation",
      "endpoint": "/api/venues/",
      "x-mapo-attrs": { "itemText": "title" }
    }
  },
  "required": ["title"]
}
```

### What the schema holds

| Descriptor                                                                                                                                                                         | Schema                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `key`                                                                                                                                                                              | The property name. A dotted key stays one property (`"seo.title"`)                               |
| `type`                                                                                                                                                                             | The keywords of its value (below), plus `x-mapo-field` when they would read back as another type |
| `label`                                                                                                                                                                            | `title`                                                                                          |
| `required`                                                                                                                                                                         | Listed in `required`                                                                             |
| `readonly`                                                                                                                                                                         | `readOnly: true`                                                                                 |
| `noDraft`                                                                                                                                                                          | `writeOnly: true`                                                                                |
| `translatable`                                                                                                                                                                     | `translatable: true` on the one property, not a `translations` object per language               |
| `fields` of a repeater                                                                                                                                                             | `items`, an object schema                                                                        |
| `attrs` a keyword expresses: `min`, `max`, `minLength`, `maxLength`, `minItems`, `maxItems`, choices, `multiple` of a select, `endpoint` and `multiple` of a relation, `templates` | That keyword                                                                                     |
| Every other attr that JSON can hold (`placeholder`, `rows`, `step`, `itemText`, `returnObject`, the attrs of a custom type…)                                                       | `x-mapo-attrs`                                                                                   |

The schema describes the form, like the schema Camomilla serves on `OPTIONS`, rather than the payload the backend stores: a translatable field is one property flagged `translatable`, and a dotted key is one property named by its path.

These are left out: layout (`tab`, `group`, `subtab`, `cols`, `class`, `expandable`), functions (`visible`, `show`, `validate`, `validateAsync`, `onChange`, `accessor`, attrs such as `previewLabel`), components and class instances (`is`, the editor's Tiptap `extensions`), and `debounce`, `validateAsyncDebounce`, `passthrough`, `synci18n`. Properties declared with [`FieldExtensions`](./custom-fields#add-your-own-descriptor-properties) reach the schema only through the `property` option.

### The value of each type

| Field type                   | Schema                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`                       | `type: string`                                                                                                                                                                                    |
| `textarea`                   | `type: string`, `format: textarea`                                                                                                                                                                |
| `email` / `url`              | `type: string`, `format: email` / `uri`                                                                                                                                                           |
| `number` / `slider`          | `type: number`                                                                                                                                                                                    |
| `boolean` / `switch`         | `type: boolean`                                                                                                                                                                                   |
| `color`                      | `type: string`, `format: color`                                                                                                                                                                   |
| `file`                       | `type: string`, `format: binary`                                                                                                                                                                  |
| `date` / `time` / `datetime` | `type: string`, `format: date` / `time` / `date-time`                                                                                                                                             |
| `editor`                     | `type: string`, `contentMediaType: text/html`                                                                                                                                                     |
| `select`                     | `enum`, or `oneOf` of `{ const, title }` when a label differs from its value or a choice has other properties (in its `x-mapo-attrs`); an `array` of them with `uniqueItems` when `multiple`      |
| `fks` / `m2m`                | `type: relation`, `endpoint`, `multiple: true` for `m2m`                                                                                                                                          |
| `repeater`                   | `type: array`; with templates, `items.oneOf` (one object per template, its `_template` property set to the template key, its label as `title`) and `discriminator: { propertyName: "_template" }` |
| `seo`                        | `type: object` with `title`, `description` and `permalink`                                                                                                                                        |
| `map`                        | `type: object` with `lat` and `lng`                                                                                                                                                               |
| `media` / `enhanced-media`   | `type: object`                                                                                                                                                                                    |
| `media-m2m`                  | `type: array` of objects                                                                                                                                                                          |
| A custom type                | No value keyword, since Mapo does not know its value: `x-mapo-field` names the type                                                                                                               |

### Customise each property

The `property` option is called for every field, those inside repeaters and templates included, with the schema written for it. Return the schema to use, or `undefined` to leave the field out. `x-mapo-field` is decided afterwards, on the schema you return, so a keyword you add cannot change the type that reads back:

```ts
const schema = fieldsToJsonSchema(fields, {
  property: (schema, field) => {
    // Secrets stay out of the schema
    if (field.noDraft) return undefined;
    // `help` is a property of this app, declared with FieldExtensions
    return field.help ? { ...schema, description: field.help } : schema;
  },
});
```

### What comes back

`useFormFromSchema(fieldsToJsonSchema(fields))` gives back descriptors that render the same fields with the same attrs. A few come back in another, equivalent shape:

- choices come back as `attrs.options` (`{ text, value }`, plus their other properties such as `icon`), whatever shape they were given in;
- `required` comes back as `false` rather than missing;
- a registry default can come back explicit: a relation gets `returnObject: true` and an `m2m` `multiple: true`. When your registry defaults `returnObject` to `false`, set it on the descriptor so it travels in the schema;
- a template with nothing but fields comes back as a bare field array.

What the schema leaves out does not come back. Add it again after reading, for example with the `overrides` option of `useFormFromSchema`.

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

DRF-spectacular emits OpenAPI 3. Read the component with `openApiToJsonSchema`, which follows its `$ref`s and finds the endpoints of its relations; `useFormFromSchema` resolves only `$defs`:

```ts
import { openApiToJsonSchema } from "@mapomodule/utils/jsonSchema";

const document = await $fetch("/api/schema/?format=json");
const articleSchema = openApiToJsonSchema(document, "Article");

const fields = articleSchema
  ? useFormFromSchema(articleSchema, {
      exclude: ["id", "created_at", "updated_at"],
    })
  : [];
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
    // camomilla ships `status` as a readOnly string, so the type and the
    // readonly flag both have to be overridden for the options to land
    status: {
      type: "select",
      readonly: false,
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

When the items tell their shape apart by `_template`, as `fieldsToJsonSchema` writes them, the generator builds the templates itself. Schemas often hide a `blocks: ARRAY` field behind another polymorphic shape that the generator cannot handle. Add the repeater manually:

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

- **Cycle-safe but lossy** — a model that contains itself, such as a menu whose items have children, or two models that list each other, expand once: the list that would repeat them becomes a repeater without fields. A `$ref` that points straight back at itself becomes an `object:<key>` field. Add the fields you need with an override. `fieldsToJsonSchema` does the same with a repeater that contains itself.
- **`oneOf` collapses** — the resolver picks the first non-null branch. Two shapes are kept: choices (`oneOf` of `{ const, title }`) and repeater items with a `discriminator` on `_template`. Items told apart by another property are not templates, because the repeater keeps the template key in `_template`: add that repeater manually (above).
- **Mapo's dialect is not plain JSON Schema** — `type: relation` is not a JSON type: Ajv refuses it even with `strict: false`, so rewrite or remove relation properties before validating. In strict mode Ajv also refuses the keywords `translatable`, `x-mapo-field` and `x-mapo-attrs` (declare them with `ajv.addKeyword`) and the formats `textarea`, `color` and `binary` (declare them with `ajv.addFormat`), and `discriminator` needs the `discriminator: true` option.
- **Read only schemas you trust** — `x-mapo-attrs` reaches the field components as attributes. Event handlers (`on…`) and DOM properties such as `innerHTML` are dropped when reading, but a schema still decides how a field looks and behaves.
- **One property per key** — when two fields share a key, for example two versions shown by `visible`, `fieldsToJsonSchema` keeps the first. A repeater with both `fields` and templates keeps its templates.
- **Dotted paths in errors** — when the schema nests properties under `translations` or `meta`, error keys reach the form as `translations.it.title`. The default error matcher handles this; do not flatten manually.
- **`maxLength > 255` triggers textarea** — if you want a single-line input for long strings, override the type explicitly.
