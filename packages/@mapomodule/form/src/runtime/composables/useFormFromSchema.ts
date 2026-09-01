import { resolveSchema, extractDefs, matchesSchema } from "@mapomodule/utils";
import type { JSONSchema } from "@mapomodule/utils";
import type { AnyFieldDescriptor, FieldType } from "../types/index.js";

// ─── Map JSON Schema types to FieldType ──────────────────────────────────────

function mapType(schema: JSONSchema, key: string): FieldType {
  // Enum on any scalar type maps to a select field.
  if (schema.enum) return "select";

  const t = Array.isArray(schema.type)
    ? schema.type.find((v) => v !== "null")
    : schema.type;
  const fmt = schema.format;

  if (t === "string") {
    if (fmt === "textarea") return "textarea";
    if (fmt === "date") return "date";
    if (fmt === "date-time") return "datetime";
    if (fmt === "time") return "time";
    if (fmt === "color") return "color";
    if (typeof schema.maxLength === "number" && schema.maxLength > 255)
      return "textarea";
    return "text";
  }

  if (t === "integer" || t === "number") return "number";
  if (t === "boolean") return "boolean";

  // SWE extension: custom `relation` type.
  if (t === "relation") {
    return (schema as JSONSchema & { multiple?: boolean }).multiple
      ? "m2m"
      : "fks";
  }

  if (t === "array") {
    const items = schema.items;
    // Array of relations maps to m2m.
    if (items?.type === "relation") return "m2m";
    // Array of objects maps to a repeater.
    if (items?.type === "object" || items?.properties) return "repeater";
    // Flat arrays of strings/numbers map to multi-select.
    return "select";
  }

  if (t === "object") {
    // Heuristic: title + description + url/slug looks like an SEO object.
    const props = Object.keys(schema.properties ?? {});
    if (
      props.includes("title") &&
      props.includes("description") &&
      (props.includes("url") || props.includes("slug"))
    )
      return "seo";
    // Otherwise treat it as a generic object through a custom type.
    return `object:${key}` as FieldType;
  }

  return "text";
}

// ─── Build extra attrs from the schema ───────────────────────────────────────

function buildAttrs(
  schema: JSONSchema,
  type: FieldType,
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  if (type === "select") {
    if (schema.enum) {
      attrs.options = (schema.enum as unknown[]).map((v) => ({
        text: String(v),
        value: v,
      }));
    }
  }

  if (type === "number") {
    if (schema.minimum !== undefined) attrs.min = schema.minimum;
    if (schema.maximum !== undefined) attrs.max = schema.maximum;
  }

  if (type === "text" || type === "textarea") {
    if (schema.maxLength !== undefined) attrs.maxLength = schema.maxLength;
    if (schema.minLength !== undefined) attrs.minLength = schema.minLength;
  }

  if (type === "fks" || type === "m2m") {
    const ext = schema as JSONSchema & { endpoint?: string; relation?: string };
    attrs.endpoint = ext.endpoint ?? ext.relation ?? "";
    attrs.returnObject = true;
    if (type === "m2m") attrs.multiple = true;
  }

  if (type === "date" || type === "datetime") {
    if (schema.minimum) attrs.min = schema.minimum;
    if (schema.maximum) attrs.max = schema.maximum;
  }

  return attrs;
}

// ─── Collect conditional rules from the root schema ──────────────────────────

interface ConditionalRule {
  ifSchema: JSONSchema;
  thenKeys: Set<string>;
  elseKeys: Set<string>;
}

function collectRules(schema: JSONSchema): ConditionalRule[] {
  const rules: ConditionalRule[] = [];

  function addRule(
    ifSchema: JSONSchema,
    then?: JSONSchema,
    elseBranch?: JSONSchema,
  ) {
    rules.push({
      ifSchema,
      thenKeys: new Set(Object.keys(then?.properties ?? {})),
      elseKeys: new Set(Object.keys(elseBranch?.properties ?? {})),
    });
  }

  if (schema.if) addRule(schema.if, schema.then, schema.else);

  if (Array.isArray(schema.allOf)) {
    for (const entry of schema.allOf) {
      if (entry?.if) addRule(entry.if, entry.then, entry.else);
    }
  }

  return rules;
}

