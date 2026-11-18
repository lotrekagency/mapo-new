import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, inject, onUnmounted, provide } from "vue";
import type { App, Component, SetupContext } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { Pinia } from "pinia";

import MapoMediaFolders from "../runtime/components/MapoMediaFolders.vue";
import { useMediaStore } from "../runtime/stores/media";
import { findFolderNode, type FolderNode } from "../runtime/utils/mediaFolders";
import type { MediaFolder } from "../runtime/types/media";

const crud = vi.hoisted(() => ({
  options: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  updateOrCreate: vi.fn(),
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

// The row a button is drawn in, provided by the `UTree` stub.
const ROW_KEY = Symbol("row");
const Row: Component = {
  name: "Row",
  props: { rowKey: String },
  setup(props: { rowKey?: string }, { slots }: SetupContext) {
    provide(ROW_KEY, props.rowKey);
    return () => h("div", null, slots.default?.());
  },
};
const flatten = (nodes: FolderNode[]): FolderNode[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
// The tree's class getters (`ui.link()`, …): no classes in a headless render.
const treeUi = new Proxy({}, { get: () => () => "" });

// `UTree` declares the contract the folders panel binds: `items`,
// `modelValue` and `expanded` in, `onSelect` / `onToggle` called with Reka's
// event and the node. A click in Reka selects, then toggles. Every node is
// drawn through `#item-wrapper`, so its row buttons exist.
interface TreeStub {
  readonly items: FolderNode[];
  readonly selectedKey: string | undefined;
  readonly expanded: string[];
  /** Whether the last click cancelled Reka's own selection. */
  readonly selectionCancelled: boolean;
  click(key: string): void;
  toggle(key: string): void;
}
let tree: TreeStub | null = null;

const UTree: Component = {
  name: "UTree",
  props: {
    items: Array,
    modelValue: Object,
    expanded: Array,
    onSelect: Function,
    onToggle: Function,
  },
  setup(
    props: {
      items?: FolderNode[];
      modelValue?: FolderNode;
      expanded?: string[];
      onSelect?: (e: { preventDefault(): void }, node: FolderNode) => void;
      onToggle?: (
        e: { detail: { isExpanded: boolean } },
        node: FolderNode,
      ) => void;
    },
    { slots }: SetupContext,
  ) {
    const node = (key: string) => {
      const found = findFolderNode(props.items, key);
      if (!found) throw new Error(`no node ${key}`);
      return found;
    };
    const isExpanded = (key: string) => (props.expanded ?? []).includes(key);
    let selectionCancelled = false;
    tree = {
      get items() {
        return props.items ?? [];
      },
      get selectedKey() {
        return props.modelValue?.key;
      },
      get expanded() {
        return props.expanded ?? [];
      },
      get selectionCancelled() {
        return selectionCancelled;
      },
      click(key) {
        selectionCancelled = false;
        props.onSelect?.(
          { preventDefault: () => (selectionCancelled = true) },
          node(key),
        );
        props.onToggle?.(
          { detail: { isExpanded: isExpanded(key) } },
          node(key),
        );
      },
      toggle(key) {
        props.onToggle?.(
          { detail: { isExpanded: isExpanded(key) } },
          node(key),
        );
      },
    };
    onUnmounted(() => {
      tree = null;
    });
    return () =>
      h(
        "div",
        null,
        flatten(props.items ?? []).map((item) =>
          h(Row, { key: item.key, rowKey: item.key }, () =>
            slots["item-wrapper"]?.({
              item,
              expanded: false,
              selected: false,
              ui: treeUi,
            }),
          ),
        ),
      );
  },
};

// `UButton`: its `aria-label`, the row it sits in, whether it is disabled,
// and its click (with the event `.stop` needs).
const buttons: {
  row?: string;
  label: string;
  disabled: boolean;
  click(): void;
}[] = [];
const UButton: Component = {
  name: "UButton",
  inheritAttrs: false,
  setup(_props: unknown, { attrs, slots }: SetupContext) {
    const stub = {
      row: inject<string | undefined>(ROW_KEY, undefined),
      get label() {
        return String(attrs["aria-label"] ?? "");
      },
      get disabled() {
        return Boolean(attrs.disabled);
      },
      click() {
        const onClick = attrs.onClick as ((event: unknown) => void) | undefined;
        onClick?.({ stopPropagation: () => {} });
      },
    };
    buttons.push(stub);
    onUnmounted(() => {
      buttons.splice(buttons.indexOf(stub), 1);
    });
    return () => h("div", null, slots.default?.());
  },
};

// `MapoMediaFolderPicker`: `open` and `exclude` in, `confirm` out.
let picker: {
  readonly open: boolean;
  readonly exclude: number[];
  pick(folder: MediaFolder | null): void;
} | null = null;
const MapoMediaFolderPicker: Component = {
  name: "MapoMediaFolderPicker",
  props: { open: Boolean, exclude: Array },
  emits: ["confirm", "update:open"],
  setup(
    props: { open?: boolean; exclude?: number[] },
    { emit }: SetupContext<["confirm", "update:open"]>,
  ) {
    picker = {
      get open() {
        return props.open ?? false;
      },
      get exclude() {
        return props.exclude ?? [];
      },
      pick(folder) {
        emit("confirm", folder);
        emit("update:open", false);
      },
    };
    onUnmounted(() => {
      picker = null;
    });
    return () => h("div");
  },
};

const passthrough = (name: string): Component => ({
  name,
  inheritAttrs: false,
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h("div", null, slots.default?.());
  },
});

const stubs: Record<string, Component> = {
  UTree,
  UButton,
  MapoMediaFolderPicker,
  UInput: passthrough("UInput"),
  USeparator: passthrough("USeparator"),
  UIcon: passthrough("UIcon"),
};

const explorer = (folders: MediaFolder[], parentFolder: unknown = null) => ({
  media: { items: [], paginator: { page: 1, pages: 1 } },
  folders,
  parent_folder: parentFolder,
});
const photos: MediaFolder = {
  id: 1,
  name: "Photos",
  parent: null,
  path: "/photos",
};
const videos: MediaFolder = {
  id: 2,
  name: "Videos",
  parent: null,
  path: "/videos",
};

// Runs the pending CRUD promises and the renders they trigger.
const settle = () => new Promise((resolve) => setTimeout(resolve));

const rowButton = (row: string, label: string) =>
  buttons.find((stub) => stub.row === row && stub.label === label);

let app: App<HeadlessNode> | undefined;
let pinia: Pinia;

async function mountFolders() {
  await useMediaStore().getRoot({ page: 1 });
  app = createApp({ render: () => h(MapoMediaFolders as Component) });
  app.use(pinia);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(headlessNode());
  await settle();
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  for (const fn of Object.values(crud)) fn.mockReset();
  crud.list.mockResolvedValue(explorer([photos, videos]));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoMediaFolders tree", () => {
  it("shows the root with its folders, the root selected and open", async () => {
    await mountFolders();

    const [root] = tree?.items ?? [];
    expect(root?.children?.map((node) => node.label)).toEqual([
      "Photos",
      "Videos",
    ]);
    expect(tree?.selectedKey).toBe("root");
    expect(tree?.expanded).toContain("root");
  });

  // A click selects and toggles: the navigation loads the folder once.
  it("navigates to a clicked folder, loading it once, and selects it", async () => {
    crud.detail.mockResolvedValue(explorer([], photos));
    await mountFolders();

    tree?.click("1");
    await settle();

    expect(crud.detail).toHaveBeenCalledTimes(1);
    // Reka would select the node before the navigation lands, and unselect
    // the current folder on a second click: the folder on screen decides.
    expect(tree?.selectionCancelled).toBe(true);
    expect(tree?.selectedKey).toBe("1");
    expect(tree?.expanded).toContain("1");
  });

  it("loads the subfolders of a branch opened without navigating", async () => {
    crud.detail.mockResolvedValue(explorer([], videos));
    await mountFolders();

    tree?.toggle("2");
    await settle();

    expect(crud.detail).toHaveBeenCalledWith(2, { params: { page: 1 } });
    expect(tree?.selectedKey).toBe("root");
    expect(findFolderNode(tree?.items, "2")?.children).toBeUndefined();
  });

  it("does not navigate to the loading placeholder", async () => {
    await mountFolders();

    tree?.click("1:pending");
    await settle();

    expect(crud.detail).not.toHaveBeenCalled();
  });
});

describe("MapoMediaFolders moving a folder", () => {
  // The picker hides the folder with its subtree: a move inside itself would
  // loop on Camomilla.
  it("opens the picker without the folder, then moves it there", async () => {
    crud.updateOrCreate.mockResolvedValue({ ...photos, parent: 2 });
    crud.detail.mockResolvedValue(explorer([], videos));
    await mountFolders();

    rowButton("1", "mapo.mediaMove.moveTo")?.click();
    await settle();
    expect(picker?.open).toBe(true);
    expect(picker?.exclude).toEqual([1]);

    picker?.pick(videos);
    await settle();

    expect(crud.updateOrCreate).toHaveBeenCalledWith({ ...photos, parent: 2 });
    expect(picker?.open).toBe(false);
  });

  it("offers no move on the root", async () => {
    await mountFolders();

    expect(rowButton("root", "mapo.mediaMove.moveTo")).toBeUndefined();
    expect(rowButton("2", "mapo.mediaMove.moveTo")).toBeDefined();
  });

  // The tree shows the folder in its old place until the branches reload.
  it("disables the row actions while a folder moves", async () => {
    let accept: (value: unknown) => void = () => {};
    crud.updateOrCreate.mockReturnValueOnce(
      new Promise((resolve) => (accept = resolve)),
    );
    crud.detail.mockResolvedValue(explorer([], videos));
    await mountFolders();

    rowButton("1", "mapo.mediaMove.moveTo")?.click();
    await settle();
    picker?.pick(videos);
    await settle();
    const actions = ["mapo.edit", "mapo.mediaMove.moveTo", "mapo.delete"];
    expect(actions.map((label) => rowButton("2", label)?.disabled)).toEqual([
      true,
      true,
      true,
    ]);

    accept({ ...photos, parent: 2 });
    await settle();
    expect(rowButton("2", "mapo.mediaMove.moveTo")?.disabled).toBe(false);
  });
});
