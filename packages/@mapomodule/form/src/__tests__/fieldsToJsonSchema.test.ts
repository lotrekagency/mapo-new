import { describe, expect, it } from "vitest";
import type { JSONSchema } from "@mapomodule/utils";

import { useFormFromSchema } from "../runtime/composables/useFormFromSchema.js";
import { defaultRegistry } from "../runtime/registry/defaults.js";
import { KnownFieldType } from "../runtime/types/index.js";
import type {
  AnyFieldDescriptor,
  RepeaterTemplate,
} from "../runtime/types/index.js";
import { fieldsToJsonSchema } from "../runtime/utils/fieldsToJsonSchema.js";
import { normalizeTemplates } from "../runtime/utils/repeaterTemplates.js";

/** The schema of the only property of a one-field form. */
function propertyOf(field: AnyFieldDescriptor): JSONSchema {
  const schema = fieldsToJsonSchema([field]);
  return schema.properties![String(field.key)]!;
}

/** `attrs` is not on every member of the descriptor union. */
function attrsOf(field: AnyFieldDescriptor): Record<string, unknown> {
  return (field as { attrs?: Record<string, unknown> }).attrs ?? {};
}

/**
 * A select's choices as `{ label, value, ...others }`, whatever the shape they
 * were given in. The label is the one the select shows: `text`, then `label`.
 */
function choicesOf(attrs: Record<string, unknown>) {
  const list = (attrs.items ?? attrs.options) as unknown[] | undefined;
  return list?.map((item) => {
    if (typeof item !== "object" || item === null)
      return { label: String(item), value: item };
    const { text, label, value, ...others } = item as Record<string, unknown>;
    return { label: text ?? label, value, ...others };
  });
}

/**
 * What renders a field: its type, flags and attrs after the registry defaults,
 * with choices and templates in one shape. Layout and functions are left out,
 * as `fieldsToJsonSchema()` leaves them out.
 */
function effective(field: AnyFieldDescriptor): Record<string, unknown> {
  const type = String(field.type);
  const {
    items: _items,
    options: _options,
    templates,
    ...attrs
  } = {
    ...defaultRegistry.attrs.All,
    ...defaultRegistry.attrs[type],
    ...attrsOf(field),
  };
  const choices = choicesOf(attrsOf(field));
  const fields = (field as { fields?: AnyFieldDescriptor[] }).fields;
  return {
    key: field.key,
    type,
    ...(field.label ? { label: field.label } : {}),
    required: !!field.required,
    readonly: !!field.readonly,
    translatable: !!field.translatable,
    noDraft: !!field.noDraft,
    attrs: {
      ...attrs,
      ...(choices ? { choices } : {}),
      ...(templates
        ? {
            templates: normalizeTemplates(
              templates as Record<
                string,
                AnyFieldDescriptor[] | RepeaterTemplate
              >,
            ).map((template) => ({
              ...template,
              fields: template.fields.map(effective),
            })),
          }
        : {}),
    },
    ...(fields ? { fields: fields.map(effective) } : {}),
  };
}

