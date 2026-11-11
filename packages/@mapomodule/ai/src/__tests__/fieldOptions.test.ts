import { describe, expect, expectTypeOf, it } from "vitest";
import type { FieldDescriptor } from "@mapomodule/form/types";

import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import type { MapoAiFieldOptions } from "../index";
import { readAiOptions, aiOptionsFrom } from "../runtime/shared/dialect";
import { mapoAiFieldsSchema } from "../runtime/shared/fill";

// `pnpm typecheck` checks this file: the `@ts-expect-error` line fails it
// when the descriptors stop checking their `ai`.
describe("ai on a field's descriptor", () => {
  it("is declared on every descriptor type once the module is installed", () => {
    expectTypeOf<FieldDescriptor["ai"]>().toEqualTypeOf<
      MapoAiFieldOptions | undefined
    >();

    const fields: FieldDescriptor[] = [
      { key: "summary", type: "textarea", ai: { hint: "Two sentences." } },
      {
        key: "reviewer",
        type: "fks",
        attrs: { endpoint: "/api/people/", itemText: "email" },
        ai: { list: false },
      },
      // @ts-expect-error `hnt` is not an option of the AI.
      { key: "title", type: "text", ai: { hnt: "typo" } },
    ];
    expect(fields).toHaveLength(3);
  });
});

describe("aiOptionsFrom", () => {
  it("reads a hint, an exclusion and list: false", () => {
    expect(
      aiOptionsFrom({ hint: "  Two sentences. ", exclude: true, list: false }),
    ).toEqual({ hint: "Two sentences.", exclude: true, list: false });
  });

  it("ignores what is not one of them: list: true, a blank hint, other keys", () => {
    expect(
      aiOptionsFrom({ hint: " ", exclude: "yes", list: true, other: 1 }),
    ).toEqual({});
    expect(aiOptionsFrom("exclude")).toEqual({});
    expect(aiOptionsFrom(undefined)).toEqual({});
  });

  it("reads the same from a schema's x-mapo-ai", () => {
    expect(readAiOptions({ "x-mapo-ai": { list: false } })).toEqual({
      list: false,
    });
  });
});

describe("mapoAiFieldsSchema", () => {
  const fields: FieldDescriptor[] = [
    { key: "title", type: "text", label: "Title" },
    { key: "summary", type: "textarea", ai: { hint: " Two sentences. " } },
    { key: "notes", type: "textarea", ai: { exclude: true } },
    {
      key: "speakers",
      type: "repeater",
      fields: [
        {
          key: "person",
          type: "fks",
          attrs: { endpoint: "/api/people/", itemText: "name" },
          ai: { list: false },
        },
      ],
    },
  ];

  it("writes each descriptor's ai as x-mapo-ai, a repeater's items included", () => {
    const schema = mapoAiFieldsSchema(fields);
    const properties = schema.properties ?? {};
    expect(properties.summary).toMatchObject({
      "x-mapo-ai": { hint: "Two sentences." },
    });
    expect(properties.notes).toMatchObject({
      "x-mapo-ai": { exclude: true },
    });
    expect(properties.speakers).toMatchObject({
      items: { properties: { person: { "x-mapo-ai": { list: false } } } },
    });
  });

  it("writes the other fields as fieldsToJsonSchema does", () => {
    const schema = mapoAiFieldsSchema(fields);
    const plain = fieldsToJsonSchema(fields);
    expect(schema.properties?.title).toEqual(plain.properties?.title);
    expect(plain.properties?.summary).not.toHaveProperty("x-mapo-ai");
  });
});
