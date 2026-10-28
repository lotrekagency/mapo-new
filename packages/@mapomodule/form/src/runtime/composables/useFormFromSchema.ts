import {
  ATTRS_KEYWORD,
  FIELD_KEYWORD,
  resolveSchema,
  extractDefs,
  matchesSchema,
} from "@mapomodule/utils";
import type { JSONSchema } from "@mapomodule/utils";
import type {
  AnyFieldDescriptor,
  FieldType,
  RepeaterTemplate,
} from "../types/index.js";

// ─── Mapo keywords ───────────────────────────────────────────────────────────
// `x-mapo-field` and `x-mapo-attrs` come from `@mapomodule/utils`, shared with
// the DRF and OpenAPI normalizers. `fieldsToJsonSchema()` writes them, so that
// its schema reads back into the same descriptors.

/** The property where a repeater item keeps its template key. @internal */
export const TEMPLATE_PROPERTY = "_template";

/**
 * Attrs that a JSON Schema keyword with the same meaning expresses, by field
 * type. The reader maps the keyword to the attr, and `fieldsToJsonSchema()`
 * the attr to the keyword. @internal
 */
export const KEYWORD_ATTRS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  number: { min: "minimum", max: "maximum" },
  slider: { min: "minimum", max: "maximum" },
  text: { minLength: "minLength", maxLength: "maxLength" },
  textarea: { minLength: "minLength", maxLength: "maxLength" },
  email: { minLength: "minLength", maxLength: "maxLength" },
  url: { minLength: "minLength", maxLength: "maxLength" },
  repeater: { minItems: "minItems", maxItems: "maxItems" },
  "media-m2m": { minItems: "minItems", maxItems: "maxItems" },
};

/**
 * Attr names never read from a schema nor written to one. Attrs reach the
 * field component through `v-bind`: an event handler (`onFocus`, `onclick`) or
 * a DOM property such as `innerHTML` would let a schema run script.
 * @internal
 */
export function isUnsafeAttr(name: string): boolean {
  return (
    /^on/i.test(name) ||
    /^(innerhtml|outerhtml|innertext|textcontent|srcdoc|formaction)$/i.test(
      name,
    )
  );
}

/** Labels of the `enum` values, kept aside when choices are read. */
const ENUM_LABELS = "_enumLabels";
/** Other properties of each choice (`icon`, `disabled`…), kept aside too. */
const ENUM_EXTRAS = "_enumExtras";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The entries of `record` whose name is not {@link isUnsafeAttr}. */
function safeEntries(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => !isUnsafeAttr(name)),
  );
}

/** The JSON type of a schema, ignoring `"null"` in a type list. */
function jsonType(schema: JSONSchema): string | undefined {
  return Array.isArray(schema.type)
    ? schema.type.find((v) => v !== "null")
    : schema.type;
}

// ─── Choices with labels ─────────────────────────────────────────────────────

/**
 * Turns choices written as `oneOf` (or `anyOf`) of `{ const, title }`, the JSON
 * Schema way to label enum values, into an `enum` with its labels kept aside.
 * `resolveSchema()` would otherwise keep the first choice only.
 */
function withLabeledChoices(schema: JSONSchema): JSONSchema {
  const union = schema.oneOf ?? schema.anyOf;
  if (!union) return schema;
  const choices = union.filter(
    (branch) => isRecord(branch) && branch.type !== "null",
  );
  const isChoiceList =
    choices.length > 0 && choices.every((branch) => "const" in branch);
  if (!isChoiceList) return schema;
  const { oneOf: _oneOf, anyOf: _anyOf, ...rest } = schema;
  const nullable = choices.length < union.length;
  return {
    ...rest,
    enum: choices.map((branch) => branch.const),
    [ENUM_LABELS]: choices.map(
      (branch) => branch.title ?? String(branch.const),
    ),
    [ENUM_EXTRAS]: choices.map((branch) => branch[ATTRS_KEYWORD]),
    ...(nullable ? { _nullable: true } : {}),
  };
}

// ─── Resolve a property ──────────────────────────────────────────────────────

