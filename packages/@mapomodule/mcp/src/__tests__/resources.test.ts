import { describe, expect, it } from "vitest";
import {
  DOCS_URI_PREFIX,
  FIELD_URI_PREFIX,
  docResourceList,
  fieldResourceList,
  renderDocResource,
  renderFieldResource,
  renderKnowledgeIndex,
} from "../runtime/core/resources.js";
import { makeApi, makeContext } from "./fixtures.js";

const context = makeContext();

describe("renderKnowledgeIndex", () => {
  it("maps out recipes, pages and every extracted symbol", () => {
    const index = renderKnowledgeIndex(context.knowledge(), context.api());
    expect(index).toContain("## Recipes");
    expect(index).toContain("howto/crud-list.md");
    expect(index).toContain("MapoList, MapoDetail");
    expect(index).toContain("select, text");
    expect(index).toContain("useCrud");
  });
});

describe("renderDocResource", () => {
  it("returns the whole page", () => {
    const text = renderDocResource(context.knowledge(), "howto/crud-list.md")!;
    expect(text).toContain("# CRUD list view");
    expect(text).toContain("Bulk actions");
  });

  it("returns null for an unknown path", () => {
    expect(renderDocResource(context.knowledge(), "nope.md")).toBeNull();
  });
});

describe("renderFieldResource", () => {
  it("describes the contract of a field type", () => {
    const text = renderFieldResource(makeApi(), "select")!;
    expect(text).toContain("# Field type `select`");
    expect(text).toContain("component: NuiSelectMenu");
    expect(text).toContain("`items`: readonly string[] (required)");
    expect(text).toContain("## Shared descriptor properties");
  });

  it("returns null for an unregistered type", () => {
    expect(renderFieldResource(makeApi(), "nope")).toBeNull();
  });
});

describe("resource listings", () => {
  it("addresses every doc page under the docs prefix", () => {
    const resources = docResourceList(context.knowledge());
    expect(resources.length).toBeGreaterThan(0);
    for (const resource of resources) {
      expect(resource.uri.startsWith(DOCS_URI_PREFIX)).toBe(true);
      expect(resource.mimeType).toBe("text/markdown");
    }
  });

  it("addresses every field type under the fields prefix", () => {
    const resources = fieldResourceList(makeApi());
    expect(resources.map((resource) => resource.uri)).toEqual([
      `${FIELD_URI_PREFIX}select`,
      `${FIELD_URI_PREFIX}text`,
    ]);
  });
});
