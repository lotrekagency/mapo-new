import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, onUnmounted } from "vue";
import type { App, Component, SetupContext } from "vue";

import MapoMenuManager from "../runtime/components/MapoMenuManager.vue";
import type { MapoMenu } from "../runtime/types/menu";

const crud = vi.hoisted(() => ({
  options: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  partialUpdate: vi.fn(),
}));

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => crud }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/composables/usePermissions", () => ({
  usePermissions: () => ({ canAdd: () => true, canChange: () => true }),
}));
// The manager imports the tree and the node editor by path: replace the
// modules. The tree renders the `top` slot, where the language switch goes.
vi.mock("../runtime/components/MapoMenuTreeview.vue", async () => {
  const { h } = await import("vue");
  return {
    default: {
      name: "MapoMenuTreeview",
      setup(_props: unknown, { slots }: SetupContext) {
        return () => h("div", null, [slots.top?.(), slots.bottom?.()]);
      },
    },
  };
});
vi.mock("../runtime/components/MapoMenuNodeEditor.vue", () => ({
  default: { name: "MapoMenuNodeEditor", render: () => null },
}));

// Tests run in Node without a DOM. A renderer whose nodes are plain objects is
// enough to mount the component with real reactivity, watchers and events.
interface HeadlessNode {
  parent: HeadlessNode | null;
  children: HeadlessNode[];
}

const headlessNode = (): HeadlessNode => ({ parent: null, children: [] });

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
});

// The language switch, resolved by name like the real one.
let langSwitch: { readonly langs: string[] } | null = null;
const MapoDetailLangSwitch: Component = {
  name: "MapoDetailLangSwitch",
  props: { modelValue: String, langs: Array },
  setup(props: { langs?: string[] }) {
    langSwitch = {
      get langs() {
        return props.langs ?? [];
      },
    };
    onUnmounted(() => {
      langSwitch = null;
    });
    return () => h("div");
  },
};

const stubs: Record<string, Component> = {
  MapoDetailLangSwitch,
  UButton: { name: "UButton", render: () => h("button") },
  UIcon: { name: "UIcon", render: () => null },
};

// Runs the pending CRUD promises and the renders they trigger.
const settle = () => new Promise((resolve) => setTimeout(resolve));

let app: App<HeadlessNode> | undefined;

async function mountManager(props: Record<string, unknown> = {}) {
  app = createApp({
    render: () =>
      h(MapoMenuManager as Component, { endpoint: "/api/menus", ...props }),
  });
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(headlessNode());
  await settle();
}

beforeEach(() => {
  for (const fn of Object.values(crud)) fn.mockReset();
  crud.options.mockResolvedValue({});
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoMenuManager language switch", () => {
  it("shows the switch with several languages", async () => {
    await mountManager({ languages: ["it", "en"] });
    expect(langSwitch?.langs).toEqual(["it", "en"]);
  });

  it("hides the switch with a single language", async () => {
    await mountManager({ languages: ["it"] });
    expect(langSwitch).toBeNull();
  });

  // Hiding the switch changes nothing in the data: the tree of a menu
  // translated into one language still lives under that language.
  it("keeps the single language's tree under its translation", async () => {
    crud.options.mockResolvedValue({
      lang_info: { translatable: true, languages: ["it"] },
    });
    const menu: MapoMenu = { key: "main", nodes: [], translations: {} };
    await mountManager({ modelValue: menu });

    expect(langSwitch).toBeNull();
    expect(menu.translations?.it?.nodes).toEqual([]);
  });
});
