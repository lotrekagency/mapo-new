import { ATTRS_KEYWORD, FIELD_KEYWORD, placeholderType } from "./dialect.js";
import type { JSONSchema } from "./types.js";

/**
 * One field of the metadata Django REST Framework serves on `OPTIONS`
 * (`SimpleMetadata`), under `actions.POST` or `actions.PUT`.
 */
export interface DrfFieldInfo {
  /** DRF's name for the serializer field: `string`, `choice`, `field`… */
  type: string;
  required?: boolean;
  read_only?: boolean;
  label?: string;
  help_text?: string;
  min_length?: number;
  max_length?: number;
  min_value?: number | string;
  max_value?: number | string;
  max_digits?: number;
  decimal_places?: number;
  /** The choices of a `choice` or `multiple choice` field. */
  choices?: Array<{ value: unknown; display_name?: string }>;
  /** The item of a `list`. */
  child?: DrfFieldInfo;
  /** The fields of a `nested object`. */
  children?: Record<string, DrfFieldInfo>;
  [key: string]: unknown;
}

/** Writes the keywords of the value of a DRF field. */
export type DrfTypeSchema = (field: DrfFieldInfo, key: string) => JSONSchema;

/** Options of {@link drfMetadataToJsonSchema} and {@link metadataToJsonSchema}. */
export interface DrfMetadataOptions {
  /** The action whose fields to read. Default: `"POST"`, then `"PUT"`. */
  method?: "POST" | "PUT";
  /**
   * The schema of each DRF type, merged over the built-in ones: add a type
   * that a custom metadata class publishes, or change how a built-in one is
   * read. The key is DRF's `type`, such as `"field"` or `"decimal"`.
   */
  types?: Record<string, DrfTypeSchema>;
  /**
   * Called for every field, those of nested objects included, with the schema
   * written for it. Return the schema to use, or `undefined` to leave the
   * field out.
   */
  property?: (
    schema: JSONSchema,
    field: DrfFieldInfo,
    key: string,
  ) => JSONSchema | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldInfo(value: unknown): value is DrfFieldInfo {
  return isRecord(value) && typeof value.type === "string";
}

/** A number, also from the string DRF sends for a decimal limit. */
function toNumber(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number)
    ? number
    : undefined;
}

function stringLimits(field: DrfFieldInfo): JSONSchema {
  return {
    ...(toNumber(field.min_length) !== undefined
      ? { minLength: toNumber(field.min_length) }
      : {}),
    ...(toNumber(field.max_length) !== undefined
      ? { maxLength: toNumber(field.max_length) }
      : {}),
  };
}

function numberLimits(field: DrfFieldInfo): JSONSchema {
  return {
    ...(toNumber(field.min_value) !== undefined
      ? { minimum: toNumber(field.min_value) }
      : {}),
    ...(toNumber(field.max_value) !== undefined
      ? { maximum: toNumber(field.max_value) }
      : {}),
  };
}

/** The JSON type every value shares, if any. */
function sharedType(values: unknown[]): string | undefined {
  const types = new Set(values.map((value) => typeof value));
  const [only] = [...types];
  const isShared = types.size === 1;
  if (!isShared) return undefined;
  return only === "string" || only === "number" || only === "boolean"
    ? only
    : undefined;
}

/** DRF choices: an `enum`, or `oneOf` of `{ const, title }` when a label differs. */
function choiceSchema(field: DrfFieldInfo): JSONSchema {
  const choices = Array.isArray(field.choices)
    ? field.choices.filter(isRecord)
    : [];
  if (choices.length === 0) return {};
  const values = choices.map((choice) => choice.value);
  const type = sharedType(values);
  const labels = choices.map((choice) =>
    String(choice.display_name ?? choice.value),
  );
  const isLabeled = labels.some(
    (label, index) => label !== String(values[index]),
  );
  return {
    ...(type ? { type } : {}),
    ...(isLabeled
      ? {
          oneOf: choices.map((choice, index) => ({
            const: choice.value,
            title: labels[index],
          })),
        }
      : { enum: values }),
  };
}

/** A value Mapo cannot describe: a placeholder type, edited as JSON until replaced. */
const placeholder: DrfTypeSchema = (_field, key) => ({
  [FIELD_KEYWORD]: placeholderType(key),
});

/** DRF's `type`, as `SimpleMetadata` names the serializer fields, to JSON Schema. */
const BUILT_IN_TYPES: Readonly<Record<string, DrfTypeSchema>> = {
  string: (field) => ({ type: "string", ...stringLimits(field) }),
  email: (field) => ({
    type: "string",
    format: "email",
    ...stringLimits(field),
  }),
  url: (field) => ({ type: "string", format: "uri", ...stringLimits(field) }),
  slug: (field) => ({
    type: "string",
    pattern: "^[-a-zA-Z0-9_]+$",
    ...stringLimits(field),
  }),
  regex: (field) => ({ type: "string", ...stringLimits(field) }),
  integer: (field) => ({ type: "integer", ...numberLimits(field) }),
  float: (field) => ({ type: "number", ...numberLimits(field) }),
  decimal: (field) => ({ type: "number", ...numberLimits(field) }),
  boolean: () => ({ type: "boolean" }),
  date: () => ({ type: "string", format: "date" }),
  datetime: () => ({ type: "string", format: "date-time" }),
  time: () => ({ type: "string", format: "time" }),
  duration: () => ({ type: "string", format: "duration" }),
  choice: (field) => choiceSchema(field),
  "multiple choice": (field) => ({
    type: "array",
    items: choiceSchema(field),
    uniqueItems: true,
  }),
  "file upload": () => ({ type: "string", format: "binary" }),
  "image upload": () => ({
    type: "string",
    format: "binary",
    [ATTRS_KEYWORD]: { accept: "image/*" },
  }),
  // A relation, a method field, any field DRF does not name: Mapo cannot know
  // the value, and a text input would save an id or a list of ids as a string.
  field: placeholder,
};

