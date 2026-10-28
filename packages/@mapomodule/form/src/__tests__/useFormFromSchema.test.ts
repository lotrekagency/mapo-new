import { describe, it, expect } from "vitest";
import { useFormFromSchema } from "../runtime/composables/useFormFromSchema.js";
import type { JSONSchema } from "@mapomodule/utils";

type DescriptorWithAttrs = {
  attrs?: {
    options?: Array<{ text: string; value: unknown }>;
    min?: number;
    max?: number;
  };
  fields?: unknown[];
  visible?: (ctx: { model: Record<string, unknown> }) => boolean;
  readonly?: boolean;
  translatable?: boolean;
};

// Pydantic v2 / DRF Spectacular style schema.
const articleSchema: JSONSchema = {
  type: "object",
  title: "Article",
  required: ["title", "slug"],
  properties: {
    id: { type: "integer", title: "ID" },
    title: { type: "string", title: "Titolo", maxLength: 255 },
    slug: { type: "string", title: "Slug", maxLength: 100 },
    body: { type: "string", title: "Corpo", maxLength: 10000 },
    excerpt: { type: "string", title: "Estratto", maxLength: 300 },
    published_at: {
      anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
    },
    date_only: { type: "string", format: "date" },
    is_draft: { type: "boolean", title: "Bozza" },
    view_count: { type: "integer", title: "Visualizzazioni" },
    rating: { type: "number", title: "Rating", minimum: 0, maximum: 5 },
    status: { type: "string", enum: ["draft", "published", "archived"] },
    seo: {
      type: "object",
      title: "SEO",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        url: { type: "string" },
      },
    },
    tags: { type: "array", items: { type: "string" } },
    blocks: {
      type: "array",
      title: "Blocchi",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          content: { type: "string" },
        },
      },
    },
  },
};

describe("useFormFromSchema — basic mapping", () => {
  it("maps string → text", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const title = fields.find((f) => f.key === "title");
    expect(title?.type).toBe("text");
  });

  it("maps long string → textarea", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "slug",
        "title",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const body = fields.find((f) => f.key === "body");
    expect(body?.type).toBe("textarea");
  });

  it("maps date-time format → datetime", () => {
    // published_at: anyOf[string+date-time, null] -> resolved as datetime
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
        "date_only",
      ],
    });
    const pub = fields.find((f) => f.key === "published_at");
    expect(pub?.type).toBe("datetime");
  });

  it("maps date format → date", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const d = fields.find((f) => f.key === "date_only");
    expect(d?.type).toBe("date");
  });

  it("maps boolean → boolean", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const f = fields.find((f) => f.key === "is_draft");
    expect(f?.type).toBe("boolean");
  });

  it("maps integer → number", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const f = fields.find((f) => f.key === "view_count");
    expect(f?.type).toBe("number");
  });

  it("maps enum → select with options", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const f = fields.find((f) => f.key === "status");
    const typed = f as DescriptorWithAttrs | undefined;
    expect(f?.type).toBe("select");
    expect(typed?.attrs?.options).toHaveLength(3);
    expect(typed?.attrs?.options?.[0]).toEqual({
      text: "draft",
      value: "draft",
    });
  });

  it("maps object with title+description+url → seo", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "tags",
        "blocks",
      ],
    });
    const f = fields.find((f) => f.key === "seo");
    expect(f?.type).toBe("seo");
  });

  it("maps array of objects → repeater with child fields", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
      ],
    });
    const f = fields.find((f) => f.key === "blocks");
    const typed = f as DescriptorWithAttrs | undefined;
    expect(f?.type).toBe("repeater");
    expect(typed?.fields?.length).toBeGreaterThan(0);
  });

  it("sets required=true for required fields", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const title = fields.find((f) => f.key === "title");
    const slug = fields.find((f) => f.key === "slug");
    expect(title?.required).toBe(true);
    expect(slug?.required).toBe(true);
  });
});

describe("useFormFromSchema — options", () => {
  it("exclude removes fields", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    expect(fields.find((f) => f.key === "id")).toBeUndefined();
  });

  it("overrides replace generated descriptor fields", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
      overrides: { title: { type: "textarea", translatable: true } },
    });
    const title = fields.find((f) => f.key === "title");
    expect(title?.type).toBe("textarea");
    expect(title?.translatable).toBe(true);
  });

  it("uses schema title as label when present", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "rating",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const f = fields.find((f) => f.key === "title");
    expect(f?.label).toBe("Titolo");
  });
});

