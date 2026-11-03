import { describe, expect, it } from "vitest";
import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import { drfMetadataToJsonSchema } from "@mapomodule/utils/jsonSchema";
import type { JSONSchema } from "@mapomodule/utils";
import { buildAiEntity } from "../runtime/shared/entity";
import type { AiEntity, AiField } from "../runtime/shared/entity";
import { AI_KEYWORD } from "../runtime/shared/dialect";

type Fields = Parameters<typeof fieldsToJsonSchema>[0];

/** The entity of a form alone, its fields written the way the browser will. */
function formEntity(fields: Fields): AiEntity {
  return buildAiEntity({ fields: fieldsToJsonSchema(fields) });
}

function fieldOf(entity: AiEntity, key: string): AiField | undefined {
  return entity.fields.find((field) => field.key === key);
}

function reasonOf(entity: AiEntity, key: string): string | undefined {
  return entity.skipped.find((field) => field.key === key)?.reason;
}

/** A dialect schema written by hand, for the merge rules. */
function objectSchema(
  properties: Record<string, JSONSchema>,
  required: string[] = [],
): JSONSchema {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
  };
}

describe("buildAiEntity — a form alone", () => {
  it.each([
    ["text", {}, "string"],
    ["textarea", {}, "text"],
    ["editor", {}, "html"],
    ["email", {}, "email"],
    ["url", {}, "url"],
    ["color", {}, "color"],
    ["number", {}, "number"],
    ["slider", {}, "number"],
    ["boolean", {}, "boolean"],
    ["switch", {}, "boolean"],
    ["date", {}, "date"],
    ["datetime", {}, "datetime"],
    ["time", {}, "time"],
    ["select", { options: [{ text: "Draft", value: "draft" }] }, "choice"],
    ["fks", { endpoint: "/api/places/" }, "relation"],
    ["m2m", { endpoint: "/api/tags/" }, "relation"],
  ])("reads a %s field as a value of kind %s", (type, attrs, kind) => {
    const entity = formEntity([{ key: "value", type, attrs }] as Fields);

    expect(entity.skipped).toEqual([]);
    expect(fieldOf(entity, "value")).toMatchObject({ fieldType: type, kind });
  });

  it.each([
    ["file", {}, "media"],
    ["media", {}, "media"],
    ["media-m2m", {}, "media"],
    ["enhanced-media", {}, "media"],
    ["seo", {}, "unsupported"],
    ["map", {}, "unsupported"],
    ["fks", {}, "relation"],
    ["rating", {}, "unsupported"],
  ])("leaves a %s field alone (%s)", (type, attrs, reason) => {
    const entity = formEntity([{ key: "value", type, attrs }] as Fields);

    expect(entity.fields).toEqual([]);
    expect(entity.skipped).toEqual([{ key: "value", fieldType: type, reason }]);
  });

  it("leaves a repeater alone: nested values are not filled", () => {
    const entity = formEntity([
      { key: "faq", type: "repeater", fields: [{ key: "q", type: "text" }] },
    ] as Fields);

    expect(reasonOf(entity, "faq")).toBe("unsupported");
  });

  it("keeps a select's choices with their labels, and its multiplicity", () => {
    const entity = formEntity([
      {
        key: "tags",
        type: "select",
        attrs: {
          multiple: true,
          options: [
            { text: "News", value: "news" },
            { text: "Events", value: "events" },
          ],
        },
      },
    ] as Fields);

    expect(fieldOf(entity, "tags")).toMatchObject({
      kind: "choice",
      multiple: true,
      choices: [
        { value: "news", label: "News" },
        { value: "events", label: "Events" },
      ],
    });
  });

  it("keeps a relation's endpoint and multiplicity", () => {
    const entity = formEntity([
      { key: "place", type: "fks", attrs: { endpoint: "/api/places/" } },
      { key: "tags", type: "m2m", attrs: { endpoint: "/api/tags/" } },
    ] as Fields);

    expect(fieldOf(entity, "place")).toMatchObject({
      endpoint: "/api/places/",
      multiple: false,
    });
    expect(fieldOf(entity, "tags")).toMatchObject({
      endpoint: "/api/tags/",
      multiple: true,
    });
  });

  it("carries labels, required, translatable and the limits", () => {
    const entity = formEntity([
      {
        key: "title",
        type: "text",
        label: "Title",
        required: true,
        translatable: true,
        attrs: { minLength: 3, maxLength: 80 },
      },
      { key: "seats", type: "number", attrs: { min: 1, max: 500 } },
    ] as Fields);

    expect(fieldOf(entity, "title")).toEqual({
      key: "title",
      fieldType: "text",
      kind: "string",
      label: "Title",
      required: true,
      translatable: true,
      multiple: false,
      constraints: { minLength: 3, maxLength: 80 },
    });
    expect(fieldOf(entity, "seats")?.constraints).toEqual({
      minimum: 1,
      maximum: 500,
    });
  });

  it("keeps the form's order", () => {
    const entity = formEntity([
      { key: "b", type: "text" },
      { key: "a", type: "text" },
      { key: "c", type: "text" },
    ] as Fields);

    expect(entity.fields.map((field) => field.key)).toEqual(["b", "a", "c"]);
  });

  it("names the first reason when several apply: a secret before read-only", () => {
    const entity = formEntity([
      { key: "password", type: "text", readonly: true, noDraft: true },
      { key: "code", type: "text", readonly: true },
    ] as Fields);

    expect(reasonOf(entity, "password")).toBe("secret");
    expect(reasonOf(entity, "code")).toBe("readonly");
  });

  it("reads the hint and the exclusion from x-mapo-ai", () => {
    const fields = fieldsToJsonSchema(
      [
        { key: "title", type: "text" },
        { key: "slug", type: "text" },
      ] as Fields,
      {
        property: (schema, field) => {
          const ai =
            field.key === "title"
              ? { hint: "  The event name, without the date.  " }
              : { exclude: true };
          return { ...schema, [AI_KEYWORD]: ai };
        },
      },
    );
    const entity = buildAiEntity({ fields });

    expect(fieldOf(entity, "title")?.hint).toBe(
      "The event name, without the date.",
    );
    expect(reasonOf(entity, "slug")).toBe("excluded");
  });

  it("ignores an x-mapo-ai that is not an object, an empty hint and a non-true exclude", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        a: { type: "string", [AI_KEYWORD]: "exclude" },
        b: { type: "string", [AI_KEYWORD]: { hint: "   ", exclude: "yes" } },
      }),
    });

    expect(entity.fields.map((field) => [field.key, field.hint])).toEqual([
      ["a", undefined],
      ["b", undefined],
    ]);
  });

  it("excludes the keys listed for the entity", () => {
    const entity = buildAiEntity(
      { fields: fieldsToJsonSchema([{ key: "slug", type: "text" }] as Fields) },
      { exclude: ["slug"] },
    );

    expect(reasonOf(entity, "slug")).toBe("excluded");
  });

  it("treats a password format as a secret", () => {
    const entity = buildAiEntity({
      schema: objectSchema({ pin: { type: "string", format: "password" } }),
    });

    expect(reasonOf(entity, "pin")).toBe("secret");
  });

  it("gives a custom type the kind of the value it holds", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        rating: { type: "integer", "x-mapo-field": "rating" },
        mood: { type: "object", "x-mapo-field": "mood" },
      }),
    });

    expect(fieldOf(entity, "rating")).toMatchObject({
      fieldType: "rating",
      kind: "integer",
    });
    expect(reasonOf(entity, "mood")).toBe("unsupported");
  });

  it("is plain JSON", () => {
    const entity = formEntity([
      { key: "title", type: "text", required: true },
      { key: "status", type: "select", attrs: { options: ["a", "b"] } },
      { key: "cover", type: "media" },
    ] as Fields);

    // toStrictEqual: a key holding `undefined` would not survive the round trip.
    expect(JSON.parse(JSON.stringify(entity))).toStrictEqual(entity);
  });
});

