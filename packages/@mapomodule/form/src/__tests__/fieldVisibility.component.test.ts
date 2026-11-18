import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick, ref } from "vue";
import type { App, Component, Ref } from "vue";

import MapoFormFlatSection from "../runtime/components/MapoFormFlatSection.vue";
import MapoFormGroup from "../runtime/components/MapoFormGroup.vue";
import type { AnyFieldDescriptor } from "../runtime/types/index.js";

// A field hidden by `visible` or `show` takes its grid cell with it, and a flat
// section, a group or a sub-tab with no field to show goes as well.

const form = vi.hoisted(() => ({
  context: undefined as
    | { model: Ref<Record<string, unknown>>; currentLang: Ref<string> }
    | undefined,
}));

// The keys of the fields mounted so far, once per mount, and of the ones
// mounted now: a field that `show` hides stays mounted.
const fieldMounts = vi.hoisted(() => [] as string[]);
const mountedFields = vi.hoisted(() => new Set<string>());

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({
    public: { mapoForm: { groups: { expanded: true } } },
  }),
}));
vi.mock("../runtime/composables/useMapoForm.js", () => ({
  injectMapoForm: () => form.context,
}));
vi.mock("../runtime/components/MapoFormField.vue", async () => {
  const { h, onUnmounted } = await import("vue");
  return {
    default: {
      name: "MapoFormField",
      props: { descriptor: { type: Object, required: true } },
      setup(props: { descriptor: { key: string } }) {
        const key = props.descriptor.key;
        fieldMounts.push(key);
        mountedFields.add(key);
        onUnmounted(() => mountedFields.delete(key));
        return () => h("span", { "data-field": key });
      },
    },
  };
});

// Tests run in Node without a DOM. A renderer whose nodes are plain objects
// keeps each element's tag, props and text; `style` takes what `v-show` writes,
// and `querySelector` gives the field-expand `Teleport` a target.
interface HeadlessNode {
  type: string;
  text: string;
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  props: Record<string, unknown>;
  style: Record<string, string>;
}

const headlessNode = (type: string, text = ""): HeadlessNode => ({
  type,
  text,
  parent: null,
  children: [],
  props: {},
  style: {},
});
const body = headlessNode("body");

const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: (type) => headlessNode(type),
  createText: (text) => headlessNode("#text", text),
  createComment: (text) => headlessNode("#comment", text),
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.children = [];
    node.text = text;
  },
  patchProp(node, key, _previous, next) {
    node.props[key] = next;
  },
  insert(child, parent, anchor) {
    child.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, child);
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = null;
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) =>
    node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  querySelector: () => body,
});

const UIcon: Component = { name: "UIcon", render: () => null };

const all = (node: HeadlessNode): HeadlessNode[] => [
  node,
  ...node.children.flatMap(all),
];
const textOf = (node: HeadlessNode): string =>
  node.text + node.children.map(textOf).join("");
const hasClass = (node: HeadlessNode, name: string) =>
  String(node.props.class ?? "")
    .split(" ")
    .includes(name);
const isCell = (node: HeadlessNode) =>
  String(node.props.class ?? "").startsWith("col-span-");

/** The key of the field a cell holds, or of the `field.<key>` slot that fills it. */
function keyInCell(cell: HeadlessNode): string | undefined {
  const content = all(cell).find(
    (node) => "data-field" in node.props || "data-slot" in node.props,
  );
  return (content?.props["data-field"] ?? content?.props["data-slot"]) as
    | string
    | undefined;
}

let app: App<HeadlessNode> | undefined;
let root: HeadlessNode;
let model: Ref<Record<string, unknown>>;

/** The cells of the grids, in order, by the key of what they hold. */
const cellKeys = () => all(root).filter(isCell).map(keyInCell);
const cellOf = (key: string) =>
  all(root).find((node) => isCell(node) && keyInCell(node) === key);
const findByClass = (name: string) =>
  all(root).find((node) => hasClass(node, name));

/** Whether a node is on screen: neither it nor an ancestor is hidden by `v-show`. */
function isDisplayed(node: HeadlessNode | undefined): boolean {
  if (!node) return false;
  for (let at: HeadlessNode | null = node; at; at = at.parent) {
    if (at.style.display === "none") return false;
  }
  return true;
}

function mount(
  component: Component,
  props: Record<string, unknown>,
  slots: Record<string, () => unknown> = {},
) {
  root = headlessNode("root");
  const host: Component = { render: () => h(component, props, slots) };
  app = createApp(host);
  app.component("UIcon", UIcon);
  app.mount(root);
}

type Predicate = (ctx: { model: Record<string, unknown> }) => boolean;

// Like a page whose content fields depend on the template it uses.
const isHome: Predicate = ({ model }) => model.template === "home";
const isLanding: Predicate = ({ model }) => model.template === "landing";

const field = (
  key: string,
  options: { cols?: number; visible?: Predicate; show?: Predicate } = {},
) => ({ key, type: "text", ...options }) as AnyFieldDescriptor;

