import { FIELD_KEYWORD, placeholderType } from "./dialect.js";
import type { JSONSchema } from "./types.js";

/** A model an OpenAPI document describes, as {@link openApiModels} lists it. */
export interface OpenApiModel {
  /** The component name, as {@link openApiToJsonSchema} takes it. */
  name: string;
  title?: string;
  description?: string;
  /** The collection endpoint that lists it, read from the document's paths. */
  endpoint?: string;
}

/** Options of {@link openApiToJsonSchema}. */
export interface OpenApiOptions {
  /**
   * The collection endpoint of each component, by name, merged over the ones
   * read from the document's paths. A relation to a component without an
   * endpoint becomes a placeholder field.
   */
  endpoints?: Record<string, string>;
  /**
   * Called for every property, those of nested objects included, with the
   * schema written for it and the property as the document has it. Return the
   * schema to use, or `undefined` to leave the property out.
   */
  property?: (
    schema: JSONSchema,
    source: Record<string, unknown>,
    key: string,
  ) => JSONSchema | undefined;
}

/** An object as the document has it, keys not yet checked. */
type Obj = Record<string, unknown>;

function isRecord(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The schemas under `components.schemas`, or an empty map. */
function componentsOf(document: unknown): Record<string, Obj> {
  const schemas = isRecord(document)
    ? (document.components as Obj | undefined)?.schemas
    : undefined;
  if (!isRecord(schemas)) return {};
  return Object.fromEntries(
    Object.entries(schemas).filter((entry): entry is [string, Obj] =>
      isRecord(entry[1]),
    ),
  );
}

/** `#/components/schemas/Article` → `Article` */
function refName(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

function isObjectSchema(schema: Obj): boolean {
  return schema.type === "object" || isRecord(schema.properties);
}

/**
 * Maps every component to the collection endpoint that serves it, from the
 * 200 response of each `get`: a bare `$ref`, an array of them, or DRF's
 * paginated `{ count, results: [...] }`.
 */
function endpointsByModel(document: unknown): Map<string, string> {
  const byModel = new Map<string, string>();
  const paths = isRecord(document) ? document.paths : undefined;
  if (!isRecord(paths)) return byModel;

  for (const [path, operations] of Object.entries(paths)) {
    // Collection endpoints only: `/api/articles/`, not `/api/articles/{id}/`.
    if (/\{[^}]+\}/.test(path) || !isRecord(operations)) continue;
    const get = operations.get;
    const responses = isRecord(get) ? get.responses : undefined;
    const ok = isRecord(responses) ? responses["200"] : undefined;
    const content = isRecord(ok) ? ok.content : undefined;
    const json = isRecord(content) ? content["application/json"] : undefined;
    const schema = isRecord(json) ? json.schema : undefined;
    if (!isRecord(schema)) continue;

    const results = isRecord(schema.properties)
      ? schema.properties.results
      : undefined;
    const candidates = [
      isRecord(results) && isRecord(results.items)
        ? results.items.$ref
        : undefined,
      isRecord(schema.items) ? schema.items.$ref : undefined,
      schema.$ref,
    ];
    const ref = candidates.find((value) => typeof value === "string");
    if (typeof ref !== "string") continue;
    const model = refName(ref);
    if (!byModel.has(model)) byModel.set(model, path);
  }
  return byModel;
}

/**
 * Every object component of an OpenAPI 3 document, with the collection
 * endpoint that lists it when the paths tell. Enum components are left out.
 *
 * @param document The OpenAPI document, as received.
 * @returns The models, sorted by name.
 */
export function openApiModels(document: unknown): OpenApiModel[] {
  const endpoints = endpointsByModel(document);
  return Object.entries(componentsOf(document))
    .filter(([, schema]) => isObjectSchema(schema))
    .map(([name, schema]) => ({
      name,
      ...(typeof schema.title === "string" ? { title: schema.title } : {}),
      ...(typeof schema.description === "string"
        ? { description: schema.description }
        : {}),
      ...(endpoints.has(name) ? { endpoint: endpoints.get(name)! } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface Reader {
  components: Record<string, Obj>;
  endpoints: Map<string, string>;
  options: OpenApiOptions;
}

interface Resolved {
  schema: Obj;
  /** The component the schema came from, when it came from a `$ref`. */
  ref?: string;
}

/** Two members of an `allOf`: an object composed of both keeps the properties of each. */
function mergeSchemas(a: Obj, b: Obj): Obj {
  const properties =
    isRecord(a.properties) || isRecord(b.properties)
      ? { properties: { ...(a.properties as Obj), ...(b.properties as Obj) } }
      : {};
  const required = [
    ...(Array.isArray(a.required) ? a.required : []),
    ...(Array.isArray(b.required) ? b.required : []),
  ];
  return {
    ...a,
    ...b,
    ...properties,
    ...(required.length ? { required: [...new Set(required)] } : {}),
  };
}

/**
 * Follows `$ref` and the `allOf: [{ $ref }]` wrapper DRF-spectacular writes
 * around a nullable or read-only relation; keywords next to it win.
 */
function resolve(raw: Obj, reader: Reader, depth = 0): Resolved {
  if (depth > 8) return { schema: {} };
  if (typeof raw.$ref === "string") {
    const name = refName(raw.$ref);
    const target = reader.components[name];
    if (!target) return { schema: {}, ref: name };
    const inner = resolve(target, reader, depth + 1);
    return { schema: inner.schema, ref: inner.ref ?? name };
  }
  if (Array.isArray(raw.allOf) && raw.allOf.length) {
    let merged: Resolved = { schema: {} };
    for (const member of raw.allOf) {
      if (!isRecord(member)) continue;
      const inner = resolve(member, reader, depth + 1);
      merged = {
        schema: mergeSchemas(merged.schema, inner.schema),
        ref: inner.ref ?? merged.ref,
      };
    }
    const { allOf: _allOf, ...siblings } = raw;
    return { schema: { ...merged.schema, ...siblings }, ref: merged.ref };
  }
  return { schema: raw };
}

/** `published_at` → `Published at` */
function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

/** The keywords copied as they are, when the source has them. */
const PLAIN_KEYWORDS = [
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "default",
] as const;

function plainKeywords(schema: Obj): JSONSchema {
  return Object.fromEntries(
    PLAIN_KEYWORDS.filter((keyword) => schema[keyword] !== undefined).map(
      (keyword) => [keyword, schema[keyword]],
    ),
  );
}

/** A relation to `ref`: its endpoint when known, otherwise a placeholder. */
function relationSchema(
  ref: string,
  key: string,
  isMultiple: boolean,
  reader: Reader,
): JSONSchema {
  const endpoint = reader.endpoints.get(ref);
  if (!endpoint) return { [FIELD_KEYWORD]: placeholderType(key) };
  return {
    type: "relation",
    endpoint,
    ...(isMultiple ? { multiple: true } : {}),
  };
}

/** The keywords of a value, without title and flags. */
function valueSchema(
  schema: Obj,
  ref: string | undefined,
  key: string,
  reader: Reader,
): JSONSchema {
  // A component that is an object, met as a value: a relation to it.
  if (ref && isObjectSchema(schema))
    return relationSchema(ref, key, false, reader);

  if (Array.isArray(schema.enum)) {
    return {
      ...(typeof schema.type === "string" ? { type: schema.type } : {}),
      enum: [...schema.enum],
    };
  }

  const type = schema.type;
  if (type === "array") {
    const items = isRecord(schema.items)
      ? resolve(schema.items, reader)
      : undefined;
    if (items?.ref && isObjectSchema(items.schema))
      return relationSchema(items.ref, key, true, reader);
    const itemSchema = items
      ? valueSchema(items.schema, items.ref, key, reader)
      : {};
    if (itemSchema[FIELD_KEYWORD] !== undefined)
      return { [FIELD_KEYWORD]: placeholderType(key) };
    return { type: "array", items: itemSchema, ...plainKeywords(schema) };
  }

  if (type === "object") {
    return isRecord(schema.properties)
      ? objectSchema(schema, reader)
      : { type: "object" };
  }

  // A decimal DRF-spectacular sends as a string.
  if (type === "string" && schema.format === "decimal") {
    const {
      format: _format,
      pattern: _pattern,
      ...rest
    } = plainKeywords(schema);
    return { type: "number", ...rest };
  }

  if (typeof type === "string") return { type, ...plainKeywords(schema) };
  // No type, as for a JSON field: any value, edited as JSON.
  return { [FIELD_KEYWORD]: placeholderType(key) };
}

function propertySchema(raw: Obj, key: string, reader: Reader): JSONSchema {
  const { schema, ref } = resolve(raw, reader);
  const value = valueSchema(schema, ref, key, reader);
  // OpenAPI 3.0 marks null with `nullable`; JSON Schema with a type list.
  // `relation` is a type of Mapo's dialect, not of JSON: an empty relation
  // already means none.
  const isNullable = raw.nullable === true || schema.nullable === true;
  const jsonType =
    typeof value.type === "string" && value.type !== "relation"
      ? value.type
      : undefined;
  const nullable = isNullable && jsonType ? { type: [jsonType, "null"] } : {};
  const title = typeof schema.title === "string" ? schema.title : humanize(key);
  return {
    title,
    ...(typeof schema.description === "string"
      ? { description: schema.description }
      : {}),
    ...value,
    ...nullable,
    ...(schema.readOnly === true || raw.readOnly === true
      ? { readOnly: true }
      : {}),
    ...(schema.writeOnly === true || raw.writeOnly === true
      ? { writeOnly: true }
      : {}),
  };
}

function objectSchema(schema: Obj, reader: Reader): JSONSchema {
  const source = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key) => typeof key === "string")
      : [],
  );
  const properties: [string, JSONSchema][] = [];
  for (const [key, raw] of Object.entries(source)) {
    if (!isRecord(raw)) continue;
    const written = propertySchema(raw, key, reader);
    const final = reader.options.property
      ? reader.options.property(written, raw, key)
      : written;
    if (final) properties.push([key, final]);
  }
  const kept = properties
    .map(([key]) => key)
    .filter((key) => required.has(key));
  return {
    type: "object",
    properties: Object.fromEntries(properties),
    ...(kept.length ? { required: kept } : {}),
  };
}

/**
 * Reads a component of an OpenAPI 3 document, such as the one DRF-spectacular
 * serves, as a JSON Schema in the dialect `useFormFromSchema()` reads.
 *
 * `$ref`s are followed. A property that points to another object component
 * is a relation, with the endpoint that lists that component; without one,
 * it becomes a placeholder type, `field:<key>`, edited as JSON. A property
 * with no type, such as a JSON field, becomes a placeholder too. Labels come
 * from `title`, or from the property name.
 *
 * @param document The OpenAPI document, as received.
 * @param model    The component name, as {@link openApiModels} lists it.
 * @param options  `endpoints` and `property` customise the reading.
 * @returns A JSON Schema of type `object`, or `undefined` when the document
 * has no such component.
 *
 * @example
 * const doc = await $fetch("/api/schema/?format=json");
 * const fields = useFormFromSchema(openApiToJsonSchema(doc, "Article")!);
 */
export function openApiToJsonSchema(
  document: unknown,
  model: string,
  options: OpenApiOptions = {},
): JSONSchema | undefined {
  const components = componentsOf(document);
  const component = components[model];
  if (!component) return undefined;
  const endpoints = endpointsByModel(document);
  for (const [name, endpoint] of Object.entries(options.endpoints ?? {}))
    endpoints.set(name, endpoint);
  const reader: Reader = { components, endpoints, options };
  const { schema } = resolve(component, reader);
  return objectSchema(schema, reader);
}
