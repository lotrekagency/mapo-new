import { describe, expect, it } from "vitest";
import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import type { JSONSchema } from "@mapomodule/utils";
import { buildAiEntity } from "../runtime/shared/entity";
import type { AiEntity, AiField, AiValueKind } from "../runtime/shared/entity";
import {
  AI_CONTRACT_FORMAT_VERSION,
  compileExtractContract,
  compileFillContract,
} from "../runtime/shared/contract";
import type { AiContract, AiContractField } from "../runtime/shared/contract";

type Fields = Parameters<typeof fieldsToJsonSchema>[0];

function entityOf(fields: Fields): AiEntity {
  return buildAiEntity({ fields: fieldsToJsonSchema(fields) });
}

function itemsOf(contract: AiContract): JSONSchema[] {
  const items = contract.schema.properties?.items?.items;
  if (!items) return [];
  return items.anyOf ?? [items];
}

function valuesOf(contract: AiContract, index = 0): JSONSchema {
  const values =
    contract.task === "fill"
      ? contract.schema.properties?.values
      : itemsOf(contract)[index]?.properties?.values;
  if (!values) throw new Error("no values");
  return values;
}

function propertyOf(contract: AiContract, wire: string, index = 0): JSONSchema {
  const property = valuesOf(contract, index).properties?.[wire];
  if (!property) throw new Error(`no property ${wire}`);
  return property;
}

function fieldOf(
  contract: AiContract,
  key: string,
  index = 0,
): AiContractField {
  const entity =
    contract.task === "fill" ? contract.entity : contract.entities[index];
  const field = entity?.fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`no field ${key}`);
  return field;
}

function choices(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    text: `${prefix} ${index}`,
    value: `${prefix}${index}`,
  }));
}

/** A field written by hand, as `buildAiEntity()` would never give it. */
function aiField(
  key: string,
  kind: AiValueKind = "string",
  extra: Partial<AiField> = {},
): AiField {
  return {
    key,
    fieldType: "custom",
    kind,
    required: false,
    translatable: false,
    multiple: false,
    constraints: {},
    ...extra,
  };
}

/** A model written by hand: large ones build fast, odd ones reach the compiler. */
function modelOf(fields: AiField[]): AiEntity {
  return {
    sources: { schema: false, fields: true },
    fields,
    skipped: [],
    warnings: [],
  };
}

function textFields(count: number, prefix = "f"): AiField[] {
  return Array.from({ length: count }, (_, index) =>
    aiField(`${prefix}${index}`),
  );
}

/** `count` distinct values of `length` characters each. */
function longValues(count: number, length: number): AiField["choices"] {
  return Array.from({ length: count }, (_, index) => {
    const value = `v${index}`.padEnd(length, "x");
    return { value, label: value };
  });
}

/** A choice field of `count` values, each `length` characters long when given. */
function listField(key: string, count: number, length = 0): AiField {
  return aiField(key, "choice", {
    choices: Array.from({ length: count }, (_, index) => {
      const value = `${key}${index}`.padEnd(length, "x");
      return { value, label: value };
    }),
  });
}

function switches(count: number): AiField[] {
  return Array.from({ length: count }, (_, index) =>
    aiField(`s${index}`, "boolean"),
  );
}

/** The keys of the fields whose list the budget moved to the description. */
function movedKeys(fields: AiField[], evidence = false): string[] {
  return compileFillContract({ entity: modelOf(fields), evidence })
    .entity.fields.filter((field) => !field.choicesInSchema)
    .map((field) => field.key);
}

function evidenceFieldOf(
  schema: JSONSchema | undefined,
): JSONSchema | undefined {
  return schema?.properties?.evidence?.items?.properties?.field;
}

// ─── The subset every provider accepts in strict mode ────────────────────────

const PORTABLE_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "description",
  "anyOf",
]);
const PROPERTY_NAME = /^[A-Za-z0-9_]{1,64}$/;

const PORTABLE_TYPES = ["object", "string", "array"];

interface Census {
  unions: number;
  properties: number;
  enumValues: number;
  characters: number;
}

/**
 * Walks a schema and fails on anything outside the portable subset: the
 * keywords, one type per node among object, string and array, objects
 * closed and fully required, safe property names, at most one `anyOf` and
 * never at the root, `enum`s of unique strings (at most 250 each, 1000 in
 * all), at most 5000 properties, 10 levels and 100,000 characters of names
 * and values.
 */
function expectPortable(schema: JSONSchema): Census {
  const census: Census = {
    unions: 0,
    properties: 0,
    enumValues: 0,
    characters: 0,
  };
  const walk = (
    node: JSONSchema,
    path: string,
    depth: number,
    isRoot: boolean,
  ): void => {
    expect(depth, `${path}: too deep`).toBeLessThanOrEqual(10);
    for (const keyword of Object.keys(node))
      expect(PORTABLE_KEYWORDS.has(keyword), `${path}: ${keyword}`).toBe(true);
    if (node.anyOf) {
      expect(isRoot, `${path}: anyOf at the root`).toBe(false);
      for (const keyword of Object.keys(node))
        expect(
          ["anyOf", "description"],
          `${path}: ${keyword} beside anyOf`,
        ).toContain(keyword);
      census.unions++;
      node.anyOf.forEach((branch, index) =>
        walk(branch, `${path}.anyOf[${index}]`, depth, false),
      );
      return;
    }
    expect(typeof node.type, `${path}: one type`).toBe("string");
    expect(PORTABLE_TYPES, `${path}: type`).toContain(node.type);
    if (isRoot) expect(node.type).toBe("object");
    const isObject = node.type === "object";
    for (const keyword of ["properties", "required", "additionalProperties"])
      if (keyword in node) expect(isObject, `${path}: ${keyword}`).toBe(true);
    if ("items" in node) expect(node.type, `${path}: items`).toBe("array");
    if (node.enum) {
      expect(node.type, `${path}: enum of strings`).toBe("string");
      expect(node.enum.length, `${path}: empty enum`).toBeGreaterThan(0);
      expect(node.enum.length, `${path}: enum too long`).toBeLessThanOrEqual(
        250,
      );
      expect(new Set(node.enum).size, `${path}: repeated value`).toBe(
        node.enum.length,
      );
      for (const value of node.enum) {
        expect(typeof value).toBe("string");
        census.characters += String(value).length;
      }
      census.enumValues += node.enum.length;
    }
    if (node.type === "object") {
      expect(node.additionalProperties, path).toBe(false);
      const keys = Object.keys(node.properties ?? {});
      expect([...(node.required ?? [])].sort(), path).toEqual([...keys].sort());
      census.properties += keys.length;
      for (const key of keys) {
        expect(key, `${path}: property name`).toMatch(PROPERTY_NAME);
        census.characters += key.length;
        walk(node.properties?.[key] ?? {}, `${path}.${key}`, depth + 1, false);
      }
    }
    if (node.type === "array") {
      expect(node.items, `${path}: items`).toBeDefined();
      walk(node.items ?? {}, `${path}[]`, depth + 1, false);
    }
  };
  walk(schema, "$", 1, true);
  expect(census.unions).toBeLessThanOrEqual(1);
  expect(census.properties).toBeLessThanOrEqual(5000);
  expect(census.enumValues).toBeLessThanOrEqual(1000);
  expect(census.characters).toBeLessThanOrEqual(100_000);
  return census;
}