describe("buildAiEntity — a backend schema alone", () => {
  const metadata = {
    actions: {
      POST: {
        id: { type: "integer", label: "ID", read_only: true },
        title: {
          type: "string",
          label: "Title",
          required: true,
          max_length: 120,
          help_text: "Shown in lists.",
        },
        status: {
          type: "choice",
          label: "Status",
          choices: [
            { value: "draft", display_name: "Draft" },
            { value: "live", display_name: "Published" },
          ],
        },
        seats: {
          type: "integer",
          label: "Seats",
          min_value: 0,
          max_value: 500,
        },
        author: { type: "field", label: "Author" },
      },
    },
  };

  it("describes the entity from DRF metadata", () => {
    const entity = buildAiEntity({ schema: drfMetadataToJsonSchema(metadata) });

    expect(entity.sources).toEqual({ schema: true, fields: false });
    expect(entity.fields).toEqual([
      {
        key: "title",
        fieldType: "text",
        kind: "string",
        label: "Title",
        description: "Shown in lists.",
        required: true,
        translatable: false,
        multiple: false,
        constraints: { maxLength: 120 },
      },
      {
        key: "status",
        fieldType: "select",
        kind: "choice",
        label: "Status",
        required: false,
        translatable: false,
        multiple: false,
        choices: [
          { value: "draft", label: "Draft" },
          { value: "live", label: "Published" },
        ],
        constraints: {},
      },
      {
        key: "seats",
        fieldType: "number",
        kind: "integer",
        label: "Seats",
        required: false,
        translatable: false,
        multiple: false,
        constraints: { minimum: 0, maximum: 500 },
      },
    ]);
    expect(entity.skipped).toEqual([
      { key: "id", fieldType: "number", label: "ID", reason: "readonly" },
      {
        key: "author",
        fieldType: "field:author",
        label: "Author",
        reason: "unsupported",
      },
    ]);
  });

  it("reads a nullable property: the description beside the union, the limits inside it", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        subtitle: {
          title: "Subtitle",
          description: "Optional.",
          anyOf: [{ type: "string", maxLength: 50 }, { type: "null" }],
        },
      }),
    });

    expect(fieldOf(entity, "subtitle")).toMatchObject({
      kind: "string",
      description: "Optional.",
      constraints: { maxLength: 50 },
    });
  });

  it("is empty without any source", () => {
    expect(buildAiEntity({})).toEqual({
      sources: { schema: false, fields: false },
      fields: [],
      skipped: [],
      warnings: [],
    });
  });
});

describe("buildAiEntity — merging the backend schema into the fields", () => {
  it("lets the fields decide which fields exist, in their order", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ b: { type: "string" }, a: { type: "string" } }),
      schema: objectSchema({
        a: { type: "string" },
        internal_notes: { type: "string" },
      }),
    });

    expect(entity.sources).toEqual({ schema: true, fields: true });
    expect(entity.fields.map((field) => field.key)).toEqual(["b", "a"]);
  });

  it("makes a field required when either side requires it", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ title: { type: "string" } }),
      schema: objectSchema({ title: { type: "string" } }, ["title"]),
    });

    expect(fieldOf(entity, "title")?.required).toBe(true);
  });

  it("keeps the stricter limit on each side", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        title: { type: "string", minLength: 5, maxLength: 200 },
        seats: { type: "number", minimum: 10, maximum: 1000 },
        tags: {
          type: "array",
          items: { enum: ["a", "b", "c"] },
          minItems: 1,
          maxItems: 3,
        },
      }),
      schema: objectSchema({
        title: {
          type: "string",
          minLength: 2,
          maxLength: 120,
          pattern: "^\\S",
        },
        seats: { type: "integer", minimum: 0, maximum: 500 },
        tags: { type: "array", minItems: 2, maxItems: 5 },
      }),
    });

    expect(fieldOf(entity, "title")?.constraints).toEqual({
      minLength: 5,
      maxLength: 120,
      patterns: ["^\\S"],
    });
    expect(fieldOf(entity, "seats")?.constraints).toEqual({
      minimum: 10,
      maximum: 500,
    });
    expect(fieldOf(entity, "tags")?.constraints).toEqual({
      minItems: 2,
      maxItems: 3,
    });
  });

  it("keeps both patterns when the two sides have different ones", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ code: { type: "string", pattern: "^[A-Z]" } }),
      schema: objectSchema({ code: { type: "string", pattern: "\\d$" } }),
    });

    expect(fieldOf(entity, "code")?.constraints.patterns).toEqual([
      "^[A-Z]",
      "\\d$",
    ]);
  });

  it("makes a number an integer when the backend wants one", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([{ key: "seats", type: "number" }] as Fields),
      schema: objectSchema({ seats: { type: "integer" } }),
    });

    expect(fieldOf(entity, "seats")?.kind).toBe("integer");
  });

  it("keeps only the field's choices the backend accepts, with the field's labels", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "status",
          type: "select",
          attrs: {
            options: [
              { text: "Draft", value: "draft" },
              { text: "Live", value: "live" },
              { text: "Archived", value: "archived" },
            ],
          },
        },
      ] as Fields),
      schema: objectSchema({ status: { enum: ["archived", "draft"] } }),
    });

    expect(fieldOf(entity, "status")?.choices).toEqual([
      { value: "draft", label: "Draft" },
      { value: "archived", label: "Archived" },
    ]);
  });

  it("narrows a text field to the backend's choices", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([{ key: "size", type: "text" }] as Fields),
      schema: objectSchema({
        size: {
          oneOf: [
            { const: "s", title: "Small" },
            { const: "l", title: "Large" },
          ],
        },
      }),
    });

    expect(fieldOf(entity, "size")).toMatchObject({
      fieldType: "text",
      kind: "choice",
      choices: [
        { value: "s", label: "Small" },
        { value: "l", label: "Large" },
      ],
    });
  });

  it("leaves a field alone, with a warning, when the backend accepts none of its choices", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ status: { enum: ["draft", "live"] } }),
      schema: objectSchema({ status: { enum: ["DRAFT", "LIVE"] } }),
    });

    expect(reasonOf(entity, "status")).toBe("conflict");
    expect(entity.warnings).toEqual([
      { kind: "choices-conflict", key: "status" },
    ]);
  });

  it("warns about a type conflict and keeps the field's type", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([{ key: "code", type: "text" }] as Fields),
      schema: objectSchema({ code: { type: "integer" } }),
    });

    expect(fieldOf(entity, "code")?.kind).toBe("string");
    expect(entity.warnings).toEqual([
      {
        kind: "type-conflict",
        key: "code",
        fieldJsonType: "string",
        schemaJsonType: "integer",
      },
    ]);
  });

  it("does not compare a relation with the key type the backend expects", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        { key: "place", type: "fks", attrs: { endpoint: "/api/places/" } },
      ] as Fields),
      schema: objectSchema({ place: { type: "integer" } }),
    });

    expect(entity.warnings).toEqual([]);
    expect(fieldOf(entity, "place")?.kind).toBe("relation");
  });

  it("follows the form on read-only, and warns when only the backend says so", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ code: { type: "string" } }),
      schema: objectSchema({ code: { type: "string", readOnly: true } }),
    });

    expect(fieldOf(entity, "code")).toBeDefined();
    expect(entity.warnings).toEqual([
      { kind: "readonly-conflict", key: "code" },
    ]);
  });

  it("keeps a secret out when either side marks it", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ token: { type: "string" } }),
      schema: objectSchema({ token: { type: "string", writeOnly: true } }),
    });

    expect(reasonOf(entity, "token")).toBe("secret");
  });

  it("excludes a field when the backend's x-mapo-ai says so", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ notes: { type: "string" } }),
      schema: objectSchema({
        notes: { type: "string", [AI_KEYWORD]: { exclude: true } },
      }),
    });

    expect(reasonOf(entity, "notes")).toBe("excluded");
  });

  it("takes the label, the description and the hint from the fields first", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        title: {
          type: "string",
          title: "Event title",
          description: "The public name.",
          [AI_KEYWORD]: { hint: "Form hint." },
        },
      }),
      schema: objectSchema({
        title: {
          type: "string",
          title: "Title",
          description: "Shown in lists.",
          [AI_KEYWORD]: { hint: "Backend hint." },
        },
      }),
    });

    expect(fieldOf(entity, "title")).toMatchObject({
      label: "Event title",
      description: "The public name.",
      hint: "Form hint.",
    });
  });

  it("takes them from the backend when the fields have none", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ title: { type: "string" } }),
      schema: objectSchema({
        title: {
          type: "string",
          title: "Title",
          description: "Shown in lists.",
          [AI_KEYWORD]: { hint: "Backend hint." },
        },
      }),
    });

    expect(fieldOf(entity, "title")).toMatchObject({
      label: "Title",
      description: "Shown in lists.",
      hint: "Backend hint.",
    });
  });

  it("takes a relation's endpoint from the backend when the field has none", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ place: { type: "relation" } }),
      schema: objectSchema({
        place: { type: "relation", endpoint: "/api/places/" },
      }),
    });

    expect(fieldOf(entity, "place")?.endpoint).toBe("/api/places/");
  });
});