// One rich descriptor per built-in type, plus the cases that need a mark.
const roundTrips: AnyFieldDescriptor[] = [
  {
    key: "title",
    type: "text",
    label: "Title",
    required: true,
    translatable: true,
    attrs: { placeholder: "Chi siamo", minLength: 3, maxLength: 120 },
  },
  { key: "subtitle", type: "text", attrs: { maxLength: 300 } },
  {
    key: "summary",
    type: "textarea",
    label: "Summary",
    attrs: { rows: 4, maxLength: 2000 },
  },
  { key: "email", type: "email", label: "Email", attrs: { maxLength: 254 } },
  { key: "website", type: "url", label: "Website" },
  {
    key: "price",
    type: "number",
    label: "Price",
    attrs: { min: 0, max: 1000, step: 0.5 },
  },
  { key: "rating", type: "slider", attrs: { min: 1, max: 5, step: 1 } },
  { key: "is_public", type: "boolean", label: "Public", readonly: true },
  { key: "featured", type: "switch", label: "Featured" },
  { key: "accent", type: "color", label: "Accent" },
  {
    key: "attachment",
    type: "file",
    attrs: { accept: "application/pdf", maxSize: 1_000_000 },
  },
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      placeholder: "Choose",
      items: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
    },
  },
  {
    key: "topics",
    type: "select",
    attrs: {
      multiple: true,
      options: [
        { text: "Art", value: "art" },
        { text: "Music", value: "music" },
      ],
    },
  },
  { key: "size", type: "select", attrs: { items: ["S", "M", "L"] } },
  {
    key: "visibility",
    type: "select",
    attrs: {
      items: [
        { label: "Public", value: "public", icon: "i-lucide-globe" },
        { label: "Private", value: "private", disabled: true },
      ],
    },
  },
  { key: "priority", type: "select", attrs: { items: [1, 2, 3] } },
  {
    key: "author",
    type: "fks",
    label: "Author",
    attrs: { endpoint: "/api/users/", itemText: "username" },
  },
  {
    key: "category",
    type: "fks",
    attrs: {
      endpoint: "/api/categories/",
      returnObject: false,
      itemValue: "pk",
    },
  },
  {
    key: "editors",
    type: "fks",
    attrs: { endpoint: "/api/users/", multiple: true },
  },
  {
    key: "tags",
    type: "m2m",
    label: "Tags",
    attrs: { endpoint: "/api/tags/" },
  },
  {
    key: "starts_on",
    type: "date",
    attrs: { min: "2026-01-01", max: "2026-12-31" },
  },
  { key: "opens_at", type: "time" },
  { key: "published_at", type: "datetime", attrs: { tz: "utc" } },
  { key: "body", type: "editor", label: "Body", translatable: true },
  { key: "seo", type: "seo", label: "SEO" },
  {
    key: "location",
    type: "map",
    attrs: { defaultLat: 45.46, defaultLng: 9.19, zoom: 12 },
  },
  {
    key: "faq",
    type: "repeater",
    label: "FAQ",
    fields: [
      { key: "question", type: "text", required: true },
      { key: "answer", type: "textarea" },
    ],
    attrs: { minItems: 1, maxItems: 10, confirmDelete: true },
  },
  {
    key: "blocks",
    type: "repeater",
    attrs: {
      picker: "modal",
      templates: {
        hero: {
          label: "Hero",
          description: "A big title over an image",
          icon: "i-lucide-image",
          category: "Intro",
          fields: [
            { key: "title", type: "text", required: true },
            { key: "image", type: "media" },
          ],
        },
        quote: [{ key: "text", type: "textarea" }],
      },
    },
  },
  { key: "cover", type: "media", label: "Cover", attrs: { mime: "image/*" } },
  {
    key: "gallery",
    type: "media-m2m",
    attrs: { mime: "image/*", maxItems: 12 },
  },
  { key: "hero_image", type: "enhanced-media" },
  { key: "mood", type: "rating", label: "Mood", attrs: { stars: 5 } },
  { key: "meta", type: "object:meta" },
  { key: "api_key", type: "text", noDraft: true },
  { key: "seo.title", type: "text", label: "SEO title" },
];

describe("fieldsToJsonSchema — round trip", () => {
  it("has a case for every built-in type", () => {
    const covered = new Set(roundTrips.map((field) => field.type));
    for (const type of Object.values(KnownFieldType))
      expect(covered, type).toContain(type);
  });

  it.each(roundTrips.map((field) => [`${field.type} ${field.key}`, field]))(
    "reads back %s as an equivalent descriptor",
    (_name, field) => {
      const [back] = useFormFromSchema(fieldsToJsonSchema([field]));
      expect(effective(back!)).toEqual(effective(field));
    },
  );

  it("reads a whole form back in order", () => {
    const back = useFormFromSchema(fieldsToJsonSchema(roundTrips));
    expect(back.map(effective)).toEqual(roundTrips.map(effective));
  });

  it("writes JSON only, without sharing objects with the descriptors", () => {
    const schema = fieldsToJsonSchema(roundTrips);
    expect(JSON.parse(JSON.stringify(schema))).toStrictEqual(schema);

    const status = roundTrips.find((field) => field.key === "status")!;
    const written = schema.properties!.status!;
    (written["x-mapo-attrs"] as Record<string, unknown>).placeholder = "x";
    expect(attrsOf(status).placeholder).toBe("Choose");
  });
});

describe("fieldsToJsonSchema — properties", () => {
  it("writes one property per field, with the required ones listed", () => {
    const schema = fieldsToJsonSchema([
      { key: "title", type: "text", label: "Title", required: true },
      { key: "body", type: "editor" },
    ]);
    expect(schema).toEqual({
      type: "object",
      properties: {
        title: { title: "Title", type: "string" },
        body: { type: "string", contentMediaType: "text/html" },
      },
      required: ["title"],
    });
  });

  it("keeps a dotted key as one property and flags translatable fields", () => {
    const schema = fieldsToJsonSchema([
      { key: "seo.title", type: "text", translatable: true },
    ]);
    expect(Object.keys(schema.properties!)).toEqual(["seo.title"]);
    expect(schema.properties!["seo.title"]!.translatable).toBe(true);
  });

  it("writes readonly and noDraft as readOnly and writeOnly", () => {
    expect(
      propertyOf({ key: "id", type: "number", readonly: true }),
    ).toMatchObject({ readOnly: true });
    expect(
      propertyOf({ key: "password", type: "text", noDraft: true }),
    ).toMatchObject({ writeOnly: true });
  });

  it("keeps the first field of a key that appears twice", () => {
    const schema = fieldsToJsonSchema([
      { key: "price", type: "number", label: "Price" },
      { key: "price", type: "text", label: "Price as text" },
    ]);
    expect(schema.properties!.price).toEqual({
      title: "Price",
      type: "number",
    });
  });
});