// ─── Fill: one value per kind ────────────────────────────────────────────────

describe("compileFillContract — the value of each kind", () => {
  it.each([
    ["text", "Plain text on one line."],
    ["textarea", "line breaks are allowed"],
    ["editor", "restricted Markdown"],
    ["email", "An email address."],
    ["url", "http or https URL"],
    ["color", "#RRGGBB"],
    ["number", "with a dot for decimals"],
    ["date", "YYYY-MM-DD."],
    ["datetime", "YYYY-MM-DDTHH:MM:SS"],
    ["time", "HH:MM, 24-hour"],
  ])("asks for a %s as a string", (type, rule) => {
    const contract = compileFillContract({
      entity: entityOf([{ key: "value", type }] as Fields),
    });
    const property = propertyOf(contract, "value");

    expect(property.type).toBe("string");
    expect(property.enum).toBeUndefined();
    expect(property.description).toContain(rule);
    expect(property.description).toContain('Empty ("") when');
    expect(fieldOf(contract, "value").choicesInSchema).toBe(false);
  });

  it("asks for an integer in digits", () => {
    const contract = compileFillContract({
      entity: buildAiEntity({
        schema: { type: "object", properties: { seats: { type: "integer" } } },
      }),
    });

    expect(propertyOf(contract, "seats").description).toContain(
      "A whole number in digits",
    );
  });

  it("asks for a boolean as one of three strings", () => {
    const contract = compileFillContract({
      entity: entityOf([{ key: "featured", type: "switch" }] as Fields),
    });

    expect(propertyOf(contract, "featured")).toMatchObject({
      type: "string",
      enum: ["", "true", "false"],
    });
    expect(fieldOf(contract, "featured").choicesInSchema).toBe(true);
  });

  it("lists a choice's values in the schema and its labels in the description", () => {
    const contract = compileFillContract({
      entity: entityOf([
        {
          key: "status",
          type: "select",
          attrs: {
            options: [
              { text: "Draft", value: "draft" },
              { text: "live", value: "live" },
            ],
          },
        },
      ] as Fields),
    });
    const property = propertyOf(contract, "status");

    expect(property.enum).toEqual(["", "draft", "live"]);
    expect(property.description).toContain(
      "One of the listed values; empty when the source's value is none of them.",
    );
    expect(property.description).toContain('Values: "draft" (Draft), "live".');
  });

  it("does not repeat values the schema lists when their labels add nothing", () => {
    const contract = compileFillContract({
      entity: entityOf([
        { key: "size", type: "select", attrs: { options: ["s", "m", "l"] } },
      ] as Fields),
    });

    expect(propertyOf(contract, "size").enum).toEqual(["", "s", "m", "l"]);
    expect(propertyOf(contract, "size").description).not.toContain("Values:");
  });

  it("asks for a multiple choice as a list, without the empty value", () => {
    const contract = compileFillContract({
      entity: entityOf([
        {
          key: "tags",
          type: "select",
          attrs: { multiple: true, options: ["a", "b"] },
        },
      ] as Fields),
    });
    const property = propertyOf(contract, "tags");

    expect(property.type).toBe("array");
    expect(property.items).toEqual({ type: "string", enum: ["a", "b"] });
    expect(property.description).toContain(
      "The values from the list that the source gives; leave out a value that is not listed.",
    );
    expect(property.description).toContain("An empty list when");
  });

  it("keeps one choice per value as the answer writes it, the first listed, and drops the empty one", () => {
    const contract = compileFillContract({
      entity: modelOf([
        aiField("rank", "choice", {
          choices: [
            { value: 1, label: "One" },
            { value: "1", label: "Uno" },
            { value: "", label: "None" },
          ],
        }),
        aiField("open", "choice", {
          choices: [
            { value: true, label: "Yes" },
            { value: "true", label: "Sì" },
          ],
        }),
      ]),
    });

    expect(propertyOf(contract, "rank").enum).toEqual(["", "1"]);
    expect(fieldOf(contract, "rank").choices).toEqual([
      { value: 1, label: "One" },
    ]);
    expect(propertyOf(contract, "rank").description).toContain(
      'Values: "1" (One).',
    );
    expect(propertyOf(contract, "open").enum).toEqual(["", "true"]);
    expectPortable(contract.schema);
  });

  it("does not ask for a choice left with nothing to answer", () => {
    const contract = compileFillContract({
      entity: modelOf([
        aiField("none", "choice", { choices: [{ value: "", label: "None" }] }),
        aiField("nothing", "choice", { multiple: true, choices: [] }),
        aiField("title"),
      ]),
    });

    expect(contract.entity.fields.map((field) => field.key)).toEqual(["title"]);
    expect(Object.keys(valuesOf(contract).properties ?? {})).toEqual(["title"]);
    expectPortable(contract.schema);
  });

  it("asks for a whole date or nothing, never a completed one", () => {
    const contract = compileFillContract({
      entity: entityOf([
        { key: "day", type: "date" },
        { key: "starts", type: "datetime" },
      ] as Fields),
    });
    const starts = propertyOf(contract, "starts").description;

    expect(propertyOf(contract, "day").description).toContain(
      "A date the source gives only in part, such as a month without a day or a day without a year, counts as not given: never add the missing parts.",
    );
    expect(starts).toContain(
      "then the UTC offset as +HH:MM or -HH:MM when the source states it, or names a time zone: for a time zone, the offset in force on that date, summer time included.",
    );
    expect(starts).toContain(
      'A value the source gives only in part, such as a date without a time or a day without a year, counts as not given: never add the missing parts, except ":00" seconds when the source gives none.',
    );
  });
});

