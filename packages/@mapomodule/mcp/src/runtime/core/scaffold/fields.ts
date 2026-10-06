/**
 * Field specs: the compact syntax the scaffold tool accepts for descriptors.
 *
 * `"title:text:Title"` → `{ key: "title", type: "text", label: "Title" }`.
 * Types are validated against the registry extracted from source, so the
 * scaffold can never emit a field type that does not exist.
 */
import type { ApiKnowledge } from "../types.js";

export interface ParsedField {
  key: string;
  type: string;
  label: string;
}

export class UnknownFieldTypeError extends Error {
  constructor(
    readonly type: string,
    readonly available: string[],
  ) {
    super(
      `Unknown field type "${type}". Registered types: ${available.join(", ")}. ` +
        `Custom types are added with defineFormField() — see uikit/form/registry.md.`,
    );
    this.name = "UnknownFieldTypeError";
  }
}

/**
 * `published_at` / `coverImage` → `Published at` / `Cover image`.
 * Sentence case, not Title Case: it is what the rest of the admin uses, and an
 * explicit label is one `:` away when the guess is wrong.
 */
export function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
}

/**
 * @param specs  `key[:type[:label]]`, type defaults to `text`
 * @param api    when given, unknown types are rejected instead of generated
 */
export function parseFields(
  specs: string[],
  api?: ApiKnowledge,
): ParsedField[] {
  const known = api ? new Set(api.fieldTypes.map((field) => field.type)) : null;

  return specs.map((spec) => {
    const [key = "", type = "text", ...rest] = spec.split(":");
    if (!key.trim()) throw new Error(`Empty field key in "${spec}".`);

    if (known && !known.has(type)) {
      throw new UnknownFieldTypeError(type, [...known].sort());
    }

    return {
      key: key.trim(),
      type: type.trim(),
      label: rest.join(":").trim() || humanise(key.trim()),
    };
  });
}

/** Attrs a field type cannot work without, so the skeleton is honest about them. */
function requiredAttrs(type: string, api?: ApiKnowledge): string[] {
  const field = api?.fieldTypes.find((entry) => entry.type === type);
  return (field?.attrs ?? [])
    .filter((attr) => attr.required)
    .map((attr) => attr.name);
}

/** Renders a descriptor array literal, indented to sit inside a `const`. */
export function renderDescriptors(
  fields: ParsedField[],
  api: ApiKnowledge | undefined,
  indent = "  ",
): string {
  return fields
    .map((field) => {
      const attrs = requiredAttrs(field.type, api);
      const attrsLine = attrs.length
        ? `\n${indent}  attrs: { ${attrs.map((name) => `${name}: undefined /* TODO */`).join(", ")} },`
        : "";

      return (
        `${indent}{\n` +
        `${indent}  key: "${field.key}",\n` +
        `${indent}  type: "${field.type}",\n` +
        `${indent}  label: "${field.label}",${attrsLine}\n` +
        `${indent}},`
      );
    })
    .join("\n");
}

/** Interface members for the model type, inferred from the field types. */
export function renderModel(fields: ParsedField[]): string {
  const tsType = (type: string): string => {
    if (["number", "slider"].includes(type)) return "number";
    if (["boolean", "switch"].includes(type)) return "boolean";
    if (
      [
        "fks",
        "m2m",
        "media",
        "media-m2m",
        "enhanced-media",
        "repeater",
        "seo",
        "map",
      ].includes(type)
    ) {
      return "unknown";
    }
    return "string";
  };

  return fields
    .map((field) => `  ${field.key}: ${tsType(field.type)};`)
    .join("\n");
}