describe("useFormFromSchema — conditionals", () => {
  const conditionalSchema: JSONSchema = {
    type: "object",
    properties: {
      type: { type: "string", enum: ["video", "article"] },
      url: { type: "string" },
      content: { type: "string" },
    },
    if: { properties: { type: { const: "video" } } },
    then: { properties: { url: { type: "string" } } },
    else: { properties: { content: { type: "string" } } },
  };

  it("adds visible(ctx) to fields gated by if/then", () => {
    const fields = useFormFromSchema(conditionalSchema);
    const url = fields.find((f) => f.key === "url");
    const typed = url as DescriptorWithAttrs | undefined;
    expect(typeof typed?.visible).toBe("function");
    expect(typed?.visible?.({ model: { type: "video" } })).toBe(true);
    expect(typed?.visible?.({ model: { type: "article" } })).toBe(false);
  });

  it("adds visible(ctx) negated for else branch", () => {
    const fields = useFormFromSchema(conditionalSchema);
    const content = fields.find((f) => f.key === "content");
    const typed = content as DescriptorWithAttrs | undefined;
    expect(typeof typed?.visible).toBe("function");
    expect(typed?.visible?.({ model: { type: "article" } })).toBe(true);
    expect(typed?.visible?.({ model: { type: "video" } })).toBe(false);
  });
});

describe("useFormFromSchema — number attrs", () => {
  it("adds min/max to number attrs", () => {
    const fields = useFormFromSchema(articleSchema, {
      exclude: [
        "id",
        "title",
        "slug",
        "body",
        "excerpt",
        "published_at",
        "date_only",
        "is_draft",
        "view_count",
        "status",
        "seo",
        "tags",
        "blocks",
      ],
    });
    const f = fields.find((f) => f.key === "rating");
    const typed = f as DescriptorWithAttrs | undefined;
    expect(typed?.attrs?.min).toBe(0);
    expect(typed?.attrs?.max).toBe(5);
  });
});

describe("useFormFromSchema — schema flags", () => {
  // Camomilla's OPTIONS schema marks per-language properties. Dropping the flag
  // renders them as plain fields under language tabs that no longer bind them.
  const flagged: JSONSchema = {
    type: "object",
    properties: {
      title: { type: "string", title: "Titolo", translatable: true },
      identifier: { type: "string", title: "Identifier" },
      created_at: { type: "string", format: "date-time", readOnly: true },
    },
  };

  it("carries translatable and readOnly onto the descriptor", () => {
    const fields = useFormFromSchema(flagged);
    const by = (k: string) =>
      fields.find((f) => f.key === k) as DescriptorWithAttrs | undefined;
    expect(by("title")?.translatable).toBe(true);
    expect(by("identifier")?.translatable).toBeUndefined();
    expect(by("created_at")?.readonly).toBe(true);
  });
});

/** The descriptor of a one-property schema. */
function fieldFor(property: JSONSchema, defs?: Record<string, JSONSchema>) {
  const [field] = useFormFromSchema({
    type: "object",
    properties: { value: property },
    ...(defs ? { $defs: defs } : {}),
  });
  return field as DescriptorWithAttrs & {
    type: string;
    noDraft?: boolean;
    attrs?: Record<string, unknown>;
  };
}

