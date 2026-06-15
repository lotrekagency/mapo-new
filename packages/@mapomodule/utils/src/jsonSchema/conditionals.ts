// Cherry-picked from structured-widget-editor (MIT License, Copyright (c) 2026 bnznamco)
// Source: https://github.com/bnznamco/structured-widget-editor/blob/main/src/conditionals.js
// Modifications: converted to TypeScript, added type annotations.

import type { JSONSchema } from "./types.js";

/**
 * Maximum number of resolution passes for cascading conditionals: a merged branch
 * may introduce new `if` rules, so we iterate until the schema stabilises or this
 * cap is hit (whichever comes first).
 */
const MAX_CONDITIONAL_PASSES = 8;

/**
 * Returns `true` if `value` is a non-null object that contains `key` with a
 * non-empty, non-null, non-undefined value.
 */
function isPresent(value: unknown, key: string): boolean {
  if (value == null || typeof value !== "object") return false;
  if (!(key in (value as Record<string, unknown>))) return false;
  const v = (value as Record<string, unknown>)[key];
  return v !== undefined && v !== null && v !== "";
}

/**
 * Checks whether a single property value satisfies the constraints defined by
 * a JSON Schema node (type, const, enum, numeric/string bounds, not, etc.).
 */
function matchesPropertyConstraint(
  value: unknown,
  constraint: JSONSchema,
): boolean {
  if (!constraint || typeof constraint !== "object") return true;
  if ("const" in constraint) return value === constraint.const;
  if (Array.isArray(constraint.enum)) return constraint.enum.includes(value);
  if (constraint.type) {
    const t = constraint.type;
    if (t === "string" && typeof value !== "string") return false;
    if (t === "number" && typeof value !== "number") return false;
    if (
      t === "integer" &&
      (typeof value !== "number" || !Number.isInteger(value))
    )
      return false;
    if (t === "boolean" && typeof value !== "boolean") return false;
    if (t === "null" && value !== null) return false;
    if (t === "array" && !Array.isArray(value)) return false;
    if (
      t === "object" &&
      (value == null || typeof value !== "object" || Array.isArray(value))
    )
      return false;
  }
  if (typeof value === "number") {
    if (typeof constraint.minimum === "number" && value < constraint.minimum)
      return false;
    if (typeof constraint.maximum === "number" && value > constraint.maximum)
      return false;
    if (
      typeof constraint.exclusiveMinimum === "number" &&
      value <= constraint.exclusiveMinimum
    )
      return false;
    if (
      typeof constraint.exclusiveMaximum === "number" &&
      value >= constraint.exclusiveMaximum
    )
      return false;
    if (
      typeof constraint.multipleOf === "number" &&
      constraint.multipleOf > 0
    ) {
      const q = value / constraint.multipleOf;
      if (Math.abs(q - Math.round(q)) > 1e-9) return false;
    }
  }
  if (typeof value === "string") {
    if (
      typeof constraint.minLength === "number" &&
      value.length < constraint.minLength
    )
      return false;
    if (
      typeof constraint.maxLength === "number" &&
      value.length > constraint.maxLength
    )
      return false;
    if (typeof constraint.pattern === "string") {
      try {
        if (!new RegExp(constraint.pattern).test(value)) return false;
      } catch {
        return false;
      }
    }
  }
  if (constraint.not) return !matchesSchema(value, constraint.not);
  return true;
}

/**
 * Evaluates whether `value` satisfies all constraints in `schema`.
 * Handles `required`, `properties`, `not`, `allOf`, `anyOf`, `oneOf`,
 * `dependentRequired`, and nested `if/then/else` rules.
 *
 * @param value  - The data value to validate.
 * @param schema - The JSON Schema node to validate against.
 * @returns `true` if the value conforms to the schema.
 */
