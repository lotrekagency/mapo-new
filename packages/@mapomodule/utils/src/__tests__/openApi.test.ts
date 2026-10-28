import { describe, expect, it } from "vitest";

import { openApiModels, openApiToJsonSchema } from "../jsonSchema/index.js";
import document from "./fixtures/openapi.json";

const event = openApiToJsonSchema(document, "Event")!;
const property = (key: string) => event.properties![key]!;

describe("openApiModels", () => {
  it("lists the object components with the endpoint that lists them", () => {
    expect(openApiModels(document)).toEqual([
      {
        name: "Event",
        description: "A festival event.",
        endpoint: "/api/events/",
      },
      { name: "Organizer" },
      // An `allOf` component is not an object at its top: it is not listed.
      {
        name: "Speaker",
        title: "Speaker",
        description: "Someone who talks at an event.",
        endpoint: "/api/speakers/",
      },
      { name: "Venue", endpoint: "/api/venues/" },
    ]);
  });

  it("returns nothing for what is not an OpenAPI document", () => {
    expect(openApiModels(null)).toEqual([]);
    expect(openApiModels({ components: { schemas: [] } })).toEqual([]);
  });
});

describe("openApiToJsonSchema — values", () => {
  it("labels each property, from its title or its name", () => {
    expect(property("starts_at").title).toBe("Starts at");
    expect(property("created_at").title).toBe("Created");
  });

  it("copies the keywords of scalar values", () => {
    expect(property("title")).toEqual({
      title: "Title",
      type: "string",
      maxLength: 200,
    });
    expect(property("contact")).toMatchObject({
      type: "string",
      format: "email",
    });
    expect(property("website")).toMatchObject({
      type: "string",
      format: "uri",
    });
    expect(property("poster")).toMatchObject({
      type: "string",
      format: "binary",
    });
    expect(property("id")).toEqual({
      title: "Id",
      type: "integer",
      readOnly: true,
    });
    expect(property("password")).toMatchObject({ writeOnly: true });
  });

  it("follows a $ref to an enum", () => {
    expect(property("status")).toEqual({
      title: "Status",
      type: "string",
      enum: ["draft", "published"],
    });
  });

  it("reads a decimal sent as a string as a number", () => {
    expect(property("price")).toEqual({ title: "Price", type: "number" });
  });

  it("turns nullable into a type list", () => {
    expect(property("starts_at")).toEqual({
      title: "Starts at",
      type: ["string", "null"],
      format: "date-time",
    });
  });

  it("reads arrays of values and of inline objects", () => {
    expect(property("keywords")).toEqual({
      title: "Keywords",
      type: "array",
      items: { type: "string" },
      maxItems: 5,
    });
    expect(property("schedule")).toEqual({
      title: "Schedule",
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { title: "Time", type: "string", format: "time" },
          label: { title: "Label", type: "string" },
        },
        required: ["label"],
      },
    });
  });

  it("lists the required properties", () => {
    expect(event.required).toEqual(["title", "status"]);
  });
});

describe("openApiToJsonSchema — relations and placeholders", () => {
  it("reads a property pointing to a listed component as a relation", () => {
    expect(property("venue")).toEqual({
      title: "Venue",
      type: "relation",
      endpoint: "/api/venues/",
    });
    expect(property("speakers")).toEqual({
      title: "Speakers",
      type: "relation",
      endpoint: "/api/speakers/",
      multiple: true,
    });
  });

  it("makes a placeholder of a relation without an endpoint and of a value without a type", () => {
    expect(property("organizer")).toEqual({
      title: "Organizer",
      "x-mapo-field": "field:organizer",
      readOnly: true,
    });
    expect(property("metadata")).toEqual({
      title: "Metadata",
      "x-mapo-field": "field:metadata",
    });
  });
});

describe("openApiToJsonSchema — documents and options", () => {
  it("reads an allOf composition with the properties of every member", () => {
    const composed = openApiToJsonSchema(document, "PublicEvent")!;
    expect(Object.keys(composed.properties!)).toContain("title");
    expect(Object.keys(composed.properties!)).toContain("slug");
    expect(composed.required).toEqual(["title", "status", "slug"]);
  });

  it("returns undefined for a component the document does not have", () => {
    expect(openApiToJsonSchema(document, "Ticket")).toBeUndefined();
    expect(openApiToJsonSchema(undefined, "Event")).toBeUndefined();
  });

  it("takes the endpoints the paths do not tell", () => {
    const custom = openApiToJsonSchema(document, "Event", {
      endpoints: { Organizer: "/api/organizers/" },
    })!;
    expect(custom.properties!.organizer).toEqual({
      title: "Organizer",
      type: "relation",
      endpoint: "/api/organizers/",
      readOnly: true,
    });
  });

  it("lets `property` rewrite or drop each property, nested ones included", () => {
    const seen: string[] = [];
    const custom = openApiToJsonSchema(document, "Event", {
      property: (written, source, key) => {
        seen.push(key);
        if (source.readOnly === true) return undefined;
        return key === "metadata"
          ? { title: "Metadata", type: "object" }
          : written;
      },
    })!;
    expect(custom.properties).not.toHaveProperty("id");
    expect(custom.properties!.metadata).toEqual({
      title: "Metadata",
      type: "object",
    });
    expect(seen).toContain("label");
  });
});