describe("compileFillContract — relations", () => {
  const entity = entityOf([
    { key: "place", type: "fks", attrs: { endpoint: "/api/places/" } },
    { key: "tags", type: "m2m", attrs: { endpoint: "/api/tags/" } },
    { key: "author", type: "fks", attrs: { endpoint: "/api/people/" } },
  ] as Fields);

  it("asks for a relation by id when its records are few, by name otherwise", () => {
    const contract = compileFillContract({
      entity,
      relationChoices: {
        place: [
          { value: 12, label: "Rome" },
          { value: 15, label: "Milan" },
        ],
        tags: [{ value: "news", label: "News" }],
      },
    });

    expect(propertyOf(contract, "place").enum).toEqual(["", "12", "15"]);
    expect(propertyOf(contract, "place").description).toContain(
      'The id of the related record, from the list; empty when the record the source names is not listed. Values: "12" (Rome), "15" (Milan).',
    );
    expect(propertyOf(contract, "tags").description).toContain(
      "The ids of the related records the source names, from the list; leave out a record that is not listed.",
    );
    expect(propertyOf(contract, "tags")).toMatchObject({
      type: "array",
      items: { type: "string", enum: ["news"] },
    });
    expect(propertyOf(contract, "author")).toMatchObject({ type: "string" });
    expect(propertyOf(contract, "author").description).toContain(
      "Mapo searches for it",
    );
    expect(fieldOf(contract, "place").relationMode).toBe("choice");
    expect(fieldOf(contract, "author").relationMode).toBe("search");
    expect(fieldOf(contract, "author").choices).toBeUndefined();
  });

  it("searches when the listed records have no answerable id", () => {
    const contract = compileFillContract({
      entity,
      relationChoices: { tags: [{ value: "", label: "None" }] },
    });

    expect(fieldOf(contract, "tags").relationMode).toBe("search");
    expectPortable(contract.schema);
  });

  it("reads only the source's own lists, whatever the field key", () => {
    const named = entityOf([
      { key: "constructor", type: "fks", attrs: { endpoint: "/api/a/" } },
      { key: "hasOwnProperty", type: "fks", attrs: { endpoint: "/api/b/" } },
      { key: "place", type: "fks", attrs: { endpoint: "/api/places/" } },
    ] as Fields);
    const contract = compileFillContract({
      entity: named,
      relationChoices: { place: [{ value: 1, label: "Rome" }] },
    });

    expect(fieldOf(contract, "constructor").relationMode).toBe("search");
    expect(fieldOf(contract, "hasOwnProperty").relationMode).toBe("search");
    expect(fieldOf(contract, "place").relationMode).toBe("choice");
    expectPortable(contract.schema);
  });

  it("leaves the limits of a relation's key to the sanitizer, but for its number of records", () => {
    const keyed = buildAiEntity({
      fields: fieldsToJsonSchema([
        { key: "place", type: "fks", attrs: { endpoint: "/api/places/" } },
      ] as Fields),
      schema: {
        type: "object",
        properties: {
          place: { type: "string", maxLength: 50, pattern: "^[-a-z0-9]+$" },
        },
      },
    });
    const contract = compileFillContract({
      entity: modelOf([
        ...keyed.fields,
        aiField("speakers", "relation", {
          multiple: true,
          endpoint: "/api/people/",
          constraints: { minItems: 1, maxItems: 3, minimum: 1 },
        }),
      ]),
    });
    const place = propertyOf(contract, "place").description;

    expect(fieldOf(contract, "place").constraints).toMatchObject({
      maxLength: 50,
    });
    expect(place).not.toContain("At most 50");
    expect(place).not.toContain("regular expression");
    expect(propertyOf(contract, "speakers").description).toContain(
      "At least 1 value. At most 3 values. Never add words or values the source does not give to reach a minimum.",
    );
    expect(propertyOf(contract, "speakers").description).not.toContain(
      "At least 1.",
    );
  });

  it("ignores a list the source only inherits", () => {
    const inherited = Object.create({
      place: [{ value: 1, label: "Rome" }],
    }) as Record<string, { value: number; label: string }[]>;
    const contract = compileFillContract({
      entity,
      relationChoices: inherited,
    });

    expect(fieldOf(contract, "place").relationMode).toBe("search");
  });

  it("keeps one record per id as the answer writes it", () => {
    const contract = compileFillContract({
      entity,
      relationChoices: {
        place: [
          { value: 1, label: "Rome" },
          { value: "1", label: "Roma" },
          { value: "", label: "None" },
        ],
        tags: [
          { value: 2, label: "News" },
          { value: "2", label: "Notizie" },
        ],
      },
    });

    expect(propertyOf(contract, "place").enum).toEqual(["", "1"]);
    expect(fieldOf(contract, "place").choices).toEqual([
      { value: 1, label: "Rome" },
    ]);
    expect(propertyOf(contract, "tags").items?.enum).toEqual(["2"]);
    expectPortable(contract.schema);
  });

  it("asks for several related records by name, one each", () => {
    const contract = compileFillContract({ entity });

    expect(propertyOf(contract, "tags")).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
    expect(propertyOf(contract, "tags").description).toContain(
      "The names of the related records as the source writes them: Mapo searches for each.",
    );
  });
});

// ─── Fill: descriptions and names ────────────────────────────────────────────

