import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  endpointsByModel,
  listModels,
  renderFields,
  resolveSchema,
  toFields,
  toScaffoldSpecs,
} from "../runtime/core/openapi.js";
import {
  SchemaUnavailableError,
  clearSchemaCache,
  loadOpenApiDocument,
} from "../runtime/core/schema-source.js";
import type { OpenApiDocument } from "../runtime/core/openapi.js";

const fixturePath = fileURLToPath(
  new URL("./fixtures/drf-schema.json", import.meta.url),
);
const doc = JSON.parse(readFileSync(fixturePath, "utf-8")) as OpenApiDocument;

/** The mapped field for one Article property. */
function field(key: string) {
  return toFields(doc, "Article", { includeReadOnly: true })!.fields.find(
    (entry) => entry.key === key,
  );
}

afterEach(() => clearSchemaCache());

describe("resolveSchema", () => {
  it("follows a $ref to its component", () => {
    const { schema, ref } = resolveSchema(doc, {
      $ref: "#/components/schemas/Tag",
    });
    expect(ref).toBe("Tag");
    expect(schema.properties?.label?.maxLength).toBe(40);
  });

  it("unwraps the allOf DRF emits for nullable relations, keeping siblings", () => {
    const { schema, ref } = resolveSchema(doc, {
      allOf: [{ $ref: "#/components/schemas/Author" }],
      nullable: true,
      readOnly: true,
    });

    expect(ref).toBe("Author");
    expect(schema.nullable).toBe(true);
    expect(schema.readOnly).toBe(true); // the sibling wins over the component
  });
});

describe("endpointsByModel", () => {
  it("finds collection endpoints, paginated or plain", () => {
    const endpoints = endpointsByModel(doc);

    expect(endpoints.get("Article")).toBe("/api/articles/"); // {count, results}
    expect(endpoints.get("Author")).toBe("/api/authors/"); // bare array
    expect(endpoints.get("Tag")).toBe("/api/tags/");
  });

  it("ignores detail routes", () => {
    // `/api/articles/{id}/` must not win over the collection route.
    expect(endpointsByModel(doc).get("Article")).not.toContain("{id}");
  });

  it("reports nothing for a component no route serves", () => {
    expect(endpointsByModel(doc).has("Editor")).toBe(false);
  });
});

describe("mapProperty", () => {
  it.each([
    ["title", "text"],
    ["body", "textarea"],
    ["summary", "textarea"],
    ["status", "select"],
    ["published_at", "datetime"],
    ["release_date", "date"],
    ["is_featured", "boolean"],
    ["priority", "number"],
    ["contact_email", "email"],
    ["canonical_url", "url"],
    ["cover", "file"],
    ["author", "fks"],
    ["tags", "m2m"],
  ])("maps %j to %j", (key, type) => {
    expect(field(key)?.type).toBe(type);
  });

  it("keeps the length limit of a short string and lengthens the rest", () => {
    expect(field("title")?.attrs).toEqual({ maxLength: 200 });
    expect(field("summary")?.type).toBe("textarea");
  });

  it("turns choices into select items with readable labels", () => {
    expect(field("status")?.attrs).toEqual({
      items: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
    });
  });

  it("prefers the schema title over the derived label", () => {
    expect(field("status")?.label).toBe("Publication status");
    expect(field("published_at")?.label).toBe("Published at");
  });

  it("carries numeric bounds", () => {
    expect(field("priority")?.attrs).toEqual({ min: 1, max: 10 });
  });

  it("resolves the endpoint of a relation from the paths section", () => {
    expect(field("author")?.attrs).toEqual({
      endpoint: "/api/authors/",
      itemValue: "id",
    });
    expect(field("tags")?.attrs).toEqual({
      endpoint: "/api/tags/",
      itemValue: "id",
    });
    expect(field("author")?.note).toBeUndefined();
  });

  it("says so when the endpoint could not be inferred", () => {
    const editor = field("editor")!;
    expect(editor.type).toBe("fks");
    expect(editor.note).toContain("no list endpoint");
  });

  it("flags an array of plain values instead of pretending it is a repeater", () => {
    expect(field("keywords")?.type).toBe("repeater");
    expect(field("keywords")?.note).toContain("review");
  });

  it("marks required and read-only from the schema", () => {
    expect(field("title")?.required).toBe(true);
    expect(field("body")?.required).toBeUndefined();
    expect(field("created_at")?.readonly).toBe(true);
  });
});