describe("buildAiEntity — what keeps the AI out counts wherever it is written", () => {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

  it.each([
    ["anyOf", { writeOnly: true, ...nullableString }],
    [
      "oneOf",
      { writeOnly: true, oneOf: [{ type: "string" }, { type: "null" }] },
    ],
  ])("keeps a secret written beside a nullable %s", (_union, token) => {
    const alone = buildAiEntity({ schema: objectSchema({ token }) });
    const merged = buildAiEntity({
      fields: fieldsToJsonSchema([{ key: "token", type: "text" }] as Fields),
      schema: objectSchema({ token }),
    });
    const onTheFormSide = buildAiEntity({ fields: objectSchema({ token }) });

    expect(reasonOf(alone, "token")).toBe("secret");
    expect(reasonOf(merged, "token")).toBe("secret");
    expect(reasonOf(onTheFormSide, "token")).toBe("secret");
  });

  it("finds a password format in any branch of a union", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        code: {
          anyOf: [{ type: "integer" }, { type: "string", format: "password" }],
        },
      }),
    });

    expect(reasonOf(entity, "code")).toBe("secret");
  });

  it("keeps a read-only value written beside a nullable union", () => {
    const alone = buildAiEntity({
      schema: objectSchema({ code: { readOnly: true, ...nullableString } }),
    });
    const merged = buildAiEntity({
      fields: objectSchema({ code: { type: "string" } }),
      schema: objectSchema({ code: { readOnly: true, ...nullableString } }),
    });

    expect(reasonOf(alone, "code")).toBe("readonly");
    expect(merged.warnings).toEqual([
      { kind: "readonly-conflict", key: "code" },
    ]);
  });

  it("reads an exclusion behind a $ref and inside a union branch", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: {
          notes: { $ref: "#/$defs/Notes" },
          memo: {
            anyOf: [
              { type: "string", [AI_KEYWORD]: { exclude: true } },
              { type: "null" },
            ],
          },
        },
        $defs: { Notes: { type: "string", [AI_KEYWORD]: { exclude: true } } },
      },
    });

    expect(reasonOf(entity, "notes")).toBe("excluded");
    expect(reasonOf(entity, "memo")).toBe("excluded");
  });

  it("keeps a media type written beside a nullable union", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        cover: {
          "x-mapo-field": "media",
          anyOf: [{ type: "integer" }, { type: "null" }],
        },
      }),
    });

    expect(reasonOf(entity, "cover")).toBe("media");
  });

  it("keeps translatable written beside a nullable union", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        title: { translatable: true, ...nullableString },
      }),
    });

    expect(fieldOf(entity, "title")?.translatable).toBe(true);
  });

  it("treats a password input and a key that names a password as secrets", () => {
    const entity = formEntity([
      { key: "access", type: "text", attrs: { type: "password" } },
      { key: "new_password", type: "text" },
      { key: "passwd", type: "text" },
    ] as Fields);

    expect(entity.fields).toEqual([]);
    expect(entity.skipped.map((field) => field.reason)).toEqual([
      "secret",
      "secret",
      "secret",
    ]);
  });

  describe("a key that names a token, a secret or an API key", () => {
    const secrets = [
      "auth_token",
      "refreshTokens",
      "client_secret",
      "apiKey",
      "APIKey",
      "x-api-key",
      "apikey",
      "privateKey",
      "access_key_id",
      // With a digit, run together, or a password by another name.
      "api_key2",
      "apiKey2",
      "token2",
      "secret1",
      "authtoken",
      "csrftoken",
      "clientsecret",
      "secretkey",
      "privatekey",
      "accesskey",
      "db_pwd",
      "passphrase",
    ];
    // The same words at the start of another word, or another word beside "key".
    const kept = [
      "secretary_name",
      "tokenizer",
      "keynote",
      "api_version",
      "passport",
    ];

    it("keeps it out of a form alone", () => {
      const entity = formEntity(
        [...secrets, ...kept].map((key) => ({ key, type: "text" })) as Fields,
      );

      expect(entity.skipped.map((field) => [field.key, field.reason])).toEqual(
        secrets.map((key) => [key, "secret"]),
      );
      expect(entity.fields.map((field) => field.key)).toEqual(kept);
    });

    it("keeps it out of a backend schema alone", () => {
      const entity = buildAiEntity({
        schema: objectSchema(
          Object.fromEntries(
            [...secrets, ...kept].map((key) => [key, { type: "string" }]),
          ),
        ),
      });

      expect(entity.skipped.map((field) => field.key)).toEqual(secrets);
      expect(entity.fields.map((field) => field.key)).toEqual(kept);
    });
  });
});