describe("compileFillContract — descriptions", () => {
  it("carries the label, the help text, the hint and every limit", () => {
    const entity = buildAiEntity({
      fields: {
        type: "object",
        properties: {
          title: {
            type: "string",
            title: "Title",
            description: "Shown in lists.",
            minLength: 3,
            maxLength: 80,
            pattern: "^[A-Z]",
            "x-mapo-ai": { hint: "Without the date" },
          },
          seats: {
            type: "number",
            minimum: 1,
            maximum: 500,
            exclusiveMinimum: 0,
            exclusiveMaximum: 501,
          },
          tags: {
            type: "array",
            items: { enum: ["a", "b", "c"] },
            minItems: 1,
            maxItems: 2,
          },
        },
        required: ["title"],
      },
    });
    const contract = compileFillContract({ entity });

    expect(propertyOf(contract, "title").description).toBe(
      'Title. Shown in lists. Without the date. Plain text on one line. At least 3 characters. At most 80 characters. Matches the regular expression `^[A-Z]`. Never add words or values the source does not give to reach a minimum. The form needs it, but leave it empty rather than guess. Empty ("") when the source does not give it.',
    );
    expect(propertyOf(contract, "seats").description).toContain(
      "At least 1. At most 500. Greater than 0. Less than 501.",
    );
    expect(propertyOf(contract, "tags").description).toContain(
      "At least 1 value. At most 2 values. Never add words or values the source does not give to reach a minimum.",
    );
    expect(propertyOf(contract, "seats").description).not.toContain(
      "Never add",
    );
  });

  it("does not add a full stop after a label that ends with punctuation", () => {
    const contract = compileFillContract({
      entity: entityOf([
        { key: "open", type: "switch", label: "Open to the public?" },
      ] as Fields),
    });

    expect(propertyOf(contract, "open").description).toMatch(
      /^Open to the public\? "true"/,
    );
  });

  it("trims labels and help texts, and leaves blank ones out", () => {
    const contract = compileFillContract({
      entity: modelOf([
        aiField("title", "string", {
          label: "Title ",
          description: "Shown in lists.\n",
        }),
        aiField("note", "string", { label: "   " }),
      ]),
    });

    expect(propertyOf(contract, "title").description).toMatch(
      /^Title\. Shown in lists\. Plain text on one line\./,
    );
    expect(propertyOf(contract, "note").description).toMatch(
      /^Plain text on one line\./,
    );
  });

  it.each<[string, AiValueKind, number[], string | undefined]>([
    ["decimals for a power of ten", "number", [0.01], "At most 2 decimals."],
    ["one decimal", "number", [0.1], "At most 1 decimal."],
    ["a multiple otherwise", "number", [0.5], "A multiple of 0.5."],
    ["a multiple of a whole step", "integer", [5], "A multiple of 5."],
    ["nothing for a step a whole number meets", "integer", [1], undefined],
    ["a whole number on a number", "number", [1], "A whole number."],
  ])("describes a step: %s", (_case, kind, steps, rule) => {
    const contract = compileFillContract({
      entity: modelOf([aiField("amount", kind, { constraints: { steps } })]),
    });
    const description = String(propertyOf(contract, "amount").description);

    if (rule) expect(description).toContain(rule);
    else expect(description).not.toMatch(/multiple|decimal/);
  });

  it("writes no minimum of zero", () => {
    const contract = compileFillContract({
      entity: modelOf([
        aiField("title", "string", { constraints: { minLength: 0 } }),
        aiField("tags", "choice", {
          multiple: true,
          choices: [{ value: "a", label: "a" }],
          constraints: { minItems: 0 },
        }),
      ]),
    });

    for (const wire of ["title", "tags"]) {
      expect(propertyOf(contract, wire).description).not.toContain("At least");
      expect(propertyOf(contract, wire).description).not.toContain("Never add");
    }
  });

  it("quotes a pattern with a fence longer than its backticks", () => {
    const contract = compileFillContract({
      entity: modelOf([
        aiField("plain", "string", { constraints: { patterns: ["^a."] } }),
        aiField("ticks", "string", { constraints: { patterns: ["^[^`]+$"] } }),
        aiField("edge", "string", { constraints: { patterns: ["`x"] } }),
        aiField("spaced", "string", { constraints: { patterns: [" a "] } }),
      ]),
    });

    expect(propertyOf(contract, "plain").description).toContain(
      "Matches the regular expression `^a.`.",
    );
    expect(propertyOf(contract, "ticks").description).toContain(
      "Matches the regular expression ``^[^`]+$``.",
    );
    expect(propertyOf(contract, "edge").description).toContain(
      "Matches the regular expression `` `x ``.",
    );
    expect(propertyOf(contract, "spaced").description).toContain(
      "Matches the regular expression `  a  `.",
    );
  });

  it("lists a label only when it says more than its value", () => {
    const contract = compileFillContract({
      entity: modelOf([
        aiField("size", "choice", {
          choices: [
            { value: "x", label: "" },
            { value: "y", label: " Two " },
          ],
        }),
        aiField("code", "choice", {
          choices: [
            { value: "a", label: "  " },
            { value: "b", label: "b" },
            { value: " c", label: " c" },
          ],
        }),
      ]),
    });

    expect(propertyOf(contract, "size").description).toContain(
      'Values: "x", "y" (Two).',
    );
    expect(propertyOf(contract, "code").description).not.toContain("Values:");
  });

  it("names the language of a translatable value, when there is one", () => {
    const entity = entityOf([
      { key: "title", type: "text", translatable: true },
    ] as Fields);

    expect(
      propertyOf(compileFillContract({ entity }, { language: "it" }), "title")
        .description,
    ).toContain('Write it in the language with code "it".');
    expect(
      propertyOf(compileFillContract({ entity }), "title").description,
    ).not.toContain("Write it in");
  });

  it("names the language for prose only", () => {
    const contract = compileFillContract(
      {
        entity: entityOf([
          { key: "title", type: "text", translatable: true },
          { key: "summary", type: "textarea", translatable: true },
          { key: "body", type: "editor", translatable: true },
          { key: "seats", type: "number", translatable: true },
          { key: "link", type: "url", translatable: true },
          {
            key: "level",
            type: "select",
            translatable: true,
            attrs: { options: ["beginner", "expert"] },
          },
          {
            key: "place",
            type: "fks",
            translatable: true,
            attrs: { endpoint: "/api/places/" },
          },
        ] as Fields),
      },
      { language: "it" },
    );
    const named = contract.entity.fields
      .filter((field) =>
        String(propertyOf(contract, field.wire).description).includes(
          'Write it in the language with code "it".',
        ),
      )
      .map((field) => field.key);

    expect(named).toEqual(["title", "summary", "body"]);
  });

  it("measures the limits of rich text on the HTML it becomes", () => {
    const contract = compileFillContract({
      entity: buildAiEntity({
        fields: {
          type: "object",
          properties: {
            body: {
              type: "string",
              "x-mapo-field": "editor",
              minLength: 20,
              maxLength: 500,
              pattern: "^<p>",
            },
          },
        },
      }),
    });
    const description = propertyOf(contract, "body").description;

    expect(fieldOf(contract, "body").kind).toBe("html");
    expect(description).toContain(
      "At least 20 characters once turned into HTML, tags included. At most 500 characters once turned into HTML, tags included.",
    );
    expect(description).not.toContain("regular expression");
    expect(fieldOf(contract, "body").constraints.patterns).toEqual(["^<p>"]);
  });
});

