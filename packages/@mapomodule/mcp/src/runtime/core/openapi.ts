/**
 * OpenAPI / DRF schema → Mapo field descriptors.
 *
 * Django REST Framework projects already describe every serializer in their
 * OpenAPI document (drf-spectacular). That document knows the types, the
 * choices, the read-only flags and the length limits — everything a form needs
 * and everything a model would otherwise guess.
 *
 * Pure and dependency-free: fetching happens elsewhere, so the mapping is
 * testable against fixtures.
 */

/** Minimal shape we rely on; the rest of the document is ignored. */
export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, OpenApiSchema> };
}

export interface OpenApiSchema {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  readOnly?: boolean;
  writeOnly?: boolean;
  nullable?: boolean;
  maxLength?: number;
  minLength?: number;
  maximum?: number;
  minimum?: number;
  $ref?: string;
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  [key: string]: unknown;
}

export interface MappedField {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  readonly?: boolean;
  attrs?: Record<string, unknown>;
  /** Why this mapping is uncertain, when it is. */
  note?: string;
}

export interface ModelSummary {
  name: string;
  title?: string;
  description?: string;
  /** List endpoint serving this model, when the document declares one. */
  endpoint?: string;
  fieldCount: number;
}

/** `#/components/schemas/Article` → `Article` */
function refName(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

/**
 * Resolves `$ref` and the `allOf: [$ref]` wrapper drf-spectacular emits for
 * nullable nested serializers, returning the schema plus the component name it
 * came from (needed to look up the relation's endpoint).
 */
export function resolveSchema(
  doc: OpenApiDocument,
  schema: OpenApiSchema | undefined,
  depth = 0,
): { schema: OpenApiSchema; ref?: string } {
  if (!schema || depth > 5) return { schema: schema ?? {} };

  if (schema.$ref) {
    const name = refName(schema.$ref);
    const target = doc.components?.schemas?.[name];
    if (!target) return { schema: {}, ref: name };
    const resolved = resolveSchema(doc, target, depth + 1);
    return { schema: resolved.schema, ref: resolved.ref ?? name };
  }

  // `allOf` is a wrapper: merge the members, then let sibling keywords
  // (`readOnly`, `nullable`, `title`) declared next to it win.
  if (schema.allOf?.length) {
    const merged = schema.allOf.reduce<{ schema: OpenApiSchema; ref?: string }>(
      (accumulator, member) => {
        const resolved = resolveSchema(doc, member, depth + 1);
        return {
          schema: { ...accumulator.schema, ...resolved.schema },
          ref: resolved.ref ?? accumulator.ref,
        };
      },
      { schema: {} },
    );
    const { allOf: _allOf, ...siblings } = schema;
    return { schema: { ...merged.schema, ...siblings }, ref: merged.ref };
  }

  return { schema };
}

/**
 * Maps every component to the collection endpoint that serves it, by reading
 * the 200 response of each `get`. Both a bare `$ref` and DRF's paginated
 * `{ count, results: [...] }` wrapper are recognised.
 */
export function endpointsByModel(doc: OpenApiDocument): Map<string, string> {
  const byModel = new Map<string, string>();

  for (const [path, operations] of Object.entries(doc.paths ?? {})) {
    // Collection endpoints only: `/api/articles/`, not `/api/articles/{id}/`.
    if (/\{[^}]+\}/.test(path)) continue;

    // Only the shape we read is described: the rest of an operation object is
    // irrelevant here and typing it fully would be noise.
    const get = (
      operations as {
        get?: {
          responses?: Record<
            string,
            { content?: Record<string, { schema?: OpenApiSchema }> }
          >;
        };
      }
    )?.get;
    const schema =
      get?.responses?.["200"]?.content?.["application/json"]?.schema;
    if (!schema) continue;

    const direct = schema.$ref ? refName(schema.$ref) : undefined;
    const results = schema.properties?.results;
    const paginated = results?.items?.$ref
      ? refName(results.items.$ref)
      : undefined;
    const array = schema.items?.$ref ? refName(schema.items.$ref) : undefined;

    const model = paginated ?? array ?? direct;
    if (model && !byModel.has(model)) byModel.set(model, path);
  }

  return byModel;
}

