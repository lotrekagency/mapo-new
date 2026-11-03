import { describe, expect, it } from "vitest";
import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import type { JSONSchema } from "@mapomodule/utils";
import { AI_KEYWORD } from "../runtime/shared/dialect";
import { buildAiEntity } from "../runtime/shared/entity";
import type { AiEntity, AiField } from "../runtime/shared/entity";
import {
  AI_CONTRACT_FORMAT_VERSION,
  compileExtractContract,
  compileFillContract,
} from "../runtime/shared/contract";
import type {
  AiContractField,
  AiFillContract,
} from "../runtime/shared/contract";
import {
  outcomesByPath,
  sanitizeExtractAnswer,
  sanitizeFillAnswer,
} from "../runtime/shared/sanitize";
import type { AiFieldOutcome } from "../runtime/shared/sanitize";
import { expectPortable } from "./portable";

type Fields = Parameters<typeof fieldsToJsonSchema>[0];

/** The entity of a form alone, its fields written the way the browser will. */
function formEntity(fields: Fields, exclude?: string[]): AiEntity {
  return buildAiEntity(
    { fields: fieldsToJsonSchema(fields) },
    exclude ? { exclude } : {},
  );
}

function fieldOf(fields: readonly AiField[], key: string): AiField | undefined {
  return fields.find((field) => field.key === key);
}

function contractFieldOf(
  fields: readonly AiContractField[],
  key: string,
): AiContractField | undefined {
  return fields.find((field) => field.key === key);
}

/** The schema of a property of the record's values, in a fill contract. */
function valueSchemaOf(contract: AiFillContract, wire: string): JSONSchema {
  return contract.schema.properties?.values?.properties?.[wire] ?? {};
}

const SPEAKERS: Fields = [
  { key: "title", type: "text" },
  {
    key: "speakers",
    type: "repeater",
    attrs: { maxItems: 3 },
    fields: [
      { key: "name", type: "text", required: true },
      { key: "role", type: "text" },
    ],
  },
] as Fields;

const BLOCKS: Fields = [
  {
    key: "blocks",
    type: "repeater",
    attrs: {
      templates: {
        hero: {
          label: "Hero",
          description: "A large title",
          fields: [{ key: "title", type: "text" }],
        },
        gallery: [{ key: "caption", type: "text" }],
      },
    },
  },
] as Fields;

// ─── The entity model ────────────────────────────────────────────────────────

