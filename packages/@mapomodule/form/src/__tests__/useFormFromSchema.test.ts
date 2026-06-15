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
