import { describe, it, expect } from "vitest";
import {
  annotationFor,
  entriesUnder,
  tabAnnotationGroups,
  valuePath,
} from "../runtime/utils/annotations.js";
import type {
  AnyFieldDescriptor,
  FieldAnnotation,
  FieldAnnotations,
} from "../runtime/types/index.js";
import type { TabEntry } from "../runtime/types/layout.js";

const ai: FieldAnnotation = {
  label: "Suggested by AI",
  icon: "i-lucide-sparkles",
  color: "info",
};
const toCheck: FieldAnnotation = { ...ai, label: "To check", color: "warning" };
const note: FieldAnnotation = { label: "Note" };

/** A tab with one flat group of fields, plus optional sub-tabs and child tabs. */
function tabOf(
  fields: AnyFieldDescriptor[],
  extra: {
    subtabs?: Record<string, AnyFieldDescriptor[]>;
    children?: TabEntry[];
  } = {},
): TabEntry {
  return {
    name: "content",
    groups: new Map([
      [
        "__flat__",
        { fields, subtabs: new Map(Object.entries(extra.subtabs ?? {})) },
      ],
    ]),
    children: new Map((extra.children ?? []).map((tab) => [tab.name, tab])),
  };
}

/** How many marks the badges of a tab count, all groups together. */
const countOf = (
  tab: TabEntry,
  annotations: FieldAnnotations,
  model: Record<string, unknown> = {},
  lang = "",
) =>
  tabAnnotationGroups(tab, annotations, model, lang).reduce(
    (sum, group) => sum + group.count,
    0,
  );

describe("valuePath", () => {
  it("is the key of a field", () => {
    expect(valuePath({ key: "title", type: "text" }, "it")).toBe("title");
  });

  it("is the translation in the current language for a translatable field", () => {
    const field: AnyFieldDescriptor = {
      key: "title",
      type: "text",
      translatable: true,
    };
    expect(valuePath(field, "it")).toBe("translations.it.title");
    expect(valuePath(field, "")).toBe("title");
  });
});

describe("annotationFor", () => {
  it("finds the annotation at the path of the value", () => {
    expect(annotationFor({ title: ai }, "title", "title")).toBe(ai);
  });

  it("prefers the current language, then the bare key of a translatable field", () => {
    const annotations = { "translations.it.title": toCheck, title: ai };
    expect(annotationFor(annotations, "title", "translations.it.title")).toBe(
      toCheck,
    );
    expect(annotationFor({ title: ai }, "title", "translations.it.title")).toBe(
      ai,
    );
  });

  it("finds nothing for a field without annotations", () => {
    expect(annotationFor({ slug: ai }, "title", "title")).toBeUndefined();
  });
});

describe("entriesUnder", () => {
  it("keeps the entries under the prefix, keyed relative to it", () => {
    const record = {
      "blocks.0.title": ai,
      "blocks.1.title": note,
      "blocks.0": toCheck,
      title: note,
    };
    expect(entriesUnder(record, "blocks.0")).toEqual({ title: ai });
  });
});

describe("tabAnnotationGroups", () => {
  it("groups the annotations of a tab by icon and color", () => {
    const tab = tabOf([
      { key: "title", type: "text" },
      { key: "summary", type: "textarea" },
      { key: "slug", type: "text" },
      { key: "body", type: "editor" },
    ]);
    const annotations = { title: ai, summary: ai, slug: toCheck, body: note };

    expect(tabAnnotationGroups(tab, annotations, {}, "")).toEqual([
      {
        icon: "i-lucide-sparkles",
        color: "info",
        count: 2,
        labels: [ai.label],
      },
      {
        icon: "i-lucide-sparkles",
        color: "warning",
        count: 1,
        labels: [toCheck.label],
      },
      { icon: "i-lucide-info", color: "neutral", count: 1, labels: ["Note"] },
    ]);
  });

  it("counts the marks in sub-tabs and child tabs", () => {
    const tab = tabOf([{ key: "title", type: "text" }], {
      subtabs: { seo: [{ key: "seo_title", type: "text" }] },
      children: [tabOf([{ key: "author", type: "text" }])],
    });
    const annotations = { title: ai, seo_title: ai, author: ai };

    expect(countOf(tab, annotations)).toBe(3);
  });

  it("counts the marks of the items a repeater renders, as they render", () => {
    const blocks: AnyFieldDescriptor = {
      key: "blocks",
      type: "repeater",
      fields: [
        { key: "title", type: "text" },
        { key: "note", type: "text", show: ({ model }) => !!model.withNote },
      ],
    };
    const model = { blocks: [{ title: "A" }, { title: "B", withNote: true }] };
    const annotations = {
      "blocks.0.title": ai,
      "blocks.1.title": ai,
      "blocks.0.note": ai, // hidden in the first item
      "blocks.1.note": ai,
      "blocks.9.title": ai, // no such item
    };

    expect(countOf(tabOf([blocks]), annotations, model)).toBe(3);
  });

  it("counts a translatable field in the current language, inside items too", () => {
    const blocks: AnyFieldDescriptor = {
      key: "blocks",
      type: "repeater",
      fields: [{ key: "title", type: "text", translatable: true }],
    };
    const tab = tabOf([
      { key: "title", type: "text", translatable: true },
      blocks,
    ]);
    const annotations = {
      "translations.it.title": ai,
      "translations.en.title": ai,
      "blocks.0.translations.it.title": ai,
      "blocks.1.translations.en.title": ai,
    };

    expect(countOf(tab, annotations, { blocks: [{}, {}] }, "it")).toBe(2);
    expect(countOf(tab, annotations, { blocks: [{}, {}] }, "fr")).toBe(0);
  });

  it("finds the items of a translatable repeater under its key, as the repeater does", () => {
    const blocks: AnyFieldDescriptor = {
      key: "blocks",
      type: "repeater",
      translatable: true,
      fields: [{ key: "title", type: "text" }],
    };
    const model = { translations: { it: { blocks: [{ title: "A" }] } } };

    expect(
      countOf(tabOf([blocks]), { "blocks.0.title": ai }, model, "it"),
    ).toBe(1);
  });

  it("uses the fields of each item's template", () => {
    const blocks: AnyFieldDescriptor = {
      key: "blocks",
      type: "repeater",
      attrs: {
        templates: {
          text: [{ key: "body", type: "textarea" }],
          image: [{ key: "alt", type: "text" }],
        },
      },
    };
    const model = { blocks: [{ _template: "image" }, {}] };
    const annotations = {
      "blocks.0.alt": ai,
      "blocks.0.body": ai, // not a field of the image template
      "blocks.1.body": ai, // no template: the first one, text
    };

    expect(countOf(tabOf([blocks]), annotations, model)).toBe(2);
  });

  it("leaves out the fields the model hides", () => {
    const tab = tabOf([
      { key: "title", type: "text" },
      { key: "price", type: "number", show: ({ model }) => !!model.paid },
    ]);
    const annotations = { title: ai, price: ai };

    expect(countOf(tab, annotations)).toBe(1);
    expect(countOf(tab, annotations, { paid: true })).toBe(2);
  });
});
