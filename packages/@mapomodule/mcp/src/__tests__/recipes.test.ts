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
    ["how do the packages fit together", "concepts"],
    ["show a field only when another field is checked", "conditional-fields"],
    ["autosave a draft while the user edits", "form-draft"],
    ["generate the fields from a json schema", "schema-to-form"],
    ["describe my form as a json schema", "form-to-schema"],
    ["read the DRF OPTIONS metadata into form fields", "schema-sources"],
    ["add a button to every detail page", "detail-extensions"],
    [
      "read the current record from a component inside the detail",
      "detail-context",
    ],
    [
      "add a typed property of my own to every field descriptor",
      "descriptor-extensions",
    ],
    ["put a hint below one form field with a slot", "form-slots"],
    ["edit a repeater item fullscreen", "focus-mode"],
    ["mark a field as suggested by AI", "field-annotations"],
    ["show which fields were filled by the assistant", "field-annotations"],
    ["read the annotation of a field in my custom field", "field-annotations"],
    ["let editors choose a content block from a block picker", "block-editor"],
    ["add my page to the sidebar with an icon", "sidebar-navigation"],
    ["how to reorder sidebar/menu entries", "sidebar-navigation"],
    ["change the branding of the login page", "login-page"],
    ["TS2307 cannot find module mapomodule/types", "imports"],
    ["connect claude code or copilot through mcp", "ai-assistant"],
    ["set up the camomilla session cookie", "camomilla"],
    ["ask the AI to fill a form from a pasted text", "ai-fill"],
    ["fill the detail form with values the AI verified", "ai-fill"],
    ["use magic fill on a detail page", "ai-fill"],
    ["apply the values the AI proposed to the form", "ai-fill"],
    ["call the AI gateway's run route to extract records", "ai-run"],
    ["read the outcome of each field from the run route", "ai-run"],
    ["register my own LLM provider for the AI gateway", "ai-providers"],
    ["use a local model with ollama for the AI", "ai-local-models"],
    ["connect the AI gateway to LM Studio or vLLM", "ai-local-models"],
    ["use claude models from anthropic for the AI", "ai-cloud-models"],
    ["set the openai api key for the AI gateway", "ai-cloud-models"],
    ["turn on the prompt cache of the AI provider", "ai-cloud-models"],
    ["raise the reasoning effort of the AI provider", "ai-cloud-models"],
    ["set the api key of the ollama server", "ai-local-models"],
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
