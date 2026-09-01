import { describe, expect, it } from "vitest";

import type { AnyFieldDescriptor } from "../runtime/types/index.js";
import { useFormFromSchema } from "../runtime/composables/useFormFromSchema";
import articleSchema from "./article.schema.json";

// Captured from camomilla: FormAutoSchema().map_serializer(ArticleSerializer()).
// This is the contract between the two repos — if camomilla changes the shape,
// this fails here rather than as an empty form in someone's browser.
describe("camomilla OPTIONS schema -> mapo descriptors", () => {
  const fields = useFormFromSchema(articleSchema as never);
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  // `attrs` is not on every member of the AnyFieldDescriptor union.
  const attrsOf = (f: AnyFieldDescriptor | undefined) =>
    (f as { attrs?: Record<string, unknown> } | undefined)?.attrs;

  it("produces a descriptor per field, not an empty array", () => {
    expect(fields.length).toBeGreaterThan(20);
  });

  it("maps m2m relations with a usable endpoint", () => {
    expect(byKey.tags.type).toBe("m2m");
    expect(attrsOf(byKey.tags)?.endpoint).toBe("/api/camomilla/tags/");
    expect(attrsOf(byKey.tags)?.multiple).toBe(true);
  });

  it("maps fk relations with a usable endpoint", () => {
    expect(byKey.author.type).toBe("fks");
    expect(attrsOf(byKey.author)?.endpoint).toBe("/api/camomilla/users/");
  });

  it("does not leave any relation with an empty endpoint", () => {
    // An empty endpoint is the silent failure: MapoFksField rewrites "" to "/",
    // fetches the API root, and swallows the error as an empty picker.
    const relations = fields.filter(
      (f) => f.type === "fks" || f.type === "m2m",
    );
    expect(relations.length).toBeGreaterThan(0);
    for (const rel of relations) expect(attrsOf(rel)?.endpoint).toBeTruthy();
  });

  it("marks server-computed fields readonly rather than dropping them", () => {
    // Without this they rendered as ordinary inputs and the backend discarded
    // whatever was typed, with nothing to notice.
    expect(byKey.id.readonly).toBe(true);
    expect(byKey.status.readonly).toBe(true);
    expect(byKey.date_created.readonly).toBe(true);
    // An editable field must NOT be flagged.
    expect(byKey.title.readonly).toBeUndefined();
  });

  it("respects the multiline hint for unbounded text", () => {
    // A Django TextField has no maxLength, so the >255 heuristic never fires.
    expect(byKey.content.type).toBe("textarea");
    expect(byKey.description.type).toBe("textarea");
  });

  it("carries labels", () => {
    expect(byKey.title.label).toBe("Title");
  });

  it("types scalars correctly", () => {
    expect(byKey.title.type).toBe("text");
    expect(byKey.published_at.type).toBe("datetime");
  });

  it("has no translations envelope and no localized twins", () => {
    expect(byKey.translations).toBeUndefined();
    expect(fields.filter((f) => /_(it|en)$/.test(String(f.key)))).toHaveLength(
      0,
    );
  });
});
