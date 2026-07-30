import { describe, expect, it } from "vitest";
import {
  docsTools,
  getDocTool,
  searchDocsTool,
} from "../runtime/core/tools/docs.js";
import type { MapoToolContext } from "../runtime/core/tool-spec.js";
import { CRUD_LIST_DOC, CUSTOM_FIELDS_DOC, makeKnowledge } from "./fixtures.js";

const context: MapoToolContext = {
  knowledge: () =>
    makeKnowledge({
      "howto/crud-list.md": CRUD_LIST_DOC,
      "uikit/form/custom-fields.md": CUSTOM_FIELDS_DOC,
    }),
};

describe("tool specs", () => {
  it("namespaces every tool and declares read-only annotations", () => {
    for (const tool of docsTools) {
      expect(tool.name.startsWith("mapo_")).toBe(true);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it("exposes input examples that satisfy the declared schema", () => {
    for (const tool of docsTools) {
      for (const example of tool.inputExamples ?? []) {
        for (const key of Object.keys(example)) {
          expect(Object.keys(tool.inputSchema)).toContain(key);
        }
      }
    }
  });
});

describe("mapo_search_docs", () => {
  it("returns paths and anchors the agent can feed to mapo_get_doc", async () => {
    const output = await searchDocsTool.run(
      { query: "bulk actions", limit: 2 },
      context,
    );
    expect(output).toContain("howto/crud-list.md");
    expect(output).toContain("#bulk-actions");
    expect(output).toContain("mapo_get_doc");
  });

  it("explains the miss instead of returning an empty result", async () => {
    const output = await searchDocsTool.run({ query: "zzzqqq" }, context);
    expect(output).toContain("No documentation section matched");
  });
});

describe("mapo_get_doc", () => {
  it("returns the section plus the page's heading list", async () => {
    const output = await getDocTool.run(
      { path: "howto/crud-list.md", heading: "Minimal example" },
      context,
    );
    expect(output).toContain("source: `howto/crud-list.md`");
    expect(output).toContain("MapoList");
    expect(output).toContain("Bulk actions");
  });

  it("points back to search when the path is wrong", async () => {
    const output = await getDocTool.run({ path: "nope.md" }, context);
    expect(output).toContain("mapo_search_docs");
  });
});