describe("buildAiEntity — lists", () => {
  it("reads a repeater's items from the form, with the number of its items", () => {
    const entity = formEntity(SPEAKERS);
    const speakers = fieldOf(entity.fields, "speakers");

    expect(speakers).toMatchObject({
      kind: "list",
      fieldType: "repeater",
      multiple: false,
      constraints: { maxItems: 3 },
    });
    expect(speakers?.items?.fields).toMatchObject([
      { key: "name", kind: "string", required: true },
      { key: "role", kind: "string", required: false },
    ]);
  });

  it("keeps out of every item what keeps the AI out", () => {
    const entity = formEntity([
      {
        key: "contacts",
        type: "repeater",
        fields: [
          { key: "name", type: "text" },
          { key: "password", type: "text" },
          { key: "code", type: "text", readonly: true },
          { key: "photo", type: "media" },
        ],
      },
    ] as Fields);

    const items = fieldOf(entity.fields, "contacts")?.items;
    expect(items?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(items?.skipped.map(({ key, reason }) => [key, reason])).toEqual([
      ["password", "secret"],
      ["code", "readonly"],
      ["photo", "media"],
    ]);
  });

  it("reads a list from a backend schema alone", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          speakers: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              properties: { name: { type: "string", maxLength: 40 } },
              required: ["name"],
            },
          },
        },
      },
    });

    expect(fieldOf(entity.fields, "speakers")).toMatchObject({
      kind: "list",
      constraints: { maxItems: 5 },
      items: {
        fields: [
          { key: "name", required: true, constraints: { maxLength: 40 } },
        ],
      },
    });
  });

  it("adds the backend's limits to the items, and its secrets keep a field out", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "speakers",
          type: "repeater",
          fields: [
            { key: "name", type: "text" },
            { key: "pin", type: "text" },
          ],
        },
      ] as Fields),
      schema: {
        type: "object",
        properties: {
          speakers: {
            type: "array",
            maxItems: 2,
            items: {
              type: "object",
              properties: {
                name: { type: "string", maxLength: 20 },
                pin: { type: "string", writeOnly: true },
              },
            },
          },
        },
      },
    });

    const speakers = fieldOf(entity.fields, "speakers");
    expect(speakers?.constraints).toEqual({ maxItems: 2 });
    expect(speakers?.items?.fields).toMatchObject([
      { key: "name", constraints: { maxLength: 20 } },
    ]);
    expect(speakers?.items?.skipped).toMatchObject([
      { key: "pin", reason: "secret" },
    ]);
  });

  it("reads one set of fields per template, without `_template` among them", () => {
    const entity = formEntity(BLOCKS);
    const items = fieldOf(entity.fields, "blocks")?.items;

    expect(items?.fields).toEqual([]);
    expect(items?.templates).toMatchObject([
      {
        key: "hero",
        label: "Hero",
        description: "A large title",
        fields: [{ key: "title" }],
      },
      { key: "gallery", fields: [{ key: "caption" }] },
    ]);
    expect(JSON.stringify(items)).not.toContain("_template");
  });

  it("matches the backend's template by its key, and any template's secret keeps a field out", () => {
    const branch = (key: string, properties: Record<string, JSONSchema>) => ({
      type: "object",
      properties: { _template: { const: key }, ...properties },
    });
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema(BLOCKS),
      schema: {
        type: "object",
        properties: {
          blocks: {
            type: "array",
            items: {
              oneOf: [
                branch("hero", { title: { type: "string", maxLength: 30 } }),
                branch("gallery", {
                  caption: { type: "string", writeOnly: true },
                }),
              ],
              discriminator: { propertyName: "_template" },
            },
          },
        },
      },
    });

    const [hero, gallery] =
      fieldOf(entity.fields, "blocks")?.items?.templates ?? [];
    expect(hero?.fields).toMatchObject([
      { key: "title", constraints: { maxLength: 30 } },
    ]);
    expect(gallery?.fields).toEqual([]);
    expect(gallery?.skipped).toMatchObject([
      { key: "caption", reason: "secret" },
    ]);
  });

  it("follows a list inside the items of a list", () => {
    const entity = formEntity([
      {
        key: "days",
        type: "repeater",
        fields: [
          { key: "label", type: "text" },
          {
            key: "talks",
            type: "repeater",
            fields: [{ key: "title", type: "text" }],
          },
        ],
      },
    ] as Fields);

    const talks = fieldOf(
      fieldOf(entity.fields, "days")?.items?.fields ?? [],
      "talks",
    );
    expect(talks).toMatchObject({
      kind: "list",
      items: { fields: [{ key: "title" }] },
    });
  });

  it("follows a schema that contains itself once, and leaves the list that would repeat it", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          menu: { type: "array", items: { $ref: "#/$defs/Entry" } },
        },
        $defs: {
          Entry: {
            type: "object",
            properties: {
              label: { type: "string" },
              children: { type: "array", items: { $ref: "#/$defs/Entry" } },
            },
          },
        },
      },
    });

    const menu = fieldOf(entity.fields, "menu");
    expect(menu?.items?.fields.map((field) => field.key)).toEqual(["label"]);
    expect(menu?.items?.skipped).toMatchObject([
      { key: "children", reason: "unsupported" },
    ]);
  });

  it("leaves a list out whole when nothing in its items can be filled, with the reason they share, or when the list itself is kept out", () => {
    const entity = formEntity([
      {
        key: "photos",
        type: "repeater",
        fields: [{ key: "image", type: "media" }],
      },
      {
        key: "frozen",
        type: "repeater",
        readonly: true,
        fields: [{ key: "name", type: "text" }],
      },
      {
        key: "api_tokens",
        type: "repeater",
        fields: [{ key: "value", type: "text" }],
      },
    ] as Fields);

    expect(entity.fields).toEqual([]);
    expect(entity.skipped.map(({ key, reason }) => [key, reason])).toEqual([
      ["photos", "media"],
      ["frozen", "readonly"],
      ["api_tokens", "secret"],
    ]);
  });

  it("excludes a field of every item", () => {
    const entity = formEntity(
      [
        {
          key: "speakers",
          type: "repeater",
          fields: [
            { key: "name", type: "text" },
            { key: "email", type: "email" },
            { key: "phone", type: "text" },
          ],
        },
      ] as Fields,
      ["speakers.email", "speakers.*.phone"],
    );

    const items = fieldOf(entity.fields, "speakers")?.items;
    expect(items?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(items?.skipped.map(({ key, reason }) => [key, reason])).toEqual([
      ["email", "excluded"],
      ["phone", "excluded"],
    ]);
  });

  it("reads an exclusion that ends in `*` as the whole list or object", () => {
    const entity = formEntity(
      [...SPEAKERS, { key: "seo", type: "seo" }] as Fields,
      ["speakers.*", "seo.*"],
    );

    expect(entity.fields.map((field) => field.key)).toEqual(["title"]);
    expect(entity.skipped).toEqual([
      { key: "speakers", fieldType: "repeater", reason: "excluded" },
      { key: "seo", fieldType: "seo", reason: "excluded" },
    ]);
  });

  it("keeps out an item's field that the form keeps from drafts or from the AI", () => {
    const fields = fieldsToJsonSchema(
      [
        {
          key: "speakers",
          type: "repeater",
          fields: [
            { key: "name", type: "text" },
            { key: "code", type: "text", noDraft: true },
            { key: "notes", type: "textarea" },
          ],
        },
      ] as Fields,
      {
        property: (schema, field) =>
          field.key === "notes"
            ? { ...schema, [AI_KEYWORD]: { exclude: true } }
            : schema,
      },
    );

    const items = fieldOf(buildAiEntity({ fields }).fields, "speakers")?.items;
    expect(items?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(items?.skipped.map(({ key, reason }) => [key, reason])).toEqual([
      ["code", "secret"],
      ["notes", "excluded"],
    ]);
  });

  it("keeps a translatable repeater or object translatable, and every value inside", () => {
    const entity = formEntity([
      {
        key: "faq",
        type: "repeater",
        translatable: true,
        fields: [
          { key: "question", type: "text" },
          {
            key: "links",
            type: "repeater",
            fields: [{ key: "label", type: "text" }],
          },
        ],
      },
      { key: "seo", type: "seo", translatable: true },
    ] as Fields);

    expect(fieldOf(entity.fields, "seo.title")?.translatable).toBe(true);

    const faq = fieldOf(entity.fields, "faq");
    expect(faq?.translatable).toBe(true);
    const question = fieldOf(faq?.items?.fields ?? [], "question");
    const links = fieldOf(faq?.items?.fields ?? [], "links");
    expect(question?.translatable).toBe(true);
    expect(links?.translatable).toBe(true);
    expect(links?.items?.fields).toMatchObject([
      { key: "label", translatable: true },
    ]);
  });

  it("keeps one template per key, the last, as the form's reader does", () => {
    const branch = (key: string, properties: Record<string, JSONSchema>) => ({
      type: "object",
      properties: { _template: { const: key }, ...properties },
    });
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          blocks: {
            type: "array",
            items: {
              oneOf: [
                branch("hero", { title: { type: "string" } }),
                branch("gallery", { caption: { type: "string" } }),
                branch("hero", { heading: { type: "string" } }),
              ],
              discriminator: { propertyName: "_template" },
            },
          },
        },
      },
    });

    const templates = fieldOf(entity.fields, "blocks")?.items?.templates;
    expect(
      templates?.map((template) => [
        template.key,
        template.fields.map((field) => field.key),
      ]),
    ).toEqual([
      ["hero", ["heading"]],
      ["gallery", ["caption"]],
    ]);
    const contract = compileFillContract({ entity });
    expectPortable(contract.schema);
    expect(
      valueSchemaOf(contract, "blocks").items?.properties?._template?.enum,
    ).toEqual(["hero", "gallery"]);
  });
});