describe("toFields", () => {
  it("skips read-only properties by default and explains why", () => {
    const result = toFields(doc, "Article")!;

    expect(result.fields.map((entry) => entry.key)).not.toContain("id");
    expect(result.skipped.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(["id", "created_at"]),
    );
    expect(result.notes.join(" ")).toContain("includeReadOnly");
  });

  it("reports the model's own endpoint", () => {
    expect(toFields(doc, "Article")!.endpoint).toBe("/api/articles/");
  });

  it("never emits a type the app does not register", () => {
    const result = toFields(doc, "Article", {
      knownTypes: new Set(["text", "textarea", "select"]),
    })!;

    expect(
      result.fields.every((entry) =>
        ["text", "textarea", "select"].includes(entry.type),
      ),
    ).toBe(true);
    expect(
      result.skipped.find((entry) => entry.key === "tags")?.reason,
    ).toContain("m2m");
  });

  it("returns null for an unknown model", () => {
    expect(toFields(doc, "Nope")).toBeNull();
  });
});

describe("rendering", () => {
  it("emits descriptors as TypeScript, with the uncertainty as a comment", () => {
    const code = renderFields(toFields(doc, "Article")!);

    expect(code).toContain("const fields: FieldDescriptor<Article>[] = [");
    expect(code).toContain(
      '{ key: "title", type: "text", label: "Title", required: true',
    );
    expect(code).toContain("// no list endpoint found for Editor");
  });

  it("produces specs mapo_scaffold accepts", () => {
    const specs = toScaffoldSpecs(toFields(doc, "Article")!);
    expect(specs).toContain("title:text:Title");
    expect(specs).toContain("status:select:Publication status");
  });
});

describe("listModels", () => {
  it("lists components with their endpoint and size", () => {
    const models = listModels(doc);
    expect(models.map((model) => model.name)).toEqual([
      "Article",
      "Author",
      "Editor",
      "Tag",
    ]);
    expect(models[0]!.endpoint).toBe("/api/articles/");
    expect(models[0]!.fieldCount).toBeGreaterThan(10);
    expect(
      models.find((model) => model.name === "Editor")!.endpoint,
    ).toBeUndefined();
  });
});

describe("loadOpenApiDocument", () => {
  it("reads a local file", async () => {
    const loaded = await loadOpenApiDocument(fixturePath);
    expect(loaded.info?.title).toBe("Example CMS API");
  });

  it("reports a missing file", async () => {
    await expect(loadOpenApiDocument("/nope/schema.json")).rejects.toThrow(
      SchemaUnavailableError,
    );
  });

  it("recognises YAML and points at the JSON query param", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const path = join(
      mkdtempSync(join(tmpdir(), "mapo-schema-")),
      "schema.yaml",
    );
    writeFileSync(path, "openapi: 3.0.3\ninfo:\n  title: x\n");

    await expect(loadOpenApiDocument(path)).rejects.toThrow(/format=json/);
  });

  it("rejects a document without component schemas", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const path = join(
      mkdtempSync(join(tmpdir(), "mapo-schema-")),
      "empty.json",
    );
    writeFileSync(path, JSON.stringify({ openapi: "3.0.3", paths: {} }));

    await expect(loadOpenApiDocument(path)).rejects.toThrow(
      /components\.schemas/,
    );
  });
});