beforeEach(() => {
  fieldMounts.length = 0;
  mountedFields.clear();
  model = ref<Record<string, unknown>>({ template: "home" });
  form.context = { model, currentLang: ref("") };
  // The field-expand listeners touch `document`, which Node does not have.
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    body: { style: {} },
  });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  form.context = undefined;
  vi.unstubAllGlobals();
});

describe("MapoFormFlatSection cells", () => {
  it("renders no cell for a field `visible` removes, so the next one takes its place", () => {
    mount(MapoFormFlatSection, {
      fields: [
        field("cta_label", { cols: 6, visible: isLanding }),
        field("hero_title", { cols: 6, visible: isHome }),
      ],
    });

    expect(cellKeys()).toEqual(["hero_title"]);
    expect([...mountedFields]).toEqual(["hero_title"]);
  });

  it("keeps the cell of a field `show` hides, hidden, with the field mounted", () => {
    mount(MapoFormFlatSection, {
      fields: [field("title"), field("cta_label", { show: isLanding })],
    });

    expect(cellKeys()).toEqual(["title", "cta_label"]);
    expect(isDisplayed(cellOf("title"))).toBe(true);
    expect(isDisplayed(cellOf("cta_label"))).toBe(false);
    expect(mountedFields.has("cta_label")).toBe(true);
  });

  it("brings the cells back when the model changes, without mounting a hidden field again", async () => {
    mount(MapoFormFlatSection, {
      fields: [
        field("title"),
        field("cta_label", { visible: isLanding }),
        field("cta_url", { show: isLanding }),
      ],
    });
    expect(cellKeys()).toEqual(["title", "cta_url"]);

    model.value.template = "landing";
    await nextTick();

    expect(cellKeys()).toEqual(["title", "cta_label", "cta_url"]);
    expect(isDisplayed(cellOf("cta_label"))).toBe(true);
    expect(isDisplayed(cellOf("cta_url"))).toBe(true);
    expect(fieldMounts.filter((key) => key === "cta_url")).toHaveLength(1);

    model.value.template = "home";
    await nextTick();

    expect(cellKeys()).toEqual(["title", "cta_url"]);
    expect(isDisplayed(cellOf("cta_url"))).toBe(false);
    expect(fieldMounts.filter((key) => key === "cta_url")).toHaveLength(1);
  });

  it("applies the field's predicates to the cell its `field.<key>` slot fills", async () => {
    mount(
      MapoFormFlatSection,
      {
        fields: [
          field("title"),
          field("cta_label", { visible: isLanding }),
          field("cta_url", { show: isLanding }),
        ],
      },
      {
        "field.cta_label": () => h("em", { "data-slot": "cta_label" }),
        "field.cta_url": () => h("em", { "data-slot": "cta_url" }),
      },
    );

    expect(cellKeys()).toEqual(["title", "cta_url"]);
    expect(isDisplayed(cellOf("cta_url"))).toBe(false);

    model.value.template = "landing";
    await nextTick();

    expect(cellKeys()).toEqual(["title", "cta_label", "cta_url"]);
    expect(isDisplayed(cellOf("cta_url"))).toBe(true);
  });

  it("keeps the other cells when a field's predicate throws", () => {
    // Reads a nested value the model does not have yet, as on a new record.
    const seoEnabled: Predicate = ({ model }) =>
      (model.seo as { enabled: boolean }).enabled;
    mount(MapoFormFlatSection, {
      fields: [field("title"), field("seo_title", { visible: seoEnabled })],
    });

    expect(cellKeys()).toEqual(["title"]);
  });

  it("renders no grid while `visible` removes every field", () => {
    mount(MapoFormFlatSection, {
      fields: [field("cta_label", { visible: isLanding })],
    });

    expect(findByClass("grid")).toBeUndefined();
  });

  it("hides the grid while `show` hides every field, and shows it with one of them", async () => {
    mount(MapoFormFlatSection, {
      fields: [
        field("cta_label", { visible: isLanding }),
        field("cta_url", { show: isLanding }),
      ],
    });
    expect(isDisplayed(findByClass("grid"))).toBe(false);
    expect(mountedFields.has("cta_url")).toBe(true);

    model.value.template = "landing";
    await nextTick();

    expect(isDisplayed(findByClass("grid"))).toBe(true);
  });
});