describe("buildAiEntity — warnings inside nested values", () => {
  it("says which nested value has a declaration the reader cannot read", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema(SPEAKERS),
      schema: {
        type: "object",
        properties: {
          speakers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { enum: "x" as unknown as unknown[] },
              },
            },
          },
        },
      },
    });

    expect(entity.warnings).toContainEqual({
      kind: "unreadable-source",
      source: "schema",
      key: "speakers.*",
    });
  });
});

describe("buildAiEntity — a secret named across nested keys", () => {
  it("keeps out a field that names a secret with its object's or its list's key, from a backend alone", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          api: {
            type: "object",
            properties: {
              key: { type: "string" },
              keywords: { type: "string" },
            },
          },
          access: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
              },
            },
          },
        },
      },
    });

    expect(fieldOf(entity.fields, "api.keywords")).toBeDefined();
    expect(entity.skipped).toMatchObject([
      { key: "api.key", reason: "secret" },
    ]);
    const access = fieldOf(entity.fields, "access")?.items;
    expect(access?.fields.map((field) => field.key)).toEqual(["label"]);
    expect(access?.skipped).toMatchObject([{ key: "key", reason: "secret" }]);
  });

  it("keeps out the field of a form's object type that names a secret with the object's key", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        { key: "private", type: "object:private" },
      ] as Fields),
      schema: {
        type: "object",
        properties: {
          private: {
            type: "object",
            properties: { key: { type: "string" }, note: { type: "string" } },
          },
        },
      },
    });

    expect(entity.fields.map((field) => field.key)).toEqual(["private.note"]);
    expect(entity.skipped).toMatchObject([
      { key: "private.key", reason: "secret" },
    ]);
  });

  it("keeps out an item's field that names a secret with its list's or its template's key, from a form alone", () => {
    const entity = formEntity([
      {
        key: "api",
        type: "repeater",
        fields: [
          { key: "key", type: "text" },
          { key: "label", type: "text" },
        ],
      },
      {
        key: "blocks",
        type: "repeater",
        attrs: {
          templates: {
            api: [
              { key: "key", type: "text" },
              { key: "name", type: "text" },
            ],
          },
        },
      },
    ] as Fields);

    const api = fieldOf(entity.fields, "api")?.items;
    expect(api?.fields.map((field) => field.key)).toEqual(["label"]);
    expect(api?.skipped).toMatchObject([{ key: "key", reason: "secret" }]);
    const [template] = fieldOf(entity.fields, "blocks")?.items?.templates ?? [];
    expect(template?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(template?.skipped).toMatchObject([{ key: "key", reason: "secret" }]);
    const contract = compileFillContract({ entity });
    expectPortable(contract.schema);
    expect(JSON.stringify(contract.schema)).not.toContain("api_key");
  });
});

describe("buildAiEntity — objects and maps", () => {
  it("fills an object of the backend through its own fields, under dotted keys", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          address: {
            type: "object",
            properties: {
              street: { type: "string" },
              area: {
                type: "object",
                properties: { zone: { type: "string", maxLength: 10 } },
              },
              password: { type: "string" },
            },
            required: ["street"],
          },
        },
        required: ["address"],
      },
    });

    expect(entity.fields).toMatchObject([
      { key: "address.street", required: true },
      { key: "address.area.zone", constraints: { maxLength: 10 } },
    ]);
    expect(entity.skipped).toMatchObject([
      { key: "address.password", reason: "secret" },
    ]);
  });

  it("makes the fields of an optional object optional", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          address: {
            type: "object",
            properties: { street: { type: "string" } },
            required: ["street"],
          },
        },
      },
    });

    expect(fieldOf(entity.fields, "address.street")?.required).toBe(false);
  });

  it("gives the SEO block the backend's limits, and keeps it out whole when it is excluded", () => {
    const sources = {
      fields: fieldsToJsonSchema([{ key: "seo", type: "seo" }] as Fields),
      schema: {
        type: "object",
        properties: {
          seo: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: 60 },
              description: { type: "string" },
              permalink: { type: "string" },
            },
          },
        },
      },
    };

    expect(
      fieldOf(buildAiEntity(sources).fields, "seo.title")?.constraints,
    ).toEqual({
      maxLength: 60,
    });
    expect(buildAiEntity(sources, { exclude: ["seo"] }).skipped).toEqual([
      { key: "seo", fieldType: "seo", reason: "excluded" },
    ]);
  });

  it("leaves out an object whose fields nobody describes", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: { data: { type: "object", additionalProperties: true } },
      },
    });

    expect(entity.skipped).toMatchObject([
      { key: "data", reason: "unsupported" },
    ]);
  });

  it("keeps a point out when one of its parts is kept out: by the exclusions, or on either side", () => {
    const place = [{ key: "place", type: "map" }] as Fields;
    expect(formEntity(place, ["place.lat"]).skipped).toMatchObject([
      { key: "place", reason: "excluded" },
    ]);

    const withBackend = (lat: JSONSchema) =>
      buildAiEntity({
        fields: fieldsToJsonSchema(place),
        schema: {
          type: "object",
          properties: {
            place: {
              type: "object",
              properties: { lat, lng: { type: "number" } },
            },
          },
        },
      });
    expect(
      withBackend({ type: "number", [AI_KEYWORD]: { exclude: true } }).skipped,
    ).toMatchObject([{ key: "place", reason: "excluded" }]);
    expect(
      withBackend({ type: "number", writeOnly: true }).skipped,
    ).toMatchObject([{ key: "place", reason: "secret" }]);

    // Without fields the backend is the form: read-only on a part decides.
    const backendAlone = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          place: {
            type: "object",
            "x-mapo-field": "map",
            properties: {
              lat: { type: "number", readOnly: true },
              lng: { type: "number" },
            },
          },
        },
      },
    });
    expect(backendAlone.skipped).toMatchObject([
      { key: "place", reason: "readonly" },
    ]);
  });

  it("lets a key the form declares on its own win over the same key of an object", () => {
    const entity = formEntity([
      { key: "seo", type: "seo" },
      { key: "seo.title", type: "textarea" },
    ] as Fields);

    const titles = entity.fields.filter((field) => field.key === "seo.title");
    expect(titles).toHaveLength(1);
    expect(titles[0]?.kind).toBe("text");
  });
});