export function matchesSchema(value: unknown, schema: JSONSchema): boolean {
  if (!schema || typeof schema !== "object") return true;

  if (Array.isArray(schema.required)) {
    for (const k of schema.required) {
      if (!isPresent(value, k)) return false;
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    for (const [k, constraint] of Object.entries(schema.properties)) {
      if (value == null || !(k in (value as Record<string, unknown>))) continue;
      if (
        !matchesPropertyConstraint(
          (value as Record<string, unknown>)[k],
          constraint,
        )
      )
        return false;
    }
  }

  if (schema.not && matchesSchema(value, schema.not)) return false;
  if (
    Array.isArray(schema.allOf) &&
    !schema.allOf.every((s) => matchesSchema(value, s))
  )
    return false;
  if (
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some((s) => matchesSchema(value, s))
  )
    return false;
  if (Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.filter((s) => matchesSchema(value, s)).length;
    if (matched !== 1) return false;
  }

  return true;
}

/**
 * Inserts `newEntries` into the `properties` map immediately after `anchorKey`.
 * If `anchorKey` is `null` or not found, entries are appended at the end.
 * Existing keys that appear in `newEntries` are moved to the anchor position
 * rather than duplicated.
 */
function insertAfter(
  properties: Record<string, JSONSchema>,
  anchorKey: string | null,
  newEntries: [string, JSONSchema][],
): Record<string, JSONSchema> {
  const existingKeys = Object.keys(properties);
  const anchorIdx = anchorKey ? existingKeys.indexOf(anchorKey) : -1;
  if (anchorIdx === -1) {
    const out: Record<string, JSONSchema> = { ...properties };
    for (const [k, v] of newEntries) out[k] = v;
    return out;
  }
  const out: Record<string, JSONSchema> = {};
  for (let i = 0; i < existingKeys.length; i++) {
    const key = existingKeys[i]!;
    out[key] = properties[key]!;
    if (i === anchorIdx) {
      for (const [k, v] of newEntries) {
        if (!(k in properties)) out[k] = v;
      }
    }
  }
  for (const [k, v] of newEntries) {
    if (k in properties) out[k] = v;
  }
  return out;
}

/**
 * Merges a conditional branch schema into `target` in-place.
 * Properties are inserted after `anchorKey` to preserve visual ordering.
 * `required`, `allOf`, `dependentSchemas`, and `dependentRequired` are merged
 * additively rather than replaced.
 */
function mergeBranch(
  target: JSONSchema,
  branch: JSONSchema,
  anchorKey: string | null,
): JSONSchema {
  if (!branch || typeof branch !== "object") return target;

  if (branch.properties) {
    const merged: [string, JSONSchema][] = [];
    for (const [k, v] of Object.entries(branch.properties)) {
      const existing = target.properties?.[k];
      merged.push([k, existing ? { ...existing, ...v } : v]);
    }
    target.properties = insertAfter(target.properties || {}, anchorKey, merged);
  }

  if (Array.isArray(branch.required)) {
    const set = new Set(target.required || []);
    for (const k of branch.required) set.add(k);
    target.required = Array.from(set);
  }

  if (branch.allOf) target.allOf = [...(target.allOf || []), ...branch.allOf];
  if (branch.if)
    target.allOf = [
      ...(target.allOf || []),
      { if: branch.if, then: branch.then, else: branch.else },
    ];
  if (branch.dependentSchemas)
    target.dependentSchemas = {
      ...(target.dependentSchemas || {}),
      ...branch.dependentSchemas,
    };
  if (branch.dependentRequired)
    target.dependentRequired = {
      ...(target.dependentRequired || {}),
      ...branch.dependentRequired,
    };

  return target;
}

/**
 * Evaluates all conditional keywords in `schema` against `value` and returns
 * an effective schema with the appropriate branches merged in.
 *
 * Supported conditional keywords:
 * - `if / then / else` (top-level and inside `allOf`)
 * - `dependentSchemas` / `dependentRequired`
 *
 * Iteration is repeated up to {@link MAX_CONDITIONAL_PASSES} times to handle cascading
 * conditionals where a merged branch introduces new `if` rules. Stops early when the
 * schema stabilises between iterations.
 *
 * @param schema   - The base schema to evaluate.
 * @param value    - The current form data used to resolve conditionals.
 * @param resolver - Optional function to resolve `$ref` pointers inside branches.
 * @returns A new schema with all applicable branches merged.
 */
export function applyConditionals(
  schema: JSONSchema,
  value: unknown,
  resolver?: (s: JSONSchema) => JSONSchema,
): JSONSchema {
  const resolve =
    typeof resolver === "function" ? resolver : (s: JSONSchema) => s;
  if (!schema || typeof schema !== "object") return schema;
  if (schema.type !== "object" && !schema.properties) return schema;

  const effective: JSONSchema = {
    ...schema,
    properties: { ...(schema.properties || {}) },
    required: Array.isArray(schema.required) ? [...schema.required] : [],
  };

  const safeValue = value && typeof value === "object" ? value : {};

  const anchorOf = (ifClause: JSONSchema): string | null => {
    if (!ifClause || typeof ifClause !== "object") return null;
    const props = ifClause.properties && Object.keys(ifClause.properties);
    if (props && props.length) return props[0]!;
    if (Array.isArray(ifClause.required) && ifClause.required.length)
      return ifClause.required[0]!;
    return null;
  };

  interface ConditionalRule {
    if: JSONSchema;
    then?: JSONSchema;
    else?: JSONSchema;
    anchor: string | null;
  }

  const rules: ConditionalRule[] = [];
  if (effective.if) {
    rules.push({
      if: effective.if,
      then: effective.then,
      else: effective.else,
      anchor: anchorOf(effective.if),
    });
  }
  if (Array.isArray(effective.allOf)) {
    for (const entry of effective.allOf) {
      if (entry && typeof entry === "object" && entry.if) {
        rules.push({
          if: entry.if,
          then: entry.then,
          else: entry.else,
          anchor: anchorOf(entry.if),
        });
      } else if (
        entry &&
        typeof entry === "object" &&
        (entry.properties || entry.required)
      ) {
        mergeBranch(effective, entry, null);
      }
    }
  }

  for (let i = 0; i < MAX_CONDITIONAL_PASSES; i++) {
    const before = JSON.stringify({
      p: effective.properties,
      r: effective.required,
    });

    for (const rule of rules) {
      const matched = matchesSchema(safeValue, rule.if);
      const branch = matched ? rule.then : rule.else;
      if (branch) mergeBranch(effective, resolve(branch), rule.anchor);
    }

    if (effective.dependentSchemas) {
      for (const [key, branch] of Object.entries(effective.dependentSchemas)) {
        if (isPresent(safeValue, key))
          mergeBranch(effective, resolve(branch), key);
      }
    }

    if (effective.dependentRequired) {
      for (const [key, requiredKeys] of Object.entries(
        effective.dependentRequired,
      )) {
        if (isPresent(safeValue, key) && Array.isArray(requiredKeys)) {
          const set = new Set(effective.required || []);
          for (const k of requiredKeys) set.add(k);
          effective.required = Array.from(set);
        }
      }
    }

    const after = JSON.stringify({
      p: effective.properties,
      r: effective.required,
    });
    if (after === before) break;
  }

  return effective;
}

/**
 * Returns `true` if the schema contains any conditional keywords that could
 * affect the visible set of properties at runtime.
 *
 * Checked keywords: `if`, `dependentSchemas`, `dependentRequired`, and
 * any `if` entries nested inside `allOf`.
 *
 * @param schema - The schema to inspect.
 */
export function hasConditionals(schema: JSONSchema): boolean {
  if (!schema || typeof schema !== "object") return false;
  if (schema.if || schema.dependentSchemas || schema.dependentRequired)
    return true;
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.some(
      (e) => e && typeof e === "object" && (e.if || e.dependentSchemas),
    );
  }
  return false;
}
