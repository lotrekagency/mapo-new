import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, reactive } from "vue";
import type { App, Component, SetupContext } from "vue";

import MapoListTable from "../runtime/components/MapoListTable.vue";

// The table reads the route, the stores and the CRUD layer at setup: replace them
// with in-memory doubles. `vi.hoisted` lets the mock factories below share them.
const route = vi.hoisted(() => ({ query: {} as Record<string, string> }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const crud = vi.hoisted(() => ({
  list: vi.fn(),
  delete: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock("#app", () => ({ useRoute: () => route, useRouter: () => router }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => ({ ask: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/composables/usePermissions", () => ({
  usePermissions: () => ({ canChange: () => true, canDelete: () => true }),
}));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => crud }));

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

const passthrough = (name: string): Component => ({
  name,
  inheritAttrs: false,
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h("div", null, slots.default?.());
  },
});

// The pager stub declares Nuxt UI 4's contract: `UPagination` models `page`
// (prop `page`, event `update:page`), not `modelValue`.
let pager: { readonly page: number | undefined; select(page: number): void };

const UPagination: Component = {
  name: "UPagination",
  props: { page: Number, total: Number, itemsPerPage: Number },
  emits: ["update:page"],
  setup(props: { page?: number }, { emit }: SetupContext<["update:page"]>) {
    pager = {
      get page() {
        return props.page;
      },
      select: (page) => emit("update:page", page),
    };
    return () => h("nav");
  },
};

const stubs: Record<string, Component> = {
  UPagination,
  ...Object.fromEntries(
    [
      "UTable",
      "UInput",
      "USelect",
      "UIcon",
      "UCheckbox",
      "UButton",
      "NuxtLink",
      "MapoListQuickEdit",
    ].map((name) => [name, passthrough(name)]),
  ),
};

let app: App<HeadlessNode> | undefined;

/** Mounts the table; the returned props stay reactive, so a test can change them. */
function mountTable(initial: Record<string, unknown>) {
  const props = reactive({ ...initial });
  const root: Component = {
    render: () => h(MapoListTable as Component, props),
  };
  app = createApp(root);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(headlessNode());
  return props;
}

// Runs the pending fetches, the watchers they trigger and the debounced URL
// writes (timers are fake, so nothing leaks into the next test).
const settle = () => vi.runAllTimersAsync();

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Row ${i + 1}`,
  }));

const listProps = {
  endpoint: "/api/news/",
  columns: [{ key: "title", label: "Title" }],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  route.query = {};
  router.replace.mockReset();
  crud.list.mockReset();
  crud.list.mockResolvedValue({ results: rows(20), count: 95 });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.useRealTimers();
});

describe("MapoListTable pagination", () => {
  it("loads the page in the URL and shows it as the current one", async () => {
    route.query = { page: "3" };
    mountTable(listProps);
    await settle();

    expect(crud.list).toHaveBeenCalledTimes(1);
    expect(crud.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3, page_size: 20 }),
    );
    expect(pager.page).toBe(3);
    // The first load is not a change: the URL keeps its page.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("loads the page picked in the pager and writes it to the URL", async () => {
    mountTable(listProps);
    await settle();

    pager.select(2);
    await settle();

    expect(crud.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, page_size: 20 }),
    );
    expect(pager.page).toBe(2);
    expect(router.replace).toHaveBeenLastCalledWith({ query: { page: "2" } });
  });

  it("goes back to the first page when the filters change", async () => {
    route.query = { page: "3" };
    const props = mountTable(listProps);
    await settle();

    props.filterParams = { status: "draft" };
    await settle();

    expect(crud.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "draft", page: 1 }),
    );
    expect(pager.page).toBe(1);
  });
});
