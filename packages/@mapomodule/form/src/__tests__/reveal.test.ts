import { describe, expect, it } from "vitest";

import { fieldAtPath, tabHoldsField } from "../runtime/utils/reveal";
import type { AnyFieldDescriptor } from "../runtime/types/index.js";
import type { TabEntry } from "../runtime/types/layout.js";

const fields: AnyFieldDescriptor[] = [
  { key: "title", type: "text", translatable: true },
  { key: "seo", type: "text" },
  { key: "seo.title", type: "text" },
  { key: "blocks", type: "repeater" },
];

describe("fieldAtPath", () => {
  it("finds the field a path names", () => {
    expect(fieldAtPath(fields, "seo", "")).toEqual({
      field: fields[1],
      rest: "",
    });
  });

  it("finds the field whose value holds the path, with the rest of it", () => {
    expect(fieldAtPath(fields, "blocks.2.author", "")).toEqual({
      field: fields[3],
      rest: "2.author",
    });
  });

  it("prefers the longest key, so a dotted key wins over its start", () => {
    expect(fieldAtPath(fields, "seo.title", "")?.field).toBe(fields[2]);
  });

  it("takes a translatable field's path in the language and its bare key", () => {
    const inItalian = fieldAtPath(fields, "translations.it.title", "it");
    const bare = fieldAtPath(fields, "title", "it");

    expect(inItalian).toEqual({ field: fields[0], rest: "" });
    expect(bare).toEqual({ field: fields[0], rest: "" });
  });

  it("finds nothing for another language's path, or a key that only starts the same", () => {
    expect(fieldAtPath(fields, "translations.en.title", "it")).toBeUndefined();
    expect(fieldAtPath(fields, "titles", "")).toBeUndefined();
    expect(fieldAtPath(fields, "blocksX.0", "")).toBeUndefined();
  });
});

describe("tabHoldsField", () => {
  const field = (key: string): AnyFieldDescriptor => ({ key, type: "text" });
  const tab = (
    name: string,
    groups: TabEntry["groups"],
    children: TabEntry[] = [],
  ): TabEntry => ({
    name,
    groups,
    children: new Map(children.map((child) => [child.name, child])),
  });
  const content = tab(
    "content",
    new Map([
      [
        "main",
        {
          fields: [field("title")],
          subtabs: new Map([["more", [field("subtitle")]]]),
        },
      ],
    ]),
    [
      tab(
        "advanced",
        new Map([
          ["__flat__", { fields: [field("canonical")], subtabs: new Map() }],
        ]),
      ),
    ],
  );

  it("finds a field in a group, in a group's sub-tab and in a child tab", () => {
    expect(tabHoldsField(content, "title")).toBe(true);
    expect(tabHoldsField(content, "subtitle")).toBe(true);
    expect(tabHoldsField(content, "canonical")).toBe(true);
  });

  it("does not find a field of another tab", () => {
    expect(tabHoldsField(content, "seo_title")).toBe(false);
  });
});
