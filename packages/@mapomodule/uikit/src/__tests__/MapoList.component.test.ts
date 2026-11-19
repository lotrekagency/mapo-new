import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick } from "vue";
import type { App, Component, SetupContext } from "vue";

import MapoList from "../runtime/components/MapoList.vue";

// Where MapoList puts its bulk actions: in the table's toolbar, next to the
// search, together with the app's `dtable.toolbar` content. Its children are
// stubs: the table renders the toolbar slot it gets and reports selections.

const route = vi.hoisted(() => ({ query: {} as Record<string, string> }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("#app", () => ({ useRoute: () => route, useRouter: () => router }));

// Nodes are plain objects that keep their tag and props.
interface HeadlessNode {
  type: string;
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  props: Record<string, unknown>;
}

const headlessNode = (type: string): HeadlessNode => ({
  type,
  parent: null,
  children: [],
  props: {},
});

const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: (type) => headlessNode(type),
  createText: () => headlessNode("#text"),
  createComment: () => headlessNode("#comment"),
  setText: () => {},
  setElementText: () => {},
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
});

// What the table stub was given, and how to make it report a selection.
const table = vi.hoisted(() => ({
  slotNames: [] as string[],
  select: undefined as ((rows: unknown[]) => void) | undefined,
}));

const stubs: Record<string, Component> = {
  MapoListHead: { render: () => null },
  MapoListTabs: { render: () => null },
  MapoListFilters: { render: () => null },
  MapoListActions: {
    props: { selection: { type: [Array, String], default: () => [] } },
    setup: (props: Record<string, unknown>) => () =>
      h("actions", { selection: props.selection }),
  },
  MapoListTable: {
    emits: ["update:selection", "update:selectionQuery", "update:items"],
    setup(_props: unknown, { slots, emit, expose }: SetupContext) {
      expose({ refresh: () => {} });
      table.select = (rows) => emit("update:selection", rows);
      return () => {
        table.slotNames = Object.keys(slots);
        return h("table", null, [
          slots["dtable.toolbar"]
            ? h("toolbar", null, slots["dtable.toolbar"]())
            : null,
        ]);
      };
    },
  },
};

let app: App<HeadlessNode> | undefined;
let root: HeadlessNode;

function mount(
  props: Record<string, unknown> = {},
  slots: Record<string, () => unknown> = {},
) {
  root = headlessNode("root");
  const host: Component = {
    render: () =>
      h(
        MapoList as Component,
        { endpoint: "/api/news/", columns: [], ...props },
        slots,
      ),
  };
  app = createApp(host);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(root);
}

const all = (node: HeadlessNode): HeadlessNode[] => [
  node,
  ...node.children.flatMap(all),
];
const find = (type: string) => all(root).find((node) => node.type === type);
/** The toolbar's elements in order, without the anchors of fragments. */
const toolbarItems = () =>
  find("toolbar")!.children.filter((node) => !node.type.startsWith("#"));

beforeEach(() => {
  route.query = {};
  table.slotNames = [];
  table.select = undefined;
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoList bulk actions", () => {
  it("puts them in the table's toolbar, where the search is", () => {
    mount();

    const actions = find("actions")!;
    expect(actions.parent).toBe(find("toolbar"));
    expect(actions.props.class).toBe("ml-auto");
  });

  it("puts the app's dtable.toolbar content before them", () => {
    mount({}, { "dtable.toolbar": () => h("custom") });

    expect(toolbarItems().map((node) => node.type)).toEqual([
      "custom",
      "actions",
    ]);
  });

  it("gives a list without search a toolbar only while rows are selected", async () => {
    mount({ searchable: false });
    expect(table.slotNames).not.toContain("dtable.toolbar");
    expect(find("actions")).toBeUndefined();

    table.select!([{ id: 1 }]);
    await nextTick();

    expect(find("actions")!.props.selection).toEqual([{ id: 1 }]);

    table.select!([]);
    await nextTick();
    expect(find("toolbar")).toBeUndefined();
  });

  it("forwards the other slots to the table unchanged", () => {
    mount({}, { "cell.title": () => h("cell"), "dtable.empty": () => null });

    expect(table.slotNames).toEqual(
      expect.arrayContaining(["cell.title", "dtable.empty", "dtable.toolbar"]),
    );
  });
});
