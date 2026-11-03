import type { JSONSchema } from "./types.js";

/**
 * Decimals as Django checks them, in JSON Schema: a number with at most
 * `decimal_places` decimals (`multipleOf`) and `max_digits` digits in all,
 * so at most `max_digits - decimal_places` before the point (a value between
 * `-10^digits` and `10^digits`, both excluded).
 */

/** `10^exponent` as the literal `1e-2` reads it: `10 ** -2` may round differently. */
function powerOfTen(exponent: number): number {
  return Number(`1e${exponent}`);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** A limit the schema writes as a number: OpenAPI 3.0's `true` flags are none. */
function limitOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * The schema with the limits of a decimal: `multipleOf` for its decimal
 * places, unless it has one, and the bounds of its whole digits, excluded,
 * on each side where the schema has no limit at least as strict.
 * `wholeDigits` 4 and `decimalPlaces` 2 give `multipleOf: 0.01`,
 * `exclusiveMinimum: -10000` and `exclusiveMaximum: 10000`. The limits the
 * schema has stay: the form reads `minimum` and `maximum` only.
 *
 * @param signed Negative values are allowed: otherwise the lower bound is 0.
 */
export function withDecimalLimits(
  schema: JSONSchema,
  wholeDigits: number | undefined,
  decimalPlaces: number | undefined,
  signed = true,
): JSONSchema {
  const limited: JSONSchema = { ...schema };
  if (isCount(decimalPlaces) && limitOf(limited.multipleOf) === undefined)
    limited.multipleOf = powerOfTen(-decimalPlaces);
  if (!isCount(wholeDigits)) return limited;

  const bound = powerOfTen(wholeDigits);
  const maximum = limitOf(limited.maximum);
  const exclusiveMaximum = limitOf(limited.exclusiveMaximum);
  const hasStricterMaximum =
    (maximum !== undefined && maximum < bound) ||
    (exclusiveMaximum !== undefined && exclusiveMaximum <= bound);
  if (!hasStricterMaximum) limited.exclusiveMaximum = bound;

  const minimum = limitOf(limited.minimum);
  const exclusiveMinimum = limitOf(limited.exclusiveMinimum);
  if (!signed) {
    const hasStricterMinimum =
      (minimum !== undefined && minimum >= 0) ||
      (exclusiveMinimum !== undefined && exclusiveMinimum >= 0);
    if (!hasStricterMinimum) limited.minimum = 0;
    return limited;
  }
  const hasStricterMinimum =
    (minimum !== undefined && minimum > -bound) ||
    (exclusiveMinimum !== undefined && exclusiveMinimum >= -bound);
  if (!hasStricterMinimum) limited.exclusiveMinimum = -bound;
  return limited;
}

/**
 * The pattern DRF-spectacular writes for a decimal sent as a string:
 * `^-?\d{0,4}(?:\.\d{0,2})?$`, `^-?0?(?:\.\d{0,2})?$` with no whole digits,
 * `\,` for a localized separator.
 */
const DECIMAL_PATTERN =
  /^\^(-\?)?(?:\\d\{0,(\d+)\}|0\?)\(\?:\\[.,]\\d\{0,(\d+)\}\)\?\$$/;

/**
 * A decimal sent as a string (`type: string`, `format: decimal`) read as a
 * number. Its `pattern`, which a number cannot match, becomes the limits it
 * writes when DRF-spectacular wrote it, and is dropped otherwise.
 */
export function decimalAsNumber(schema: JSONSchema): JSONSchema {
  const { format: _format, pattern, ...rest } = withExclusiveBounds(schema);
  const type = Array.isArray(rest.type)
    ? [...new Set(rest.type.map((one) => (one === "string" ? "number" : one)))]
    : "number";
  const read =
    typeof pattern === "string" ? DECIMAL_PATTERN.exec(pattern) : null;
  const number: JSONSchema = { ...rest, type };
  if (!read) return number;
  const [, sign, digits, places] = read;
  return withDecimalLimits(
    number,
    digits === undefined ? 0 : Number(digits),
    Number(places),
    sign !== undefined,
  );
}

/** A schema that sends a decimal as a string: `format: decimal`, on a string type. */
export function isDecimalString(schema: JSONSchema): boolean {
  const isString = Array.isArray(schema.type)
    ? schema.type.includes("string")
    : schema.type === "string";
  return schema.format === "decimal" && isString;
}

// The keywords that hold schemas, by the shape of their value. Typed as
// plain names, so their values are read as the unknown data they are.
/** Keywords whose value is one schema. */
const SCHEMA_KEYWORDS: readonly string[] = [
  "items",
  "additionalProperties",
  "not",
  "if",
  "then",
  "else",
  "contains",
];
/** Keywords whose value is a list of schemas. */
const LIST_KEYWORDS: readonly string[] = [
  "allOf",
  "anyOf",
  "oneOf",
  "prefixItems",
];
/** Keywords whose value maps names to schemas. */
const MAP_KEYWORDS: readonly string[] = [
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
];

function isSchema(value: unknown): value is JSONSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The schema with every decimal sent as a string read as a number, with
 * the limits of its pattern, at any depth: properties, items, `$defs`,
 * the branches of a union. The schema itself, unchanged, when it has none.
 *
 * @example
 * withDecimalsAsNumbers({ type: "string", format: "decimal", multipleOf: 0.01 })
 * // { type: "number", multipleOf: 0.01 }
 */
export function withDecimalsAsNumbers(schema: JSONSchema): JSONSchema {
  let changed = false;
  const next: JSONSchema = { ...schema };
  const read = (value: JSONSchema) => {
    const result = withDecimalsAsNumbers(value);
    if (result !== value) changed = true;
    return result;
  };
  for (const keyword of SCHEMA_KEYWORDS) {
    const value = next[keyword];
    if (isSchema(value)) next[keyword] = read(value);
  }
  for (const keyword of LIST_KEYWORDS) {
    const value = next[keyword];
    if (Array.isArray(value))
      next[keyword] = value.map((one: unknown) =>
        isSchema(one) ? read(one) : one,
      );
  }
  for (const keyword of MAP_KEYWORDS) {
    const value = next[keyword];
    if (isSchema(value))
      next[keyword] = Object.fromEntries(
        Object.entries(value).map(([name, one]) => [
          name,
          isSchema(one) ? read(one) : one,
        ]),
      );
  }
  if (isDecimalString(next)) return decimalAsNumber(next);
  return changed ? next : schema;
}

/**
 * The bounds OpenAPI 3.0 writes as flags (`maximum: 1000` with
 * `exclusiveMaximum: true`) as JSON Schema writes them: `exclusiveMaximum:
 * 1000`, with `maximum` kept for the form, which reads only that. A `false`
 * flag says nothing and goes.
 */
export function withExclusiveBounds(schema: JSONSchema): JSONSchema {
  const bounded: JSONSchema = { ...schema };
  const sides = [
    ["maximum", "exclusiveMaximum"],
    ["minimum", "exclusiveMinimum"],
  ] as const;
  for (const [inclusive, exclusive] of sides) {
    const flag: unknown = bounded[exclusive];
    if (typeof flag !== "boolean") continue;
    const limit = limitOf(bounded[inclusive]);
    delete bounded[exclusive];
    if (flag && limit !== undefined) bounded[exclusive] = limit;
  }
  return bounded;
}