describe("fieldsToJsonSchema — values", () => {
  it.each([
    ["text", { type: "string" }],
    ["textarea", { type: "string", format: "textarea" }],
    ["email", { type: "string", format: "email" }],
    ["url", { type: "string", format: "uri" }],
    ["number", { type: "number" }],
    ["boolean", { type: "boolean" }],
    ["color", { type: "string", format: "color" }],
    ["file", { type: "string", format: "binary" }],
    ["date", { type: "string", format: "date" }],
    ["time", { type: "string", format: "time" }],
    ["datetime", { type: "string", format: "date-time" }],
    ["editor", { type: "string", contentMediaType: "text/html" }],
  ])("writes %s with standard keywords", (type, expected) => {
    expect(propertyOf({ key: "value", type })).toEqual(expected);
  });

  it("writes the limits a keyword expresses as that keyword", () => {
    expect(
      propertyOf({ key: "price", type: "number", attrs: { min: 0, max: 10 } }),
    ).toEqual({ type: "number", minimum: 0, maximum: 10 });
    expect(
      propertyOf({ key: "title", type: "text", attrs: { maxLength: 80 } }),
    ).toEqual({ type: "string", maxLength: 80 });
  });

  it("writes choices as an enum, or oneOf when they have labels", () => {
    expect(
      propertyOf({ key: "size", type: "select", attrs: { items: ["S", "M"] } }),
    ).toEqual({ type: "string", enum: ["S", "M"] });
    expect(
      propertyOf({
        key: "status",
        type: "select",
        attrs: { options: [{ text: "Draft", value: "draft" }] },
      }),
    ).toEqual({
      type: "string",
      oneOf: [{ const: "draft", title: "Draft" }],
    });
  });

  it("writes a multiple select as an array of choices", () => {
    expect(
      propertyOf({
        key: "sizes",
        type: "select",
        attrs: { multiple: true, items: ["S", "M"] },
      }),
    ).toEqual({
      type: "array",
      items: { type: "string", enum: ["S", "M"] },
      uniqueItems: true,
    });
  });

  it("writes relations in the relation dialect", () => {
    expect(
      propertyOf({
        key: "tags",
        type: "m2m",
        attrs: { endpoint: "/api/tags/" },
      }),
    ).toEqual({ type: "relation", endpoint: "/api/tags/", multiple: true });
  });

  it("writes repeater items as an object, and templates as oneOf on _template", () => {
    expect(
      propertyOf({
        key: "faq",
        type: "repeater",
        fields: [{ key: "question", type: "text", required: true }],
      }),
    ).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"],
      },
    });

    const blocks = propertyOf({
      key: "blocks",
      type: "repeater",
      attrs: {
        templates: {
          quote: { label: "Quote", fields: [{ key: "text", type: "text" }] },
        },
      },
    });
    expect(blocks).toEqual({
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            title: "Quote",
            properties: {
              _template: { const: "quote" },
              text: { type: "string" },
            },
            required: ["_template"],
          },
        ],
        discriminator: { propertyName: "_template" },
      },
    });
  });
});

describe("fieldsToJsonSchema — Mapo keywords", () => {
  it("names the type only when the other keywords read back as another", () => {
    expect(propertyOf({ key: "a", type: "text" })["x-mapo-field"]).toBe(
      undefined,
    );
    expect(propertyOf({ key: "a", type: "switch" })["x-mapo-field"]).toBe(
      "switch",
    );
    // A long text would read back as a textarea.
    expect(
      propertyOf({ key: "a", type: "text", attrs: { maxLength: 300 } })[
        "x-mapo-field"
      ],
    ).toBe("text");
    // A custom type: Mapo does not know its value.
    expect(propertyOf({ key: "a", type: "rating" })).toEqual({
      "x-mapo-field": "rating",
    });
  });

  it("keeps the attrs no keyword expresses in x-mapo-attrs", () => {
    expect(
      propertyOf({
        key: "author",
        type: "fks",
        attrs: { endpoint: "/api/users/", itemText: "username" },
      }),
    ).toEqual({
      type: "relation",
      endpoint: "/api/users/",
      "x-mapo-attrs": { itemText: "username" },
    });
  });

  it("leaves out functions, class instances and undefined values, one attr at a time", () => {
    class Extension {}
    const property = propertyOf({
      key: "body",
      type: "repeater",
      fields: [],
      attrs: {
        previewLabel: (item: unknown) => String(item),
        confirmDelete: true,
        defaultExpanded: undefined,
        custom: { size: 2, skipped: undefined },
        extensions: [new Extension()],
      },
    });
    expect(property["x-mapo-attrs"]).toEqual({
      confirmDelete: true,
      custom: { size: 2 },
    });
  });

  it("does not write layout, functions or components", () => {
    const property = propertyOf({
      key: "title",
      type: "text",
      tab: "Content",
      group: "Main",
      cols: 6,
      class: "font-bold",
      expandable: true,
      visible: () => true,
      validate: () => null,
      is: { name: "Custom" },
    });
    expect(property).toEqual({ type: "string" });
  });
});

