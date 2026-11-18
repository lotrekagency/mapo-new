import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, onUnmounted } from "vue";
import type { App, Component, SetupContext } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { Pinia } from "pinia";

import MapoMediaFolderPicker from "../runtime/components/MapoMediaFolderPicker.vue";
import { useMediaStore } from "../runtime/stores/media";
import { findFolderNode, type FolderNode } from "../runtime/utils/mediaFolders";
import type { MediaFolder } from "../runtime/types/media";

const crud = vi.hoisted(() => ({
  options: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({ public: {} }),
  useNuxtApp: () => ({}),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => crud }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => ({ ask: vi.fn() }),
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
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

// `UModal` renders its body and footer while open.
const UModal: Component = {
  name: "UModal",
  props: { open: Boolean },
  setup(props: { open?: boolean }, { slots }: SetupContext) {
    return () =>
      props.open ? h("div", null, [slots.body?.(), slots.footer?.()]) : null;
  },
};

// `UTree`: `items` in, `onSelect` called with Reka's event and the node.
let tree: { readonly items: FolderNode[]; pick(key: string): void } | null =
  null;
const UTree: Component = {
  name: "UTree",
  props: { items: Array, onSelect: Function },
  setup(props: {
    items?: FolderNode[];
    onSelect?: (e: { preventDefault(): void }, node: FolderNode) => void;
  }) {
    tree = {
      get items() {
        return props.items ?? [];
      },
      pick(key) {
        const node = findFolderNode(props.items, key);
        if (!node) throw new Error(`no node ${key}`);
        props.onSelect?.({ preventDefault: () => {} }, node);
      },
    };
    onUnmounted(() => {
      tree = null;
    });
    return () => h("div");
  },
};

// `UButton`: its label, `disabled` in, `click` out (none while disabled).
const buttons: { label: string; disabled: boolean; click(): void }[] = [];
const UButton: Component = {
  name: "UButton",
  props: { disabled: Boolean },
  emits: ["click"],
  setup(
    props: { disabled?: boolean },
    { emit, slots }: SetupContext<["click"]>,
  ) {
    const stub = {
      get label() {
        return (slots.default?.() ?? [])
          .map((node) =>
            typeof node.children === "string" ? node.children : "",
          )
          .join("")
          .trim();
      },
      get disabled() {
        return props.disabled ?? false;
      },
      click() {
        if (!stub.disabled) emit("click");
      },
    };
    buttons.push(stub);
    onUnmounted(() => {
      buttons.splice(buttons.indexOf(stub), 1);
    });
    return () => h("button", null, slots.default?.());
  },
};

const stubs: Record<string, Component> = {
  UModal,
  UTree,
  UButton,
  UIcon: { name: "UIcon", render: () => null },
};

const photos: MediaFolder = { id: 1, name: "Photos", parent: null };
const videos: MediaFolder = { id: 2, name: "Videos", parent: null };

let app: App<HeadlessNode> | undefined;
let pinia: Pinia;
const confirmed: (MediaFolder | null)[] = [];
const openChanges: boolean[] = [];

async function mountPicker(props: Record<string, unknown> = {}) {
  app = createApp({
    render: () =>
      h(MapoMediaFolderPicker as Component, {
        open: true,
        onConfirm: (folder: MediaFolder | null) => confirmed.push(folder),
        "onUpdate:open": (open: boolean) => openChanges.push(open),
        ...props,
      }),
  });
  app.use(pinia);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(headlessNode());
  await new Promise((resolve) => setTimeout(resolve));
}

const confirmButton = () =>
  buttons.find((b) => b.label === "mapo.mediaMove.confirm");

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  for (const fn of Object.values(crud)) fn.mockReset();
  confirmed.length = 0;
  openChanges.length = 0;
  useMediaStore().folderChildren = { root: [photos, videos] };
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoMediaFolderPicker", () => {
  it("confirms nothing until a folder is picked", async () => {
    await mountPicker();

    expect(confirmButton()?.disabled).toBe(true);
    confirmButton()?.click();
    expect(confirmed).toEqual([]);
  });

  it("confirms the picked folder and closes", async () => {
    await mountPicker();

    tree?.pick("2");
    await new Promise((resolve) => setTimeout(resolve));
    confirmButton()?.click();

    expect(confirmed).toEqual([videos]);
    expect(openChanges).toEqual([false]);
  });

  it("confirms the root as null", async () => {
    await mountPicker();

    tree?.pick("root");
    await new Promise((resolve) => setTimeout(resolve));
    confirmButton()?.click();

    expect(confirmed).toEqual([null]);
  });

  it("hides the excluded folders", async () => {
    await mountPicker({ exclude: [1] });

    expect(tree?.items[0]?.children?.map((node) => node.label)).toEqual([
      "Videos",
    ]);
  });
});
