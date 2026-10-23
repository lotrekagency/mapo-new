import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick, onUnmounted, reactive } from "vue";
import type { App, Component, SetupContext, VNode } from "vue";

import MapoListTable from "../runtime/components/MapoListTable.vue";
import { ALL_ROWS } from "../runtime/utils/listTable";

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

// The stubs whose binding is under test declare the real component's contract.

// `UPagination` models `page` (prop `page`, event `update:page`), not `modelValue`.
let pager: { readonly page: number | undefined; select(page: number): void };
let pagerMounted = false;

const UPagination: Component = {
  name: "UPagination",
  props: { page: Number, total: Number, itemsPerPage: Number },
  emits: ["update:page"],
  setup(props: { page?: number }, { emit }: SetupContext<["update:page"]>) {
    pagerMounted = true;
    onUnmounted(() => {
      pagerMounted = false;
    });
    pager = {
      get page() {
        return props.page;
      },
      select: (page) => emit("update:page", page),
    };
    return () => h("nav");
  },
};

// `UTable` gets TanStack column defs; the tests render headers and cells from them.
interface ColumnDef {
  id?: string;
  header?: string | (() => VNode);
  cell?: (context: { row: { original: object; index: number } }) => unknown;
}
let table: {
  readonly data: Record<string, unknown>[];
  readonly columns: ColumnDef[];
  readonly empty: string | undefined;
};

const UTable: Component = {
  name: "UTable",
  props: { data: Array, columns: Array, empty: String },
  setup(props: {
    data?: Record<string, unknown>[];
    columns?: ColumnDef[];
    empty?: string;
  }) {
    table = {
      get data() {
        return props.data ?? [];
      },
      get columns() {
        return props.columns ?? [];
      },
      get empty() {
        return props.empty;
      },
    };
    return () => h("table");
  },
};

// `USelect` is the per-page selector.
interface SelectItem {
  label: string;
  value: number;
}
let pageSizeSelect: {
  readonly items: SelectItem[];
  select(value: number): void;
};

const USelect: Component = {
  name: "USelect",
  props: { modelValue: Number, items: Array },
  emits: ["update:modelValue"],
  setup(
    props: { items?: SelectItem[] },
    { emit }: SetupContext<["update:modelValue"]>,
  ) {
    pageSizeSelect = {
      get items() {
        return props.items ?? [];
      },
      select: (value) => emit("update:modelValue", value),
    };
    return () => h("select");
  },
};