describe("compileFillContract — property names", () => {
  it("makes keys safe and unique", () => {
    const long = "a".repeat(80);
    const contract = compileFillContract({
      entity: buildAiEntity({
        fields: {
          type: "object",
          properties: {
            "seo.title": { type: "string" },
            seo_title: { type: "string" },
            "€€": { type: "string" },
            [long]: { type: "string" },
            [`${long}b`]: { type: "string" },
          },
        },
      }),
    });
    const wires = contract.entity.fields.map((field) => [
      field.key,
      field.wire,
    ]);

    expect(wires).toEqual([
      ["seo.title", "seo_title"],
      ["seo_title", "seo_title_2"],
      ["€€", "field"],
      [long, "a".repeat(64)],
      [`${long}b`, `${"a".repeat(62)}_2`],
    ]);
    expect(Object.keys(valuesOf(contract).properties ?? {})).toEqual(
      wires.map(([, wire]) => wire),
    );
    expectPortable(contract.schema);
  });
});

// ─── Fill: evidence ──────────────────────────────────────────────────────────

describe("compileFillContract — evidence", () => {
  const entity = entityOf([
    { key: "title", type: "text" },
    { key: "seo.title", type: "text" },
  ] as Fields);

  it("asks for a quote per value, naming the fields by wire", () => {
    const contract = compileFillContract({ entity });
    const evidence = contract.schema.properties?.evidence;

    expect(contract.schema.required).toEqual(["values", "evidence"]);
    expect(evidence?.items?.properties?.field?.enum).toEqual([
      "title",
      "seo_title",
    ]);
    expect(evidence?.items?.required).toEqual(["field", "quote", "where"]);
  });

  it("leaves the quotes out when the entity turns them off", () => {
    const contract = compileFillContract({ entity, evidence: false });

    expect(contract.schema.required).toEqual(["values"]);
    expect(contract.schema.properties?.evidence).toBeUndefined();
    expect(contract.entity.evidence).toBe(false);
  });

  it("leaves them out, and says so, when there is nothing to fill", () => {
    const contract = compileFillContract({
      entity: entityOf([{ key: "cover", type: "media" }] as Fields),
    });

    expect(contract.schema.required).toEqual(["values"]);
    expect(contract.entity.evidence).toBe(false);
    expect(valuesOf(contract)).toEqual({
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    });
  });
});

// ─── Fill: limits every provider accepts ─────────────────────────────────────