describe("buildAiEntity — dotted keys", () => {
  const nested = objectSchema(
    {
      seo: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", maxLength: 60 },
          kind: { enum: ["page", "post"] },
        },
      },
      account: {
        type: "object",
        properties: { pin: { type: "string", writeOnly: true } },
      },
      author: {
        type: "object",
        readOnly: true,
        properties: { name: { type: "string" } },
      },
      extra: {
        type: "object",
        [AI_KEYWORD]: { exclude: true },
        properties: { note: { type: "string" } },
      },
    },
    ["seo"],
  );

  function mergedWith(keys: string[], schema: JSONSchema = nested) {
    return buildAiEntity({
      fields: objectSchema(
        Object.fromEntries(keys.map((key) => [key, { type: "string" }])),
      ),
      schema,
    });
  }

  it("applies the backend's nested limits, choices and required flag", () => {
    const entity = mergedWith(["seo.title", "seo.kind"]);

    expect(fieldOf(entity, "seo.title")).toMatchObject({
      required: true,
      constraints: { maxLength: 60 },
    });
    expect(fieldOf(entity, "seo.kind")?.choices).toEqual([
      { value: "page", label: "page" },
      { value: "post", label: "post" },
    ]);
  });

  it("is not required when an object on the way is optional", () => {
    const entity = mergedWith(["seo.title"], {
      ...nested,
      required: [],
    });

    expect(fieldOf(entity, "seo.title")?.required).toBe(false);
  });

  it("keeps a nested secret out", () => {
    expect(reasonOf(mergedWith(["account.pin"]), "account.pin")).toBe("secret");
  });

  it("inherits the exclusion and the read-only state of the objects around", () => {
    const entity = mergedWith(["extra.note", "author.name"]);

    expect(reasonOf(entity, "extra.note")).toBe("excluded");
    expect(entity.warnings).toEqual([
      { kind: "readonly-conflict", key: "author.name" },
    ]);
  });

  it("follows a $ref on the way", () => {
    const entity = mergedWith(["seo.title"], {
      type: "object",
      properties: { seo: { $ref: "#/$defs/Seo" } },
      $defs: {
        Seo: {
          type: "object",
          properties: { title: { type: "string", maxLength: 70 } },
        },
      },
    });

    expect(fieldOf(entity, "seo.title")?.constraints).toEqual({
      maxLength: 70,
    });
  });

  it("prefers a backend property named with the dotted key itself", () => {
    const entity = mergedWith(["seo.title"], {
      ...nested,
      properties: {
        ...nested.properties,
        "seo.title": { type: "string", maxLength: 30 },
      },
    });

    expect(fieldOf(entity, "seo.title")?.constraints).toEqual({
      maxLength: 30,
    });
  });

  it("excludes the keys inside an excluded key", () => {
    const entity = buildAiEntity(
      { fields: objectSchema({ "seo.title": { type: "string" } }) },
      { exclude: ["seo"] },
    );

    expect(reasonOf(entity, "seo.title")).toBe("excluded");
  });
});

describe("buildAiEntity — custom field types over a backend field", () => {
  /** A custom field, written the way the browser writes it: no value schema. */
  const customFields = (key: string) =>
    fieldsToJsonSchema([{ key, type: "my-widget" }] as Fields);

  it.each([
    ["a file upload", { type: "string", format: "binary" }],
    ["a media id", { type: "integer", "x-mapo-field": "media" }],
  ])("leaves the field alone over %s", (_case, backend) => {
    const entity = buildAiEntity({
      fields: customFields("cover"),
      schema: objectSchema({ cover: backend }),
    });

    expect(reasonOf(entity, "cover")).toBe("media");
  });

  it("follows the backend's relation, with its endpoint and its list", () => {
    const entity = buildAiEntity({
      fields: customFields("tags"),
      schema: objectSchema({
        tags: { type: "relation", endpoint: "/api/tags/", multiple: true },
      }),
    });

    expect(fieldOf(entity, "tags")).toMatchObject({
      fieldType: "my-widget",
      kind: "relation",
      endpoint: "/api/tags/",
      multiple: true,
    });
  });

  it("follows the backend's choices", () => {
    const entity = buildAiEntity({
      fields: customFields("size"),
      schema: objectSchema({ size: { enum: ["s", "m"] } }),
    });

    expect(fieldOf(entity, "size")).toMatchObject({
      kind: "choice",
      choices: [
        { value: "s", label: "s" },
        { value: "m", label: "m" },
      ],
    });
  });
});

describe("buildAiEntity — values without a type", () => {
  it.each([
    ["an empty schema", {}],
    ["a boolean schema", true],
    ["null", null],
    ["a single allOf model", { allOf: [{ $ref: "#/$defs/Model" }] }],
    ["a $ref to nothing", { $ref: "#/$defs/Missing" }],
    [
      "a discriminated union",
      {
        oneOf: [{ $ref: "#/$defs/Model" }, { $ref: "#/$defs/Other" }],
        discriminator: { propertyName: "kind" },
      },
    ],
  ])("leaves %s alone", (_case, property) => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: { value: property as JSONSchema },
        $defs: {
          Model: { type: "object", properties: { a: { type: "string" } } },
          Other: { type: "object", properties: { b: { type: "string" } } },
        },
      },
    });

    expect(entity.fields).toEqual([]);
    expect(reasonOf(entity, "value")).toBe("unsupported");
  });

  it("fills a typed form field over an untyped backend value", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([{ key: "note", type: "text" }] as Fields),
      schema: objectSchema({ note: {} }),
    });

    expect(fieldOf(entity, "note")?.kind).toBe("string");
  });
});

