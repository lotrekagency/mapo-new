import { expect } from "vitest";
import type { JSONSchema } from "@mapomodule/utils";

// ─── The subset every provider accepts in strict mode ────────────────────────

const PORTABLE_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "description",
  "anyOf",
]);
const PROPERTY_NAME = /^[A-Za-z0-9_]{1,64}$/;

const PORTABLE_TYPES = ["object", "string", "array"];

export interface Census {
  unions: number;
  properties: number;
  enumValues: number;
  characters: number;
}

/**
 * Walks a schema and fails on anything outside the portable subset: the
 * keywords, one type per node among object, string and array, objects
 * closed and fully required, safe property names, at most one `anyOf` and
 * never at the root, `enum`s of unique strings (at most 250 each, 1000 in
 * all), at most 5000 properties, 10 levels and 100,000 characters of names
 * and values.
 */
export function expectPortable(schema: JSONSchema): Census {
  const census: Census = {
    unions: 0,
    properties: 0,
    enumValues: 0,
    characters: 0,
  };
  const walk = (
    node: JSONSchema,
    path: string,
    depth: number,
    isRoot: boolean,
  ): void => {
    expect(depth, `${path}: too deep`).toBeLessThanOrEqual(10);
    for (const keyword of Object.keys(node))
      expect(PORTABLE_KEYWORDS.has(keyword), `${path}: ${keyword}`).toBe(true);
    if (node.anyOf) {
      expect(isRoot, `${path}: anyOf at the root`).toBe(false);
      for (const keyword of Object.keys(node))
        expect(
          ["anyOf", "description"],
          `${path}: ${keyword} beside anyOf`,
        ).toContain(keyword);
      census.unions++;
      node.anyOf.forEach((branch, index) =>
        walk(branch, `${path}.anyOf[${index}]`, depth, false),
      );
      return;
    }
    expect(typeof node.type, `${path}: one type`).toBe("string");
    expect(PORTABLE_TYPES, `${path}: type`).toContain(node.type);
    if (isRoot) expect(node.type).toBe("object");
    const isObject = node.type === "object";
    for (const keyword of ["properties", "required", "additionalProperties"])
      if (keyword in node) expect(isObject, `${path}: ${keyword}`).toBe(true);
    if ("items" in node) expect(node.type, `${path}: items`).toBe("array");
    if (node.enum) {
      expect(node.type, `${path}: enum of strings`).toBe("string");
      expect(node.enum.length, `${path}: empty enum`).toBeGreaterThan(0);
      expect(node.enum.length, `${path}: enum too long`).toBeLessThanOrEqual(
        250,
      );
      expect(new Set(node.enum).size, `${path}: repeated value`).toBe(
        node.enum.length,
      );
      for (const value of node.enum) {
        expect(typeof value).toBe("string");
        census.characters += String(value).length;
      }
      census.enumValues += node.enum.length;
    }
    if (node.type === "object") {
      expect(node.additionalProperties, path).toBe(false);
      const keys = Object.keys(node.properties ?? {});
      expect([...(node.required ?? [])].sort(), path).toEqual([...keys].sort());
      census.properties += keys.length;
      for (const key of keys) {
        expect(key, `${path}: property name`).toMatch(PROPERTY_NAME);
        census.characters += key.length;
        walk(node.properties?.[key] ?? {}, `${path}.${key}`, depth + 1, false);
      }
    }
    if (node.type === "array") {
      expect(node.items, `${path}: items`).toBeDefined();
      walk(node.items ?? {}, `${path}[]`, depth + 1, false);
    }
  };
  walk(schema, "$", 1, true);
  expect(census.unions).toBeLessThanOrEqual(1);
  expect(census.properties).toBeLessThanOrEqual(5000);
  expect(census.enumValues).toBeLessThanOrEqual(1000);
  expect(census.characters).toBeLessThanOrEqual(100_000);
  return census;
}
