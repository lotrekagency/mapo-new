import { describe, expect, it } from "vitest";
import {
  humanise,
  parseFields,
  UnknownFieldTypeError,
} from "../runtime/core/scaffold/fields.js";
import { SCAFFOLD_KINDS, scaffold } from "../runtime/core/scaffold/index.js";
import { makeApi } from "./fixtures.js";

const api = makeApi();

describe("field specs", () => {
  it("parses key, type and label", () => {
    expect(parseFields(["title:text:Article title"])).toEqual([
      { key: "title", type: "text", label: "Article title" },
    ]);
  });

  it("defaults the type to text and derives a readable label", () => {
    expect(parseFields(["published_at"])).toEqual([
      { key: "published_at", type: "text", label: "Published at" },
    ]);
  });

  it("rejects a type the registry does not know", () => {
    expect(() => parseFields(["title:wysiwyg"], api)).toThrow(
      UnknownFieldTypeError,
    );
    try {
      parseFields(["title:wysiwyg"], api);
    } catch (error) {
      // The message must let the caller recover on its own.
      expect((error as Error).message).toContain("select, text");
      expect((error as Error).message).toContain("defineFormField");
    }
  });

  it("humanises identifiers", () => {
    expect(humanise("is_featured")).toBe("Is featured");
    expect(humanise("coverImage")).toBe("Cover image");
  });
});

describe("scaffold", () => {
  it("covers every advertised kind", () => {
    for (const kind of SCAFFOLD_KINDS) {
      const result = scaffold({ kind, name: "articles", api });
      expect(result.files.length, kind).toBeGreaterThan(0);
      expect(result.docs.length, kind).toBeGreaterThan(0);
      for (const file of result.files) {
        expect(file.content.length, `${kind} → ${file.path}`).toBeGreaterThan(
          50,
        );
        expect(file.path.startsWith("/"), `${kind} → ${file.path}`).toBe(false);
      }
    }
  });

  it("derives model, route and endpoint from the resource name", () => {
    const [file] = scaffold({ kind: "list-page", name: "articles", api }).files;

    expect(file!.path).toBe("app/pages/articles/index.vue");
    expect(file!.content).toContain("interface Article {");
    expect(file!.content).toContain('endpoint="/api/articles"');
    expect(file!.content).toContain('detail-base="/articles"');
  });

  it.each([
    ["categories", "Category"],
    ["boxes", "Box"],
    ["articles", "Article"],
    // Irregular plurals are left alone rather than guessed at.
    ["media", "Media"],
    ["star-rating", "StarRating"],
  ])("singularises %j into %j", (name, model) => {
    const result = scaffold({ kind: "detail-page", name, api });
    expect(result.files[0]!.content).toContain(`interface ${model} {`);
  });

  it("honours explicit endpoint and route", () => {
    const [file] = scaffold({
      kind: "list-page",
      name: "articles",
      endpoint: "/api/cms/posts",
      route: "/content/posts",
      api,
    }).files;

    expect(file!.path).toBe("app/pages/content/posts/index.vue");
    expect(file!.content).toContain('endpoint="/api/cms/posts"');
  });

  it("emits descriptors with the requested types and a typed model", () => {
    const [file] = scaffold({
      kind: "detail-page",
      name: "articles",
      fields: ["title:text:Title", "featured:select:Featured"],
      api,
    }).files;

    expect(file!.content).toContain('key: "title"');
    expect(file!.content).toContain('type: "select"');
    expect(file!.content).toContain("title: string;");
    // `select` declares a required `items` attr: the skeleton must show it.
    expect(file!.content).toContain("attrs: { items: undefined /* TODO */ }");
  });

  it("generates both the component and its registration for a custom field", () => {
    const result = scaffold({ kind: "custom-field", name: "star-rating", api });

    expect(result.files.map((file) => file.path)).toEqual([
      "app/components/StarRatingField.vue",
      "app/plugins/star-rating-field.ts",
    ]);
    expect(result.files[1]!.content).toContain('defineFormField("star-rating"');
    expect(result.notes.join(" ")).toContain("mapo_inspect_app");
  });

  it("keeps the login page out of the admin layout", () => {
    const [file] = scaffold({ kind: "login-page", api }).files;

    expect(file!.path).toBe("app/pages/login.vue");
    expect(file!.content).toContain("layout: false");
    expect(file!.content).toContain("<MapoLogin />");
  });

  it("imports types from the aggregate package a consumer installs", () => {
    for (const kind of [
      "list-page",
      "detail-page",
      "standalone-form",
    ] as const) {
      const content = scaffold({ kind, name: "articles", api }).files[0]!
        .content;
      expect(content, kind).toContain('from "mapomodule/types"');
    }
  });

  it("puts every page behind the auth middleware and the admin layout", () => {
    for (const kind of [
      "list-page",
      "detail-page",
      "standalone-form",
      "menu-page",
      "media-page",
    ] as const) {
      const content = scaffold({ kind, name: "articles", api }).files[0]!
        .content;
      expect(content, kind).toContain('layout: "mapo-default"');
      expect(content, kind).toContain('middleware: ["auth"]');
    }
  });
});
