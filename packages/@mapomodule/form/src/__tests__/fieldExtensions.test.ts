import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AnyFieldDescriptor,
  FieldDescriptor,
} from "../runtime/types/index.js";
import { fieldsToJsonSchema } from "../runtime/utils/fieldsToJsonSchema.js";

// A package declares a descriptor property of its own. `pnpm typecheck`
// checks this file: the `@ts-expect-error` lines fail it when the extension
// stops being checked.
declare module "../runtime/types/descriptor.js" {
  interface FieldExtensions {
    example?: { hint?: string; exclude?: boolean };
  }
}

describe("FieldExtensions", () => {
  it("adds the declared property to every descriptor type", () => {
    expectTypeOf<FieldDescriptor["example"]>().toEqualTypeOf<
      { hint?: string; exclude?: boolean } | undefined
    >();
    expectTypeOf<AnyFieldDescriptor["example"]>().toEqualTypeOf<
      { hint?: string; exclude?: boolean } | undefined
    >();

    const price: FieldDescriptor = {
      key: "price",
      type: "number",
      example: { hint: "Whole euros" },
    };
    expect(price.example?.hint).toBe("Whole euros");
  });

  it("type-checks the declared property and rejects undeclared ones", () => {
    const fields: FieldDescriptor[] = [
      // @ts-expect-error `hnt` is not in the declared shape.
      { key: "title", type: "text", example: { hnt: "typo" } },
      // @ts-expect-error `undeclared` was never declared.
      { key: "title", type: "text", undeclared: true },
    ];
    expect(fields).toHaveLength(2);
  });

  it("reaches the schema through the property option", () => {
    const schema = fieldsToJsonSchema(
      [
        { key: "price", type: "number", example: { hint: "Whole euros" } },
        { key: "slug", type: "text", example: { exclude: true } },
      ],
      {
        property: (written, field) => {
          if (field.example?.exclude) return undefined;
          const hint = field.example?.hint;
          return hint ? { ...written, description: hint } : written;
        },
      },
    );
    expect(schema.properties).toEqual({
      price: { type: "number", description: "Whole euros" },
    });
  });
});
