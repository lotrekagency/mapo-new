import { describe, expect, it } from "vitest";
import { matchRecipes, RECIPES } from "../runtime/core/recipes.js";

describe("recipe table", () => {
  it("has unique ids and non-empty metadata", () => {
    const ids = RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const recipe of RECIPES) {
      expect(recipe.doc.endsWith(".md")).toBe(true);
      expect(recipe.keywords.length).toBeGreaterThan(2);
      expect(recipe.summary.length).toBeGreaterThan(20);
    }
  });
});

describe("matchRecipes", () => {
  it.each([
    ["register a custom form field component", "custom-field"],
    ["how do I paginate a list of articles with filters", "crud-list"],
    ["let editors reorder the navigation entries", "menu-manager"],
    ["port a v1 project to v2", "migration"],
    ["protect the dashboard route with permissions", "auth-permissions"],
  ])("maps %j to the %j recipe", (query, expectedId) => {
    expect(matchRecipes(query)[0]?.id).toBe(expectedId);
  });

  it("surfaces both plausible recipes for an ambiguous request", () => {
    // "upload an image" points at media, "in a form" at field types: show both.
    const ids = matchRecipes("upload an image and pick it in a form").map(
      (recipe) => recipe.id,
    );
    expect(ids).toContain("media-manager");
    expect(ids.length).toBeGreaterThan(1);
  });

  it("stays silent when the query is unrelated", () => {
    expect(matchRecipes("what is the weather today")).toEqual([]);
  });

  it("caps the number of matches", () => {
    expect(matchRecipes("form field list page", 1)).toHaveLength(1);
  });
});