describe("buildAiEntity — what keeps the AI out counts in every declaration of a nested value", () => {
  it("keeps out an object's field that another `allOf` part marks as a secret", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        allOf: [
          {
            properties: {
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  pin: { type: "string" },
                },
              },
            },
          },
          {
            properties: {
              address: {
                properties: { pin: { type: "string", writeOnly: true } },
              },
            },
          },
        ],
      },
    });

    expect(fieldOf(entity.fields, "address.street")).toBeDefined();
    expect(entity.skipped).toMatchObject([
      { key: "address.pin", reason: "secret" },
    ]);
  });

  it("keeps out an item's field that a union branch of the record marks as a secret", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          speakers: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, pin: { type: "string" } },
            },
          },
        },
        anyOf: [
          {
            properties: {
              speakers: {
                items: {
                  properties: { pin: { type: "string", writeOnly: true } },
                },
              },
            },
          },
          { properties: {} },
        ],
      },
    });

    const items = fieldOf(entity.fields, "speakers")?.items;
    expect(items?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(items?.skipped).toMatchObject([{ key: "pin", reason: "secret" }]);
  });

  it("keeps out a form item's field that a condition of the backend marks as a secret", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "speakers",
          type: "repeater",
          fields: [
            { key: "name", type: "text" },
            { key: "pin", type: "text" },
          ],
        },
      ] as Fields),
      schema: {
        type: "object",
        properties: {
          speakers: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, pin: { type: "string" } },
            },
          },
        },
        if: { properties: { kind: { const: "private" } } },
        then: {
          properties: {
            speakers: {
              items: {
                properties: { pin: { type: "string", writeOnly: true } },
              },
            },
          },
        },
      },
    });

    const items = fieldOf(entity.fields, "speakers")?.items;
    expect(items?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(items?.skipped).toMatchObject([{ key: "pin", reason: "secret" }]);
  });

  it("keeps out an item's field that another declaration of the form marks as a secret or read-only", () => {
    const fields = fieldsToJsonSchema([
      {
        key: "speakers",
        type: "repeater",
        fields: [
          { key: "name", type: "text" },
          { key: "pin", type: "text" },
          { key: "role", type: "text" },
        ],
      },
    ] as Fields);
    const entity = buildAiEntity({
      fields: {
        ...fields,
        allOf: [
          {
            properties: {
              speakers: {
                items: {
                  properties: {
                    pin: { writeOnly: true },
                    role: { readOnly: true },
                  },
                },
              },
            },
          },
        ],
      },
    });

    const items = fieldOf(entity.fields, "speakers")?.items;
    expect(items?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(items?.skipped.map(({ key, reason }) => [key, reason])).toEqual([
      ["pin", "secret"],
      ["role", "readonly"],
    ]);
    expect(entity.warnings).toEqual([]);
  });

  it("keeps out every field of items the form marks as a secret as a whole", () => {
    const fields = fieldsToJsonSchema(SPEAKERS);
    const speakers = fields.properties?.speakers ?? {};
    const entity = buildAiEntity({
      fields: {
        ...fields,
        properties: {
          ...fields.properties,
          speakers: {
            ...speakers,
            items: { ...speakers.items, writeOnly: true },
          },
        },
      },
    });

    expect(entity.fields.map((field) => field.key)).toEqual(["title"]);
    expect(entity.skipped).toMatchObject([
      { key: "speakers", reason: "secret" },
    ]);
  });

  it("keeps out every field of items an exclusion marks, wherever it is written", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          speakers: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
        allOf: [
          {
            properties: {
              speakers: { items: { "x-mapo-ai": { exclude: true } } },
            },
          },
        ],
      },
    });

    expect(entity.fields).toEqual([]);
  });
});

// ─── The contract ────────────────────────────────────────────────────────────

