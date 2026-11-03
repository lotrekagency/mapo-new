/**
 * The entity model: what the AI may fill in a record, and how. It is built
 * from JSON Schemas in Mapo's dialect, the backend's and the form's, merged
 * with the fields first (they decide which fields exist and how they look)
 * and the stricter constraint winning. Pure and serializable: the browser
 * builds it, and the gateway receives it inside the contract.
 *
 * Safety comes first. A secret, a read-only value, an excluded field or a
 * media field never becomes fillable, wherever the schema says so: beside a
 * union, inside one of its branches, behind a `$ref`, on an object around a
 * dotted key, or in a part of the schema the form's reader cannot read.
 */
import { ATTRS_KEYWORD, FIELD_KEYWORD } from "@mapomodule/utils";
import type { JSONSchema } from "@mapomodule/utils";
import { useFormFromSchema } from "@mapomodule/form/runtime/composables/useFormFromSchema";
import { readAiOptions } from "./dialect";
import type { AiPropertyOptions } from "./dialect";
import { isRecord } from "./guards";

// ─── The model ───────────────────────────────────────────────────────────────

/** The kind of value the AI writes into a field. */
export type AiValueKind =
  | "string"
  | "text"
  | "html"
  | "email"
  | "url"
  | "color"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "time"
  | "choice"
  | "relation";

/**
 * Why the AI leaves a field alone:
 * - `secret`: a value the backend never sends back, such as a password:
 *   `writeOnly`, `noDraft`, a `password` format or input, or a key that
 *   names a password, a token, a secret or an API, private or access key;
 * - `readonly`: the form does not let the operator change it;
 * - `excluded`: `x-mapo-ai` or the entity's `exclude` list keeps the AI out;
 * - `media`: a file or a media, on either side;
 * - `relation`: a relation whose endpoint is unknown, so no record can be
 *   looked up;
 * - `unsupported`: a nested value (repeater, object, SEO, map), a list without
 *   choices, a value without a JSON type, a `$ref` to nothing, or a property
 *   the form's reader cannot read;
 * - `conflict`: the form and the backend leave no valid value, because they
 *   share no choice or their limits exclude each other.
 */
export type AiSkipReason =
  | "secret"
  | "readonly"
  | "excluded"
  | "media"
  | "relation"
  | "unsupported"
  | "conflict";

/** One value a choice field accepts. */
export interface AiChoice {
  /** The value saved in the record. */
  value: string | number | boolean;
  /** What the operator sees. */
  label: string;
}

/** Limits on a value, the stricter of the form's and the backend's. */
export interface AiConstraints {
  /** Shortest text accepted. */
  minLength?: number;
  /** Longest text accepted. */
  maxLength?: number;
  /** Lowest number accepted. */
  minimum?: number;
  /** Highest number accepted. */
  maximum?: number;
  /** Numbers must be greater than this. */
  exclusiveMinimum?: number;
  /** Numbers must be lower than this. */
  exclusiveMaximum?: number;
  /** Fewest values in a list. */
  minItems?: number;
  /** Most values in a list. */
  maxItems?: number;
  /** Regular expressions the value must match, every one of them. */
  patterns?: string[];
  /** Steps a number must be a multiple of, every one of them (`multipleOf`). */
  steps?: number[];
}

/** A field the AI may fill. */
export interface AiField {
  /** The field key: a value path of the form, such as `seo.title`. */
  key: string;
  /** The form's field type, as `useFormFromSchema()` reads it. */
  fieldType: string;
  /** The kind of value the AI writes. */
  kind: AiValueKind;
  /** The label the operator sees. */
  label?: string;
  /** The help text, from the form or the backend. */
  description?: string;
  /** The developer's guidance for the AI, from `x-mapo-ai`. */
  hint?: string;
  /** The form or the backend needs a value. */
  required: boolean;
  /** One value per language: the AI fills the current one only. */
  translatable: boolean;
  /** A list of choices or of related records. */
  multiple: boolean;
  /**
   * The accepted values of a `choice` field, one per value the backend tells
   * apart (`1` and `"1"` are one, `true` and `"True"` too, `true` and
   * `"true"` are two), never `""`.
   */
  choices?: AiChoice[];
  /** Where a `relation` field looks its records up. */
  endpoint?: string;
  /** Limits the value must respect. */
  constraints: AiConstraints;
}

/** A field the AI never fills, and why. */
export interface AiSkippedField {
  /** The field key, as in {@link AiField.key}. */
  key: string;
  /** The form's field type; `unknown` when the reader could not read it. */
  fieldType: string;
  /** The label the operator sees. */
  label?: string;
  /** Why the AI leaves it alone. */
  reason: AiSkipReason;
}

/** Something a developer should look at. */
export type AiEntityWarning =
  | {
      kind: "type-conflict";
      key: string;
      /** The JSON type of the form's value. */
      fieldJsonType: string;
      /** The JSON type the backend expects. */
      schemaJsonType: string;
    }
  /** Only the backend says the value is read-only: it will ignore it. */
  | { kind: "readonly-conflict"; key: string }
  /** The backend accepts none of the field's choices. */
  | { kind: "choices-conflict"; key: string }
  /** The form's and the backend's limits leave no valid value. */
  | { kind: "limits-conflict"; key: string }
  /**
   * The form's reader cannot read all of a source: the whole schema, or a
   * nested value of the backend. The properties were read one by one, and
   * those it cannot read keep only what keeps the AI out. One malformed
   * definition in `$defs` can make every property unreadable.
   */
  | { kind: "unreadable-source"; source: "schema" | "fields" };

/** What the AI may fill in a record of an entity, and how. */
export interface AiEntity {
  /** The sources the model was built from. */
  sources: { schema: boolean; fields: boolean };
  /** The fields the AI may fill, in the form's order. */
  fields: AiField[];
  /** The fields the AI leaves alone. */
  skipped: AiSkippedField[];
  /** Disagreements between the form and the backend, unreadable sources. */
  warnings: AiEntityWarning[];
}

