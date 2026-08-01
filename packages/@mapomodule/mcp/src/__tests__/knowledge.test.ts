/**
 * Regression tests against the real generated knowledge base.
 * Skipped when the package has not been built yet (`pnpm build`).
 */
import { describe, expect, it } from "vitest";
import {
  loadApiKnowledge,
  loadDocsKnowledge,
  resolveKnowledgeDir,
} from "../runtime/core/knowledge.js";
import { RECIPES } from "../runtime/core/recipes.js";
import { getDoc, searchDocs } from "../runtime/core/search.js";

const knowledgeDir = resolveKnowledgeDir(import.meta.url);
const describeBuilt = knowledgeDir ? describe : describe.skip;

describeBuilt("generated knowledge base", () => {
  const knowledge = loadDocsKnowledge(knowledgeDir);

  it("indexes the real docs tree", () => {
    const paths = new Set(knowledge.chunks.map((chunk) => chunk.path));
    expect(paths.has("howto/crud-list.md")).toBe(true);
    expect(paths.has("uikit/form/custom-fields.md")).toBe(true);
    expect(knowledge.chunks.length).toBeGreaterThan(100);
  });

  it("excludes internal planning docs", () => {
    const roadmap = knowledge.chunks.filter((chunk) =>
      chunk.path.startsWith("roadmap/"),
    );
    expect(roadmap).toEqual([]);
  });

  it.each([
    ["how do I build a paginated list of articles", "howto/crud-list.md"],
    ["add a new field type to the registry", "uikit/form/registry.md"],
    ["translate the admin interface", "howto/i18n.md"],
    ["protect a page with permissions", "howto/auth-permissions.md"],
    ["show a toast notification", "howto/feedback.md"],
    ["connect a django backend", "howto/backend-integration.md"],
  ])("ranks %j near the top of the results", (query, expectedPath) => {
    const hits = searchDocs(knowledge, query, { limit: 3 });
    expect(hits.map((hit) => hit.path)).toContain(expectedPath);
  });

  it("keeps every curated recipe pointing at a real page and section", () => {
    const pages = new Map(
      knowledge.chunks.map((chunk) => [chunk.path, new Set<string>()] as const),
    );
    for (const chunk of knowledge.chunks)
      pages.get(chunk.path)!.add(chunk.heading);

    for (const recipe of RECIPES) {
      expect(
        pages.has(recipe.doc),
        `recipe "${recipe.id}" → missing doc ${recipe.doc}`,
      ).toBe(true);
      if (recipe.heading) {
        expect(
          [...pages.get(recipe.doc)!],
          `recipe "${recipe.id}" → missing heading in ${recipe.doc}`,
        ).toContain(recipe.heading);
      }
      for (const related of recipe.seeAlso ?? []) {
        expect(
          pages.has(related),
          `recipe "${recipe.id}" → missing seeAlso ${related}`,
        ).toBe(true);
      }
    }
  });

  it("reads a real page back", () => {
    const doc = getDoc(knowledge, "howto/crud-list.md")!;
    expect(doc.title).toBeTruthy();
    expect(doc.content).toContain("MapoList");
  });
});

describeBuilt("generated API surface", () => {
  const api = loadApiKnowledge(knowledgeDir);

  it("extracts the Mapo components from source", () => {
    const names = api.components.map((component) => component.name);
    expect(names).toContain("MapoList");
    expect(names).toContain("MapoDetail");
    expect(names).toContain("MapoForm");
    expect(api.components.length).toBeGreaterThan(30);
  });

  it("reports real prop types and JSDoc, not documentation prose", () => {
    const list = api.components.find(
      (component) => component.name === "MapoList",
    )!;
    const endpoint = list.props.find((prop) => prop.name === "endpoint")!;

    expect(endpoint.type).toContain("string");
    expect(list.props.length).toBeGreaterThan(10);
    expect(list.props.some((prop) => prop.description)).toBe(true);
    expect(list.slots.length).toBeGreaterThan(0);
  });

  it("covers every field type of the registry, with its component", () => {
    const types = api.fieldTypes.map((field) => field.type);
    for (const expected of [
      "text",
      "select",
      "editor",
      "repeater",
      "fks",
      "date",
    ]) {
      expect(types).toContain(expected);
    }

    const select = api.fieldTypes.find((field) => field.type === "select")!;
    expect(select.component).toBeTruthy();
    expect(select.attrs.map((attr) => attr.name)).toContain("items");
  });

  it("keeps descriptor types readable instead of expanding mapped types", () => {
    const key = api.fieldCommon.find((member) => member.name === "key")!;
    expect(key.type).toBe("DeepKeyOf<T>");
  });

  it("lists the auto-imported composables with their signatures", () => {
    const names = api.composables.map((composable) => composable.name);
    expect(names).toContain("useCrud");
    expect(names).toContain("useMapoAuth");

    const crud = api.composables.find(
      (composable) => composable.name === "useCrud",
    )!;
    expect(crud.pkg).toBe("@mapomodule/core");
    expect(crud.signature).toContain("endpoint");
  });
});
