import { describe, expect, it } from "vitest";
import type { AnyFieldDescriptor } from "../runtime/types/index.js";
import type { TabEntry } from "../runtime/types/layout.js";
import {
  isFieldShown,
  pickActiveTab,
  tabHasShownFields,
} from "../runtime/utils/tabVisibility.js";

type Predicates = Pick<AnyFieldDescriptor, "visible" | "show">;

const field = (key: string, predicates: Predicates = {}) =>
  ({ key, type: "text", ...predicates }) as AnyFieldDescriptor;

/** A tab holding its fields in one flat group, as MapoForm builds it. */
const tab = (
  name: string,
  fields: AnyFieldDescriptor[],
  children: TabEntry[] = [],
): TabEntry => ({
  name,
  groups: new Map([["__flat__", { fields, subtabs: new Map() }]]),
  children: new Map(children.map((child) => [child.name, child])),
});

// Like a page whose content fields depend on the template picked in the sidebar.
const hasTemplate = ({ model }: { model: Record<string, unknown> }) =>
  Boolean(model.template);

describe("isFieldShown", () => {
  it("shows a field without predicates", () => {
    expect(isFieldShown(field("title"), {})).toBe(true);
  });

  it("hides a field that `visible` removes", () => {
    const body = field("body", { visible: hasTemplate });
    expect(isFieldShown(body, { template: "" })).toBe(false);
    expect(isFieldShown(body, { template: "Home" })).toBe(true);
  });

  it("hides a field that `show` hides", () => {
    const body = field("body", { show: hasTemplate });
    expect(isFieldShown(body, { template: "" })).toBe(false);
  });
});

describe("tabHasShownFields", () => {
  it("is false while every field is hidden and true once one shows", () => {
    const general = tab("__default__", [
      field("body", { visible: hasTemplate }),
      field("intro", { visible: hasTemplate }),
    ]);
    expect(tabHasShownFields(general, { template: "" })).toBe(false);
    expect(tabHasShownFields(general, { template: "Home" })).toBe(true);
  });

  it("counts the fields of a sub-tab", () => {
    const seo: TabEntry = {
      name: "SEO",
      groups: new Map([
        [
          "meta",
          { fields: [], subtabs: new Map([["basic", [field("meta_title")]]]) },
        ],
      ]),
      children: new Map(),
    };
    expect(tabHasShownFields(seo, {})).toBe(true);
  });

  it("counts the fields of a child tab", () => {
    const settings = tab(
      "Settings",
      [field("legacy", { visible: () => false })],
      [tab("SEO", [field("meta_title")])],
    );
    expect(tabHasShownFields(settings, {})).toBe(true);
  });
});

describe("pickActiveTab", () => {
  const general = tab("__default__", []);
  const seo = tab("SEO", []);

  it("opens the first shown tab until the user picks one", () => {
    expect(pickActiveTab([general, seo], null)).toBe("__default__");
    // The first tab is hidden: the next one opens, not an empty panel.
    expect(pickActiveTab([seo], null)).toBe("SEO");
  });

  it("keeps the picked tab while it is shown", () => {
    expect(pickActiveTab([general, seo], "SEO")).toBe("SEO");
  });

  it("falls back to the first shown tab while the picked one is hidden", () => {
    expect(pickActiveTab([seo], "__default__")).toBe("SEO");
  });

  it("is empty when no tab is shown", () => {
    expect(pickActiveTab([], null)).toBe("");
  });
});
