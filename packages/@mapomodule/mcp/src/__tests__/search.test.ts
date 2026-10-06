import { describe, expect, it } from "vitest";
import {
  extractSnippet,
  getDoc,
  listDocs,
  searchDocs,
} from "../runtime/core/search.js";
import { CRUD_LIST_DOC, CUSTOM_FIELDS_DOC, makeKnowledge } from "./fixtures.js";

const knowledge = makeKnowledge({
  "howto/crud-list.md": CRUD_LIST_DOC,
  "uikit/form/custom-fields.md": CUSTOM_FIELDS_DOC,
});

describe("searchDocs", () => {
  it("ranks the section that actually answers the question first", () => {
    const [top] = searchDocs(
      knowledge,
      "how do I run bulk actions on selected rows",
    );
    expect(top?.path).toBe("howto/crud-list.md");
    expect(top?.heading).toBe("Bulk actions");
  });

  it("finds a page through an identifier mentioned in its body", () => {
    const [top] = searchDocs(knowledge, "defineFormField");
    expect(top?.path).toBe("uikit/form/custom-fields.md");
  });

  it("honours the section filter", () => {
    const hits = searchDocs(knowledge, "field registry", { section: "howto" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.section === "howto")).toBe(true);
  });

  it("honours the package filter, with or without the scope", () => {
    const scoped = searchDocs(knowledge, "field", { pkg: "@mapomodule/form" });
    const bare = searchDocs(knowledge, "field", { pkg: "form" });
    expect(scoped.map((hit) => hit.path)).toEqual(bare.map((hit) => hit.path));
    expect(bare.every((hit) => hit.path.startsWith("uikit/form/"))).toBe(true);
  });

  it("respects the limit and returns nothing for gibberish", () => {
    expect(searchDocs(knowledge, "field", { limit: 1 })).toHaveLength(1);
    expect(searchDocs(knowledge, "zzzqqq")).toEqual([]);
  });
});

describe("extractSnippet", () => {
  it("centres the excerpt on the matched term", () => {
    const text = `${"padding ".repeat(60)}NEEDLE${" trailing".repeat(60)}`;
    const snippet = extractSnippet(text, "needle");
    expect(snippet).toContain("NEEDLE");
    expect(snippet.length).toBeLessThan(text.length);
    expect(snippet.startsWith("…")).toBe(true);
  });

  it("falls back to the head of the text when nothing matches", () => {
    expect(extractSnippet("short body", "absent")).toBe("short body");
  });
});

describe("getDoc", () => {
  it("returns the whole page with its heading list", () => {
    const doc = getDoc(knowledge, "howto/crud-list.md")!;
    expect(doc.title).toBe("CRUD list view");
    expect(doc.headings).toContain("Bulk actions");
    expect(doc.content).toContain("MapoList");
    expect(doc.truncated).toBe(false);
  });

  it("returns a single section when asked, by heading or anchor", () => {
    const byHeading = getDoc(knowledge, "howto/crud-list.md", {
      heading: "Bulk actions",
    })!;
    const byAnchor = getDoc(knowledge, "howto/crud-list.md", {
      heading: "bulk-actions",
    })!;
    expect(byHeading.content).toBe(byAnchor.content);
    expect(byHeading.content).toContain("## Bulk actions");
    expect(byHeading.content).not.toContain("Minimal example");
  });

  it("tolerates a leading docs/ prefix and reports unknown pages", () => {
    expect(getDoc(knowledge, "docs/howto/crud-list.md")).not.toBeNull();
    expect(getDoc(knowledge, "nope.md")).toBeNull();
  });

  it("truncates beyond maxChars", () => {
    const doc = getDoc(knowledge, "howto/crud-list.md", { maxChars: 100 })!;
    expect(doc.truncated).toBe(true);
    expect(doc.content).toContain("[truncated]");
  });
});

describe("listDocs", () => {
  it("groups chunks back into pages", () => {
    const docs = listDocs(knowledge);
    expect(docs.map((doc) => doc.path)).toEqual([
      "howto/crud-list.md",
      "uikit/form/custom-fields.md",
    ]);
    expect(docs[0]!.headings).toContain("Quick edit");
  });
});
