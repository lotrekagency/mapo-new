import { describe, expect, it } from "vitest";
import {
  drfMetadataToJsonSchema,
  openApiToJsonSchema,
} from "@mapomodule/utils";

import { useFormFromSchema } from "../runtime/composables/useFormFromSchema.js";
import type { AnyFieldDescriptor } from "../runtime/types/index.js";

// The normalizers of @mapomodule/utils write the dialect useFormFromSchema
// reads: these tests read their output as a form would.

/** `[key, type]` of each descriptor, and the attrs of one. */
const types = (fields: AnyFieldDescriptor[]) =>
  fields.map((field) => [field.key, field.type]);
const attrsOf = (fields: AnyFieldDescriptor[], key: string) =>
  (fields.find((field) => field.key === key) as { attrs?: object })?.attrs;

describe("DRF metadata → descriptors", () => {
  const fields = useFormFromSchema(
    drfMetadataToJsonSchema({
      actions: {
        POST: {
          id: { type: "integer", read_only: true, label: "ID" },
          title: { type: "string", required: true, label: "Title" },
          status: {
            type: "choice",
            label: "Status",
            choices: [{ value: "draft", display_name: "Draft" }],
          },
          contact: { type: "email", label: "Contact" },
          poster: { type: "image upload", label: "Poster" },
          seats: { type: "integer", min_value: 1, max_value: 9 },
          starts_at: { type: "datetime", label: "Starts at" },
          venue: { type: "field", required: true, label: "Venue" },
          keywords: { type: "list", child: { type: "string" } },
          address: {
            type: "nested object",
            children: { city: { type: "string" } },
          },
        },
      },
    })!,
  );

  it("gives each DRF type its field", () => {
    expect(types(fields)).toEqual([
      ["id", "number"],
      ["title", "text"],
      ["status", "select"],
      ["contact", "email"],
      ["poster", "file"],
      ["seats", "number"],
      ["starts_at", "datetime"],
      ["venue", "field:venue"],
      ["keywords", "select"],
      ["address", "object:address"],
    ]);
  });

  it("carries labels, flags, choices and limits", () => {
    expect(fields[0]).toMatchObject({ label: "ID", readonly: true });
    expect(fields[1]).toMatchObject({ label: "Title", required: true });
    expect(attrsOf(fields, "status")).toEqual({
      options: [{ text: "Draft", value: "draft" }],
    });
    expect(attrsOf(fields, "poster")).toEqual({ accept: "image/*" });
    expect(attrsOf(fields, "seats")).toEqual({ min: 1, max: 9 });
    expect(attrsOf(fields, "keywords")).toEqual({ multiple: true });
  });
});

describe("OpenAPI → descriptors", () => {
  const document = {
    paths: {
      "/api/venues/": {
        get: {
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Venue" },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Venue: { type: "object", properties: { name: { type: "string" } } },
        Event: {
          type: "object",
          properties: {
            venue: { allOf: [{ $ref: "#/components/schemas/Venue" }] },
            venues: {
              type: "array",
              items: { $ref: "#/components/schemas/Venue" },
            },
            starts_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            price: { type: "string", format: "decimal" },
            metadata: {},
          },
        },
      },
    },
  };
  const fields = useFormFromSchema(openApiToJsonSchema(document, "Event")!);

  it("reads relations with their endpoint, and the rest as DRF would", () => {
    expect(types(fields)).toEqual([
      ["venue", "fks"],
      ["venues", "m2m"],
      ["starts_at", "datetime"],
      ["price", "number"],
      ["metadata", "field:metadata"],
    ]);
    expect(attrsOf(fields, "venues")).toMatchObject({
      endpoint: "/api/venues/",
      multiple: true,
    });
    expect(fields[2]!.label).toBe("Starts at");
  });
});