describe("compileFillContract — lists", () => {
  it("asks for a list as items, each with its fields and its own quotes", () => {
    const contract = compileFillContract({ entity: formEntity(SPEAKERS) });
    expectPortable(contract.schema);

    expect(contract.version).toBe(AI_CONTRACT_FORMAT_VERSION);
    expect(AI_CONTRACT_FORMAT_VERSION).toBe(2);
    const speakers = valueSchemaOf(contract, "speakers");
    expect(speakers.type).toBe("array");
    expect(speakers.description).toContain(
      "One item for each one the source gives",
    );
    expect(speakers.description).toContain("At most 3 items.");
    const item = speakers.items ?? {};
    expect(Object.keys(item.properties ?? {})).toEqual([
      "name",
      "role",
      "evidence",
    ]);
    expect(item.properties?.evidence?.items?.properties?.field?.enum).toEqual([
      "name",
      "role",
    ]);
    // The record's own quotes name its own values; the items quote for themselves.
    const evidence = contract.schema.properties?.evidence;
    expect(evidence?.items?.properties?.field?.enum).toEqual(["title"]);
  });

  it("asks only the items for quotes when every field is a list", () => {
    const contract = compileFillContract({
      entity: formEntity([SPEAKERS[1]] as Fields),
    });
    expectPortable(contract.schema);

    expect(contract.entity.evidence).toBe(false);
    expect(Object.keys(contract.schema.properties ?? {})).toEqual(["values"]);
    expect(
      contractFieldOf(contract.entity.fields, "speakers")?.items?.evidence,
    ).toBe(true);
  });

  it("asks each item for its template, with each template's own fields", () => {
    const contract = compileFillContract({ entity: formEntity(BLOCKS) });
    expectPortable(contract.schema);

    const items = contractFieldOf(contract.entity.fields, "blocks")?.items;
    expect(items?.templates).toEqual([
      {
        key: "hero",
        label: "Hero",
        description: "A large title",
        wires: ["hero_title"],
      },
      { key: "gallery", wires: ["gallery_caption"] },
    ]);
    const item = valueSchemaOf(contract, "blocks").items ?? {};
    expect(item.properties?._template?.enum).toEqual(["hero", "gallery"]);
    expect(item.properties?._template?.description).toContain(
      '"hero" (Hero: A large title), "gallery"',
    );
    expect(item.properties?.hero_title?.description).toContain(
      'Only in an item whose _template is "hero"',
    );
  });

  it("keeps an item's own names for itself", () => {
    const contract = compileFillContract({
      entity: formEntity([
        {
          key: "notes",
          type: "repeater",
          fields: [
            { key: "evidence", type: "text" },
            { key: "text", type: "text" },
          ],
        },
      ] as Fields),
    });
    expectPortable(contract.schema);

    const wires = contractFieldOf(
      contract.entity.fields,
      "notes",
    )?.items?.fields.map((field) => field.wire);
    expect(wires).toEqual(["evidence_2", "text"]);
  });

  it("goes as deep as every provider accepts, and says which list it leaves out", () => {
    const level = (key: string, inner?: Fields[number]): Fields[number] =>
      ({
        key,
        type: "repeater",
        fields: [{ key: "name", type: "text" }, ...(inner ? [inner] : [])],
      }) as Fields[number];
    const entity = formEntity([level("a", level("b", level("c")))] as Fields);

    const fill = compileFillContract({ entity });
    expectPortable(fill.schema);
    const b = contractFieldOf(
      contractFieldOf(fill.entity.fields, "a")?.items?.fields ?? [],
      "b",
    );
    expect(b?.items?.fields.map((field) => field.key)).toEqual(["name"]);
    expect(fill.entity.omitted).toEqual([
      { key: "a.*.b.*.c", reason: "too-deep" },
    ]);

    const extract = compileExtractContract([{ type: "event", entity }]);
    expectPortable(extract.schema);
    expect(extract.entities[0]?.omitted).toEqual([
      { key: "a.*.b", reason: "too-deep" },
    ]);

    // Without quotes the items need less room.
    const unquoted = compileFillContract({ entity, evidence: false });
    expectPortable(unquoted.schema);
    expect(unquoted.entity.omitted).toBeUndefined();
  });

  it("leaves out a list whose links inside its items would go too deep, without quotes too", () => {
    const people = formEntity([{ key: "name", type: "text" }] as Fields);
    const compile = (link: Fields[number]) =>
      compileExtractContract([
        {
          type: "event",
          evidence: false,
          entity: formEntity([
            {
              key: "days",
              type: "repeater",
              fields: [
                { key: "label", type: "text" },
                {
                  key: "talks",
                  type: "repeater",
                  fields: [{ key: "title", type: "text" }, link],
                },
              ],
            },
          ] as Fields),
        },
        {
          type: "person",
          endpoint: "/api/people/",
          evidence: false,
          entity: people,
        },
      ]);

    const many = compile({
      key: "speakers",
      type: "m2m",
      attrs: { endpoint: "/api/people/" },
    } as Fields[number]);
    expectPortable(many.schema);
    expect(many.entities[0]?.omitted).toEqual([
      { key: "days.*.talks", reason: "too-deep" },
    ]);

    // One link is an object of leaves: it fits, at the tenth level.
    const one = compile({
      key: "speaker",
      type: "fks",
      attrs: { endpoint: "/api/people/" },
    } as Fields[number]);
    expectPortable(one.schema);
    expect(one.entities[0]?.omitted).toBeUndefined();
  });

  it("lets a relation inside items pick from the records listed under its path", () => {
    const entity = formEntity([
      {
        key: "speakers",
        type: "repeater",
        fields: [
          { key: "name", type: "text" },
          { key: "org", type: "fks", attrs: { endpoint: "/api/orgs/" } },
        ],
      },
    ] as Fields);
    const records = [{ value: 7, label: "Teatro Regio" }];

    const listed = compileFillContract({
      entity,
      relationChoices: { "speakers.*.org": records },
    });
    expectPortable(listed.schema);
    const org = contractFieldOf(
      contractFieldOf(listed.entity.fields, "speakers")?.items?.fields ?? [],
      "org",
    );
    expect(org).toMatchObject({ relationMode: "choice", choices: records });

    // Without the item's `*`, the path names no field.
    const unlisted = compileFillContract({
      entity,
      relationChoices: { "speakers.org": records },
    });
    const searched = contractFieldOf(
      contractFieldOf(unlisted.entity.fields, "speakers")?.items?.fields ?? [],
      "org",
    );
    expect(searched?.relationMode).toBe("search");
  });

  it("asks for the text of a translatable repeater's items in the record's language", () => {
    const contract = compileFillContract(
      {
        entity: formEntity([
          {
            key: "faq",
            type: "repeater",
            translatable: true,
            fields: [{ key: "question", type: "text" }],
          },
        ] as Fields),
      },
      { language: "it" },
    );

    const item = valueSchemaOf(contract, "faq").items ?? {};
    expect(item.properties?.question?.description).toContain(
      'Write it in the language with code "it".',
    );
  });

  it("describes a point of a map", () => {
    const contract = compileFillContract({
      entity: formEntity([{ key: "place", type: "map" }] as Fields),
    });

    expect(valueSchemaOf(contract, "place")).toMatchObject({ type: "string" });
    expect(valueSchemaOf(contract, "place").description).toContain(
      "only when the source writes both numbers: never work them out from an address or a place name",
    );
  });

  it("moves the choices inside items to the descriptions when the schema holds too many", () => {
    const choices = (prefix: string) =>
      Array.from({ length: 240 }, (_, index) => ({
        text: `${prefix} ${index}`,
        value: `${prefix}${index}`,
      }));
    const entity = formEntity([
      {
        key: "rows",
        type: "repeater",
        fields: ["a", "b", "c", "d", "e"].map((key) => ({
          key,
          type: "select",
          attrs: { options: choices(key) },
        })),
      },
    ] as Fields);

    const contract = compileFillContract({ entity });
    const census = expectPortable(contract.schema);

    expect(census.enumValues).toBeLessThanOrEqual(1000);
    const moved = contractFieldOf(
      contract.entity.fields,
      "rows",
    )?.items?.fields.filter((field) => !field.choicesInSchema);
    expect(moved?.length).toBeGreaterThan(0);
  });
});