/** `published_at` → `Published at`; a `title` from the schema wins. */
function labelFor(key: string, schema: OpenApiSchema): string {
  if (schema.title) return schema.title;
  return key
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

/** Long free text deserves a textarea rather than a single-line input. */
const TEXTAREA_THRESHOLD = 500;

function enumItems(
  schema: OpenApiSchema,
): Array<{ label: string; value: unknown }> {
  return (schema.enum ?? []).map((value) => ({
    label: String(value)
      .replace(/[_-]+/g, " ")
      .replace(/^./, (character) => character.toUpperCase()),
    value,
  }));
}

/**
 * The mapping itself. Returns `null` when nothing sensible exists, so the
 * caller can report the property instead of inventing a field for it.
 */
export function mapProperty(
  doc: OpenApiDocument,
  key: string,
  raw: OpenApiSchema,
  options: { required?: boolean; endpoints?: Map<string, string> } = {},
): MappedField | null {
  const { schema, ref } = resolveSchema(doc, raw);
  const endpoints = options.endpoints ?? new Map<string, string>();
  const base: MappedField = {
    key,
    type: "text",
    label: labelFor(key, schema),
    ...(options.required ? { required: true } : {}),
    ...(schema.readOnly ? { readonly: true } : {}),
  };

  // Choices come first: an enum is a select whatever its underlying type is.
  if (schema.enum?.length) {
    return { ...base, type: "select", attrs: { items: enumItems(schema) } };
  }

  if (schema.type === "boolean") return { ...base, type: "boolean" };

  if (schema.type === "integer" || schema.type === "number") {
    const attrs: Record<string, unknown> = {};
    if (schema.minimum !== undefined) attrs.min = schema.minimum;
    if (schema.maximum !== undefined) attrs.max = schema.maximum;
    return {
      ...base,
      type: "number",
      ...(Object.keys(attrs).length ? { attrs } : {}),
    };
  }

  if (schema.type === "array") {
    const item = resolveSchema(doc, schema.items);
    // A list of related objects is a many-to-many picker, and the endpoint is
    // inferable from the paths section.
    if (item.ref) {
      const endpoint = endpoints.get(item.ref);
      return {
        ...base,
        type: "m2m",
        attrs: {
          endpoint: endpoint ?? `/api/${item.ref.toLowerCase()}/`,
          itemValue: "id",
        },
        ...(endpoint
          ? {}
          : {
              note: `no list endpoint found for ${item.ref}; check attrs.endpoint`,
            }),
      };
    }
    if (item.schema.enum?.length) {
      return {
        ...base,
        type: "select",
        attrs: { multiple: true, items: enumItems(item.schema) },
      };
    }
    return {
      ...base,
      type: "repeater",
      note: "array of plain values: a repeater expects objects, so review this one",
    };
  }

  // A nested object with a component behind it is a foreign key.
  if (ref && (schema.type === "object" || schema.properties)) {
    const endpoint = endpoints.get(ref);
    return {
      ...base,
      type: "fks",
      attrs: {
        endpoint: endpoint ?? `/api/${ref.toLowerCase()}/`,
        itemValue: "id",
      },
      ...(endpoint
        ? {}
        : { note: `no list endpoint found for ${ref}; check attrs.endpoint` }),
    };
  }

  if (schema.type === "object") {
    return {
      ...base,
      type: "text",
      note: "free-form object: consider a repeater or a custom field",
    };
  }

  // Strings: the format carries most of the meaning.
  switch (schema.format) {
    case "date-time":
      return { ...base, type: "datetime" };
    case "date":
      return { ...base, type: "date" };
    case "time":
      return { ...base, type: "time" };
    case "email":
      return { ...base, type: "email" };
    case "uri":
    case "url":
      return { ...base, type: "url" };
    case "binary":
      return { ...base, type: "file" };
    default:
      break;
  }

  const attrs: Record<string, unknown> = {};
  if (schema.maxLength !== undefined) attrs.maxLength = schema.maxLength;

  const long =
    schema.maxLength === undefined || schema.maxLength >= TEXTAREA_THRESHOLD;
  return {
    ...base,
    type: long ? "textarea" : "text",
    ...(Object.keys(attrs).length ? { attrs } : {}),
  };
}

export interface ToFieldsOptions {
  /** Keep server-computed fields (id, timestamps) as readonly descriptors. */
  includeReadOnly?: boolean;
  /** Restrict to the field types actually registered in the app. */
  knownTypes?: Set<string>;
}

export interface ToFieldsResult {
  model: string;
  endpoint?: string;
  fields: MappedField[];
  /** Properties deliberately left out, with the reason. */
  skipped: Array<{ key: string; reason: string }>;
  notes: string[];
}

/** Every component schema of the document, with its endpoint when known. */
export function listModels(doc: OpenApiDocument): ModelSummary[] {
  const endpoints = endpointsByModel(doc);

  return Object.entries(doc.components?.schemas ?? {})
    .map(([name, schema]) => ({
      name,
      ...(schema.title ? { title: schema.title } : {}),
      ...(schema.description ? { description: schema.description } : {}),
      ...(endpoints.has(name) ? { endpoint: endpoints.get(name)! } : {}),
      fieldCount: Object.keys(schema.properties ?? {}).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Maps one component into descriptors. */
export function toFields(
  doc: OpenApiDocument,
  model: string,
  options: ToFieldsOptions = {},
): ToFieldsResult | null {
  const schema = doc.components?.schemas?.[model];
  if (!schema) return null;

  const endpoints = endpointsByModel(doc);
  const required = new Set(schema.required ?? []);
  const fields: MappedField[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];
  const notes: string[] = [];

  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const { schema: resolved } = resolveSchema(doc, property);

    if (resolved.readOnly && !options.includeReadOnly) {
      skipped.push({ key, reason: "read-only in the API" });
      continue;
    }

    const mapped = mapProperty(doc, key, property, {
      required: required.has(key),
      endpoints,
    });

    if (!mapped) {
      skipped.push({ key, reason: "no sensible field type" });
      continue;
    }

    // The app decides which types exist: never emit one it cannot render.
    if (options.knownTypes && !options.knownTypes.has(mapped.type)) {
      skipped.push({
        key,
        reason: `maps to \`${mapped.type}\`, which this app does not register`,
      });
      continue;
    }

    fields.push(mapped);
  }

  if (skipped.some((entry) => entry.reason === "read-only in the API")) {
    notes.push(
      "Read-only properties were skipped; pass includeReadOnly to keep them as readonly fields.",
    );
  }

  return {
    model,
    ...(endpoints.has(model) ? { endpoint: endpoints.get(model)! } : {}),
    fields,
    skipped,
    notes,
  };
}

/** Renders the descriptors as the TypeScript a page would contain. */
export function renderFields(result: ToFieldsResult): string {
  const body = result.fields
    .map((field) => {
      const parts = [
        `key: "${field.key}"`,
        `type: "${field.type}"`,
        `label: "${field.label}"`,
      ];
      if (field.required) parts.push("required: true");
      if (field.readonly) parts.push("readonly: true");
      if (field.attrs) parts.push(`attrs: ${JSON.stringify(field.attrs)}`);
      const comment = field.note ? ` // ${field.note}` : "";
      return `  { ${parts.join(", ")} },${comment}`;
    })
    .join("\n");

  return `const fields: FieldDescriptor<${result.model}>[] = [\n${body}\n];`;
}

/** `key:type:Label` specs, ready to hand to `mapo_scaffold`. */
export function toScaffoldSpecs(result: ToFieldsResult): string[] {
  return result.fields.map(
    (field) => `${field.key}:${field.type}:${field.label}`,
  );
}