/** The two descriptions of an entity, both in Mapo's JSON Schema dialect. */
export interface AiEntitySources {
  /**
   * The backend's schema: from `OPTIONS`, DRF metadata or an OpenAPI document,
   * normalized by `@mapomodule/utils`.
   */
  schema?: JSONSchema;
  /** The form's fields, as `fieldsToJsonSchema()` writes them. */
  fields?: JSONSchema;
}

/** Options of {@link buildAiEntity}. */
export interface BuildAiEntityOptions {
  /** Keys the AI never fills in this entity; `seo` covers `seo.title` too. */
  exclude?: readonly string[];
}

// ─── Looking through a property ──────────────────────────────────────────────
// The form's reader resolves a property for display: a nullable union keeps
// only its title and default, a `$ref` to nothing becomes a string. The AI
// needs more. A flag that keeps it out must count wherever it is written.

/** How deep `$ref`s and unions are followed: enough for real schemas, finite for cyclic ones. */
const MAX_DEPTH = 16;

const UNION_KEYWORDS = ["anyOf", "oneOf", "allOf"] as const;

/**
 * The schemas that apply only in some cases: the branches of `anyOf` and
 * `oneOf`, the `then` and `else` of a condition, the schemas of
 * `dependentSchemas`. What they say can keep the AI out, but never makes a
 * value required.
 */
function alternativesOf(schema: JSONSchema): Array<JSONSchema | undefined> {
  const dependent = schema.dependentSchemas;
  return [
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    schema.then,
    schema.else,
    ...(isRecord(dependent) ? Object.values(dependent) : []),
  ];
}

function allOfPartsOf(schema: JSONSchema): JSONSchema[] {
  return Array.isArray(schema.allOf) ? schema.allOf : [];
}

const MEDIA_TYPES = new Set(["file", "media", "media-m2m", "enhanced-media"]);

/** A property seen through its `$ref`s and wrappers. */
interface PropertyView {
  /** The property as written. */
  raw: JSONSchema;
  /**
   * Every schema on the way to the value, nearest first: the property, what
   * its `$ref`s point to, the one branch of each nullable or single-branch
   * union. A keyword is read from the first that has it; a limit is the
   * stricter of all of them.
   */
  path: JSONSchema[];
  /**
   * The value's own schema: the path merged, nearer schemas winning. Choice
   * lists and real unions stay as written.
   */
  core: JSONSchema;
  /**
   * Every schema a keyword of the property can sit on: the property, what
   * its `$ref`s point to, every branch of its unions.
   */
  variants: JSONSchema[];
  /** A `$ref` on the way to the value points to no definition. */
  unresolved: boolean;
}

/** `#/$defs/Item` and `#/definitions/Item` → `Item`. */
function defName(ref: string): string {
  return ref.replace(/^#\/\$defs\//, "").replace(/^#\/definitions\//, "");
}

function definitionsOf(root: JSONSchema): Record<string, JSONSchema> {
  const defs = root.$defs ?? root.definitions;
  return isRecord(defs) ? defs : {};
}

/**
 * The one value branch of a nullable or single-branch union, and the keywords
 * written beside the union. A lone `const` is a one-choice list, not a
 * wrapper, and stays as written.
 */
function valueBranch(
  schema: JSONSchema,
): { value: JSONSchema; beside: JSONSchema } | undefined {
  if (schema.discriminator) return undefined;
  for (const name of UNION_KEYWORDS) {
    const branches = schema[name];
    if (!Array.isArray(branches)) continue;
    const values = branches.filter(
      (branch) => isRecord(branch) && branch.type !== "null",
    );
    const value = values[0];
    const isSingle = values.length === 1 && value !== undefined;
    if (!isSingle || "const" in value) return undefined;
    const { [name]: _union, ...beside } = schema;
    return { value, beside };
  }
  return undefined;
}

function valuePath(
  raw: JSONSchema,
  defs: Record<string, JSONSchema>,
): { path: JSONSchema[]; core: JSONSchema; unresolved: boolean } {
  const path: JSONSchema[] = [raw];
  let core = raw;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const ref = core.$ref;
    if (typeof ref === "string") {
      const target = defs[defName(ref)];
      if (!isRecord(target)) return { path, core, unresolved: true };
      path.push(target);
      const { $ref: _ref, ...beside } = core;
      core = { ...target, ...beside };
      continue;
    }
    const branch = valueBranch(core);
    if (!branch) return { path, core, unresolved: false };
    path.push(branch.value);
    core = { ...branch.value, ...branch.beside };
  }
  return { path, core, unresolved: false };
}

function variantsOf(
  raw: JSONSchema,
  defs: Record<string, JSONSchema>,
): JSONSchema[] {
  const found: JSONSchema[] = [];
  const seen = new Set<JSONSchema>();
  const visit = (schema: JSONSchema | undefined, depth: number): void => {
    if (!isRecord(schema)) return;
    const isKnown = seen.has(schema);
    const isTooDeep = depth > MAX_DEPTH;
    if (isKnown || isTooDeep) return;
    seen.add(schema);
    found.push(schema);
    if (typeof schema.$ref === "string")
      visit(defs[defName(schema.$ref)], depth + 1);
    const branches = [...allOfPartsOf(schema), ...alternativesOf(schema)];
    for (const branch of branches) visit(branch, depth + 1);
  };
  visit(raw, 0);
  return found;
}

function viewOf(
  property: JSONSchema | undefined,
  defs: Record<string, JSONSchema>,
): PropertyView {
  const raw: JSONSchema = isRecord(property) ? property : {};
  const { path, core, unresolved } = valuePath(raw, defs);
  return { raw, path, core, variants: variantsOf(raw, defs), unresolved };
}

/** Any variant of the property holds `value` under `name`. */
function anyVariant(view: PropertyView, name: string, value: unknown): boolean {
  return view.variants.some((schema) => schema[name] === value);
}