// ─── The sanitizer ───────────────────────────────────────────────────────────

const SOURCE =
  "Ospiti della serata: Mario Rossi, direttore artistico del festival, e Anna Bianchi, curatrice della mostra.";

function speakersAnswer(items: unknown[], title = ""): unknown {
  return {
    values: { title, speakers: items },
    evidence: [],
  };
}

function quote(field: string, text: string) {
  return { field, quote: text, where: "" };
}

const MARIO = {
  name: "Mario Rossi",
  role: "direttore artistico",
  evidence: [
    quote("name", "Mario Rossi, direttore"),
    quote("role", "direttore artistico del festival"),
  ],
};
const ANNA = {
  name: "Anna Bianchi",
  role: "curatrice",
  evidence: [
    quote("name", "Anna Bianchi, curatrice"),
    quote("role", "Anna Bianchi, curatrice"),
  ],
};

function speakersOutcome(items: unknown[]): AiFieldOutcome | undefined {
  const contract = compileFillContract({ entity: formEntity(SPEAKERS) });
  return sanitizeFillAnswer(contract, speakersAnswer(items), { source: SOURCE })
    .fields.speakers;
}

describe("sanitizeFillAnswer — lists", () => {
  it("reads each item with its own quotes, and verifies the list when every item is", () => {
    const outcome = speakersOutcome([MARIO, ANNA]);

    expect(outcome).toMatchObject({
      status: "filled",
      verified: true,
      value: [
        { name: "Mario Rossi", role: "direttore artistico" },
        { name: "Anna Bianchi", role: "curatrice" },
      ],
    });
    if (outcome?.status !== "filled") throw new Error("Not filled");
    expect(outcome.items?.map((item) => item.verified)).toEqual([true, true]);
    expect(outcome.items?.[0]?.fields.name).toMatchObject({
      status: "filled",
      verified: true,
      quotes: [{ quote: "Mario Rossi, direttore", found: true }],
    });
  });

  it("leaves a list to check when one item is, and says which", () => {
    const unquoted = { name: "Luigi Verdi", role: "", evidence: [] };
    const outcome = speakersOutcome([MARIO, unquoted]);

    expect(outcome).toMatchObject({ status: "filled", verified: false });
    if (outcome?.status !== "filled") throw new Error("Not filled");
    expect(outcome.items?.map((item) => item.verified)).toEqual([true, false]);
  });

  it("skips an item without values, and takes out what is not an item", () => {
    const empty = { name: "", role: "", evidence: [] };
    const outcome = speakersOutcome([MARIO, empty, "Anna Bianchi"]);

    expect(outcome).toMatchObject({
      status: "filled",
      verified: false,
      value: [{ name: "Mario Rossi", role: "direttore artistico" }],
      dropped: [{ proposed: "Anna Bianchi", reason: "format" }],
    });
  });

  it("discards a list with more items than it allows, and keeps a short one to check", () => {
    const four = [MARIO, ANNA, { ...MARIO }, { ...ANNA }];
    expect(speakersOutcome(four)).toMatchObject({
      status: "discarded",
      reason: "too-many-values",
    });

    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          speakers: {
            type: "array",
            minItems: 2,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
              },
            },
          },
        },
      },
    });
    const contract = compileFillContract({ entity });
    const result = sanitizeFillAnswer(
      contract,
      { values: { speakers: [MARIO] } },
      {
        source: SOURCE,
      },
    );
    expect(result.fields.speakers).toMatchObject({
      status: "filled",
      tooFew: true,
      verified: false,
    });
  });

  it("reads a templated item by its template's fields, never verified, and takes out one without a template of the list", () => {
    const contract = compileFillContract({ entity: formEntity(BLOCKS) });
    const result = sanitizeFillAnswer(
      contract,
      {
        values: {
          blocks: [
            {
              _template: "hero",
              hero_title: "Mario Rossi",
              gallery_caption: "ignored",
              evidence: [quote("hero_title", "Mario Rossi, direttore")],
            },
            {
              _template: "poster",
              hero_title: "x",
              gallery_caption: "",
              evidence: [],
            },
          ],
        },
      },
      { source: SOURCE },
    );

    // The title is in the source; which kind of block it is, no quote says.
    expect(result.fields.blocks).toMatchObject({
      status: "filled",
      verified: false,
      value: [{ _template: "hero", title: "Mario Rossi" }],
      dropped: [{ reason: "not-listed" }],
      items: [
        {
          template: "hero",
          verified: false,
          fields: { title: { status: "filled", verified: true } },
        },
      ],
    });
  });

  it("nests an item's dotted keys, and reads a list inside an item", () => {
    const contract = compileFillContract({
      entity: formEntity([
        {
          key: "days",
          type: "repeater",
          fields: [
            { key: "seo", type: "seo" },
            {
              key: "talks",
              type: "repeater",
              fields: [{ key: "title", type: "text" }],
            },
          ],
        },
      ] as Fields),
    });
    const days = contractFieldOf(contract.entity.fields, "days")?.items;
    const seoTitle =
      contractFieldOf(days?.fields ?? [], "seo.title")?.wire ?? "";
    const result = sanitizeFillAnswer(
      contract,
      {
        values: {
          days: [
            {
              [seoTitle]: "Serata d'apertura",
              seo_description: "",
              seo_permalink: "",
              talks: [{ title: "Mario Rossi", evidence: [] }],
              evidence: [],
            },
          ],
        },
      },
      { source: SOURCE },
    );

    expect(result.fields.days).toMatchObject({
      status: "filled",
      value: [
        {
          seo: { title: "Serata d'apertura" },
          talks: [{ title: "Mario Rossi" }],
        },
      ],
    });
    const paths = Object.keys(outcomesByPath(result.fields));
    expect(paths).toEqual(
      expect.arrayContaining([
        "days",
        "days.0.seo.title",
        "days.0.talks",
        "days.0.talks.0.title",
      ]),
    );
  });

  it("leaves to check an item that repeats one before it", () => {
    const outcome = speakersOutcome([MARIO, { ...MARIO }]);

    expect(outcome).toMatchObject({ status: "filled", verified: false });
    if (outcome?.status !== "filled") throw new Error("Not filled");
    expect(outcome.items?.map((item) => item.verified)).toEqual([true, false]);
  });

  it("leaves to check an item without a value its fields require", () => {
    const onlyRole = {
      name: "",
      role: "curatrice",
      evidence: [quote("role", "Anna Bianchi, curatrice")],
    };

    expect(speakersOutcome([onlyRole])).toMatchObject({
      status: "filled",
      verified: false,
      items: [{ verified: false, fields: { role: { verified: true } } }],
    });
  });

  it("leaves to check an item with a discarded value, and takes out one whose every value is discarded", () => {
    const contract = compileFillContract({
      entity: formEntity([
        {
          key: "contacts",
          type: "repeater",
          fields: [
            { key: "name", type: "text" },
            { key: "email", type: "email" },
          ],
        },
      ] as Fields),
    });
    const result = sanitizeFillAnswer(
      contract,
      {
        values: {
          contacts: [
            {
              name: "Mario Rossi",
              email: "not an email",
              evidence: [quote("name", "Mario Rossi, direttore")],
            },
            { name: "", email: "also wrong", evidence: [] },
          ],
        },
      },
      { source: SOURCE },
    );

    expect(result.fields.contacts).toMatchObject({
      status: "filled",
      verified: false,
      value: [{ name: "Mario Rossi" }],
      dropped: [{ reason: "format" }],
      items: [
        {
          verified: false,
          fields: {
            name: { status: "filled", verified: true },
            email: { status: "discarded", reason: "format" },
          },
        },
      ],
    });
  });

  it("keys the outcomes inside a list by the place of their item in its value", () => {
    const empty = { name: "", role: "", evidence: [] };
    const outcome = speakersOutcome([MARIO, empty, "Luigi Verdi", ANNA]);
    const byPath = outcomesByPath(outcome ? { speakers: outcome } : {});

    expect(byPath["speakers.0.name"]).toMatchObject({ value: "Mario Rossi" });
    expect(byPath["speakers.1.name"]).toMatchObject({ value: "Anna Bianchi" });
    expect(byPath["speakers.2.name"]).toBeUndefined();
  });

  it("warns about a quote for a field of another template", () => {
    const contract = compileFillContract({ entity: formEntity(BLOCKS) });
    const result = sanitizeFillAnswer(contract, {
      values: {
        blocks: [
          {
            _template: "gallery",
            hero_title: "",
            gallery_caption: "Mario Rossi",
            evidence: [quote("hero_title", "Mario Rossi, direttore")],
          },
        ],
      },
    });

    expect(result.warnings).toContainEqual({
      kind: "unknown-field",
      path: "$.values.blocks[0].evidence[0]",
      field: "hero_title",
    });
  });
});

