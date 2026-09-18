import { describe, expect, it } from "vitest";
import {
  buildIndex,
  chunkMarkdown,
  extractTags,
  slugify,
  splitSections,
} from "../runtime/core/indexer.js";
import { stem, tokenize } from "../runtime/core/tokenize.js";
import { CRUD_LIST_DOC } from "./fixtures.js";

describe("tokenize", () => {
  it("splits identifiers into their sub-words", () => {
    expect(tokenize("MapoListFilters")).toEqual([
      "mapolistfilter",
      "mapo",
      "list",
      "filter",
    ]);
  });

  it("drops stopwords and de-pluralises", () => {
    expect(tokenize("how do I add the fields")).toEqual(["add", "field"]);
  });

  it("leaves short and -ss words alone", () => {
    expect(stem("css")).toBe("css");
    expect(stem("has")).toBe("has");
  });
});

describe("splitSections", () => {
  it("extracts the title and one section per H2", () => {
    const { title, sections } = splitSections(CRUD_LIST_DOC);
    expect(title).toBe("CRUD list view");
    expect(sections.map((section) => section.heading)).toEqual([
      "CRUD list view",
      "Minimal example",
      "Bulk actions",
      "Quick edit",
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const { sections } = splitSections(
      "# T\n\n## Real\n\n```md\n## Fake\n```\n",
    );
    expect(sections.map((section) => section.heading)).toEqual(["Real"]);
  });
});

describe("chunkMarkdown", () => {
  const chunks = chunkMarkdown("howto/crud-list.md", CRUD_LIST_DOC);

  it("carries path metadata on every chunk", () => {
    expect(chunks.every((chunk) => chunk.path === "howto/crud-list.md")).toBe(
      true,
    );
    expect(chunks[0]!.section).toBe("howto");
    expect(chunks[0]!.title).toBe("CRUD list view");
  });

  it("anchors sections like VitePress", () => {
    const bulk = chunks.find((chunk) => chunk.heading === "Bulk actions");
    expect(bulk?.anchor).toBe("bulk-actions");
    expect(bulk?.id).toBe("howto/crud-list.md#bulk-actions");
  });

  it("maps nested paths to their package", () => {
    const [chunk] = chunkMarkdown(
      "uikit/form/validation.md",
      "# V\n\n## A\n\ntext\n",
    );
    expect(chunk?.pkg).toBe("@mapomodule/form");
    expect(chunk?.group).toBe("form");
  });
});

describe("extractTags", () => {
  it("picks up components, composables and field types", () => {
    const tags = extractTags('Use <MapoList> with useCrud and type: "editor"');
    expect(tags).toContain("MapoList");
    expect(tags).toContain("useCrud");
    expect(tags).toContain("editor");
  });
});

describe("buildIndex", () => {
  const chunks = chunkMarkdown("howto/crud-list.md", CRUD_LIST_DOC);
  const index = buildIndex(chunks);

  it("indexes every chunk", () => {
    expect(index.total).toBe(chunks.length);
    expect(index.lengths).toHaveLength(chunks.length);
    expect(index.avgLength).toBeGreaterThan(0);
  });

  it("boosts heading terms above body terms", () => {
    const bulkIndex = chunks.findIndex(
      (chunk) => chunk.heading === "Bulk actions",
    );
    const posting = index.terms["bulk"]!.find(
      ([chunkIndex]) => chunkIndex === bulkIndex,
    )!;
    expect(posting[1]).toBeGreaterThan(1);
  });
});

describe("slugify", () => {
  it("matches GitHub/VitePress anchors", () => {
    expect(slugify("Bulk actions")).toBe("bulk-actions");
    expect(slugify("`useCrud()` options")).toBe("usecrud-options");
  });
});