const stubs: Record<string, Component> = {
  UPagination,
  UTable,
  USelect,
  ...Object.fromEntries(
    [
      "UInput",
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

const lastListParams = () =>
  crud.list.mock.lastCall?.[0] as Record<string, unknown>;

const column = (id: string) => {
  const found = table.columns.find((col) => col.id === id);
  if (!found) throw new Error(`no column ${id}`);
  return found;
};

/** The header button of a sortable column, as the table renders it. */
const sortButton = (id: string) => {
  const header = column(id).header;
  if (typeof header !== "function") throw new Error(`${id} is not sortable`);
  return header().props as {
    "aria-label": string;
    icon: string;
    onClick: () => void;
  };
};

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

  it("drops a pending URL write when the list goes away", async () => {
    mountTable(listProps);
    await settle();

    pager.select(2);
    await nextTick(); // the watcher runs and arms the debounced URL write
    app?.unmount();
    app = undefined;
    await settle();

    expect(router.replace).not.toHaveBeenCalled();
  });

  it("uses paginationParams instead of page and page_size", async () => {
    mountTable({
      ...listProps,
      paginationParams: ({
        page,
        pageSize,
      }: {
        page: number;
        pageSize: number;
      }) => ({
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }),
    });
    await settle();

    expect(lastListParams()).toEqual({ offset: 0, limit: 20 });
  });
});

describe("MapoListTable sorting", () => {
  const sortableProps = {
    endpoint: "/api/news/",
    columns: [
      { key: "title", label: "Title", sortable: true },
      { key: "status", label: "Status" },
    ],
  };

  it("cycles a sortable header through ascending, descending and unsorted", async () => {
    mountTable(sortableProps);
    await settle();
    expect(sortButton("title")["aria-label"]).toBe(
      "mapo.listTable.sortAscending",
    );

    sortButton("title").onClick();
    await settle();
    expect(lastListParams().ordering).toBe("title");
    expect(router.replace).toHaveBeenLastCalledWith({
      query: { ordering: "title" },
    });
    expect(sortButton("title")["aria-label"]).toBe(
      "mapo.listTable.sortDescending",
    );

    sortButton("title").onClick();
    await settle();
    expect(lastListParams().ordering).toBe("-title");
    expect(sortButton("title")["aria-label"]).toBe(
      "mapo.listTable.clearSorting",
    );

    sortButton("title").onClick();
    await settle();
    expect(lastListParams()).not.toHaveProperty("ordering");
    expect(router.replace).toHaveBeenLastCalledWith({ query: {} });
  });

  it("restores the order from the URL into the header", async () => {
    route.query = { ordering: "-title" };
    mountTable(sortableProps);
    await settle();

    expect(lastListParams().ordering).toBe("-title");
    expect(sortButton("title").icon).toBe("i-lucide-arrow-down-wide-narrow");
  });

  it("keeps a plain header on a column that is not sortable", async () => {
    mountTable(sortableProps);
    await settle();

    expect(column("status").header).toBe("Status");
  });
});

describe("MapoListTable nested column keys", () => {
  const analyses = [
    { id: 1, title: "Glucose", category: { name: "Blood" } },
    { id: 2, title: "Urea", category: { name: "Urine" } },
    { id: 3, title: "Iron", category: null },
  ];
  const nestedColumns = [
    { key: "title", label: "Title" },
    { key: "category.name", label: "Category", sortable: true },
  ];

  it("shows a related object's field and sorts on it with a Django lookup", async () => {
    crud.list.mockResolvedValue({ results: analyses, count: 3 });
    mountTable({ endpoint: "/api/analyses/", columns: nestedColumns });
    await settle();

    const cell = column("category.name").cell!;
    expect(cell({ row: { original: analyses[0]!, index: 0 } })).toBe("Blood");
    expect(cell({ row: { original: analyses[2]!, index: 2 } })).toBe("—");

    sortButton("category.name").onClick();
    await settle();
    expect(lastListParams().ordering).toBe("category__name");
  });

  const shownTitles = () => table.data.map((row) => row.title);

  it("sorts nested values in offline mode", async () => {
    mountTable({ items: analyses, columns: nestedColumns });
    await settle();

    sortButton("category.name").onClick();
    sortButton("category.name").onClick(); // descending
    await settle();

    // A row without the related object goes last, as for any empty value.
    expect(shownTitles()).toEqual(["Urea", "Glucose", "Iron"]);
  });

  it("searches nested values in offline mode", async () => {
    route.query = { search: "blood" };
    mountTable({ items: analyses, columns: nestedColumns });
    await settle();

    expect(shownTitles()).toEqual(["Glucose"]);
  });

  it("hands bulk actions the same ordering as the list request", async () => {
    const onSelectionQuery = vi.fn();
    crud.list.mockResolvedValue({ results: analyses, count: 3 });
    mountTable({
      endpoint: "/api/analyses/",
      columns: nestedColumns,
      "onUpdate:selectionQuery": onSelectionQuery,
    });
    await settle();

    sortButton("category.name").onClick();
    sortButton("category.name").onClick(); // descending
    await settle();
    // Select a row, as before running a bulk action.
    const checkbox = column("__select__").cell!({
      row: { original: analyses[0]!, index: 0 },
    }) as VNode;
    (checkbox.props as { "onUpdate:modelValue": () => void })[
      "onUpdate:modelValue"
    ]();
    await settle();

    const query = onSelectionQuery.mock.lastCall?.[0] as URLSearchParams;
    expect(query.toString()).toBe("page_size=20&ordering=-category__name");
  });
});

describe("MapoListTable all rows", () => {
  it("offers 'all' and then requests the list without pagination", async () => {
    mountTable({ ...listProps, pageSizeOptions: [10, "all"] });
    await settle();

    expect(pageSizeSelect.items).toEqual([
      { label: "mapo.listTable.perPage", value: 10 },
      { label: "mapo.listTable.allRows", value: ALL_ROWS },
    ]);

    pageSizeSelect.select(ALL_ROWS);
    await settle();

    expect(lastListParams()).toEqual({});
    expect(router.replace).toHaveBeenLastCalledWith({
      query: { page_size: "all" },
    });
    expect(pagerMounted).toBe(false);
  });

  it("restores 'all' from the URL", async () => {
    route.query = { page_size: "all" };
    mountTable({ ...listProps, pageSizeOptions: [10, "all"] });
    await settle();

    expect(lastListParams()).toEqual({});
    expect(pagerMounted).toBe(false);
  });
});

describe("MapoListTable empty state", () => {
  beforeEach(() => {
    crud.list.mockResolvedValue({ results: [], count: 0 });
  });

  it("tells an empty list from a search with no match", async () => {
    mountTable(listProps);
    await settle();
    expect(table.empty).toBe("mapo.listTable.noItems");

    app?.unmount();
    route.query = { search: "zzz" };
    mountTable(listProps);
    await settle();
    expect(table.empty).toBe("mapo.listTable.noResults");
  });
});