describe("compileFillContract — limits every provider accepts", () => {
  it.each([
    ["a single choice of 249", 249, false, true],
    ["a single choice of 250", 250, false, false],
    ["a multiple choice of 250", 250, true, true],
    ["a multiple choice of 251", 251, true, false],
  ])(
    "keeps %s in the schema only when its enum fits 250",
    (_case, count, multiple, fits) => {
      const contract = compileFillContract({
        entity: entityOf([
          {
            key: "pick",
            type: "select",
            attrs: { multiple, options: choices(count, "c") },
          },
        ] as Fields),
      });

      expect(fieldOf(contract, "pick").choicesInSchema).toBe(fits);
      expect(propertyOf(contract, "pick").description).toContain(
        fits ? "(c 0)" : `(c ${count - 1})`,
      );
      expectPortable(contract.schema);
    },
  );

  it.each([
    [249, "choice"],
    [250, "search"],
  ])("asks for a relation with %i records as a %s", (count, mode) => {
    const contract = compileFillContract({
      entity: entityOf([
        { key: "city", type: "fks", attrs: { endpoint: "/api/cities/" } },
      ] as Fields),
      relationChoices: {
        city: Array.from({ length: count }, (_, index) => ({
          value: index + 1,
          label: `City ${index}`,
        })),
      },
    });

    expect(fieldOf(contract, "city").relationMode).toBe(mode);
    expectPortable(contract.schema);
  });

  it("keeps the whole schema within the enum budget, moving the smallest list that is enough", () => {
    const fields = [
      ["a", 200],
      ["b", 240],
      ["c", 210],
      ["d", 220],
      ["e", 230],
    ].map(([key, count]) => ({
      key,
      type: "select",
      attrs: { options: choices(Number(count), String(key)) },
    }));
    const contract = compileFillContract({
      entity: entityOf(fields as Fields),
    });

    // 1110 values: the evidence's 5 cannot close the gap, "a" (201) can,
    // and the evidence comes back once "a" is out.
    expect(
      contract.entity.fields.map((field) => field.choicesInSchema),
    ).toEqual([false, true, true, true, true]);
    expect(propertyOf(contract, "a").description).toContain('"a0" (a 0)');
    expect(evidenceFieldOf(contract.schema)?.enum).toHaveLength(5);
    expectPortable(contract.schema);
  });

  it("moves the names of the evidence before any list of values", () => {
    // 3 x 250 + 3 + 249 names = 1002: one switch would close the gap, but
    // the evidence goes first.
    const contract = compileFillContract({
      entity: modelOf([
        listField("a", 249),
        listField("b", 249),
        listField("c", 249),
        ...switches(1),
        ...textFields(245),
      ]),
    });

    expect(
      contract.entity.fields.filter((field) => field.choicesInSchema),
    ).toHaveLength(4);
    expect(evidenceFieldOf(contract.schema)?.enum).toBeUndefined();
    expect(evidenceFieldOf(contract.schema)?.description).toContain("a, b, c");
    expectPortable(contract.schema);
  });

  it("moves the smallest list that closes the gap on both measures", () => {
    // 3 x 250 + 100 + 60 x 3 = 1030: of the lists that cover 30, "d".
    expect(
      movedKeys([
        listField("a", 249),
        listField("b", 249),
        listField("c", 249),
        listField("d", 99),
        ...switches(60),
      ]),
    ).toEqual(["d"]);
  });

  it("picks the smallest closing list by its values, then its characters", () => {
    // 3 x 250 + 101 + 51 + 43 x 3 = 1031: "Y" has fewer values, "X" fewer characters.
    expect(
      movedKeys([
        listField("a", 249),
        listField("b", 249),
        listField("c", 249),
        listField("X", 100),
        listField("Y", 50, 20),
        ...switches(43),
      ]),
    ).toEqual(["Y"]);
  });

  it("counts the characters too when a list closes the gap", () => {
    // 1054 values and about 121,000 characters: "v" covers the values
    // alone, but only a list with enough characters closes both gaps.
    expect(
      movedKeys([
        listField("v", 110),
        listField("e", 150),
        listField("a", 249),
        listField("b", 249),
        listField("c", 249),
        listField("w", 20, 3000),
        listField("z", 20, 3000),
      ]),
    ).toEqual(["a", "w"]);
  });

  it("breaks a tie on values by the characters", () => {
    // 1040 values: "X" and "Y" both close the gap with 51 values; "Y" is shorter.
    expect(
      movedKeys([
        listField("a", 249),
        listField("b", 249),
        listField("c", 249),
        listField("d", 187),
        listField("X", 50, 30),
        listField("Y", 50, 10),
      ]),
    ).toEqual(["Y"]);
  });

  it("measures the largest list by its values when the values are over", () => {
    // 1287 values: "C" holds the most characters, the 250-value lists the most values.
    expect(
      movedKeys([
        listField("C", 5, 2000),
        listField("S", 30),
        ...["L", "M", "N", "O", "P"].map((key) => listField(key, 249)),
      ]),
    ).toEqual(["L", "M"]);
  });

  it("moves the largest list first when none closes the gap alone", () => {
    // 30 switches and 5 x 250 = 1340: no list covers 340.
    expect(
      movedKeys([
        ...switches(30),
        ...["a", "b", "c", "d", "e"].map((key) => listField(key, 249)),
      ]),
    ).toEqual(["a", "b"]);
  });

  it("measures the largest list by what is over", () => {
    // About 160,000 characters: "A" holds the most, the long lists the most values.
    const moved = movedKeys([
      listField("A", 10, 4000),
      listField("G", 5, 6000),
      ...["B", "C", "D", "E"].map((key) => listField(key, 200, 113)),
    ]);

    expect(moved).toEqual(["A", "G"]);
  });

  it("puts back the lists it no longer needs to move, the values' first", () => {
    // 1136 values and about 200,000 characters: "a" moves for the values,
    // "b" and "c" for the characters; then "a" fits again, and the
    // evidence, which would also fit alone, stays out.
    const contract = compileFillContract({
      entity: modelOf([
        listField("a", 249),
        listField("d", 249),
        listField("e", 249),
        listField("f", 229),
        { ...listField("b", 60, 1634), multiple: true },
        { ...listField("c", 60, 1634), multiple: true },
        ...textFields(30),
      ]),
    });

    expect(
      contract.entity.fields
        .filter((field) => field.kind === "choice" && !field.choicesInSchema)
        .map((field) => field.key),
    ).toEqual(["b", "c"]);
    expect(evidenceFieldOf(contract.schema)?.enum).toBeUndefined();
    expectPortable(contract.schema);
  });

  it.each([
    [250, true],
    [251, false],
  ])("lists the names of %i fields in the evidence: %s", (count, listed) => {
    const contract = compileFillContract({
      entity: modelOf(textFields(count)),
    });

    expect(!!evidenceFieldOf(contract.schema)?.enum).toBe(listed);
    expectPortable(contract.schema);
  });

  it("moves one switch, not a long list, when that is enough", () => {
    const selects = ["a", "b", "c"].map((key) => ({
      key,
      type: "select",
      attrs: { options: choices(249, key) },
    }));
    const switches = Array.from({ length: 84 }, (_, index) => ({
      key: `flag${index}`,
      type: "switch",
    }));
    const contract = compileFillContract({
      entity: entityOf([...selects, ...switches] as Fields),
      evidence: false,
    });
    const moved = contract.entity.fields.filter(
      (field) => !field.choicesInSchema,
    );

    expect(moved.map((field) => field.key)).toEqual(["flag0"]);
    expect(expectPortable(contract.schema).enumValues).toBe(999);
  });

  it("moves lists when their characters exceed the budget", () => {
    const fields = ["a", "b", "c", "d"].map((key) =>
      aiField(key, "choice", { choices: longValues(200, 200) }),
    );
    const contract = compileFillContract({ entity: modelOf(fields) });

    expect(
      contract.entity.fields.map((field) => field.choicesInSchema),
    ).toEqual([false, false, true, true]);
    expect(evidenceFieldOf(contract.schema)?.enum).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(expectPortable(contract.schema).characters).toBeLessThanOrEqual(
      100_000,
    );
  });

  it("counts the names the contract adds to the fields' own", () => {
    // 99,990 characters of values and a 10-character name fit alone; the
    // root's "values" takes the schema over 100,000.
    const values = longValues(249, 402) ?? [];
    const last = values[248];
    if (last) last.value = String(last.value).slice(0, 294);
    const contract = compileFillContract({
      entity: modelOf([aiField("long_field", "choice", { choices: values })]),
      evidence: false,
    });

    expect(fieldOf(contract, "long_field").choicesInSchema).toBe(false);
    expectPortable(contract.schema);
  });

  it("refuses a schema that is still too large with every list moved", () => {
    const longKeys = Array.from({ length: 1600 }, (_, index) =>
      aiField(`${index}`.padStart(64, "k")),
    );

    expect(() =>
      compileFillContract({
        entity: modelOf([...longKeys, listField("pick", 10)]),
      }),
    ).toThrow(
      /, 0 enum values \(at most 1000\), \d+ characters of names and values \(at most 100000\)/,
    );
    expect(() =>
      compileFillContract({ entity: modelOf(switches(4997)) }),
    ).toThrow(/^.*: 5002 properties \(at most 5000\), 0 enum values/);
    expect(() =>
      compileFillContract({ entity: modelOf(textFields(5000)) }),
    ).toThrow(/5005 properties \(at most 5000\)/);
    expect(
      compileFillContract({ entity: modelOf(textFields(4995)) }).schema,
    ).toBeDefined();
  });

  it("moves booleans out when they alone exceed the budget", () => {
    const fields = Array.from({ length: 400 }, (_, index) => ({
      key: `flag${index}`,
      type: "switch",
    }));
    const contract = compileFillContract({
      entity: entityOf(fields as Fields),
      evidence: false,
    });
    const listed = contract.entity.fields.filter(
      (field) => field.choicesInSchema,
    );

    // 1200 values: 67 switches out leave 999.
    expect(listed).toHaveLength(333);
    expect(propertyOf(contract, "flag0").enum).toBeUndefined();
    expect(propertyOf(contract, "flag0").description).toContain(
      '"true" or "false".',
    );
    expect(propertyOf(contract, "flag399").enum).toEqual(["", "true", "false"]);
    expectPortable(contract.schema);
  });

  it("names the fields of the evidence in its description when they are too many for one enum", () => {
    const fields = Array.from({ length: 300 }, (_, index) => ({
      key: `f${index}`,
      type: "text",
    }));
    const contract = compileFillContract({
      entity: entityOf(fields as Fields),
    });
    const field =
      contract.schema.properties?.evidence?.items?.properties?.field;

    expect(field?.enum).toBeUndefined();
    expect(field?.description).toContain("f0, f1, f2");
    expectPortable(contract.schema);
  });

  it("stays in the portable subset for every kind of field", () => {
    const contract = compileFillContract(
      {
        entity: entityOf([
          { key: "title", type: "text", required: true, translatable: true },
          { key: "body", type: "editor" },
          { key: "featured", type: "boolean" },
          { key: "status", type: "select", attrs: { options: ["a", "b"] } },
          {
            key: "tags",
            type: "select",
            attrs: { multiple: true, options: ["x"] },
          },
          { key: "place", type: "fks", attrs: { endpoint: "/api/places/" } },
          { key: "people", type: "m2m", attrs: { endpoint: "/api/people/" } },
        ] as Fields),
        relationChoices: { place: [{ value: 1, label: "Rome" }] },
      },
      { language: "it" },
    );

    expect(expectPortable(contract.schema).unions).toBe(0);
  });
});