describe("useFormFromSchema — standard keywords", () => {
  it.each([
    [{ type: "string", format: "email" }, "email"],
    [{ type: "string", format: "uri" }, "url"],
    [{ type: "string", format: "binary" }, "file"],
    [{ type: "string", contentMediaType: "text/html" }, "editor"],
  ])("maps %j to %s", (property, type) => {
    expect(fieldFor(property).type).toBe(type);
  });

  it("keeps a writeOnly value, such as a password, out of drafts", () => {
    expect(fieldFor({ type: "string", writeOnly: true }).noDraft).toBe(true);
    expect(fieldFor({ type: "string" }).noDraft).toBeUndefined();
  });

  it("reads choices with labels from oneOf or anyOf of const and title", () => {
    const labeled = fieldFor({
      type: "string",
      oneOf: [
        { const: "draft", title: "Draft" },
        { const: "published", title: "Published" },
      ],
    });
    expect(labeled.type).toBe("select");
    expect(labeled.attrs?.options).toEqual([
      { text: "Draft", value: "draft" },
      { text: "Published", value: "published" },
    ]);

    const nullable = fieldFor({
      anyOf: [{ const: 1, title: "Low" }, { const: 2 }, { type: "null" }],
    });
    expect(nullable.attrs?.options).toEqual([
      { text: "Low", value: 1 },
      { text: "2", value: 2 },
    ]);
  });

  it("reads labeled choices behind a $ref", () => {
    const field = fieldFor(
      { $ref: "#/$defs/Status" },
      {
        Status: { oneOf: [{ const: "draft", title: "Draft" }] },
      },
    );
    expect(field.attrs?.options).toEqual([{ text: "Draft", value: "draft" }]);
  });

  it("maps an array of choices to a multiple select with options", () => {
    const field = fieldFor({
      type: "array",
      items: { type: "string", enum: ["art", "music"] },
    });
    expect(field.type).toBe("select");
    expect(field.attrs).toEqual({
      options: [
        { text: "art", value: "art" },
        { text: "music", value: "music" },
      ],
      multiple: true,
    });
  });

  it("maps an array of plain values to a multiple select", () => {
    const field = fieldFor({ type: "array", items: { type: "string" } });
    expect(field.type).toBe("select");
    expect(field.attrs).toEqual({ multiple: true });
  });

  it("maps a list of models behind a $ref to a repeater", () => {
    const field = fieldFor(
      { type: "array", items: { $ref: "#/$defs/Block" } },
      { Block: { type: "object", properties: { title: { type: "string" } } } },
    );
    expect(field.type).toBe("repeater");
    expect((field.fields as Array<{ key: string }>).map((f) => f.key)).toEqual([
      "title",
    ]);
  });

  it("reads minItems and maxItems as the repeater limits", () => {
    const field = fieldFor({
      type: "array",
      items: { type: "object", properties: {} },
      minItems: 1,
      maxItems: 5,
    });
    expect(field.attrs).toEqual({ minItems: 1, maxItems: 5 });
  });

  it("maps items told apart by _template to repeater templates", () => {
    const field = fieldFor({
      type: "array",
      items: {
        discriminator: { propertyName: "_template" },
        oneOf: [
          {
            type: "object",
            title: "Hero",
            properties: {
              _template: { const: "hero" },
              title: { type: "string" },
            },
            required: ["_template", "title"],
          },
          {
            type: "object",
            properties: {
              _template: { const: "quote" },
              text: { type: "string" },
            },
          },
          // No const: no item can pick it.
          { type: "object", properties: { other: { type: "string" } } },
        ],
      },
    });
    expect(field.type).toBe("repeater");
    expect(field.fields).toBeUndefined();
    const templates = field.attrs?.templates as Record<string, unknown>;
    expect(Object.keys(templates)).toEqual(["hero", "quote"]);
    expect(templates.hero).toMatchObject({
      label: "Hero",
      fields: [{ key: "title", type: "text", required: true }],
    });
    expect(templates.quote).toMatchObject([{ key: "text", type: "text" }]);
  });

  it("leaves items told apart by another property to a select, as before", () => {
    const field = fieldFor({
      type: "array",
      items: {
        discriminator: { propertyName: "kind" },
        oneOf: [{ type: "object", properties: { kind: { const: "a" } } }],
      },
    });
    expect(field.type).toBe("select");
  });

  it("recognises an SEO object stored with permalink", () => {
    const field = fieldFor({
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        permalink: { type: "string" },
      },
    });
    expect(field.type).toBe("seo");
  });
});

describe("useFormFromSchema — Mapo keywords", () => {
  it("takes the type from x-mapo-field before any other keyword", () => {
    expect(fieldFor({ type: "boolean", "x-mapo-field": "switch" }).type).toBe(
      "switch",
    );
    expect(fieldFor({ enum: ["a"], "x-mapo-field": "radio" }).type).toBe(
      "radio",
    );
  });

  it("reads the keywords of the marked type", () => {
    const field = fieldFor({
      type: "number",
      minimum: 1,
      maximum: 5,
      "x-mapo-field": "slider",
    });
    expect(field.attrs).toEqual({ min: 1, max: 5 });
  });

  it("merges x-mapo-attrs over the attrs read from the keywords", () => {
    const field = fieldFor({
      type: "relation",
      endpoint: "/api/users/",
      "x-mapo-attrs": { returnObject: false, itemText: "username" },
    });
    expect(field.attrs).toEqual({
      endpoint: "/api/users/",
      returnObject: false,
      itemText: "username",
    });
  });

  it("keeps a single relation with multiple values when marked fks", () => {
    const field = fieldFor({
      type: "relation",
      endpoint: "/api/users/",
      multiple: true,
      "x-mapo-field": "fks",
    });
    expect(field.type).toBe("fks");
    expect(field.attrs?.multiple).toBe(true);
  });
});