/** `#/$defs/Item` → `Item`, the key `resolveSchema()` looks up. */
function defName(ref: string): string {
  return ref.replace(/^#\/\$defs\//, "").replace(/^#\/definitions\//, "");
}

/** The `$defs` a schema points to: its own `$ref` and those of its union branches. */
function refsOf(schema: unknown): string[] {
  if (!isRecord(schema)) return [];
  const branches = [
    schema,
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
  ];
  return branches.flatMap((branch) =>
    isRecord(branch) && typeof branch.$ref === "string"
      ? [defName(branch.$ref)]
      : [],
  );
}

interface ResolvedProperty {
  schema: JSONSchema;
  /** The `$defs` followed to resolve the property and its items. */
  refs: string[];
}

/**
 * Resolves a property for mapping: labeled choices, `$ref`, nullable unions,
 * and the same for its array items, so a list of models maps to a repeater.
 */
function resolveProperty(
  raw: unknown,
  defs: Record<string, JSONSchema>,
): ResolvedProperty {
  // A boolean schema (`true` accepts any value) has no keyword to map.
  if (!isRecord(raw)) return { schema: {}, refs: [] };
  const schema = resolveSchema(withLabeledChoices(raw), defs);
  const items: unknown = schema.items;
  if (!isRecord(items)) return { schema, refs: refsOf(raw) };
  return {
    schema: {
      ...schema,
      items: resolveSchema(withLabeledChoices(items), defs),
    },
    refs: [...refsOf(raw), ...refsOf(items)],
  };
}

// ─── Map JSON Schema types to FieldType ──────────────────────────────────────

/** Items of different shapes, told apart by the property that holds the template key. */
function isTemplateItems(items: JSONSchema | undefined): boolean {
  return (
    !!items?.oneOf && items.discriminator?.propertyName === TEMPLATE_PROPERTY
  );
}

function mapType(schema: JSONSchema, key: string): FieldType {
  const marked = schema[FIELD_KEYWORD];
  if (typeof marked === "string" && marked) return marked;

  // Enum on any scalar type maps to a select field.
  if (schema.enum) return "select";

  const t = jsonType(schema);
  const fmt = schema.format;

  if (t === "string") {
    if (fmt === "textarea") return "textarea";
    if (fmt === "date") return "date";
    if (fmt === "date-time") return "datetime";
    if (fmt === "time") return "time";
    if (fmt === "color") return "color";
    if (fmt === "email") return "email";
    if (fmt === "uri" || fmt === "url") return "url";
    if (fmt === "binary") return "file";
    if (schema.contentMediaType === "text/html") return "editor";
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
    // Array of objects maps to a repeater, with templates when the items vary.
    if (isTemplateItems(items)) return "repeater";
    if (items?.type === "object" || items?.properties) return "repeater";
    // Arrays of plain values map to a multiple select.
    return "select";
  }

  if (t === "object") {
    // Heuristic: title + description + url/slug/permalink looks like an SEO object.
    const props = Object.keys(schema.properties ?? {});
    if (
      props.includes("title") &&
      props.includes("description") &&
      (props.includes("url") ||
        props.includes("slug") ||
        props.includes("permalink"))
    )
      return "seo";
    // Otherwise treat it as a generic object through a custom type.
    return `object:${key}` as FieldType;
  }

  return "text";
}

/**
 * The field type `useFormFromSchema()` gives a property. `fieldsToJsonSchema()`
 * uses it to write `x-mapo-field` only when the other keywords are not enough.
 * @internal
 */
export function schemaFieldType(schema: JSONSchema, key: string): FieldType {
  return mapType(resolveProperty(schema, {}).schema, key);
}

// ─── Build extra attrs from the schema ───────────────────────────────────────

function selectAttrs(schema: JSONSchema): Record<string, unknown> {
  const isArray = jsonType(schema) === "array";
  // A multiple select keeps its choices on the items.
  const choices = isArray ? schema.items : schema;
  const values = isRecord(choices) ? choices.enum : undefined;
  const labels = choices?.[ENUM_LABELS] as string[] | undefined;
  const extras = choices?.[ENUM_EXTRAS] as unknown[] | undefined;
  return {
    ...(values
      ? {
          options: values.map((value, index) => {
            const extra = extras?.[index];
            return {
              ...(isRecord(extra) ? safeEntries(extra) : {}),
              text: labels?.[index] ?? String(value),
              value,
            };
          }),
        }
      : {}),
    ...(isArray ? { multiple: true } : {}),
  };
}

function buildAttrs(
  schema: JSONSchema,
  type: FieldType,
): Record<string, unknown> {
  const attrs: Record<string, unknown> =
    type === "select" ? selectAttrs(schema) : {};

  for (const [attr, keyword] of Object.entries(KEYWORD_ATTRS[type] ?? {})) {
    if (schema[keyword] !== undefined) attrs[attr] = schema[keyword];
  }

  if (type === "fks" || type === "m2m") {
    const ext = schema as JSONSchema & {
      endpoint?: string;
      relation?: string;
      multiple?: boolean;
    };
    attrs.endpoint = ext.endpoint ?? ext.relation ?? "";
    attrs.returnObject = true;
    if (type === "m2m" || ext.multiple === true) attrs.multiple = true;
  }

  if (type === "date" || type === "datetime") {
    if (schema.minimum) attrs.min = schema.minimum;
    if (schema.maximum) attrs.max = schema.maximum;
  }

  // Mapo's own attrs come last: they are the field's, so they win.
  const own = schema[ATTRS_KEYWORD];
  if (isRecord(own)) Object.assign(attrs, safeEntries(own));

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

// ─── Objects, repeater items and templates ───────────────────────────────────
// `chain` holds the `$defs` expanded on the way down. A model that contains
// itself (a menu whose items have children, two models that list each other)
// expands once: the list that would repeat it gets no fields.

/** One descriptor per property of an object schema, except `skip`. */
function objectDescriptors(
  schema: JSONSchema,
  defs: Record<string, JSONSchema>,
  chain: ReadonlySet<string>,
  skip?: string,
): AnyFieldDescriptor[] {
  const required = new Set<string>(schema.required ?? []);
  const rules = collectRules(schema);
  return Object.entries(schema.properties ?? {})
    .filter(([key]) => key !== skip)
    .map(([key, value]) =>
      propertyToDescriptor(key, value, defs, required, rules, chain),
    );
}

/**
 * Repeater templates from items written as `oneOf` with a `discriminator` on
 * `_template`: one template per branch, keyed by the `const` of that property.
 * A branch without that `const` cannot be reached and is skipped.
 */
function templatesOf(
  items: JSONSchema,
  defs: Record<string, JSONSchema>,
  chain: ReadonlySet<string>,
): Record<string, AnyFieldDescriptor[] | RepeaterTemplate> {
  const templates: Record<string, AnyFieldDescriptor[] | RepeaterTemplate> = {};
  for (const raw of items.oneOf ?? []) {
    if (!isRecord(raw)) continue;
    const branch = resolveSchema(raw, defs);
    const key = branch.properties?.[TEMPLATE_PROPERTY]?.const;
    if (typeof key !== "string") continue;
    const inner = new Set([...chain, ...refsOf(raw)]);
    const fields = objectDescriptors(branch, defs, inner, TEMPLATE_PROPERTY);
    // Icon, image, wireframe and category of the template.
    const own = branch[ATTRS_KEYWORD];
    const presentation = isRecord(own) ? safeEntries(own) : {};
    const meta = {
      ...(branch.title ? { label: branch.title } : {}),
      ...(typeof branch.description === "string"
        ? { description: branch.description }
        : {}),
      ...presentation,
    };
    // A template with nothing but fields stays a bare field array.
    templates[key] = Object.keys(meta).length ? { ...meta, fields } : fields;
  }
  return templates;
}

// ─── Single property → AnyFieldDescriptor ──────────────────────────────────────

function propertyToDescriptor(
  key: string,
  rawSchema: unknown,
  defs: Record<string, JSONSchema>,
  requiredKeys: Set<string>,
  rules: ConditionalRule[],
  chain: ReadonlySet<string>,
): AnyFieldDescriptor {
  const { schema, refs } = resolveProperty(rawSchema, defs);
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

  // Repeater: build child descriptors recursively, or one set per template.
  const items = type === "repeater" ? schema.items : undefined;
  const isCycle = refs.some((name) => chain.has(name));
  const inner = new Set([...chain, ...refs]);
  const hasTemplates = !!items && isTemplateItems(items) && !isCycle;
  if (hasTemplates) attrs.templates = templatesOf(items, defs, inner);

  const base: Record<string, unknown> = {
    key,
    type,
    label: schema.title ?? undefined,
    required: requiredKeys.has(key),
    ...(schema.readOnly ? { readonly: true } : {}),
    // A value the backend never returns, such as a password: keep it out of drafts.
    ...(schema.writeOnly ? { noDraft: true } : {}),
    ...(schema.translatable ? { translatable: true } : {}),
    ...(visible ? { visible } : {}),
    ...(Object.keys(attrs).length ? { attrs } : {}),
  };

  if (items && !hasTemplates) {
    base.fields = isCycle ? [] : objectDescriptors(items, defs, inner);
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
 * Reads back the schemas `fieldsToJsonSchema()` writes.
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
  // Labeled choices behind a `$ref` are read like inline ones.
  const defs = Object.fromEntries(
    Object.entries(extractDefs(schema)).map(([name, def]) => [
      name,
      isRecord(def) ? withLabeledChoices(def) : def,
    ]),
  );

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
      new Set(),
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