describe("buildAiEntity — details", () => {
  it("keeps every step a number must be a multiple of, from both sides", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        price: { type: "number", multipleOf: 0.5 },
        seats: { type: "integer", multipleOf: 0 },
      }),
      schema: objectSchema({
        price: { type: "number", multipleOf: 0.01 },
        seats: { type: "integer", multipleOf: "5" as unknown as number },
      }),
    });

    expect(fieldOf(entity, "price")?.constraints.steps).toEqual([0.5, 0.01]);
    expect(fieldOf(entity, "seats")?.constraints.steps).toBeUndefined();
  });

  it("ignores a label that is not a string", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        title: { type: "string", title: { en: "Title" } as unknown as string },
      }),
    });

    expect(fieldOf(entity, "title")?.label).toBeUndefined();
  });

  it("leaves a field alone when the backend's choices are not of its type", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([{ key: "rank", type: "number" }] as Fields),
      schema: objectSchema({ rank: { enum: ["1", "2"] } }),
    });

    expect(reasonOf(entity, "rank")).toBe("conflict");
    expect(entity.warnings).toContainEqual({
      kind: "choices-conflict",
      key: "rank",
    });
  });

  it("leaves a field alone when the merged limits exclude each other", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ code: { type: "string", minLength: 50 } }),
      schema: objectSchema({ code: { type: "string", maxLength: 20 } }),
    });

    expect(reasonOf(entity, "code")).toBe("conflict");
    expect(entity.warnings).toEqual([{ kind: "limits-conflict", key: "code" }]);
  });

  it("carries the exclusive bounds, the stricter of each", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        price: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 100 },
      }),
      schema: objectSchema({
        price: { type: "number", exclusiveMinimum: 1, exclusiveMaximum: 500 },
      }),
    });

    expect(fieldOf(entity, "price")?.constraints).toEqual({
      exclusiveMinimum: 1,
      exclusiveMaximum: 100,
    });
  });

  it("does not take a description from the first choice of a list", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        size: {
          oneOf: [
            { const: "s", title: "Small", description: "Up to 10 people." },
            { const: "l", title: "Large" },
          ],
        },
      }),
    });

    expect(fieldOf(entity, "size")?.description).toBeUndefined();
  });

  it("drops a malformed required list instead of failing", () => {
    const entity = buildAiEntity({
      schema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: true as unknown as string[],
      },
    });

    expect(fieldOf(entity, "title")?.required).toBe(false);
  });

  it("reads a source the reader cannot read property by property", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        a: { enum: "x" as unknown as unknown[] },
        title: { type: "string", maxLength: 10 },
      }),
    });

    expect(fieldOf(entity, "title")?.constraints).toEqual({ maxLength: 10 });
    expect(entity.skipped).toEqual([
      { key: "a", fieldType: "unknown", reason: "unsupported" },
    ]);
    expect(entity.warnings).toEqual([
      { kind: "unreadable-source", source: "fields" },
    ]);
  });
});

describe("buildAiEntity — a backend the reader cannot read", () => {
  /** One property the reader throws on makes the whole schema unreadable. */
  const backend = objectSchema({
    bad: { enum: {} as unknown as unknown[] },
    token: { type: "string", writeOnly: true },
    notes: { type: "string", [AI_KEYWORD]: { exclude: true } },
    cover: { type: "string", format: "binary" },
    title: { type: "string", maxLength: 10 },
  });

  it("still keeps the AI out of the backend's secrets, exclusions and media", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        token: { type: "string" },
        notes: { type: "string" },
        cover: { type: "string" },
        title: { type: "string" },
        bad: { type: "string" },
      }),
      schema: backend,
    });

    expect(entity.skipped.map((field) => [field.key, field.reason])).toEqual([
      ["token", "secret"],
      ["notes", "excluded"],
      ["cover", "media"],
    ]);
    expect(fieldOf(entity, "title")?.constraints).toEqual({ maxLength: 10 });
    // The form describes `bad`; the backend's unreadable side adds nothing.
    expect(fieldOf(entity, "bad")?.kind).toBe("string");
    expect(entity.warnings).toEqual([
      { kind: "unreadable-source", source: "schema" },
    ]);
  });

  it("skips the property it cannot read when the backend describes the entity alone", () => {
    const entity = buildAiEntity({ schema: backend });

    expect(reasonOf(entity, "bad")).toBe("unsupported");
    expect(fieldOf(entity, "title")).toBeDefined();
  });
});

describe("buildAiEntity — dotted keys whose path stops before the value", () => {
  it.each([
    [
      "a JSON field kept secret",
      "credentials.api_key",
      { credentials: { type: "object", writeOnly: true } },
      "secret",
    ],
    [
      "an excluded map",
      "meta.note",
      {
        meta: {
          type: "object",
          additionalProperties: { type: "string" },
          [AI_KEYWORD]: { exclude: true },
        },
      },
      "excluded",
    ],
    [
      "a secret union of objects",
      "contact.email",
      {
        contact: {
          writeOnly: true,
          oneOf: [
            { type: "object", properties: { email: { type: "string" } } },
            { type: "object", properties: { phone: { type: "string" } } },
          ],
        },
      },
      "secret",
    ],
    [
      "a secret placeholder",
      "vault.key",
      { vault: { "x-mapo-field": "field:vault", writeOnly: true } },
      "secret",
    ],
    [
      "a secret object whose value is declared",
      "vault.label",
      {
        vault: {
          type: "object",
          writeOnly: true,
          properties: { label: { type: "string" } },
        },
      },
      "secret",
    ],
  ])("keeps the AI out under %s", (_case, key, properties, reason) => {
    const entity = buildAiEntity({
      fields: objectSchema({ [key]: { type: "string" } }),
      schema: objectSchema(properties as Record<string, JSONSchema>),
    });

    expect(reasonOf(entity, key)).toBe(reason);
  });

  it("warns when an object on the way is read-only, though its value is not declared", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ "profile.nickname": { type: "string" } }),
      schema: objectSchema({
        profile: { type: "object", readOnly: true, properties: {} },
      }),
    });

    expect(fieldOf(entity, "profile.nickname")).toBeDefined();
    expect(entity.warnings).toEqual([
      { kind: "readonly-conflict", key: "profile.nickname" },
    ]);
  });

  it("reaches the value through an allOf composition", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        "address.city": { type: "string" },
        "address.zip": { type: "string" },
      }),
      schema: {
        type: "object",
        properties: {
          address: {
            allOf: [
              { $ref: "#/$defs/Base" },
              { properties: { zip: { type: "string", maxLength: 5 } } },
            ],
          },
        },
        $defs: {
          Base: {
            type: "object",
            properties: { city: { type: "string", maxLength: 40 } },
          },
        },
      },
    });

    expect(fieldOf(entity, "address.city")?.constraints).toEqual({
      maxLength: 40,
    });
    expect(fieldOf(entity, "address.zip")?.constraints).toEqual({
      maxLength: 5,
    });
  });

  it("keeps the flags of the objects around even when the backend names the dotted key itself", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ "seo.title": { type: "string" } }),
      schema: objectSchema({
        "seo.title": { type: "string" },
        seo: {
          type: "object",
          writeOnly: true,
          properties: { title: { type: "string" } },
        },
      }),
    });

    expect(reasonOf(entity, "seo.title")).toBe("secret");
  });
});

describe("buildAiEntity — media wherever the schema says so", () => {
  const binaryBesideUnion: JSONSchema = {
    format: "binary",
    anyOf: [{ type: "string" }, { type: "null" }],
  };

  it("sees a binary format beside a nullable union", () => {
    const alone = buildAiEntity({
      schema: objectSchema({ file: binaryBesideUnion }),
    });
    const merged = buildAiEntity({
      fields: fieldsToJsonSchema([{ key: "file", type: "text" }] as Fields),
      schema: objectSchema({ file: binaryBesideUnion }),
    });

    expect(reasonOf(alone, "file")).toBe("media");
    expect(reasonOf(merged, "file")).toBe("media");
  });

  it("sees a binary branch under another type mark", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        file: {
          "x-mapo-field": "text",
          anyOf: [{ type: "string", format: "binary" }, { type: "null" }],
        },
      }),
    });

    expect(reasonOf(entity, "file")).toBe("media");
  });
});