/** A value the backend never sends back, or one shown as a password input. */
function isSecretView(view: PropertyView): boolean {
  const isPasswordInput = view.variants.some((schema) => {
    const attrs = schema[ATTRS_KEYWORD];
    return isRecord(attrs) && attrs.type === "password";
  });
  return (
    anyVariant(view, "writeOnly", true) ||
    anyVariant(view, "format", "password") ||
    isPasswordInput
  );
}

/** A file or a media, wherever the schema says so. */
function isMediaView(view: PropertyView): boolean {
  return view.variants.some((schema) => {
    const marked = schema[FIELD_KEYWORD];
    const isMediaMark = typeof marked === "string" && MEDIA_TYPES.has(marked);
    return isMediaMark || schema.format === "binary";
  });
}

/**
 * `x-mapo-ai` belongs to the property: the hint comes from the property and
 * the schemas on the way to its value, never from one of its choices. An
 * exclusion anywhere keeps the whole field out.
 */
function aiOptionsOf(view: PropertyView): AiPropertyOptions {
  const hint = view.path.map(readAiOptions).find((option) => option.hint)?.hint;
  const isExcluded = view.variants.some(
    (schema) => readAiOptions(schema).exclude === true,
  );
  return {
    ...(hint ? { hint } : {}),
    ...(isExcluded ? { exclude: true } : {}),
  };
}

/** A keyword from the first schema on the way to the value that has it. */
function keyword(view: PropertyView, name: string): unknown {
  return view.path.find((schema) => schema[name] !== undefined)?.[name];
}

