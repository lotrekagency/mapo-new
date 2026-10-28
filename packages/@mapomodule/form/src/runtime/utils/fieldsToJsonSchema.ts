import { ATTRS_KEYWORD, FIELD_KEYWORD } from "@mapomodule/utils";
import type { JSONSchema } from "@mapomodule/utils";
import {
  KEYWORD_ATTRS,
  TEMPLATE_PROPERTY,
  isUnsafeAttr,
  schemaFieldType,
} from "../composables/useFormFromSchema.js";
import type { AnyFieldDescriptor, RepeaterTemplate } from "../types/index.js";

// `any` accepts descriptors typed against any model: the schema reads only
// what a descriptor says about its field, never the model type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Field = AnyFieldDescriptor<any>;

/** Options of {@link fieldsToJsonSchema}. */
export interface FieldsToJsonSchemaOptions {
  /**
   * Called for every field, those of repeaters and templates included, with the
   * schema written for it. Return the schema to use, or `undefined` to leave
   * the field out. This is how a property declared with `FieldExtensions`
   * reaches the schema. `x-mapo-field` is decided afterwards, on the schema
   * returned.
   *
   * @example
   * property: (schema, field) =>
   *   field.help ? { ...schema, description: field.help } : schema
   */
  property?: (
    schema: JSONSchema,
    // The full name, rather than `Field`, is what editors and the MCP show.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    field: AnyFieldDescriptor<any>,
  ) => JSONSchema | undefined;
}

/** What every step of the writing needs. */
interface WriteContext {
  options: FieldsToJsonSchemaOptions;
  /** The repeaters being written, outermost first: one that contains itself stops. */
  path: ReadonlySet<Field>;
}

/** The value of each built-in type that has a fixed shape. */
const VALUE_SCHEMAS: Readonly<Record<string, JSONSchema>> = {
  text: { type: "string" },
  textarea: { type: "string", format: "textarea" },
  email: { type: "string", format: "email" },
  url: { type: "string", format: "uri" },
  number: { type: "number" },
  slider: { type: "number" },
  boolean: { type: "boolean" },
  switch: { type: "boolean" },
  color: { type: "string", format: "color" },
  file: { type: "string", format: "binary" },
  date: { type: "string", format: "date" },
  time: { type: "string", format: "time" },
  datetime: { type: "string", format: "date-time" },
  editor: { type: "string", contentMediaType: "text/html" },
  // What the seo accessor stores.
  seo: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      permalink: { type: "string" },
    },
  },
  map: {
    type: "object",
    properties: { lat: { type: "number" }, lng: { type: "number" } },
  },
  media: { type: "object" },
  "media-m2m": { type: "array", items: { type: "object" } },
  "enhanced-media": {
    type: "object",
    properties: {
      media: { type: "object" },
      alt: { type: "string" },
      caption: { type: "string" },
    },
  },
};

/** Marks a value JSON cannot hold. */
const SKIP = Symbol("skip");

/**
 * A copy of `value` made of JSON only, or {@link SKIP} when it holds a
 * function, a component, a class instance, a cycle or another value JSON
 * cannot hold. Object entries set to `undefined` are dropped, as
 * `JSON.stringify` does.
 */
function toPlain(value: unknown, ancestors: Set<object> = new Set()): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : SKIP;
    case "object": {
      if (ancestors.has(value)) return SKIP;
      ancestors.add(value);
      const plain = toPlainObject(value, ancestors);
      ancestors.delete(value);
      return plain;
    }
    default:
      return SKIP;
  }
}

function toPlainObject(value: object, ancestors: Set<object>): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => toPlain(item, ancestors));
    return items.includes(SKIP) ? SKIP : items;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return SKIP;
  const entries: [string, unknown][] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    const plain = toPlain(entry, ancestors);
    if (plain === SKIP) return SKIP;
    entries.push([key, plain]);
  }
  return Object.fromEntries(entries);
}

/**
 * The entries of `record` that JSON can hold, each copied with {@link toPlain};
 * the others, and the names {@link isUnsafeAttr} rejects, are left out one by
 * one. `undefined` when none is left.
 */