// visible() closure that captures the ifSchema and the active branch (then/else).
function makeVisible(
  ifSchema: JSONSchema,
  side: "then" | "else",
): (ctx: { model: Record<string, unknown> }) => boolean {
  return ({ model }) => {
    const matches = matchesSchema(model, ifSchema);
    return side === "then" ? matches : !matches;
  };
}

// ─── Single property → AnyFieldDescriptor ──────────────────────────────────────

function propertyToDescriptor(
  key: string,
  rawSchema: JSONSchema,
  defs: Record<string, JSONSchema>,
  requiredKeys: Set<string>,
  rules: ConditionalRule[],
): AnyFieldDescriptor {
  const schema = resolveSchema(rawSchema, defs);
  const type = mapType(schema, key);
  const attrs = buildAttrs(schema, type);

  // Conditional visibility: if the key only appears in either then or else.
  let visible: AnyFieldDescriptor["visible"] | undefined;

  for (const rule of rules) {
    if (rule.thenKeys.has(key) && !rule.elseKeys.has(key)) {
      visible = makeVisible(rule.ifSchema, "then");
      break;
    }
    if (rule.elseKeys.has(key) && !rule.thenKeys.has(key)) {
      visible = makeVisible(rule.ifSchema, "else");
      break;
    }
  }

  // Repeater: build child descriptors recursively.
  const base: Record<string, unknown> = {
    key,
    type,
    label: schema.title ?? undefined,
    required: requiredKeys.has(key),
    ...(schema.readOnly ? { readonly: true } : {}),
    ...(visible ? { visible } : {}),
    ...(Object.keys(attrs).length ? { attrs } : {}),
  };

  if (type === "repeater" && schema.items) {
    const itemSchema = resolveSchema(schema.items, defs);
    const childRequired = new Set<string>(itemSchema.required ?? []);
    const childProps = itemSchema.properties ?? {};
    const childRules = collectRules(itemSchema);
    base.fields = Object.entries(childProps).map(([k, v]) =>
      propertyToDescriptor(k, v, defs, childRequired, childRules),
    );
  }

  return base as unknown as AnyFieldDescriptor;
}

// ─── Public composable ───────────────────────────────────────────────────────

/** Options for generating field descriptors from a JSON Schema document. */
export interface UseFormFromSchemaOptions {
  /** Keys to exclude from generation, for example `id` or `created_at`. */
  exclude?: string[];
  /** Per-field overrides that shallow-merge onto the generated descriptor. */
  overrides?: Record<string, Partial<AnyFieldDescriptor>>;
}

/**
 * Builds a `AnyFieldDescriptor[]` array from a JSON Schema.
 * Supports Pydantic v2 (`$defs`, nullable `anyOf`), DRF Spectacular, and `if/then/else` conditionals.
 *
 * @example
 * const fields = useFormFromSchema(myApiSchema, {
 *   exclude: ['id', 'created_at'],
 *   overrides: { body: { type: 'editor', translatable: true } },
 * })
 */
export function useFormFromSchema(
  schema: JSONSchema,
  options: UseFormFromSchemaOptions = {},
): AnyFieldDescriptor[] {
  const { exclude = [], overrides = {} } = options;
  const defs = extractDefs(schema);

  const properties = schema.properties ?? {};
  const requiredKeys = new Set<string>(schema.required ?? []);
  const rules = collectRules(schema);

  const descriptors: AnyFieldDescriptor[] = [];

  for (const [key, rawProp] of Object.entries(properties)) {
    if (exclude.includes(key)) continue;

    const descriptor = propertyToDescriptor(
      key,
      rawProp,
      defs,
      requiredKeys,
      rules,
    );

    // Apply consumer overrides with a shallow merge.
    const override = overrides[key];
    const final = override
      ? ({ ...descriptor, ...override } as AnyFieldDescriptor)
      : descriptor;

    descriptors.push(final);
  }

  return descriptors;
}