/** The keywords of a field's value. A type in `options.types` wins over a built-in one. */
function valueSchema(
  field: DrfFieldInfo,
  key: string,
  options: DrfMetadataOptions,
): JSONSchema {
  const custom = options.types?.[field.type];
  if (custom) return custom(field, key);
  if (field.type === "list") return listSchema(field, key, options);
  if (field.type === "nested object") {
    return isRecord(field.children)
      ? objectSchema(field.children, options)
      : { type: "object" };
  }
  const build = BUILT_IN_TYPES[field.type] ?? placeholder;
  return build(field, key);
}

function isPlaceholder(schema: JSONSchema): boolean {
  const type = schema[FIELD_KEYWORD];
  return typeof type === "string" && type.startsWith("field:");
}

/** A `list`: an array of its child, or a placeholder when the child is one. */
function listSchema(
  field: DrfFieldInfo,
  key: string,
  options: DrfMetadataOptions,
): JSONSchema {
  if (!isFieldInfo(field.child)) return { type: "array" };
  const items = valueSchema(field.child, key, options);
  if (isPlaceholder(items)) return placeholder(field, key);
  return {
    type: "array",
    items,
    // A list's length limits count its items.
    ...(toNumber(field.min_length) !== undefined
      ? { minItems: toNumber(field.min_length) }
      : {}),
    ...(toNumber(field.max_length) !== undefined
      ? { maxItems: toNumber(field.max_length) }
      : {}),
  };
}

function fieldSchema(
  field: DrfFieldInfo,
  key: string,
  options: DrfMetadataOptions,
): JSONSchema {
  const value = valueSchema(field, key, options);
  return {
    ...(field.label ? { title: field.label } : {}),
    ...(field.help_text ? { description: field.help_text } : {}),
    ...value,
    ...(field.read_only ? { readOnly: true } : {}),
  };
}

function objectSchema(
  fields: Record<string, unknown>,
  options: DrfMetadataOptions,
): JSONSchema {
  const properties: [string, JSONSchema][] = [];
  const required: string[] = [];
  for (const [key, field] of Object.entries(fields)) {
    if (!isFieldInfo(field)) continue;
    const written = fieldSchema(field, key, options);
    const schema = options.property
      ? options.property(written, field, key)
      : written;
    if (!schema) continue;
    properties.push([key, schema]);
    if (field.required && !field.read_only) required.push(key);
  }
  return {
    type: "object",
    properties: Object.fromEntries(properties),
    ...(required.length ? { required } : {}),
  };
}

/**
 * Reads the metadata Django REST Framework serves on `OPTIONS` (the
 * `actions.POST` or `actions.PUT` of `SimpleMetadata`) as a JSON Schema in the
 * dialect `useFormFromSchema()` reads.
 *
 * Labels become `title`, help texts `description`, choices `oneOf` of
 * `{ const, title }`, and the limits their keywords. A field DRF calls `field`
 * (a relation, a method field) becomes a placeholder type, `field:<key>`:
 * the form edits its value as JSON until you describe it, with `types`,
 * `property` or the `overrides` of `useFormFromSchema()`.
 *
 * @param metadata The `OPTIONS` response, as received.
 * @param options  `method`, `types` and `property` customise the reading.
 * @returns A JSON Schema of type `object`, or `undefined` when the response
 * has no fields for the action (DRF publishes `POST` only to users who can
 * create).
 *
 * @example
 * const schema = drfMetadataToJsonSchema(await crud.options(), {
 *   property: (schema, field, key) =>
 *     key === "author"
 *       ? { title: schema.title, type: "relation", endpoint: "/api/users/" }
 *       : schema,
 * });
 */
export function drfMetadataToJsonSchema(
  metadata: unknown,
  options: DrfMetadataOptions = {},
): JSONSchema | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.actions)) return undefined;
  const actions = metadata.actions;
  const fields = options.method
    ? actions[options.method]
    : (actions.POST ?? actions.PUT);
  if (!isRecord(fields)) return undefined;
  return objectSchema(fields, options);
}

/**
 * The JSON Schema an endpoint's `OPTIONS` response describes: the `schema` it
 * publishes, as Camomilla does, otherwise its DRF metadata, read with
 * {@link drfMetadataToJsonSchema}. This is what `MapoDetail` reads with
 * `experimentalFieldsFromSchema`.
 *
 * @param metadata The `OPTIONS` response, as received.
 * @param options  Passed to {@link drfMetadataToJsonSchema}.
 * @returns A JSON Schema, or `undefined` when the response describes no fields.
 */
export function metadataToJsonSchema(
  metadata: unknown,
  options: DrfMetadataOptions = {},
): JSONSchema | undefined {
  if (!isRecord(metadata)) return undefined;
  const schema = metadata.schema;
  if (isRecord(schema) && isRecord(schema.properties))
    return schema as JSONSchema;
  return drfMetadataToJsonSchema(metadata, options);
}