describe("buildAiEntity — reading through a property", () => {
  it("does not take the hint from one of the choices", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        size: {
          oneOf: [
            { const: "s", title: "Small", [AI_KEYWORD]: { hint: "Rare." } },
            { const: "l", title: "Large" },
          ],
        },
      }),
    });

    expect(fieldOf(entity, "size")?.hint).toBeUndefined();
  });

  it("keeps the whole field out when one choice is excluded", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        size: {
          oneOf: [
            { const: "s", [AI_KEYWORD]: { exclude: true } },
            { const: "l" },
          ],
        },
      }),
    });

    expect(reasonOf(entity, "size")).toBe("excluded");
  });

  it("keeps the stricter limit beside and inside a nullable union", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        name: {
          maxLength: 100,
          minLength: 1,
          anyOf: [
            { type: "string", maxLength: 50, minLength: 3 },
            { type: "null" },
          ],
        },
      }),
    });

    expect(fieldOf(entity, "name")?.constraints).toEqual({
      minLength: 3,
      maxLength: 50,
    });
  });

  it("does not take a $ref's name as the label", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ status: { type: "string" } }),
      schema: objectSchema({ status: { $ref: "#/$defs/StatusEnum" } }),
    });

    expect(fieldOf(entity, "status")?.label).toBeUndefined();
  });

  it("keeps a one-choice list a choice, without the choice's description", () => {
    const entity = buildAiEntity({
      schema: objectSchema({
        plan: {
          oneOf: [{ const: "only", title: "Only", description: "The one." }],
        },
      }),
    });

    expect(fieldOf(entity, "plan")).toMatchObject({
      kind: "choice",
      choices: [{ value: "only", label: "Only" }],
    });
    expect(fieldOf(entity, "plan")?.description).toBeUndefined();
  });
});

describe("buildAiEntity — every declaration of a property counts", () => {
  it.each([
    [
      "a union of objects around the value",
      "meta.x",
      {
        type: "object",
        properties: {
          meta: { oneOf: [{ $ref: "#/$defs/A" }, { $ref: "#/$defs/B" }] },
        },
        $defs: {
          A: {
            type: "object",
            properties: { x: { type: "string", writeOnly: true } },
          },
          B: { type: "object", properties: { y: { type: "string" } } },
        },
      },
      "secret",
    ],
    [
      "an anyOf of inline objects around the value",
      "meta.x",
      objectSchema({
        meta: {
          anyOf: [
            {
              type: "object",
              properties: {
                x: { type: "string", [AI_KEYWORD]: { exclude: true } },
              },
            },
            { type: "object", properties: { y: { type: "string" } } },
          ],
        },
      }),
      "excluded",
    ],
    [
      "a property declared again in an allOf part",
      "acc.token",
      {
        type: "object",
        properties: {
          acc: {
            allOf: [
              { $ref: "#/$defs/Base" },
              { properties: { token: { type: "string" } } },
            ],
          },
        },
        $defs: {
          Base: {
            type: "object",
            properties: { token: { type: "string", writeOnly: true } },
          },
        },
      },
      "secret",
    ],
  ])("keeps the AI out through %s", (_case, key, schema, reason) => {
    const entity = buildAiEntity({
      fields: objectSchema({ [key]: { type: "string" } }),
      schema: schema as JSONSchema,
    });

    expect(reasonOf(entity, key)).toBe(reason);
  });

  it("reads the root's allOf parts, and every declaration of a key there", () => {
    const schema: JSONSchema = {
      type: "object",
      allOf: [
        {
          properties: {
            token: { type: "string", writeOnly: true },
            notes: { type: "string", [AI_KEYWORD]: { exclude: true } },
          },
        },
        {
          properties: { title: { type: "string" }, notes: { type: "string" } },
        },
      ],
    };
    const alone = buildAiEntity({ schema });
    const merged = buildAiEntity({
      fields: objectSchema({
        token: { type: "string" },
        notes: { type: "string" },
      }),
      schema,
    });

    expect(reasonOf(alone, "token")).toBe("secret");
    expect(reasonOf(alone, "notes")).toBe("excluded");
    expect(fieldOf(alone, "title")?.kind).toBe("string");
    expect(reasonOf(merged, "token")).toBe("secret");
    expect(reasonOf(merged, "notes")).toBe("excluded");
  });

  it("passes media on through the objects around a dotted key", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        "cover.media": { type: "integer" },
        "cover.alt": { type: "string" },
      }),
      schema: objectSchema({
        cover: {
          "x-mapo-field": "enhanced-media",
          type: "object",
          properties: {
            media: { type: "integer" },
            alt: { type: "string" },
          },
        },
      }),
    });

    expect(reasonOf(entity, "cover.media")).toBe("media");
    expect(reasonOf(entity, "cover.alt")).toBe("media");
  });

  it("does not require a value inside a nullable object", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ "seo.title": { type: "string" } }),
      schema: objectSchema(
        {
          seo: {
            anyOf: [
              {
                type: "object",
                required: ["title"],
                properties: { title: { type: "string" } },
              },
              { type: "null" },
            ],
          },
        },
        ["seo"],
      ),
    });

    expect(fieldOf(entity, "seo.title")?.required).toBe(false);
  });
});

describe("buildAiEntity — a password input wherever the schema marks it", () => {
  const passwordBesideUnion: JSONSchema = {
    "x-mapo-attrs": { type: "password" },
    anyOf: [{ type: "string" }, { type: "null" }],
  };

  it("sees x-mapo-attrs beside a nullable union", () => {
    const alone = buildAiEntity({
      schema: objectSchema({ access: passwordBesideUnion }),
    });
    const merged = buildAiEntity({
      fields: objectSchema({ access: { type: "string" } }),
      schema: objectSchema({ access: passwordBesideUnion }),
    });

    expect(reasonOf(alone, "access")).toBe("secret");
    expect(reasonOf(merged, "access")).toBe("secret");
  });

  it("sees it on a property the reader cannot read", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ access: { type: "string" } }),
      schema: objectSchema({
        access: {
          enum: {} as unknown as unknown[],
          "x-mapo-attrs": { type: "password" },
        },
      }),
    });

    expect(reasonOf(entity, "access")).toBe("secret");
  });
});