describe("sanitizeFillAnswer — keys that are not plain names", () => {
  const text = (key: string): AiField => ({
    key,
    fieldType: "text",
    kind: "string",
    required: false,
    translatable: false,
    multiple: false,
    constraints: {},
  });
  const list = (key: string, fields: AiField[]): AiField => ({
    ...text(key),
    fieldType: "repeater",
    kind: "list",
    items: { fields, skipped: [] },
  });
  const entityOf = (fields: AiField[]): AiEntity => ({
    sources: { schema: false, fields: true },
    fields,
    skipped: [],
    warnings: [],
  });
  const wireOf = (contract: AiFillContract, list: string, key: string) =>
    contractFieldOf(
      contractFieldOf(contract.entity.fields, list)?.items?.fields ?? [],
      key,
    )?.wire ?? "";

  it("keeps `__proto__` inside an item as a key of its own, and touches no prototype", () => {
    // A contract crafted by hand, as a gateway could receive it.
    const contract = compileFillContract({
      entity: entityOf([
        list("rows", [text("__proto__.polluted")]),
        list("tags", [text("__proto__")]),
      ]),
      evidence: false,
    });
    try {
      const result = sanitizeFillAnswer(contract, {
        values: {
          rows: [{ [wireOf(contract, "rows", "__proto__.polluted")]: "yes" }],
          tags: [{ [wireOf(contract, "tags", "__proto__")]: "no" }],
        },
      });

      expect(Reflect.get({}, "polluted")).toBeUndefined();
      const rows = result.fields.rows;
      const tags = result.fields.tags;
      if (rows?.status !== "filled" || tags?.status !== "filled")
        throw new Error("Not filled");
      const [row] = rows.value as Record<string, unknown>[];
      const [tag] = tags.value as Record<string, unknown>[];
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
      expect(Object.getOwnPropertyDescriptor(row, "__proto__")?.value).toEqual({
        polluted: "yes",
      });
      expect(Object.getOwnPropertyDescriptor(tag, "__proto__")?.value).toBe(
        "no",
      );
    } finally {
      Reflect.deleteProperty(Object.prototype, "polluted");
    }
  });

  it("gives the outcome of a field keyed `__proto__` under its own path", () => {
    const contract = compileFillContract({
      entity: entityOf([text("__proto__"), text("title")]),
      evidence: false,
    });
    const wire = contractFieldOf(contract.entity.fields, "__proto__")?.wire;
    const result = sanitizeFillAnswer(contract, {
      values: { [wire ?? ""]: "x", title: "y" },
    });

    const byPath = outcomesByPath(result.fields);
    expect(Object.getPrototypeOf(byPath)).toBe(Object.prototype);
    expect(Object.keys(byPath)).toEqual(["__proto__", "title"]);
  });
});