describe("useFormFromSchema — schemas that point back at themselves", () => {
  type Tree = { key: string; type: string; fields?: Tree[] };
  const shape = (field: Tree): unknown =>
    field.fields
      ? { [field.key]: field.fields.map(shape) }
      : `${field.key}:${field.type}`;

  it("expands a model that contains itself once", () => {
    const fields = useFormFromSchema({
      type: "object",
      properties: { menu: { type: "array", items: { $ref: "#/$defs/Item" } } },
      $defs: {
        Item: {
          type: "object",
          properties: {
            label: { type: "string" },
            children: { type: "array", items: { $ref: "#/$defs/Item" } },
          },
        },
      },
    });
    expect(fields.map((f) => shape(f as Tree))).toEqual([
      { menu: ["label:text", { children: [] }] },
    ]);
  });

  it("stops two models that list each other", () => {
    const fields = useFormFromSchema({
      type: "object",
      properties: { authors: { type: "array", items: { $ref: "#/$defs/A" } } },
      $defs: {
        A: {
          type: "object",
          properties: {
            books: { type: "array", items: { $ref: "#/$defs/B" } },
          },
        },
        B: {
          type: "object",
          properties: {
            authors: { type: "array", items: { $ref: "#/$defs/A" } },
          },
        },
      },
    });
    expect(fields.map((f) => shape(f as Tree))).toEqual([
      { authors: [{ books: [{ authors: [] }] }] },
    ]);
  });

  it("stops a nullable list of itself, as Pydantic writes Optional[list[Self]]", () => {
    const nullableList = {
      anyOf: [
        { type: "array", items: { $ref: "#/$defs/Node" } },
        { type: "null" },
      ],
    };
    const fields = useFormFromSchema({
      type: "object",
      properties: { nodes: nullableList },
      $defs: {
        Node: {
          type: "object",
          properties: {
            name: { type: "string" },
            children: nullableList,
          },
        },
      },
    });
    expect(fields.map((f) => shape(f as Tree))).toEqual([
      { nodes: ["name:text", { children: [] }] },
    ]);
  });

  it("stops templates whose blocks hold the same templates", () => {
    const fields = useFormFromSchema({
      type: "object",
      properties: {
        blocks: { type: "array", items: { $ref: "#/$defs/Block" } },
      },
      $defs: {
        Block: {
          discriminator: { propertyName: "_template" },
          oneOf: [{ $ref: "#/$defs/Section" }],
        },
        Section: {
          type: "object",
          properties: {
            _template: { const: "section" },
            blocks: { type: "array", items: { $ref: "#/$defs/Block" } },
          },
        },
      },
    });
    const templates = (
      fields[0] as DescriptorWithAttrs & {
        attrs: { templates: Record<string, Tree[]> };
      }
    ).attrs.templates;
    expect(templates.section).toEqual([
      expect.objectContaining({ key: "blocks", type: "repeater", fields: [] }),
    ]);
  });

  it("reads boolean schemas instead of throwing", () => {
    const [tags, anything] = useFormFromSchema({
      type: "object",
      properties: {
        tags: { type: "array", items: true as unknown as JSONSchema },
        anything: true as unknown as JSONSchema,
      },
    });
    expect(tags?.type).toBe("select");
    expect(anything?.type).toBe("text");
  });
});

describe("useFormFromSchema — attrs a schema cannot set", () => {
  it("drops event handlers and DOM properties from x-mapo-attrs", () => {
    const field = fieldFor({
      type: "string",
      "x-mapo-attrs": {
        placeholder: "Title",
        onfocus: "alert(1)",
        onClick: "alert(1)",
        innerHTML: "<img src=x onerror=alert(1)>",
        srcdoc: "<script></script>",
      },
    });
    expect(field.attrs).toEqual({ placeholder: "Title" });
  });

  it("restores the other properties of each choice, without the unsafe ones", () => {
    const field = fieldFor({
      type: "string",
      oneOf: [
        {
          const: "draft",
          title: "Draft",
          "x-mapo-attrs": { icon: "i-lucide-pencil", onSelect: "alert(1)" },
        },
        { const: "published", title: "Published" },
      ],
    });
    expect(field.attrs?.options).toEqual([
      { icon: "i-lucide-pencil", text: "Draft", value: "draft" },
      { text: "Published", value: "published" },
    ]);
  });
});