describe("buildAiEntity — properties written beside a $ref", () => {
  const base: Record<string, JSONSchema> = {
    Base: {
      type: "object",
      properties: {
        token: { type: "string", writeOnly: true },
        profile: {
          type: "object",
          writeOnly: true,
          properties: { nick: { type: "string" } },
        },
      },
    },
  };

  it.each([
    [
      "a single allOf part",
      { allOf: [{ $ref: "#/$defs/Base" }], properties: { title: {} } },
    ],
    ["a $ref", { $ref: "#/$defs/Base", properties: { title: {} } }],
  ])("keeps the definition's flags at the root, beside %s", (_case, root) => {
    const schema = {
      type: "object",
      ...root,
      properties: { title: { type: "string" } },
      $defs: base,
    } as JSONSchema;
    const alone = buildAiEntity({ schema });
    const merged = buildAiEntity({
      fields: objectSchema({
        token: { type: "string" },
        "profile.nick": { type: "string" },
        title: { type: "string" },
      }),
      schema,
    });

    expect(reasonOf(alone, "token")).toBe("secret");
    expect(fieldOf(alone, "title")?.kind).toBe("string");
    expect(reasonOf(merged, "token")).toBe("secret");
    expect(reasonOf(merged, "profile.nick")).toBe("secret");
    expect(fieldOf(merged, "title")).toBeDefined();
  });

  it.each([
    [
      "a single allOf part",
      { allOf: [{ $ref: "#/$defs/Base" }], properties: { zip: {} } },
    ],
    ["a $ref", { $ref: "#/$defs/Base", properties: { zip: {} } }],
    [
      "a nullable $ref",
      {
        anyOf: [{ $ref: "#/$defs/Base" }, { type: "null" }],
        properties: { zip: {} },
      },
    ],
  ])("keeps them inside a nested object, beside %s", (_case, acc) => {
    const entity = buildAiEntity({
      fields: objectSchema({
        "acc.token": { type: "string" },
        "acc.zip": { type: "string" },
      }),
      schema: {
        type: "object",
        properties: { acc: acc as JSONSchema },
        $defs: base,
      },
    });

    expect(reasonOf(entity, "acc.token")).toBe("secret");
  });
});

describe("buildAiEntity — unions at the root", () => {
  const schema: JSONSchema = {
    type: "object",
    properties: {
      token: { type: "string" },
      title: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
    },
    oneOf: [
      { properties: { token: { writeOnly: true } } },
      { properties: { title: {} } },
    ],
    anyOf: [{ required: ["email"] }, { required: ["phone"] }],
  };

  it("lets their branches keep the AI out, but not describe or require a value", () => {
    const alone = buildAiEntity({ schema });
    const merged = buildAiEntity({
      fields: objectSchema({ token: { type: "string" } }),
      schema,
    });

    expect(reasonOf(alone, "token")).toBe("secret");
    expect(reasonOf(merged, "token")).toBe("secret");
    expect(fieldOf(alone, "email")?.required).toBe(false);
    expect(fieldOf(alone, "phone")?.required).toBe(false);
  });

  it("does not require a nested value that only one branch of a union requires", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ "contact.email": { type: "string" } }),
      schema: objectSchema(
        {
          contact: {
            oneOf: [
              {
                type: "object",
                required: ["email"],
                properties: { email: { type: "string" } },
              },
              { type: "object", properties: { phone: { type: "string" } } },
            ],
          },
        },
        ["contact"],
      ),
    });

    expect(fieldOf(entity, "contact.email")?.required).toBe(false);
  });
});

describe("buildAiEntity — which declaration describes a value", () => {
  const declaredTwice = (): JSONSchema => ({
    type: "object",
    properties: { status: { enum: ["a", "b"] } },
    allOf: [{ properties: { status: { type: "string" } } }, { properties: {} }],
  });

  it("takes the first one, at the root and under a dotted key alike", () => {
    const atRoot = buildAiEntity({ schema: declaredTwice() });
    const dotted = buildAiEntity({
      fields: objectSchema({ "o.status": { type: "string" } }),
      schema: objectSchema({ o: declaredTwice() }),
    });
    const choices = [
      { value: "a", label: "a" },
      { value: "b", label: "b" },
    ];

    expect(fieldOf(atRoot, "status")?.choices).toEqual(choices);
    expect(fieldOf(dotted, "o.status")?.choices).toEqual(choices);
  });

  it("reads a property named like a built-in of every object", () => {
    const entity = buildAiEntity({
      schema: objectSchema({ constructor: { type: "string" } }),
    });

    expect(fieldOf(entity, "constructor")?.kind).toBe("string");
  });
});

describe("buildAiEntity — conditions", () => {
  const conditional: JSONSchema = {
    type: "object",
    properties: {
      kind: { type: "string" },
      secret_value: { type: "string" },
      note: { type: "string" },
      code: { type: "string" },
    },
    if: { properties: { kind: { const: "x" } } },
    then: {
      required: ["kind"],
      properties: { secret_value: { writeOnly: true } },
    },
    else: { properties: { note: { [AI_KEYWORD]: { exclude: true } } } },
    dependentSchemas: {
      kind: { properties: { code: { writeOnly: true } } },
    },
  };

  it("lets then, else and dependentSchemas keep the AI out, but not require a value", () => {
    const alone = buildAiEntity({ schema: conditional });
    const merged = buildAiEntity({
      fields: objectSchema({
        kind: { type: "string" },
        secret_value: { type: "string" },
        note: { type: "string" },
        code: { type: "string" },
      }),
      schema: conditional,
    });

    for (const entity of [alone, merged]) {
      expect(reasonOf(entity, "secret_value")).toBe("secret");
      expect(reasonOf(entity, "note")).toBe("excluded");
      expect(reasonOf(entity, "code")).toBe("secret");
      expect(fieldOf(entity, "kind")?.required).toBe(false);
    }
  });

  it("reads a condition under a dotted key", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ "acc.pin": { type: "string" } }),
      schema: objectSchema({
        acc: {
          type: "object",
          properties: { pin: { type: "string" } },
          if: { properties: { pin: { minLength: 1 } } },
          then: { properties: { pin: { writeOnly: true } } },
        },
      }),
    });

    expect(reasonOf(entity, "acc.pin")).toBe("secret");
  });

  it("does not narrow a nested value with the limits of its alternatives", () => {
    const entity = buildAiEntity({
      fields: objectSchema({ "contact.code": { type: "string" } }),
      schema: objectSchema({
        contact: {
          oneOf: [
            {
              type: "object",
              properties: { code: { type: "string", maxLength: 5 } },
            },
            {
              type: "object",
              properties: { code: { type: "string", minLength: 10 } },
            },
          ],
        },
      }),
    });

    expect(entity.warnings).toEqual([]);
    expect(fieldOf(entity, "contact.code")?.constraints).toEqual({});
  });
});

