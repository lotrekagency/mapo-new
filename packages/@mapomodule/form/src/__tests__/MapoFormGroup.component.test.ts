import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h } from "vue";
import type { App, Component } from "vue";

import MapoFormGroup from "../runtime/components/MapoFormGroup.vue";

const runtimeConfig = vi.hoisted(() => ({
  public: { mapoForm: { groups: { expanded: true } } },
}));

// Keys of the fields the group renders: its body renders them only while the
// group is expanded.
const renderedFields = vi.hoisted(() => [] as string[]);

vi.mock("#app", () => ({ useRuntimeConfig: () => runtimeConfig }));
vi.mock("../runtime/composables/useMapoForm.js", () => ({
  injectMapoForm: () => undefined,
}));
vi.mock("../runtime/components/MapoFormField.vue", () => ({
  default: {
    name: "MapoFormField",
    props: { descriptor: { type: Object, required: true } },
    setup(props: { descriptor: { key: string } }) {
      renderedFields.push(props.descriptor.key);
      return () => null;
    },
  },
}));

// Tests run in Node without a DOM. A renderer whose nodes are plain objects is
// enough to mount the component; `style` takes what `v-show` writes, and
// `querySelector` gives the field-expand `Teleport` a target.
interface HeadlessNode {
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  style: Record<string, string>;
}

const headlessNode = (): HeadlessNode => ({
  parent: null,
  children: [],
  style: {},
});
const body = headlessNode();

const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: headlessNode,
  createText: headlessNode,
  createComment: headlessNode,
  setText: () => {},
  setElementText: () => {},
  patchProp: () => {},
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

let app: App<HeadlessNode> | undefined;

/** Mounts a group with one field; `initialExpanded` is passed only when given. */
function mountGroup(props: { initialExpanded?: boolean } = {}) {
  const root: Component = {
    render: () =>
      h(MapoFormGroup as Component, {
        name: "seo",
        fields: [{ key: "meta_title", type: "text" }],
        ...props,
      }),
  };
  app = createApp(root);
  app.component("UIcon", UIcon);
  app.mount(headlessNode());
}

describe("MapoFormGroup initial state", () => {
  beforeEach(() => {
    renderedFields.length = 0;
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
    vi.unstubAllGlobals();
  });

  it("starts expanded when the prop is absent and groups.expanded is true", () => {
    runtimeConfig.public.mapoForm.groups.expanded = true;
    mountGroup();

    expect(renderedFields).toEqual(["meta_title"]);
  });

  it("starts collapsed when the prop is absent and groups.expanded is false", () => {
    runtimeConfig.public.mapoForm.groups.expanded = false;
    mountGroup();

    expect(renderedFields).toEqual([]);
  });

  it.each([
    { initialExpanded: false, configExpanded: true, fields: [] },
    { initialExpanded: true, configExpanded: false, fields: ["meta_title"] },
  ])(
    "an explicit initialExpanded $initialExpanded wins over groups.expanded $configExpanded",
    ({ initialExpanded, configExpanded, fields }) => {
      runtimeConfig.public.mapoForm.groups.expanded = configExpanded;
      mountGroup({ initialExpanded });

      expect(renderedFields).toEqual(fields);
    },
  );
});