function stringKeyword(view: PropertyView, name: string): string | undefined {
  const value = keyword(view, name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function jsonTypeOf(schema: JSONSchema): string | undefined {
  const type = Array.isArray(schema.type)
    ? schema.type.find((name) => name !== "null")
    : schema.type;
  return typeof type === "string" ? type : undefined;
}

function higher(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function lower(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/** The stricter value of a limit across the way to the value: both apply. */
function limit(
  view: PropertyView,
  name: string,
  stricter: (a?: number, b?: number) => number | undefined,
): number | undefined {
  let found: number | undefined;
  for (const schema of view.path) {
    const value = schema[name];
    if (typeof value === "number" && Number.isFinite(value))
      found = stricter(found, value);
  }
  return found;
}

function constraintsOf(view: PropertyView): AiConstraints {
  const patterns = view.path.flatMap((schema) =>
    typeof schema.pattern === "string" && schema.pattern.trim()
      ? [schema.pattern]
      : [],
  );
  const unique = [...new Set(patterns)];
  const steps = view.path.flatMap((schema) => {
    const step = schema.multipleOf;
    return typeof step === "number" && Number.isFinite(step) && step > 0
      ? [step]
      : [];
  });
  const uniqueSteps = [...new Set(steps)];
  return compact({
    minLength: limit(view, "minLength", higher),
    maxLength: limit(view, "maxLength", lower),
    minimum: limit(view, "minimum", higher),
    maximum: limit(view, "maximum", lower),
    exclusiveMinimum: limit(view, "exclusiveMinimum", higher),
    exclusiveMaximum: limit(view, "exclusiveMaximum", lower),
    minItems: limit(view, "minItems", higher),
    maxItems: limit(view, "maxItems", lower),
    patterns: unique.length ? unique : undefined,
    steps: uniqueSteps.length ? uniqueSteps : undefined,
  });
}

// ─── One property, as one source describes it ────────────────────────────────

/** One property, as one source describes it. */
interface Side {
  key: string;
  fieldType: string;
  /** The JSON type of the value, `null` aside. */
  jsonType?: string;
  label?: string;
  description?: string;
  ai: AiPropertyOptions;
  required: boolean;
  readonly: boolean;
  secret: boolean;
  media: boolean;
  translatable: boolean;
  multiple: boolean;
  choices?: AiChoice[];
  endpoint?: string;
  constraints: AiConstraints;
  /**
   * Mapo cannot read the value: the reader failed on it, or a `$ref` points
   * to no definition. Only what keeps the AI out counts.
   */
  unreadable: boolean;
}

/** The record without its `undefined` entries, so the model stays plain JSON. */
function compact<T extends object>(record: T): T {
  const entries = Object.entries(record).filter(
    ([, value]) => value !== undefined,
  );
  return Object.fromEntries(entries) as T;
}

/** The first of the values that is a string. */
function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string");
}

/**
 * The options `useFormFromSchema()` read, as the choices the AI can answer
 * with. An option is a record with a `value`, or a scalar that is its own
 * value, as the form's writer reads it; an array or a record without a
 * `value` is not one. The AI answers with scalars but `""`, which means
 * "none", and never with an option the operator cannot pick (`disabled`).
 * `undefined` when there is no list of options; `[]` when no option is one
 * the AI could give.
 */
function choicesOf(attrs: Record<string, unknown>): AiChoice[] | undefined {
  const options = attrs.options;
  if (!Array.isArray(options)) return undefined;
  const read = options.flatMap(
    (option): { value: unknown; label?: string; disabled?: boolean }[] => {
      const isScalar = typeof option !== "object" || option === null;
      if (isScalar) return [{ value: option }];
      if (!isRecord(option) || !("value" in option)) return [];
      return [
        {
          value: option.value,
          label: firstString(option.text, option.label),
          disabled: option.disabled === true,
        },
      ];
    },
  );
  if (!read.length) return undefined;
  return read.flatMap(({ value, label, disabled }): AiChoice[] => {
    const isAnswerable =
      (typeof value === "string" && value !== "") ||
      typeof value === "number" ||
      typeof value === "boolean";
    if (!isAnswerable || disabled) return [];
    return [{ value, label: label ?? String(value) }];
  });
}

/**
 * A choice value as a DRF backend matches it: by its text as Python writes
 * it. `1` and `"1"` are one choice, and so are `true` and `"True"`; `true`
 * and `"true"` are two.
 */
function choiceKey(value: AiChoice["value"]): string {
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

/**
 * The type `x-mapo-field` names, when the reader lost it: beside a nullable
 * union, it keeps only the title and the default.
 */
function markedTypeOf(view: PropertyView): string | undefined {
  const marked = keyword(view, FIELD_KEYWORD);
  return typeof marked === "string" && marked ? marked : undefined;
}

type Descriptor = ReturnType<typeof useFormFromSchema>[number];

function sideOf(descriptor: Descriptor, view: PropertyView): Side {
  const fieldType = markedTypeOf(view) ?? String(descriptor.type);
  const attrsValue: unknown = Reflect.get(descriptor, "attrs");
  const attrs = isRecord(attrsValue) ? attrsValue : {};
  const endpoint = attrs.endpoint;
  // The reader titles a `$ref` to nothing with the definition's name.
  const readerLabel: unknown = view.unresolved ? undefined : descriptor.label;
  const label =
    stringKeyword(view, "title") ??
    (typeof readerLabel === "string" && readerLabel ? readerLabel : undefined);
  // A text field shown as a password input holds a password.
  const isPasswordInput = attrs.type === "password";

  return compact({
    key: String(descriptor.key),
    fieldType,
    jsonType: jsonTypeOf(view.core),
    label,
    description: stringKeyword(view, "description"),
    ai: aiOptionsOf(view),
    required: descriptor.required === true,
    readonly:
      descriptor.readonly === true || anyVariant(view, "readOnly", true),
    secret:
      descriptor.noDraft === true || isPasswordInput || isSecretView(view),
    media: MEDIA_TYPES.has(fieldType) || isMediaView(view),
    translatable:
      descriptor.translatable === true ||
      keyword(view, "translatable") === true,
    multiple: attrs.multiple === true || fieldType === "m2m",
    choices: choicesOf(attrs),
    endpoint: typeof endpoint === "string" && endpoint ? endpoint : undefined,
    constraints: constraintsOf(view),
    unreadable: view.unresolved,
  });
}

/** A property the reader cannot read: only what keeps the AI out counts. */
function unreadableSide(
  key: string,
  view: PropertyView,
  required: boolean,
): Side {
  return compact({
    key,
    fieldType: markedTypeOf(view) ?? "unknown",
    jsonType: jsonTypeOf(view.core),
    label: stringKeyword(view, "title"),
    description: stringKeyword(view, "description"),
    ai: aiOptionsOf(view),
    required,
    readonly: anyVariant(view, "readOnly", true),
    secret: isSecretView(view),
    media: isMediaView(view),
    translatable: keyword(view, "translatable") === true,
    multiple: false,
    constraints: constraintsOf(view),
    unreadable: true,
  });
}

function tryRead(root: JSONSchema): Descriptor[] | undefined {
  try {
    return useFormFromSchema(root);
  } catch {
    return undefined;
  }
}

/** A warning added once, however many times it is found. */
function warnOnce(warnings: AiEntityWarning[], warning: AiEntityWarning): void {
  const text = JSON.stringify(warning);
  const isKnown = warnings.some((known) => JSON.stringify(known) === text);
  if (!isKnown) warnings.push(warning);
}

// ─── Every declaration of a property ─────────────────────────────────────────
// A property can be declared more than once: in an object and in its `allOf`
// parts, or, inside a nested value, in each branch of a union. Each
// declaration may say something that keeps the AI out, and any one counts.

/** What the declarations of a property, or the objects around a dotted key, say about the value. */
interface KeepOutFlags {
  secret: boolean;
  readonly: boolean;
  exclude: boolean;
  media: boolean;
}

const NO_FLAGS: Readonly<KeepOutFlags> = {
  secret: false,
  readonly: false,
  exclude: false,
  media: false,
};

/**
 * The schemas an object is made of, each with its own `properties`: the
 * object, every schema on the way to its value (what its `$ref`s point to, the
 * branch of a single-branch union), its `allOf` parts and, with
 * `withAlternatives`, its alternatives (union branches, conditions). Keywords
 * written beside a `$ref` never hide the target's: each schema counts as a
 * part of its own. The object's own parts come before its alternatives.
 */
function partsOf(
  schema: JSONSchema,
  defs: Record<string, JSONSchema>,
  withAlternatives: boolean,
): JSONSchema[] {
  const parts: JSONSchema[] = [];
  const seen = new Set<JSONSchema>();
  const visit = (raw: JSONSchema | undefined, depth: number): void => {
    if (!isRecord(raw)) return;
    const isTooDeep = depth > MAX_DEPTH;
    if (isTooDeep) return;
    for (const step of valuePath(raw, defs).path) {
      if (seen.has(step)) continue;
      seen.add(step);
      parts.push(step);
      const branches = withAlternatives
        ? [...allOfPartsOf(step), ...alternativesOf(step)]
        : allOfPartsOf(step);
      for (const branch of branches) visit(branch, depth + 1);
    }
  };
  visit(schema, 0);
  return parts;
}

/** Every declaration of `key` across the parts of an object, its own properties only. */
function declarationsOf(
  parts: readonly JSONSchema[],
  key: string,
): JSONSchema[] {
  return parts.flatMap((part) => {
    const properties = part.properties;
    const isDeclared = isRecord(properties) && Object.hasOwn(properties, key);
    const declaration = isDeclared ? properties[key] : undefined;
    return isRecord(declaration) ? [declaration] : [];
  });
}

/** One of the parts requires `key`. */
function isRequiredIn(parts: readonly JSONSchema[], key: string): boolean {
  return parts.some(
    (part) => Array.isArray(part.required) && part.required.includes(key),
  );
}

/** What the declarations of a property say about its value: any one counts. */
function flagsOf(
  declarations: readonly JSONSchema[],
  defs: Record<string, JSONSchema>,
): KeepOutFlags {
  const views = declarations.map((declaration) => viewOf(declaration, defs));
  return {
    secret: views.some(isSecretView),
    readonly: views.some((view) => anyVariant(view, "readOnly", true)),
    exclude: views.some((view) => aiOptionsOf(view).exclude === true),
    media: views.some(isMediaView),
  };
}

/**
 * A side read from one declaration, with the flags of `flagSources` and the
 * limits of `limitSources`. Alternatives give flags, never limits: a limit
 * that holds in one case only would wrongly narrow the others.
 */
function withEveryDeclaration(
  side: Side,
  flagSources: readonly JSONSchema[],
  limitSources: readonly JSONSchema[],
  defs: Record<string, JSONSchema>,
): Side {
  const flags = flagsOf(flagSources, defs);
  const constraints = limitSources.reduce(
    (merged, declaration) =>
      mergeConstraints(merged, constraintsOf(viewOf(declaration, defs))),
    side.constraints,
  );
  return {
    ...side,
    secret: side.secret || flags.secret,
    readonly: side.readonly || flags.readonly,
    media: side.media || flags.media,
    ai: flags.exclude ? { ...side.ai, exclude: true } : side.ai,
    constraints,
  };
}

/** The value may be null: a type list with `null`, or a union with a `null` branch. */
function isNullableView(view: PropertyView): boolean {
  return view.path.some((schema) => {
    const type = schema.type;
    const hasNullType = Array.isArray(type) && type.includes("null");
    const branches = UNION_KEYWORDS.flatMap((name) => {
      const union = schema[name];
      return Array.isArray(union) ? union : [];
    });
    const hasNullBranch = branches.some(
      (branch) => isRecord(branch) && branch.type === "null",
    );
    return hasNullType || hasNullBranch;
  });
}

// ─── Reading one source ──────────────────────────────────────────────────────

/**
 * Reads every property of a schema the way the form does: `useFormFromSchema()`
 * decides the field type, the choices, the endpoint and the flags, so the AI
 * sees the same fields the operator does. The view of each property adds what
 * the reader drops, and every declaration of a property counts, the root's
 * `allOf` parts included. When the reader fails on the whole schema, each
 * property is read on its own, and one it cannot read keeps what keeps the AI
 * out.
 */
function readSides(
  root: JSONSchema | undefined,
  source: "schema" | "fields",
  warnings: AiEntityWarning[],
): Map<string, Side> {
  const sides = new Map<string, Side>();
  if (!root) return sides;

  const defs = definitionsOf(root);
  // The root's unions are not shapes of the record; its `allOf` parts are.
  const parts = partsOf(root, defs, false);
  // The first declaration of a key describes it; every declaration adds its
  // flags and limits (below). A map, so a key such as `__proto__` stays data.
  const declared = new Map<string, JSONSchema>();
  for (const part of parts) {
    if (!isRecord(part.properties)) continue;
    for (const [key, declaration] of Object.entries(part.properties)) {
      if (!declared.has(key)) declared.set(key, declaration);
    }
  }
  const properties: Record<string, JSONSchema> = Object.fromEntries(declared);
  const keys = [...declared.keys()];
  if (!keys.length) return sides;
  const required = keys.filter((key) => isRequiredIn(parts, key));

  const sideFor = (key: string, descriptor: Descriptor | undefined): Side => {
    const view = viewOf(properties[key], defs);
    const side = descriptor
      ? sideOf(descriptor, view)
      : unreadableSide(key, view, required.includes(key));
    const declarations = declarationsOf(parts, key);
    return withEveryDeclaration(side, declarations, declarations, defs);
  };

  // One flat object, the shape the reader expects.
  const descriptors = tryRead({
    type: "object",
    properties,
    $defs: defs,
    ...(required.length ? { required } : {}),
  });
  if (descriptors) {
    for (const descriptor of descriptors) {
      const key = String(descriptor.key);
      sides.set(key, sideFor(key, descriptor));
    }
    return sides;
  }

  warnOnce(warnings, { kind: "unreadable-source", source });
  for (const key of keys) {
    const isRequired = required.includes(key);
    const single = tryRead({
      type: "object",
      properties: { [key]: properties[key] },
      $defs: defs,
      ...(isRequired ? { required: [key] } : {}),
    });
    sides.set(key, sideFor(key, single?.[0]));
  }
  return sides;
}

// ─── Looking a form key up in the backend ────────────────────────────────────

type Lookup = (
  key: string,
  readValue: boolean,
) => { inherited: KeepOutFlags; value?: Side };

/**
 * Looks form keys up in the backend's schema. A dotted key, such as
 * `seo.title`, is followed through the nested objects as far as they go. At
 * every step each declaration of the segment counts: in an object, in the
 * schemas on the way to its value, in its `allOf` parts and in its
 * alternatives (union branches, conditions). Together they pass on what keeps
 * the AI out (secret, read-only, excluded, media), even when the path stops
 * before the value: a JSON field, a map, a union.
 *
 * Alternatives never require a value and never give it limits. At the root
 * they are alternative records and count only for what keeps the AI out;
 * below the root they are alternative values, and describe the value when
 * nothing outside them does. A value is required only when every object on
 * the way requires it outside its alternatives and is not nullable. With
 * `readValue`, the backend's description of the value comes back as well.
 */
function backendLookup(root: JSONSchema, warnings: AiEntityWarning[]): Lookup {
  const defs = definitionsOf(root);
  const rootShapes = partsOf(root, defs, true);
  const rootRecord = partsOf(root, defs, false);

  return (key, readValue) => {
    const segments = key.split(".");
    const inherited: KeepOutFlags = { ...NO_FLAGS };
    let containers: JSONSchema[] = [root];
    let isRequired = true;

    for (const [index, segment] of segments.entries()) {
      const isRoot = index === 0;
      const shapes = isRoot
        ? rootShapes
        : containers.flatMap((container) => partsOf(container, defs, true));
      const outsideAlternatives = isRoot
        ? rootRecord
        : containers.flatMap((container) => partsOf(container, defs, false));
      const everywhere = declarationsOf(shapes, segment);

      const flags = flagsOf(everywhere, defs);
      inherited.secret = inherited.secret || flags.secret;
      inherited.readonly = inherited.readonly || flags.readonly;
      inherited.exclude = inherited.exclude || flags.exclude;
      inherited.media = inherited.media || flags.media;
      isRequired = isRequired && isRequiredIn(outsideAlternatives, segment);

      const isValue = index === segments.length - 1;
      if (isValue) {
        const record = declarationsOf(outsideAlternatives, segment);
        // Below the root an alternative describes the value when nothing
        // outside the alternatives does, but its limits do not count.
        const isFromAlternative = !isRoot && record.length === 0;
        const first = record[0] ?? (isRoot ? undefined : everywhere[0]);
        if (!readValue || !first) return { inherited };
        // The value alone, under the form's key, read like a top-level one.
        const valueRoot: JSONSchema = {
          type: "object",
          properties: { [key]: first },
          $defs: defs,
          ...(isRequired ? { required: [key] } : {}),
        };
        const value = readSides(valueRoot, "schema", warnings).get(key);
        if (!value) return { inherited };
        const own = isFromAlternative ? { ...value, constraints: {} } : value;
        return {
          inherited,
          value: withEveryDeclaration(own, everywhere, record, defs),
        };
      }

      if (!everywhere.length) return { inherited };
      const views = everywhere.map((declaration) => viewOf(declaration, defs));
      // A nullable object may be missing: its values are not required.
      if (views.some(isNullableView)) isRequired = false;
      containers = everywhere;
    }
    return { inherited };
  };
}

// ─── Value kinds ─────────────────────────────────────────────────────────────

const NESTED_TYPES = new Set(["repeater", "seo", "map"]);

function isNestedType(type: string): boolean {
  return (
    NESTED_TYPES.has(type) ||
    type.startsWith("object:") ||
    type.startsWith("field:")
  );
}

function isRelationType(type: string): boolean {
  return type === "fks" || type === "m2m";
}

const KIND_BY_FIELD_TYPE: Readonly<Record<string, AiValueKind>> = {
  text: "string",
  textarea: "text",
  editor: "html",
  email: "email",
  url: "url",
  color: "color",
  boolean: "boolean",
  switch: "boolean",
  date: "date",
  datetime: "datetime",
  time: "time",
  select: "choice",
  fks: "relation",
  m2m: "relation",
};

/** A type Mapo does not know: the value it holds decides. */
const KIND_BY_JSON_TYPE: Readonly<Record<string, AiValueKind>> = {
  string: "string",
  integer: "integer",
  number: "number",
  boolean: "boolean",
};

/** The JSON types a value of each kind may have. Choices and relations are checked on their own. */
const JSON_TYPES_BY_KIND: Readonly<
  Partial<Record<AiValueKind, readonly string[]>>
> = {
  string: ["string"],
  text: ["string"],
  html: ["string"],
  email: ["string"],
  url: ["string"],
  color: ["string"],
  date: ["string"],
  datetime: ["string"],
  time: ["string"],
  integer: ["integer", "number"],
  number: ["integer", "number"],
  boolean: ["boolean"],
};

/** Kinds a backend `enum` can narrow to a choice. */
const NARROWABLE_KINDS = new Set<AiValueKind>([
  "string",
  "integer",
  "number",
  "choice",
]);

type KindOrSkip =
  | {
      kind: AiValueKind;
      /** The kind comes from the backend: the form's type is a custom one. */
      borrowed: boolean;
    }
  | { reason: AiSkipReason };

/** The kind a field type gives, or why it gives none; `undefined` for a type Mapo does not know. */
function kindOfType(
  type: string,
  field: Side,
  backend: Side | undefined,
): KindOrSkip | undefined {
  if (isNestedType(type)) return { reason: "unsupported" };
  const isNumber = type === "number" || type === "slider";
  if (isNumber) {
    // An integer on either side keeps the value an integer.
    const isInteger =
      field.jsonType === "integer" || backend?.jsonType === "integer";
    return { kind: isInteger ? "integer" : "number", borrowed: false };
  }
  const known = KIND_BY_FIELD_TYPE[type];
  return known ? { kind: known, borrowed: false } : undefined;
}

function kindOf(field: Side, backend: Side | undefined): KindOrSkip {
  const own = kindOfType(field.fieldType, field, backend);
  if (own) return own;

  // A custom field type: the backend's field type, then the value's JSON type.
  const fromBackend = backend
    ? kindOfType(backend.fieldType, field, backend)
    : undefined;
  if (fromBackend)
    return "kind" in fromBackend
      ? { ...fromBackend, borrowed: true }
      : fromBackend;
  const jsonType = field.jsonType ?? backend?.jsonType;
  const custom = jsonType ? KIND_BY_JSON_TYPE[jsonType] : undefined;
  return custom ? { kind: custom, borrowed: false } : { reason: "unsupported" };
}

/** One of the two sides gives the value a JSON type the kind accepts. */
function hasValueType(
  kind: AiValueKind,
  field: Side,
  backend: Side | undefined,
): boolean {
  const accepted = JSON_TYPES_BY_KIND[kind];
  if (!accepted) return true;
  return [field.jsonType, backend?.jsonType].some(
    (type) => type !== undefined && accepted.includes(type),
  );
}

function valueJsonType(value: AiChoice["value"]): string {
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

// ─── Merging the two sources ─────────────────────────────────────────────────

/** The stricter of two sets of limits. */
function mergeConstraints(
  field: AiConstraints,
  backend: AiConstraints | undefined,
): AiConstraints {
  if (!backend) return field;
  const patterns = [
    ...new Set([...(field.patterns ?? []), ...(backend.patterns ?? [])]),
  ];
  const steps = [
    ...new Set([...(field.steps ?? []), ...(backend.steps ?? [])]),
  ];
  return compact({
    minLength: higher(field.minLength, backend.minLength),
    maxLength: lower(field.maxLength, backend.maxLength),
    minimum: higher(field.minimum, backend.minimum),
    maximum: lower(field.maximum, backend.maximum),
    exclusiveMinimum: higher(field.exclusiveMinimum, backend.exclusiveMinimum),
    exclusiveMaximum: lower(field.exclusiveMaximum, backend.exclusiveMaximum),
    minItems: higher(field.minItems, backend.minItems),
    maxItems: lower(field.maxItems, backend.maxItems),
    patterns: patterns.length ? patterns : undefined,
    steps: steps.length ? steps : undefined,
  });
}

/** `low` is above `high`: no value lies between them. */
function crosses(low?: number, high?: number, inclusive = true): boolean {
  if (low === undefined || high === undefined) return false;
  return inclusive ? low > high : low >= high;
}

/** No value can meet these limits. */
function hasImpossibleLimits(limits: AiConstraints): boolean {
  return (
    crosses(limits.minLength, limits.maxLength) ||
    crosses(limits.minItems, limits.maxItems) ||
    crosses(limits.minimum, limits.maximum) ||
    crosses(limits.exclusiveMinimum, limits.maximum, false) ||
    crosses(limits.minimum, limits.exclusiveMaximum, false) ||
    crosses(limits.exclusiveMinimum, limits.exclusiveMaximum, false)
  );
}

/**
 * The field's choices the backend accepts (compared by `choiceKey()`), or the
 * backend's when the field has none. `null` when the two lists share none,
 * unless neither holds a value the AI could give: then `[]`, nothing to
 * choose.
 */
function mergeChoices(
  field: Side,
  backend: Side | undefined,
): AiChoice[] | undefined | null {
  const accepted = backend?.choices;
  if (!accepted) return field.choices;
  if (!field.choices) return accepted;
  const acceptedKeys = new Set(
    accepted.map((choice) => choiceKey(choice.value)),
  );
  const common = field.choices.filter((choice) =>
    acceptedKeys.has(choiceKey(choice.value)),
  );
  // Two lists with no value the AI could give agree: nothing to choose.
  const areBothEmpty = !field.choices.length && !accepted.length;
  return common.length || areBothEmpty ? common : null;
}

/**
 * One choice per value the backend tells apart (see `choiceKey()`): of `1`
 * and `"1"`, the first that fits the field's kind, otherwise the first listed.
 */
function onePerValue(
  choices: readonly AiChoice[],
  fits: (choice: AiChoice) => boolean,
): AiChoice[] {
  const kept = new Map<string, AiChoice>();
  for (const choice of choices) {
    const key = choiceKey(choice.value);
    const current = kept.get(key);
    const isBetter = !current || (!fits(current) && fits(choice));
    if (isBetter) kept.set(key, choice);
  }
  return [...kept.values()];
}

function warnAboutConflicts(
  field: Side,
  backend: Side | undefined,
  isBackendReadonly: boolean,
  warnings: AiEntityWarning[],
): void {
  const fieldJsonType = field.jsonType;
  const schemaJsonType = backend?.jsonType;
  // A relation holds a record on the form and its key on the backend.
  const isRelation =
    isRelationType(field.fieldType) ||
    (backend !== undefined && isRelationType(backend.fieldType));
  if (fieldJsonType !== undefined && schemaJsonType !== undefined) {
    // Integer and number are the same JSON value for a comparison.
    const asNumber = (type: string) => (type === "integer" ? "number" : type);
    const typesDiffer = asNumber(fieldJsonType) !== asNumber(schemaJsonType);
    if (typesDiffer && !isRelation)
      warnings.push({
        kind: "type-conflict",
        key: field.key,
        fieldJsonType,
        schemaJsonType,
      });
  }

  const onlyBackendReadonly = isBackendReadonly && !field.readonly;
  if (onlyBackendReadonly)
    warnings.push({ kind: "readonly-conflict", key: field.key });
}

/** A key that names a password: `password`, `new_password`, `passwd`, `passphrase`… */
const PASSWORD_KEY = /pass(?:word|wd|phrase)/i;

/**
 * Endings of a word of a key that name a secret: `token`, `authtoken`,
 * `client_secret`, `clientsecret`, `apikey`, `privatekey`, `smtppwd`. A word
 * that only begins so, such as `tokenizer` or `secretary`, names none.
 */
const SECRET_ENDINGS = [
  "token",
  "secret",
  "apikey",
  "privatekey",
  "accesskey",
  "secretkey",
].flatMap((ending) => [ending, `${ending}s`]);

/** Two words of a key that name a secret together: `api_key`, `privateKey`. */
const SECRET_PAIRS = new Set(
  ["api", "private", "access"].flatMap((kind) => [
    `${kind} key`,
    `${kind} keys`,
  ]),
);

/**
 * The words of a key, in lower case, split at `_`, `-`, `.`, camel case and
 * digits: `auth_token` → `auth`, `token`; `apiKey2` and `APIKey2` → `api`,
 * `key`, `2`.
 */
function keyWords(key: string): string[] {
  return key
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * A key that names a secret: a password anywhere in it (`pwd` as a word),
 * or a word that ends in a token, a secret, an API, private, access or
 * secret key, or an API, private or access key in two words. `secretary`,
 * `tokenizer` and `keynote` name none.
 */
function namesSecret(key: string): boolean {
  if (PASSWORD_KEY.test(key)) return true;
  const words = keyWords(key);
  const hasSecretWord = words.some(
    (word) =>
      word === "pwd" || SECRET_ENDINGS.some((ending) => word.endsWith(ending)),
  );
  const hasSecretPair = words.some((word, index) =>
    SECRET_PAIRS.has(`${word} ${words[index + 1] ?? ""}`),
  );
  return hasSecretWord || hasSecretPair;
}

function mergeField(
  field: Side,
  backend: Side | undefined,
  inherited: Readonly<KeepOutFlags>,
  isListedAsExcluded: boolean,
  warnings: AiEntityWarning[],
): AiField | AiSkippedField {
  // A backend description Mapo could not read counts only for what keeps
  // the AI out, and for its limits.
  const described = backend?.unreadable ? undefined : backend;
  const label = field.label ?? described?.label;
  const skip = (reason: AiSkipReason): AiSkippedField =>
    compact({ key: field.key, fieldType: field.fieldType, label, reason });

  const isBackendReadonly = backend?.readonly === true || inherited.readonly;
  warnAboutConflicts(field, described, isBackendReadonly, warnings);

  // A secret anywhere stays out: the stricter wins.
  const isSecret =
    field.secret ||
    backend?.secret === true ||
    inherited.secret ||
    namesSecret(field.key);
  if (isSecret) return skip("secret");
  // The form decides what is read-only; the backend only warns.
  if (field.readonly) return skip("readonly");
  const isExcluded =
    isListedAsExcluded ||
    field.ai.exclude === true ||
    backend?.ai.exclude === true ||
    inherited.exclude;
  if (isExcluded) return skip("excluded");
  // The AI never writes a file or a media id, whichever side says so.
  const isMedia = field.media || backend?.media === true || inherited.media;
  if (isMedia) return skip("media");
  if (field.unreadable) return skip("unsupported");

  const kindOrSkip = kindOf(field, described);
  if ("reason" in kindOrSkip) return skip(kindOrSkip.reason);
  const baseKind = kindOrSkip.kind;
  if (!hasValueType(baseKind, field, described)) return skip("unsupported");

  const endpoint = field.endpoint ?? described?.endpoint;
  const isRelation = baseKind === "relation";
  if (isRelation && !endpoint) return skip("relation");

  const canHaveChoices = NARROWABLE_KINDS.has(baseKind);
  const merged = canHaveChoices ? mergeChoices(field, described) : undefined;
  // A backend `enum` on a text or number field narrows it to a choice, if
  // its values are of the field's type.
  const narrowedTypes = JSON_TYPES_BY_KIND[baseKind];
  const fitsKind = (choice: AiChoice) =>
    !narrowedTypes || narrowedTypes.includes(valueJsonType(choice.value));
  const choices = merged ? onePerValue(merged, fitsKind) : merged;
  const choicesFitType = !choices || choices.every(fitsKind);
  if (choices === null || !choicesFitType) {
    warnings.push({ kind: "choices-conflict", key: field.key });
    return skip("conflict");
  }
  const kind = choices ? "choice" : baseKind;
  // No list, or a list of "none" alone: nothing the AI could answer.
  const isChoiceWithoutChoices = kind === "choice" && !choices?.length;
  if (isChoiceWithoutChoices) return skip("unsupported");

  const constraints = mergeConstraints(field.constraints, backend?.constraints);
  if (hasImpossibleLimits(constraints)) {
    warnings.push({ kind: "limits-conflict", key: field.key });
    return skip("conflict");
  }

  // A custom field over a backend list keeps the list.
  const isBorrowedList = kindOrSkip.borrowed && described?.multiple === true;
  return compact({
    key: field.key,
    fieldType: field.fieldType,
    kind,
    label,
    description: field.description ?? described?.description,
    hint: field.ai.hint ?? described?.ai.hint,
    required: field.required || backend?.required === true,
    translatable: field.translatable,
    multiple: field.multiple || isBorrowedList,
    choices,
    endpoint: isRelation ? endpoint : undefined,
    constraints,
  });
}

/**
 * Builds the entity model from the backend's schema, the form's fields, or
 * both:
 * - with one source, that source describes the entity;
 * - with both, the fields decide which fields exist, their type, choices,
 *   labels and read-only state, because the AI fills only what the operator
 *   reviews; the backend's constraints add up and the stricter wins (required
 *   on either side, the lower `maxLength`, only the choices the backend
 *   accepts…), and a disagreement becomes a warning. A dotted form key is
 *   looked up inside the backend's nested objects, and every object on the
 *   way passes on what keeps the AI out.
 *
 * Fail-soft: when the form's reader cannot read a source, its properties are
 * read one by one, and those it cannot read keep only what keeps the AI out.
 *
 * @param sources Both descriptions, in Mapo's JSON Schema dialect.
 * @param options `exclude` keeps keys of this entity away from the AI.
 * @returns The fields the AI may fill, those it leaves alone and why, and
 *   the warnings for the developer.
 *
 * @example
 * const entity = buildAiEntity({
 *   schema: drfMetadataToJsonSchema(metadata),
 *   fields: fieldsToJsonSchema(fields),
 * });
 */
export function buildAiEntity(
  sources: AiEntitySources,
  options: BuildAiEntityOptions = {},
): AiEntity {
  const warnings: AiEntityWarning[] = [];
  const hasFields = sources.fields !== undefined;
  const fromFields = readSides(sources.fields, "fields", warnings);
  const fromSchema = readSides(sources.schema, "schema", warnings);
  const decides = hasFields ? fromFields : fromSchema;
  const exclusions = options.exclude ?? [];

  const lookup = sources.schema
    ? backendLookup(sources.schema, warnings)
    : undefined;

  /** The backend's description of a form key, and what all its declarations and the objects around it pass on. */
  const backendOf = (
    key: string,
  ): { backend?: Side; inherited: Readonly<KeepOutFlags> } => {
    if (!lookup) return { inherited: NO_FLAGS };
    const exact = hasFields ? fromSchema.get(key) : undefined;
    const found = lookup(key, hasFields && !exact);
    const backend = hasFields ? (exact ?? found.value) : undefined;
    return { backend, inherited: found.inherited };
  };

  const fields: AiField[] = [];
  const skipped: AiSkippedField[] = [];
  for (const field of decides.values()) {
    const isListedAsExcluded = exclusions.some(
      (excluded) =>
        field.key === excluded || field.key.startsWith(`${excluded}.`),
    );
    const { backend, inherited } = backendOf(field.key);
    // Without fields the backend is the form: any declaration that says
    // read-only decides.
    const primary = hasFields
      ? field
      : { ...field, readonly: field.readonly || inherited.readonly };
    const merged = mergeField(
      primary,
      backend,
      inherited,
      isListedAsExcluded,
      warnings,
    );
    if ("reason" in merged) skipped.push(merged);
    else fields.push(merged);
  }

  return {
    sources: { schema: sources.schema !== undefined, fields: hasFields },
    fields,
    skipped,
    warnings,
  };
}