describe("MapoFormGroup cells", () => {
  it("renders the cells of the fields to show and hides the cell of one `show` hides", () => {
    mount(MapoFormGroup, {
      name: "content",
      fields: [
        field("cta_label", { cols: 6, visible: isLanding }),
        field("hero_title", { cols: 6, visible: isHome }),
        field("cta_url", { show: isLanding }),
      ],
    });

    expect(cellKeys()).toEqual(["hero_title", "cta_url"]);
    expect(isDisplayed(cellOf("hero_title"))).toBe(true);
    expect(isDisplayed(cellOf("cta_url"))).toBe(false);
  });

  it("brings a cell back when the model changes", async () => {
    mount(MapoFormGroup, {
      name: "content",
      fields: [field("hero_title"), field("cta_label", { visible: isLanding })],
    });
    expect(cellKeys()).toEqual(["hero_title"]);

    model.value.template = "landing";
    await nextTick();

    expect(cellKeys()).toEqual(["hero_title", "cta_label"]);
  });

  it("applies the field's predicates to the cells its `field.<key>` slots fill, sub-tabs included", async () => {
    mount(
      MapoFormGroup,
      {
        name: "content",
        fields: [field("title"), field("cta_label", { visible: isLanding })],
        subtabs: new Map([
          ["social", [field("og_title", { show: isLanding })]],
          ["basic", [field("meta_title")]],
        ]),
      },
      {
        "field.cta_label": () => h("em", { "data-slot": "cta_label" }),
        "field.og_title": () => h("em", { "data-slot": "og_title" }),
      },
    );
    expect(cellKeys()).toEqual(["title", "og_title", "meta_title"]);
    expect(isDisplayed(cellOf("og_title"))).toBe(false);

    model.value.template = "landing";
    await nextTick();

    expect(cellKeys()).toEqual([
      "title",
      "cta_label",
      "og_title",
      "meta_title",
    ]);
    expect(isDisplayed(cellOf("cta_label"))).toBe(true);
    expect(isDisplayed(cellOf("og_title"))).toBe(true);
  });

  it("renders no card while `visible` removes every field, and renders it once one is kept", async () => {
    mount(MapoFormGroup, {
      name: "call_to_action",
      fields: [
        field("cta_label", { visible: isLanding }),
        field("cta_url", { visible: isLanding }),
      ],
    });
    expect(findByClass("mapo-form-group")).toBeUndefined();

    model.value.template = "landing";
    await nextTick();

    expect(isDisplayed(findByClass("mapo-form-group"))).toBe(true);
    expect(cellKeys()).toEqual(["cta_label", "cta_url"]);
  });

  it("hides the card while `show` hides every field, keeping the fields mounted", async () => {
    mount(MapoFormGroup, {
      name: "call_to_action",
      fields: [
        field("cta_label", { visible: isLanding }),
        field("cta_url", { show: isLanding }),
      ],
    });
    expect(isDisplayed(findByClass("mapo-form-group"))).toBe(false);
    expect(mountedFields.has("cta_url")).toBe(true);

    model.value.template = "landing";
    await nextTick();

    expect(isDisplayed(findByClass("mapo-form-group"))).toBe(true);
    expect(fieldMounts.filter((key) => key === "cta_url")).toHaveLength(1);
  });
});

describe("MapoFormGroup sub-tabs", () => {
  const seoSubtabs = () =>
    new Map([
      ["basic", [field("meta_title")]],
      ["social", [field("og_title", { visible: isLanding })]],
      ["advanced", [field("canonical", { show: isLanding })]],
    ]);

  const subtabButtons = () =>
    findByClass("mapo-form-subtab-bar")?.children.filter(
      (node) => node.type === "button",
    ) ?? [];
  const subtabLabels = () =>
    subtabButtons().map((button) => textOf(button).trim());

  async function clickSubtab(label: string) {
    const button = subtabButtons().find(
      (node) => textOf(node).trim() === label,
    );
    (button?.props.onClick as () => void)();
    await nextTick();
  }

  it("leaves a sub-tab with no field to show out of the bar", () => {
    mount(MapoFormGroup, { name: "seo", fields: [], subtabs: seoSubtabs() });

    expect(subtabLabels()).toEqual(["basic"]);
    // `visible` removed og_title with its panel; `show` keeps canonical mounted.
    expect(cellOf("og_title")).toBeUndefined();
    expect(isDisplayed(cellOf("canonical"))).toBe(false);
    expect(mountedFields.has("canonical")).toBe(true);
  });

  it("opens the first shown sub-tab while the picked one is hidden, and the picked one again when it shows", async () => {
    model.value.template = "landing";
    mount(MapoFormGroup, { name: "seo", fields: [], subtabs: seoSubtabs() });
    expect(subtabLabels()).toEqual(["basic", "social", "advanced"]);

    await clickSubtab("advanced");
    expect(isDisplayed(cellOf("canonical"))).toBe(true);
    expect(isDisplayed(cellOf("meta_title"))).toBe(false);

    model.value.template = "home";
    await nextTick();

    expect(subtabLabels()).toEqual(["basic"]);
    expect(isDisplayed(cellOf("meta_title"))).toBe(true);

    model.value.template = "landing";
    await nextTick();

    expect(isDisplayed(cellOf("canonical"))).toBe(true);
    expect(isDisplayed(cellOf("meta_title"))).toBe(false);
  });

  it("renders no card while every sub-tab field is removed", () => {
    mount(MapoFormGroup, {
      name: "seo",
      fields: [],
      subtabs: new Map([
        ["social", [field("og_title", { visible: isLanding })]],
      ]),
    });

    expect(findByClass("mapo-form-group")).toBeUndefined();
  });
});