describe("compileFillContract — the contract", () => {
  it("is plain JSON, with its version and task", () => {
    const contract = compileFillContract(
      {
        entity: entityOf([{ key: "title", type: "text" }] as Fields),
        label: "Event",
        description: "A public event.",
      },
      { language: "en" },
    );

    expect(contract).toMatchObject({
      version: AI_CONTRACT_FORMAT_VERSION,
      task: "fill",
      language: "en",
      entity: {
        label: "Event",
        description: "A public event.",
        evidence: true,
      },
    });
    expect(JSON.parse(JSON.stringify(contract))).toStrictEqual(contract);
  });
});

// ─── Extract ─────────────────────────────────────────────────────────────────

describe("compileExtractContract", () => {
  const event = {
    type: "event",
    label: "Event",
    endpoint: "/api/events/",
    entity: entityOf([
      { key: "title", type: "text", required: true },
      { key: "place", type: "fks", attrs: { endpoint: "/api/places/" } },
      { key: "speakers", type: "m2m", attrs: { endpoint: "/api/people/" } },
    ] as Fields),
  };
  const place = {
    type: "place",
    label: "Place",
    endpoint: "/api/places",
    entity: entityOf([{ key: "name", type: "text" }] as Fields),
  };

  it("asks for items of every type, each with its type, a ref, values and evidence", () => {
    const contract = compileExtractContract([event, place], {
      language: "it",
    });
    const [first, second] = itemsOf(contract);

    expect(itemsOf(contract)).toHaveLength(2);
    expect(first?.required).toEqual(["type", "ref", "values", "evidence"]);
    expect(first?.properties?.type).toEqual({
      type: "string",
      enum: ["event"],
    });
    expect(second?.properties?.type?.enum).toEqual(["place"]);
    expect(first?.properties?.ref?.description).toContain('such as "event-1"');
    expect(second?.properties?.ref?.description).toContain('such as "place-1"');
    expect(expectPortable(contract.schema).unions).toBe(1);
  });

  it("lets a relation point to another item when its endpoint is an entity of the contract", () => {
    const contract = compileExtractContract([event, place]);
    const placeValue = propertyOf(contract, "place");

    expect(fieldOf(contract, "place").linksTo).toBe("place");
    expect(placeValue).toMatchObject({
      type: "object",
      required: ["record", "item"],
      properties: { record: { type: "string" }, item: { type: "string" } },
    });
    expect(placeValue.properties?.record?.description).toBe(
      "The name of the record as the source writes it, for Mapo to search among the existing records; empty when the source gives no name.",
    );
    expect(placeValue.properties?.item?.description).toBe(
      'The ref of another item of this answer, of type "place", that describes the same record; empty when no item does.',
    );
    expect(placeValue.description).toContain(
      'A link to the related record of type "place": "record" finds an existing record, "item" points to an item of this answer that describes it. Give both when both apply: Mapo links the existing record when it finds one, otherwise the item.',
    );
    expect(placeValue.description).toContain(
      'Both "record" and "item" empty ("") when',
    );
    expect(fieldOf(contract, "speakers").linksTo).toBeUndefined();
    expect(propertyOf(contract, "speakers")).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
  });

  it("lets every link of a multiple relation point to a new item, even with listed records", () => {
    const tagged = {
      ...event,
      entity: entityOf([
        { key: "tags", type: "m2m", attrs: { endpoint: "/api/tags/" } },
      ] as Fields),
      relationChoices: {
        tags: [
          { value: 1, label: "News" },
          { value: 2, label: "Sport" },
        ],
      },
    };
    const tag = {
      type: "tag",
      endpoint: "/api/tags/",
      entity: entityOf([{ key: "name", type: "text" }] as Fields),
    };
    const contract = compileExtractContract([tagged, tag]);

    expect(propertyOf(contract, "tags")).toMatchObject({
      type: "array",
      items: {
        type: "object",
        required: ["record", "item"],
        properties: {
          record: {
            type: "string",
            enum: ["", "1", "2"],
            description:
              "The id of the record, from the list; empty when it is not listed.",
          },
        },
      },
    });
    expect(propertyOf(contract, "tags").description).toContain(
      'Links to the related records of type "tag", one per record the source names:',
    );
    expectPortable(contract.schema);
  });

  it.each([
    ["without the leading slash", "api/places/"],
    ["with a query string", "/api/places/?kind=venue"],
    ["as an absolute URL", "http://localhost:8000/api/places"],
    ["with a fragment", "/api/places#list"],
    ["with dot segments", "./api/v1/../places/"],
    ["with repeated slashes", "//api//places/"],
  ])("links a relation whose endpoint is written %s", (_case, endpoint) => {
    const contract = compileExtractContract([
      {
        type: "event",
        entity: entityOf([
          { key: "place", type: "fks", attrs: { endpoint } },
        ] as Fields),
      },
      place,
    ]);

    expect(fieldOf(contract, "place").linksTo).toBe("place");
  });

  describe("with entities on one collection, filtered", () => {
    const relation = (endpoint: string) => ({
      type: "event",
      entity: entityOf([
        { key: "related", type: "fks", attrs: { endpoint } },
      ] as Fields),
    });
    const filtered = (type: string, endpoint: string) => ({
      type,
      endpoint,
      entity: entityOf([{ key: "name", type: "text" }] as Fields),
    });
    const news = filtered("news", "/api/contents/?type=news");
    const article = filtered("article", "/api/contents/?type=article");

    it.each([
      [
        "the same filter",
        "/api/contents/?type=article",
        [news, article],
        "article",
      ],
      [
        "a filter, to the whole collection",
        "/api/places/?kind=venue",
        [filtered("place", "/api/places/")],
        "place",
      ],
      [
        "the whole collection, to the only filtered entity",
        "/api/places/",
        [filtered("city", "/api/places/?kind=city")],
        "city",
      ],
      [
        "another filter",
        "/api/places/?kind=venue",
        [filtered("city", "/api/places/?kind=city")],
        undefined,
      ],
      [
        "the whole collection, to two filtered entities",
        "/api/contents/",
        [news, article],
        undefined,
      ],
      [
        "every value of a repeated filter, in any order",
        "/api/places/?tag=b&tag=a",
        [
          filtered("both", "/api/places/?tag=a&tag=b"),
          filtered("one", "/api/places/?tag=b"),
        ],
        "both",
      ],
      [
        "an encoded filter as written",
        "/api/places/?a=1%26b%3D2",
        [
          filtered("one", "/api/places/?a=1%26b%3D2"),
          filtered("two", "/api/places/?a=1&b=2"),
        ],
        "one",
      ],
    ])("links %s", (_case, endpoint, targets, linksTo) => {
      const contract = compileExtractContract([relation(endpoint), ...targets]);

      expect(fieldOf(contract, "related").linksTo).toBe(linksTo);
      expectPortable(contract.schema);
    });
  });

  it.each([
    [249, "choice"],
    [250, "search"],
  ])(
    "links a multiple relation with %i listed records as a %s",
    (count, mode) => {
      const contract = compileExtractContract([
        {
          type: "event",
          entity: entityOf([
            { key: "places", type: "m2m", attrs: { endpoint: "/api/places/" } },
          ] as Fields),
          relationChoices: {
            places: Array.from({ length: count }, (_, index) => ({
              value: index + 1,
              label: `Place ${index}`,
            })),
          },
        },
        place,
      ]);

      expect(fieldOf(contract, "places").relationMode).toBe(mode);
      expect(fieldOf(contract, "places").linksTo).toBe("place");
      expectPortable(contract.schema);
    },
  );

  it("links a relation to its own entity", () => {
    const category = {
      type: "category",
      endpoint: "/api/categories/",
      entity: entityOf([
        { key: "name", type: "text" },
        {
          key: "parent",
          type: "fks",
          attrs: { endpoint: "/api/categories/" },
        },
      ] as Fields),
    };
    const contract = compileExtractContract([category]);

    expect(fieldOf(contract, "parent").linksTo).toBe("category");
    expectPortable(contract.schema);
  });

  it("uses no union with one entity", () => {
    const contract = compileExtractContract([place]);
    const items = contract.schema.properties?.items?.items;

    expect(items?.anyOf).toBeUndefined();
    expect(items?.properties?.type?.enum).toEqual(["place"]);
    expect(expectPortable(contract.schema).unions).toBe(0);
  });

  it("follows each entity's choice of evidence", () => {
    const contract = compileExtractContract([
      event,
      { ...place, evidence: false },
    ]);
    const [withQuotes, without] = itemsOf(contract);

    expect(withQuotes?.properties?.evidence).toBeDefined();
    expect(without?.properties?.evidence).toBeUndefined();
    expect(without?.required).toEqual(["type", "ref", "values"]);
  });

  it("keeps the budget across all its entities", () => {
    const listed = (type: string, count: number) => ({
      type,
      entity: entityOf([
        {
          key: "pick",
          type: "select",
          attrs: { options: choices(count, type) },
        },
      ] as Fields),
    });
    const contract = compileExtractContract([
      listed("a", 240),
      listed("b", 240),
      listed("c", 240),
      listed("d", 240),
      listed("e", 240),
    ]);

    expect(
      contract.entities.filter((entity) => entity.fields[0]?.choicesInSchema),
    ).toHaveLength(4);
    expectPortable(contract.schema);
  });

  it("counts the entity types in the budget", () => {
    // Four lists of 250 fill the budget alone; the four types go over it.
    const sources = ["a", "b", "c", "d"].map((type) => ({
      type,
      evidence: false,
      entity: modelOf([
        aiField("pick", "choice", {
          multiple: true,
          choices: choices(250, type).map(({ text, value }) => ({
            value,
            label: text,
          })),
        }),
      ]),
    }));
    const contract = compileExtractContract(sources);

    expect(
      contract.entities.filter((entity) => entity.fields[0]?.choicesInSchema),
    ).toHaveLength(3);
    expect(expectPortable(contract.schema).enumValues).toBe(754);
  });

  it("moves the evidence of one entity when the names of all go over the budget", () => {
    const sources = ["a", "b", "c", "d", "e"].map((type) => ({
      type,
      entity: modelOf(textFields(200, type)),
    }));
    const contract = compileExtractContract(sources);
    const listed = itemsOf(contract).filter(
      (item) => evidenceFieldOf(item)?.enum,
    );

    expect(listed).toHaveLength(4);
    expect(expectPortable(contract.schema).enumValues).toBe(805);
  });

  it("refuses more entity types than the budget holds", () => {
    const sources = Array.from({ length: 1001 }, (_, index) => ({
      type: `t${index}`,
      evidence: false,
      entity: modelOf([aiField("name")]),
    }));

    expect(() => compileExtractContract(sources)).toThrow(
      /1001 enum values \(at most 1000\)/,
    );
  });

  it.each([
    ["no entity", []],
    ["an entity without a type", [{ entity: place.entity }]],
    ["two entities with one type", [place, { ...place }]],
    [
      "two entities with one endpoint",
      [place, { ...place, type: "venue", endpoint: "/api/places/" }],
    ],
    [
      "two entities with one endpoint written two ways",
      [
        place,
        { ...place, type: "venue", endpoint: "http://host//api/./places/#top" },
      ],
    ],
    [
      "two entities with one filtered endpoint",
      [
        { ...place, endpoint: "/api/places/?kind=a&city=1" },
        { ...place, type: "venue", endpoint: "api/places?city=1&kind=a" },
      ],
    ],
  ])("refuses %s", (_case, sources) => {
    expect(() => compileExtractContract(sources)).toThrow();
  });

  it("is plain JSON", () => {
    const contract = compileExtractContract([event, place]);

    expect(JSON.parse(JSON.stringify(contract))).toStrictEqual(contract);
  });
});
