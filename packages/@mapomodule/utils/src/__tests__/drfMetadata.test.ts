import { describe, expect, it } from "vitest";

import {
  drfMetadataToJsonSchema,
  metadataToJsonSchema,
} from "../jsonSchema/index.js";
import type { JSONSchema } from "../jsonSchema/index.js";
import options from "./fixtures/drf-options.json";

/** The schema of each property the fixture describes. */
const schema = drfMetadataToJsonSchema(options)!;
const property = (key: string) => schema.properties![key]!;

describe("drfMetadataToJsonSchema — types", () => {
  it.each<[string, JSONSchema]>([
    ["title", { type: "string", maxLength: 200 }],
    ["slug", { type: "string", pattern: "^[-a-zA-Z0-9_]+$", maxLength: 50 }],
    ["contact", { type: "string", format: "email", maxLength: 254 }],
    ["website", { type: "string", format: "uri", maxLength: 200 }],
    ["seats", { type: "integer", minimum: 1, maximum: 500 }],
    ["price", { type: "number", minimum: 0 }],
    ["rating", { type: "number" }],
    ["is_public", { type: "boolean" }],
    ["starts_at", { type: "string", format: "date-time" }],
    ["day", { type: "string", format: "date" }],
    ["opens", { type: "string", format: "time" }],
    ["length", { type: "string", format: "duration" }],
    ["attachment", { type: "string", format: "binary" }],
    [
      "poster",
      {
        type: "string",
        format: "binary",
        "x-mapo-attrs": { accept: "image/*" },
      },
    ],
  ])("reads %s", (key, expected) => {
    expect(property(key)).toMatchObject(expected);
  });

  it("keeps the label, the help text and the read-only flag", () => {
    expect(property("slug")).toMatchObject({
      title: "Slug",
      description: "Leave it empty to build it from the title.",
    });
    expect(property("id")).toEqual({
      title: "ID",
      type: "integer",
      readOnly: true,
    });
  });

  it("lists the required fields, never a read-only one", () => {
    expect(schema.required).toEqual(["title", "starts_at", "venue"]);
  });

  it("reads choices as oneOf with labels, or as an enum when labels add nothing", () => {
    expect(property("status")).toEqual({
      title: "Status",
      type: "string",
      oneOf: [
        { const: "draft", title: "Draft" },
        { const: "published", title: "Published" },
      ],
    });
    expect(property("size")).toEqual({
      title: "Size",
      type: "string",
      enum: ["S", "M"],
    });
    expect(property("topics")).toEqual({
      title: "Topics",
      type: "array",
      items: {
        type: "string",
        oneOf: [
          { const: "art", title: "Art" },
          { const: "music", title: "Music" },
        ],
      },
      uniqueItems: true,
    });
  });

  it("reads a list as an array, its length limits as item counts", () => {
    expect(property("keywords")).toEqual({
      title: "Keywords",
      type: "array",
      items: { type: "string", maxLength: 30 },
      maxItems: 5,
    });
  });

  it("reads a nested object, and a dict without children as an object", () => {
    expect(property("address")).toEqual({
      title: "Address",
      type: "object",
      properties: {
        street: { title: "Street", type: "string" },
        city: { title: "City", type: "string" },
      },
      required: ["street"],
    });
    expect(property("extra")).toEqual({ title: "Extra", type: "object" });
  });

  it("makes a placeholder of what Mapo cannot describe", () => {
    expect(property("venue")).toEqual({
      title: "Venue",
      "x-mapo-field": "field:venue",
    });
    // A list of relations: the list itself is the placeholder.
    expect(property("partners")).toEqual({
      title: "Partners",
      "x-mapo-field": "field:partners",
    });
    // A type a custom metadata class publishes.
    expect(property("summary")).toEqual({
      title: "Summary",
      "x-mapo-field": "field:summary",
    });
  });
});

describe("drfMetadataToJsonSchema — actions", () => {
  const fields = { name: { type: "string", label: "Name" } };

  it("reads POST, then PUT, or the method asked for", () => {
    const put = drfMetadataToJsonSchema({ actions: { PUT: fields } });
    expect(Object.keys(put!.properties!)).toEqual(["name"]);
    const both = { actions: { POST: {}, PUT: fields } };
    expect(drfMetadataToJsonSchema(both)!.properties).toEqual({});
    expect(
      drfMetadataToJsonSchema(both, { method: "PUT" })!.properties,
    ).toHaveProperty("name");
  });

  it("returns undefined without actions, as for a user who cannot create", () => {
    expect(drfMetadataToJsonSchema({ name: "Event List" })).toBeUndefined();
    expect(drfMetadataToJsonSchema({ actions: {} })).toBeUndefined();
  });

  it("skips what is not DRF metadata instead of throwing", () => {
    expect(drfMetadataToJsonSchema(null)).toBeUndefined();
    expect(drfMetadataToJsonSchema("OPTIONS")).toBeUndefined();
    expect(drfMetadataToJsonSchema({ actions: { POST: [] } })).toBeUndefined();
    const odd = drfMetadataToJsonSchema({
      actions: {
        POST: {
          name: { type: "string" },
          broken: { label: "No type" },
          choices: { type: "choice", choices: "not a list" },
        },
      },
    });
    expect(odd!.properties).toEqual({ name: { type: "string" }, choices: {} });
  });
});

describe("drfMetadataToJsonSchema — customisation", () => {
  it("lets `types` add a type and replace a built-in one", () => {
    const custom = drfMetadataToJsonSchema(options, {
      types: {
        "rich text": () => ({ type: "string", contentMediaType: "text/html" }),
        field: () => ({ type: "integer" }),
      },
    })!;
    expect(custom.properties!.summary).toEqual({
      title: "Summary",
      type: "string",
      contentMediaType: "text/html",
    });
    expect(custom.properties!.venue).toEqual({
      title: "Venue",
      type: "integer",
    });
    // Inside a list too.
    expect(custom.properties!.partners).toMatchObject({
      type: "array",
      items: { type: "integer" },
    });
  });

  it("lets `property` rewrite or drop each field, nested ones included", () => {
    const seen: string[] = [];
    const custom = drfMetadataToJsonSchema(options, {
      property: (written, field, key) => {
        seen.push(key);
        if (key === "venue")
          return {
            title: written.title,
            type: "relation",
            endpoint: "/api/venues/",
          };
        return field.read_only ? undefined : written;
      },
    })!;
    expect(custom.properties!.venue).toEqual({
      title: "Venue",
      type: "relation",
      endpoint: "/api/venues/",
    });
    expect(custom.properties).not.toHaveProperty("id");
    expect(custom.properties).not.toHaveProperty("created_at");
    expect(seen).toContain("street");
  });
});

describe("metadataToJsonSchema", () => {
  it("prefers the schema the endpoint publishes, as Camomilla does", () => {
    const published = {
      type: "object",
      properties: { title: { type: "string" } },
    };
    expect(metadataToJsonSchema({ ...options, schema: published })).toBe(
      published,
    );
  });

  it("reads the DRF metadata otherwise", () => {
    expect(metadataToJsonSchema(options)).toEqual(schema);
    expect(
      metadataToJsonSchema({ schema: { type: "object" } }),
    ).toBeUndefined();
    expect(metadataToJsonSchema(undefined)).toBeUndefined();
  });

  it("passes the options to the DRF reading", () => {
    const custom = metadataToJsonSchema(options, {
      property: (written, _field, key) =>
        key === "title" ? written : undefined,
    });
    expect(Object.keys(custom!.properties!)).toEqual(["title"]);
  });
});
