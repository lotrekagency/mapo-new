// Cherry-picked from structured-widget-editor (MIT License, Copyright (c) 2026 bnznamco)
// Source: https://github.com/bnznamco/structured-widget-editor/blob/main/src/SchemaForm.vue (resolveSchema method)
// Modifications: extracted as standalone function, converted to TypeScript.

import type { JSONSchema } from "./types.js";

/** Maximum recursion depth allowed when resolving nested schema references. */
const MAX_RESOLVE_DEPTH = 32;

/**
 * Recursively resolves a JSON Schema by following `$ref`, `anyOf`, and `oneOf` pointers.
 *
 * - `$ref` is dereferenced against the provided `defs` map.
 * - `anyOf` / `oneOf` with a single non-null branch is unwrapped; nullable schemas
 *   are marked with `_nullable: true`.
 * - A `oneOf` paired with a `discriminator` is returned as-is (handled by union editors).
 *
 * @param schema - The schema node to resolve.
 * @param defs   - Flat map of reusable definitions (`$defs` / `definitions`).
 * @param seen   - WeakSet used to detect circular references across recursive calls.
 * @param depth  - Current recursion depth; capped at {@link MAX_RESOLVE_DEPTH}.
 * @returns The fully resolved schema node.
 */
export function resolveSchema(
  schema: JSONSchema,
  defs: Record<string, JSONSchema>,
  seen: WeakSet<JSONSchema> = new WeakSet(),
  depth = 0,
): JSONSchema {
  if (!schema) return { type: "string" };

  // Cycle guard: self-referential schemas (e.g. nested comments, tree categories)
  // would recurse infinitely. Return a stripped-down object node instead.
  if (seen.has(schema) || depth > MAX_RESOLVE_DEPTH) {
    const { $ref: _ref, anyOf: _ao, oneOf: _oo, ...rest } = schema;
    return { type: "object", ...rest };
  }
  seen.add(schema);

  if (schema.$ref) {
    const refPath = schema.$ref
      .replace(/^#\/\$defs\//, "")
      .replace(/^#\/definitions\//, "");
    const resolved = defs[refPath];
    if (!resolved) return { type: "string", title: refPath };
    const { $ref: _ref, ...rest } = schema;
    return { ...resolveSchema(resolved, defs, seen, depth + 1), ...rest };
  }

  if (schema.anyOf) {
    const nonNull = schema.anyOf.filter((s) => s.type !== "null");
    const hasNull = schema.anyOf.some((s) => s.type === "null");
    if (hasNull && nonNull.length === 1) {
      // Optional field pattern: `anyOf: [T, null]` → unwrap T, mark nullable
      const resolved = resolveSchema(nonNull[0]!, defs, seen, depth + 1);
      return {
        ...resolved,
        _nullable: true,
        title: schema.title ?? resolved.title,
        default: "default" in schema ? schema.default : null,
      };
    }
    if (nonNull.length >= 1)
      return resolveSchema(nonNull[0]!, defs, seen, depth + 1);
  }

  // oneOf + discriminator → pass through as-is (handled by UnionEditor / MapoRepeater templates)
  if (schema.oneOf && schema.discriminator) return schema;

  if (schema.oneOf) {
    const nonNull = schema.oneOf.filter((s) => s.type !== "null");
    const hasNull = schema.oneOf.some((s) => s.type === "null");
    if (hasNull && nonNull.length === 1) {
      // Optional field pattern: `oneOf: [T, null]` → unwrap T, mark nullable
      const resolved = resolveSchema(nonNull[0]!, defs, seen, depth + 1);
      return {
        ...resolved,
        _nullable: true,
        title: schema.title ?? resolved.title,
        default: "default" in schema ? schema.default : null,
      };
    }
    if (nonNull.length >= 1)
      return resolveSchema(nonNull[0]!, defs, seen, depth + 1);
  }

  return schema;
}

/**
 * Extracts the reusable definitions map from a root JSON Schema.
 * Supports both the modern `$defs` keyword and the legacy `definitions` keyword.
 *
 * @param schema - The root schema object.
 * @returns A flat record of named sub-schemas.
 */
export function extractDefs(schema: JSONSchema): Record<string, JSONSchema> {
  return schema.$defs ?? schema.definitions ?? {};
}

/**
 * Derives a sensible empty/zero default value for a given JSON Schema node.
 *
 * If the schema declares an explicit `default`, that value is deep-cloned and returned.
 * Otherwise, a type-appropriate zero value is produced:
 * - `object` → object with per-property defaults
 * - `array`  → `[]`
 * - `string` → `""`
 * - `integer` / `number` → `0`
 * - `boolean` → `false`
 * - `relation` → `null` (or `[]` when `multiple: true`)
 *
 * @param schema - The resolved schema node.
 * @returns The default value inferred from the schema type.
 */
export function getDefaultForSchema(schema: JSONSchema): unknown {
  if ("default" in schema) return structuredClone(schema.default);
  if (schema.type === "object") {
    const obj: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      if ("default" in prop) obj[key] = structuredClone(prop.default);
      else if (prop.type === "string") obj[key] = "";
      else if (prop.type === "integer" || prop.type === "number") obj[key] = 0;
      else if (prop.type === "boolean") obj[key] = false;
      else if (prop.type === "array") obj[key] = [];
    }
    return obj;
  }
  if (schema.type === "array") return [];
  if (schema.type === "string") return "";
  if (schema.type === "integer" || schema.type === "number") return 0;
  if (schema.type === "boolean") return false;
  if (schema.type === "relation")
    return (schema as JSONSchema & { multiple?: boolean }).multiple ? [] : null;
  return null;
}
