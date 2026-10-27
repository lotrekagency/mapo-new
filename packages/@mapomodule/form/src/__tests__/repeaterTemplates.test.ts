import { describe, it, expect } from "vitest";
import {
  filterTemplates,
  normalizeTemplates,
  reachesMax,
  shouldUseModalPicker,
  wireframeShapes,
} from "../runtime/utils/repeaterTemplates.js";
import type { AnyFieldDescriptor } from "../runtime/types/descriptor.js";

const title: AnyFieldDescriptor = { key: "title", type: "text" };

describe("normalizeTemplates", () => {
  it("returns an empty list without templates", () => {
    expect(normalizeTemplates(undefined)).toEqual([]);
  });

  it("uses the key as label for a bare field array", () => {
    const [tpl] = normalizeTemplates({ cta: [title] });
    expect(tpl).toMatchObject({ key: "cta", label: "cta", fields: [title] });
    expect(tpl?.description).toBeUndefined();
  });

  it("keeps the metadata of a RepeaterTemplate", () => {
    const [tpl] = normalizeTemplates({
      hero: {
        label: "Hero",
        description: "Big headline",
        icon: "i-lucide-image",
        category: "Header",
        wireframe: true,
        fields: [title],
      },
    });
    expect(tpl).toMatchObject({
      key: "hero",
      label: "Hero",
      description: "Big headline",
      icon: "i-lucide-image",
      category: "Header",
      wireframe: true,
      fields: [title],
    });
  });

  it("tolerates a template object without fields", () => {
    expect(
      normalizeTemplates({ empty: { label: "Empty" } as never })[0]?.fields,
    ).toEqual([]);
  });
});

describe("shouldUseModalPicker", () => {
  it("never opens a modal without templates", () => {
    expect(shouldUseModalPicker("modal", 0)).toBe(false);
  });

  it("switches to the modal above 3 templates in auto mode", () => {
    expect(shouldUseModalPicker(undefined, 3)).toBe(false);
    expect(shouldUseModalPicker("auto", 4)).toBe(true);
  });

  it("honours an explicit mode", () => {
    expect(shouldUseModalPicker("select", 10)).toBe(false);
    expect(shouldUseModalPicker("modal", 1)).toBe(true);
  });
});

describe("filterTemplates", () => {
  const list = normalizeTemplates({
    hero: { label: "Hero", category: "Header", fields: [] },
    text: {
      label: "Rich text",
      description: "Paragraphs",
      category: "Content",
      fields: [],
    },
    cta: [title],
  });

  it("returns everything without filters", () => {
    expect(filterTemplates(list, "", "")).toHaveLength(3);
  });

  it("matches label and description, case-insensitively", () => {
    expect(filterTemplates(list, "HERO", "").map((t) => t.key)).toEqual([
      "hero",
    ]);
    expect(filterTemplates(list, "paragr", "").map((t) => t.key)).toEqual([
      "text",
    ]);
  });

  it("filters by category", () => {
    expect(filterTemplates(list, "", "Content").map((t) => t.key)).toEqual([
      "text",
    ]);
  });

  it("combines query and category", () => {
    expect(filterTemplates(list, "hero", "Content")).toEqual([]);
  });
});

describe("wireframeShapes", () => {
  it("maps field types to shapes and caps at 5", () => {
    const fields = [
      { key: "a", type: "text" },
      { key: "b", type: "textarea" },
      { key: "c", type: "media" },
      { key: "d", type: "boolean" },
      { key: "e", type: "editor" },
      { key: "f", type: "text" },
    ] as AnyFieldDescriptor[];
    expect(wireframeShapes(fields)).toEqual([
      "line",
      "lines",
      "box",
      "check",
      "lines",
    ]);
  });
});

describe("reachesMax", () => {
  it("is false without a limit", () => {
    expect(reachesMax(100, undefined)).toBe(false);
  });

  it("is true when the next item hits the limit", () => {
    expect(reachesMax(2, 3)).toBe(true);
    expect(reachesMax(1, 3)).toBe(false);
  });
});