function plainEntries(
  record: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(record)
    .filter(([key]) => !isUnsafeAttr(key))
    .map(([key, value]): [string, unknown] => [key, toPlain(value)])
    .filter(([, value]) => value !== SKIP);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Removes `name` from `attrs` and returns its value. */
function take(attrs: Record<string, unknown>, name: string): unknown {
  const value = attrs[name];
  delete attrs[name];
  return value;
}

/** The JSON type every choice value shares, if any. */
function sharedType(values: unknown[]): string | undefined {
  const types = new Set(
    values.map((value) => (value === null ? "null" : typeof value)),
  );
  const [only] = [...types];
  const isShared = types.size === 1;
  if (!isShared) return undefined;
  return only === "string" || only === "number" || only === "boolean"
    ? only
    : undefined;
}

interface Choice {
  value: unknown;
  label: string;
  /** The other properties of the choice, such as `icon` or `disabled`. */
  extras?: Record<string, unknown>;
}

/** One choice of a select, read as the select reads it: `text` before `label`. */
function toChoice(item: unknown): Choice {
  if (typeof item !== "object" || item === null)
    return { value: item, label: String(item) };
  const { text, label, value, ...rest } = item as Record<string, unknown>;
  return {
    value: toPlain(value),
    label: String(text ?? label ?? value),
    extras: plainEntries(rest),
  };
}

/**
 * The choices of a select, from `attrs.items` (strings or `{ label, value }`)
 * or `attrs.options` (`{ text, value }`): an `enum`, or `oneOf` of
 * `{ const, title }` when a label differs from its value or a choice has other
 * properties. A choice whose value JSON cannot hold is left out.
 */
function choicesSchema(list: unknown): JSONSchema {
  if (!Array.isArray(list)) return {};
  const choices = list.map(toChoice).filter((choice) => choice.value !== SKIP);
  if (choices.length === 0) return {};
  const values = choices.map((choice) => choice.value);
  const type = sharedType(values);
  const isLabeled = choices.some(
    (choice) => choice.label !== String(choice.value) || choice.extras,
  );
  return {
    ...(type ? { type } : {}),
    ...(isLabeled
      ? {
          oneOf: choices.map((choice) => ({
            const: choice.value,
            title: choice.label,
            ...(choice.extras ? { [ATTRS_KEYWORD]: choice.extras } : {}),
          })),
        }
      : { enum: values }),
  };
}

function selectSchema(attrs: Record<string, unknown>): JSONSchema {
  // The select shows `items` when it has both.
  const items = take(attrs, "items");
  const options = take(attrs, "options");
  const choices = choicesSchema(items ?? options);
  const isMultiple = take(attrs, "multiple") === true;
  return isMultiple
    ? { type: "array", items: choices, uniqueItems: true }
    : choices;
}

function relationSchema(
  type: string,
  attrs: Record<string, unknown>,
): JSONSchema {
  const endpoint = take(attrs, "endpoint");
  const isMultiple = take(attrs, "multiple") === true || type === "m2m";
  return {
    type: "relation",
    ...(typeof endpoint === "string" ? { endpoint } : {}),
    ...(isMultiple ? { multiple: true } : {}),
  };
}

function templateSchema(
  key: string,
  template: AnyFieldDescriptor[] | RepeaterTemplate,
  ctx: WriteContext,
): JSONSchema {
  const normalized: RepeaterTemplate = Array.isArray(template)
    ? { fields: template }
    : template;
  const { fields, label, description, ...presentation } = normalized;
  const body = objectSchema(fields, ctx);
  // Icon, image, wireframe and category: no keyword expresses them.
  const own = plainEntries(presentation);
  return {
    type: "object",
    ...(label ? { title: label } : {}),
    ...(description ? { description } : {}),
    properties: {
      [TEMPLATE_PROPERTY]: { const: key },
      ...body.properties,
    },
    required: [TEMPLATE_PROPERTY, ...(body.required ?? [])],
    ...(own ? { [ATTRS_KEYWORD]: own } : {}),
  };
}

function repeaterSchema(
  field: Field,
  attrs: Record<string, unknown>,
  ctx: WriteContext,
): JSONSchema {
  const templates = take(attrs, "templates") as
    | Record<string, AnyFieldDescriptor[] | RepeaterTemplate>
    | undefined;
  // A repeater that contains itself is written once: inside, its items are empty.
  if (ctx.path.has(field)) {
    return { type: "array", items: { type: "object", properties: {} } };
  }
  const inner: WriteContext = { ...ctx, path: new Set([...ctx.path, field]) };
  const hasTemplates = !!templates && Object.keys(templates).length > 0;
  if (!hasTemplates) {
    const fields = (field as { fields?: Field[] }).fields ?? [];
    return { type: "array", items: objectSchema(fields, inner) };
  }
  return {
    type: "array",
    items: {
      oneOf: Object.entries(templates).map(([key, template]) =>
        templateSchema(key, template, inner),
      ),
      discriminator: { propertyName: TEMPLATE_PROPERTY },
    },
  };
}

/** The keywords of the value, removing from `attrs` those they express. */
function valueSchema(
  field: Field,
  attrs: Record<string, unknown>,
  ctx: WriteContext,
): JSONSchema {
  const type = String(field.type);
  const keywords: JSONSchema = {};
  for (const [attr, keyword] of Object.entries(KEYWORD_ATTRS[type] ?? {})) {
    const value = toPlain(take(attrs, attr));
    if (value !== SKIP) keywords[keyword] = value;
  }

  let schema: JSONSchema;
  if (type === "select") schema = selectSchema(attrs);
  else if (type === "fks" || type === "m2m")
    schema = relationSchema(type, attrs);
  else if (type === "repeater") schema = repeaterSchema(field, attrs, ctx);
  else if (VALUE_SCHEMAS[type]) schema = structuredClone(VALUE_SCHEMAS[type]);
  // A generic object read from a schema keeps its shape.
  else if (type.startsWith("object:")) schema = { type: "object" };
  // A custom type: Mapo does not know its value.
  else schema = {};

  return { ...schema, ...keywords };
}

function fieldSchema(field: Field, ctx: WriteContext): JSONSchema {
  // A copy: `valueSchema` removes the attrs it turns into keywords.
  const attrs = {
    ...((field as { attrs?: Record<string, unknown> }).attrs ?? {}),
  };

  const schema: JSONSchema = {
    ...(field.label ? { title: field.label } : {}),
    ...valueSchema(field, attrs, ctx),
    ...(field.readonly ? { readOnly: true } : {}),
    // A field kept out of drafts holds a secret, such as a password: JSON
    // Schema marks a value the backend never sends back as writeOnly.
    ...(field.noDraft ? { writeOnly: true } : {}),
    ...(field.translatable ? { translatable: true } : {}),
  };

  const rest = plainEntries(attrs);
  if (rest) schema[ATTRS_KEYWORD] = rest;
  return schema;
}

/**
 * Names the type with `x-mapo-field` when the other keywords would read back
 * as another one, unless the schema already names one.
 */
function markType(schema: JSONSchema, field: Field): JSONSchema {
  const type = String(field.type);
  const isMarked = schema[FIELD_KEYWORD] !== undefined;
  if (isMarked) return schema;
  const readsBackAs = schemaFieldType(schema, String(field.key));
  return readsBackAs === type ? schema : { ...schema, [FIELD_KEYWORD]: type };
}

function objectSchema(fields: readonly Field[], ctx: WriteContext): JSONSchema {
  const properties: [string, JSONSchema][] = [];
  const required: string[] = [];
  const written = new Set<string>();

  for (const field of fields) {
    const key = String(field.key);
    // One property per key: the first field written with that key wins.
    if (written.has(key)) continue;

    const schema = fieldSchema(field, ctx);
    const final = ctx.options.property
      ? ctx.options.property(schema, field)
      : schema;
    if (!final) continue;

    written.add(key);
    properties.push([key, markType(final, field)]);
    if (field.required) required.push(key);
  }

  return {
    type: "object",
    properties: Object.fromEntries(properties),
    ...(required.length ? { required } : {}),
  };
}

/**
 * Describes a form as a JSON Schema: one property per field, named by the
 * field key, in the dialect `useFormFromSchema()` reads. The schema reads back
 * into equivalent descriptors.
 *
 * Each property carries the field's type, label, required, readonly,
 * translatable and `noDraft` flags, and its `attrs`: as standard keywords
 * (`minimum`, `maxLength`, `enum`…) where one exists, in `x-mapo-attrs`
 * otherwise. Layout (`tab`, `group`, `cols`…), functions (`visible`,
 * `validate`…) and components (`is`) are not written.
 *
 * @param fields  The descriptors, as passed to `MapoForm`.
 * @param options `property` customises the schema of each field.
 * @returns A JSON Schema of type `object`.
 *
 * @example
 * const schema = fieldsToJsonSchema(fields);
 * const same = useFormFromSchema(schema); // equivalent descriptors
 */
export function fieldsToJsonSchema(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: readonly AnyFieldDescriptor<any>[],
  options: FieldsToJsonSchemaOptions = {},
): JSONSchema {
  return objectSchema(fields, { options, path: new Set() });
}