describe("buildAiEntity — choices the AI can answer with", () => {
  it("keeps one choice per value as a string, the first listed, and never the empty one", () => {
    const entity = formEntity([
      {
        key: "rank",
        type: "select",
        attrs: {
          options: [
            { text: "None", value: "" },
            { text: "One", value: 1 },
            { text: "Uno", value: "1" },
            { text: "Two", value: 2 },
          ],
        },
      },
    ] as Fields);

    expect(fieldOf(entity, "rank")?.choices).toEqual([
      { value: 1, label: "One" },
      { value: 2, label: "Two" },
    ]);
  });

  it("matches the form's choices and the backend's as strings", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "rank",
          type: "select",
          attrs: {
            options: [
              { text: "One", value: 1 },
              { text: "Two", value: 2 },
            ],
          },
        },
      ] as Fields),
      schema: objectSchema({ rank: { enum: ["1", "2", "3"] } }),
    });

    expect(fieldOf(entity, "rank")?.choices).toEqual([
      { value: 1, label: "One" },
      { value: 2, label: "Two" },
    ]);
    expect(entity.warnings).toEqual([]);
  });

  it("leaves alone a choice whose only value is empty", () => {
    const entity = buildAiEntity({
      fields: objectSchema({
        none: { enum: [""] },
        nothing: { type: "array", items: { enum: [""] } },
      }),
    });

    expect(reasonOf(entity, "none")).toBe("unsupported");
    expect(reasonOf(entity, "nothing")).toBe("unsupported");
  });

  it("reads a backend that accepts only the empty value as a list, not as no list", () => {
    const select = (key: string, values: string[]) => ({
      key,
      type: "select",
      attrs: { options: values.map((value) => ({ text: value, value })) },
    });
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        { key: "code", type: "text" },
        select("status", ["a", "b"]),
        select("level", [""]),
        select("blank", [""]),
      ] as Fields),
      schema: objectSchema({
        code: { type: "string", enum: [""] },
        status: { enum: [""] },
        level: { enum: ["a", "b"] },
        blank: { enum: [""] },
      }),
    });

    expect(reasonOf(entity, "code")).toBe("unsupported");
    expect(reasonOf(entity, "status")).toBe("conflict");
    expect(reasonOf(entity, "level")).toBe("conflict");
    expect(reasonOf(entity, "blank")).toBe("unsupported");
    expect(entity.warnings).toEqual([
      { kind: "choices-conflict", key: "status" },
      { kind: "choices-conflict", key: "level" },
    ]);
  });

  it("tells a boolean from its text, as a DRF backend does", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "open",
          type: "select",
          attrs: { options: [{ text: "Yes", value: true }] },
        },
        {
          key: "both",
          type: "select",
          attrs: {
            options: [
              { text: "Yes", value: true },
              { text: "Text", value: "true" },
            ],
          },
        },
      ] as Fields),
      schema: objectSchema({ open: { enum: ["true"] } }),
    });

    expect(reasonOf(entity, "open")).toBe("conflict");
    expect(fieldOf(entity, "both")?.choices).toEqual([
      { value: true, label: "Yes" },
      { value: "true", label: "Text" },
    ]);
  });

  it("matches a boolean with its text as Python writes it", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "open",
          type: "select",
          attrs: {
            options: [
              { text: "Yes", value: true },
              { text: "No", value: false },
            ],
          },
        },
        {
          key: "same",
          type: "select",
          attrs: {
            options: [
              { text: "Yes", value: true },
              { text: "Python", value: "True" },
            ],
          },
        },
      ] as Fields),
      schema: objectSchema({ open: { enum: ["True", "False"] } }),
    });

    expect(fieldOf(entity, "open")?.choices?.map(({ value }) => value)).toEqual(
      [true, false],
    );
    expect(fieldOf(entity, "same")?.choices).toEqual([
      { value: true, label: "Yes" },
    ]);
    expect(entity.warnings).not.toContainEqual({
      kind: "choices-conflict",
      key: "open",
    });
  });

  it("reads a list with no value the AI could give as a list, whatever it holds", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        { key: "code", type: "text" },
        {
          key: "status",
          type: "select",
          attrs: {
            options: [
              { text: "A", value: "a" },
              { text: "B", value: "b" },
            ],
          },
        },
      ] as Fields),
      schema: objectSchema({
        code: { enum: [null] },
        status: { enum: [null, ""] },
      }),
    });

    expect(reasonOf(entity, "code")).toBe("unsupported");
    expect(reasonOf(entity, "status")).toBe("conflict");
  });

  it("reads an empty list of options as no list", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "status",
          type: "select",
          attrs: {
            options: [
              { text: "A", value: "a" },
              { text: "B", value: "b" },
            ],
          },
        },
      ] as Fields),
      schema: objectSchema({ status: { type: "string", enum: [] } }),
    });

    expect(
      fieldOf(entity, "status")?.choices?.map(({ value }) => value),
    ).toEqual(["a", "b"]);
    expect(entity.warnings).toEqual([]);
  });

  it("reads plain options as their own values, as the form does", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        { key: "size", type: "radio", attrs: { options: ["s", "m", "l"] } },
        { key: "stars", type: "star-rating", attrs: { options: [1, 2, 3] } },
        {
          key: "city",
          type: "text",
          attrs: { options: [{ id: 1, name: "Rome" }] },
        },
      ] as Fields),
      schema: objectSchema({
        size: { type: "string", enum: ["s", "m", "l"] },
        stars: { type: "integer" },
        city: { type: "string" },
      }),
    });

    expect(fieldOf(entity, "size")?.choices).toEqual([
      { value: "s", label: "s" },
      { value: "m", label: "m" },
      { value: "l", label: "l" },
    ]);
    expect(
      fieldOf(entity, "stars")?.choices?.map(({ value }) => value),
    ).toEqual([1, 2, 3]);
    expect(fieldOf(entity, "city")?.kind).toBe("string");
    expect(entity.warnings).toEqual([]);
  });

  it("reads tuples and records without a value as no list, as the form does", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "size",
          type: "radio",
          attrs: {
            options: [
              ["s", "Small"],
              ["m", "Medium"],
            ],
          },
        },
        { key: "code", type: "text", attrs: { options: [["a", "A"]] } },
      ] as Fields),
      schema: objectSchema({
        size: { type: "string", enum: ["s", "m"] },
        code: { type: "string" },
      }),
    });

    expect(fieldOf(entity, "size")?.choices?.map(({ value }) => value)).toEqual(
      ["s", "m"],
    );
    expect(fieldOf(entity, "code")?.kind).toBe("string");
    expect(entity.warnings).toEqual([]);
  });

  it("never offers an option the operator cannot pick", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "status",
          type: "select",
          attrs: {
            options: [
              { text: "Draft", value: "draft" },
              { text: "Archived", value: "archived", disabled: true },
            ],
          },
        },
        {
          key: "locked",
          type: "select",
          attrs: {
            options: [{ text: "Archived", value: "archived", disabled: true }],
          },
        },
      ] as Fields),
    });

    expect(
      fieldOf(entity, "status")?.choices?.map(({ value }) => value),
    ).toEqual(["draft"]);
    expect(reasonOf(entity, "locked")).toBe("unsupported");
  });

  it("takes an option's label from its text or its label", () => {
    const entity = buildAiEntity({
      fields: fieldsToJsonSchema([
        {
          key: "level",
          type: "radio",
          attrs: {
            options: [
              { label: "Beginner", value: "b" },
              { text: "Expert", label: "ignored", value: "e" },
            ],
          },
        },
      ] as Fields),
      schema: objectSchema({ level: { type: "string" } }),
    });

    expect(fieldOf(entity, "level")?.choices).toEqual([
      { value: "b", label: "Beginner" },
      { value: "e", label: "Expert" },
    ]);
  });

  it.each([
    ["the number first", [1, "1", 2]],
    ["the text first", ["1", 1, 2]],
  ])(
    "keeps the variant of the field's type, whichever the backend lists first (%s)",
    (_case, values) => {
      const entity = buildAiEntity({
        fields: fieldsToJsonSchema([{ key: "rank", type: "number" }] as Fields),
        schema: objectSchema({ rank: { enum: values } }),
      });

      expect(fieldOf(entity, "rank")?.kind).toBe("choice");
      expect(
        fieldOf(entity, "rank")?.choices?.map(({ value }) => value),
      ).toEqual([1, 2]);
      expect(entity.warnings).toEqual([]);
    },
  );
});