describe("fieldsToJsonSchema — the property option", () => {
  it("lets the caller change the schema of every field, nested ones included", () => {
    const seen: string[] = [];
    const schema = fieldsToJsonSchema(
      [
        { key: "title", type: "text" },
        {
          key: "blocks",
          type: "repeater",
          fields: [{ key: "caption", type: "text" }],
        },
      ],
      {
        property: (written, field) => {
          seen.push(String(field.key));
          return { ...written, description: `About ${String(field.key)}` };
        },
      },
    );
    expect(seen).toEqual(["title", "caption", "blocks"]);
    expect(schema.properties!.title!.description).toBe("About title");
    expect(
      schema.properties!.blocks!.items!.properties!.caption!.description,
    ).toBe("About caption");
  });

  it("leaves out a field when it returns undefined", () => {
    const schema = fieldsToJsonSchema(
      [
        { key: "title", type: "text", required: true },
        { key: "password", type: "text", required: true, noDraft: true },
      ],
      {
        property: (written, field) => (field.noDraft ? undefined : written),
      },
    );
    expect(Object.keys(schema.properties!)).toEqual(["title"]);
    expect(schema.required).toEqual(["title"]);
  });
});

describe("fieldsToJsonSchema — inputs that could break it", () => {
  it("writes a repeater that contains itself once", () => {
    const section: AnyFieldDescriptor & { fields: AnyFieldDescriptor[] } = {
      key: "blocks",
      type: "repeater",
      fields: [{ key: "title", type: "text" }],
    };
    section.fields.push(section);
    const schema = propertyOf(section);
    expect(schema.items!.properties!.blocks).toEqual({
      type: "array",
      items: { type: "object", properties: {} },
    });
  });

  it("leaves out an attr that contains itself", () => {
    const loop: Record<string, unknown> = { size: 2 };
    loop.self = loop;
    const property = propertyOf({
      key: "mood",
      type: "rating",
      attrs: { loop, stars: 5 },
    });
    expect(property["x-mapo-attrs"]).toStrictEqual({ stars: 5 });
  });

  it("leaves out only the choice whose value JSON cannot hold", () => {
    const property = propertyOf({
      key: "size",
      type: "select",
      attrs: { items: [{ label: "Small", value: "s" }, { label: "None" }] },
    });
    expect(property).toEqual({
      type: "string",
      oneOf: [{ const: "s", title: "Small" }],
    });
  });

  it("labels a choice as the select does: text before label", () => {
    const property = propertyOf({
      key: "size",
      type: "select",
      attrs: { options: [{ text: "Shown", label: "Hidden", value: "s" }] },
    });
    expect(property.oneOf).toEqual([{ const: "s", title: "Shown" }]);
  });

  it("does not write attr names that could run script", () => {
    const property = propertyOf({
      key: "title",
      type: "text",
      attrs: { placeholder: "Title", onfocus: "alert(1)", innerHTML: "<b>" },
    });
    expect(property["x-mapo-attrs"]).toStrictEqual({ placeholder: "Title" });
  });
});

describe("fieldsToJsonSchema — the property option and the type", () => {
  it("decides x-mapo-field on the schema the option returns", () => {
    const schema = fieldsToJsonSchema([{ key: "title", type: "text" }], {
      property: (written) => ({ ...written, maxLength: 1000 }),
    });
    expect(schema.properties!.title).toEqual({
      type: "string",
      maxLength: 1000,
      "x-mapo-field": "text",
    });
    const [back] = useFormFromSchema(schema);
    expect(back?.type).toBe("text");
  });

  it("keeps a type the option names itself", () => {
    const schema = fieldsToJsonSchema([{ key: "title", type: "text" }], {
      property: (written) => ({ ...written, "x-mapo-field": "slug" }),
    });
    expect(schema.properties!.title!["x-mapo-field"]).toBe("slug");
  });

  it("writes the next field with a key when the option leaves out the first", () => {
    const schema = fieldsToJsonSchema(
      [
        { key: "price", type: "number", noDraft: true },
        { key: "price", type: "text", label: "Price as text" },
      ],
      { property: (written, field) => (field.noDraft ? undefined : written) },
    );
    expect(schema.properties!.price).toEqual({
      title: "Price as text",
      type: "string",
    });
  });
});