describe("sanitizeExtractAnswer — lists", () => {
  it("reads a list inside an extracted record, with a link from an item to another record of the answer", () => {
    const contract = compileExtractContract([
      {
        type: "event",
        entity: formEntity([
          { key: "title", type: "text" },
          {
            key: "speakers",
            type: "repeater",
            fields: [
              { key: "name", type: "text" },
              { key: "org", type: "fks", attrs: { endpoint: "/api/orgs/" } },
            ],
          },
        ] as Fields),
      },
      {
        type: "org",
        endpoint: "/api/orgs/",
        entity: formEntity([{ key: "name", type: "text" }] as Fields),
      },
    ]);
    expectPortable(contract.schema);
    const speakers = contractFieldOf(
      contract.entities[0]?.fields ?? [],
      "speakers",
    );
    expect(contractFieldOf(speakers?.items?.fields ?? [], "org")?.linksTo).toBe(
      "org",
    );

    const result = sanitizeExtractAnswer(
      contract,
      {
        items: [
          {
            type: "org",
            ref: "org-1",
            values: { name: "Teatro Regio" },
            evidence: [],
          },
          {
            type: "event",
            ref: "event-1",
            values: {
              title: "",
              speakers: [
                {
                  name: "Mario Rossi",
                  org: { record: "", item: "org-1" },
                  evidence: [quote("name", "Mario Rossi, direttore")],
                },
                {
                  name: "Anna Bianchi",
                  org: { record: "", item: "org-9" },
                  evidence: [],
                },
              ],
            },
            evidence: [],
          },
        ],
      },
      { source: SOURCE },
    );

    const event = result.items.find((item) => item.type === "event");
    expect(event?.fields.speakers).toMatchObject({
      status: "filled",
      value: [
        { name: "Mario Rossi", org: { item: "org-1" } },
        { name: "Anna Bianchi" },
      ],
    });
    expect(result.warnings).toContainEqual({
      kind: "unknown-item",
      path: "$.items[1].values.speakers[1].org.item",
      item: "org-9",
    });
  });
});

describe("sanitizeFillAnswer — a point of a map", () => {
  const contract = () =>
    compileFillContract({
      entity: formEntity([{ key: "place", type: "map" }] as Fields),
    });
  const read = (value: string, quotes: string[], source: string) =>
    sanitizeFillAnswer(
      contract(),
      {
        values: { place: value },
        evidence: quotes.map((text) => quote("place", text)),
      },
      { source },
    ).fields.place;

  it.each([
    ["45.4642, 9.1900", { lat: 45.4642, lng: 9.19 }],
    ["40.7128 -74.0060", { lat: 40.7128, lng: -74.006 }],
    ["-33.8688,151.2093", { lat: -33.8688, lng: 151.2093 }],
  ])("reads %s as a point", (value, point) => {
    expect(read(value, [], "")).toMatchObject({
      status: "filled",
      value: point,
    });
  });

  it.each(["95.1, 9.19", "45.46, 190.2", "45.46", "Milano", "45,46, 9,19"])(
    "discards %s",
    (value) => {
      expect(read(value, [], "")).toMatchObject({
        status: "discarded",
        reason: "format",
      });
    },
  );

  it.each([
    ["40.7128 N, 74.0060 W", "40.7128, -74.0060", true],
    ["40.7128 N, 74.0060 W", "40.7128, 74.0060", false],
    ["Coordinate: 45.4642, 9.1900", "45.4642, 9.1900", true],
    ["Coordinate: 45.4642, 9.1900", "9.1900, 45.4642", false],
    ["9.1900 E, 45.4642 N", "45.4642, 9.1900", true],
    ["9.1900 E, 45.4642 N", "9.1900, 45.4642", false],
    ["Sydney, -33.8688, 151.2093", "-33.8688, 151.2093", true],
    ["Sydney, -33.8688, 151.2093", "33.8688, 151.2093", false],
    ["Sala da 45 posti", "45, 45", false],
    ["45 posti, ingresso 9 euro", "45, 9", false],
  ])("from the quote %j, verifies %s: %s", (text, value, verified) => {
    expect(read(value, [text], `Dove: ${text}.`)).toMatchObject({
      status: "filled",
      verified,
    });
  });

  it("verifies a point only when a quote writes both its numbers", () => {
    const source =
      "La sede è alle coordinate 45,4642 N e 9,1900 E, in via Dante.";

    expect(
      read("45.4642, 9.1900", ["coordinate 45,4642 N e 9,1900 E"], source),
    ).toMatchObject({ status: "filled", verified: true });
    expect(
      read("45.4642, 9.1900", ["coordinate 45,4642 N"], source),
    ).toMatchObject({
      status: "filled",
      verified: false,
    });
    expect(read("45.4642, 9.1900", ["in via Dante"], source)).toMatchObject({
      status: "filled",
      verified: false,
    });
  });
});
