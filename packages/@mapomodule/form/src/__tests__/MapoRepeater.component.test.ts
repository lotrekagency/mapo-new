import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick, ref } from "vue";
import type { App, Component } from "vue";

import MapoRepeater from "../runtime/components/fields/MapoRepeater.vue";
import type { RepeaterDescriptor } from "../runtime/types/index.js";

// The field writes the repeater's list into the model once its debounce has
// run out. Until then the repeater shows and changes the list it emitted
// last, so a second change made meanwhile (another item's edit, a second
// "Add") keeps the first. Here the parent writes the list only when a test
// says so, as the field does after its debounce.

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
// Drops a list, as the drag-and-drop list does when an item is moved.
const draggable = vi.hoisted(() => ({
  drop: undefined as ((list: Record<string, unknown>[]) => void) | undefined,
}));
vi.mock("vue-draggable-plus", () => ({
  VueDraggable: {
    name: "VueDraggable",
    props: { modelValue: { type: Array, default: undefined } },
    emits: ["update:modelValue"],
    setup(
      _: unknown,
      {
        slots,
        emit,
      }: {
        slots: { default?: () => unknown };
        emit: (event: "update:modelValue", list: unknown[]) => void;
      },
    ) {
      draggable.drop = (list) => emit("update:modelValue", list);
      return () => slots.default?.();
    },
  },
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => ({ ask: async () => true }),
}));
vi.mock("../runtime/composables/useMapoForm.js", async () => {
  const { ref } = await import("vue");
  const form = {
    languages: [],
    currentLang: ref(""),
    registry: {},
    errors: ref({}),
  };
  return { injectMapoForm: () => form };
});
vi.mock("../runtime/components/fields/MapoRepeaterBlockPicker.vue", () => ({
  default: { name: "MapoRepeaterBlockPicker", render: () => null },
}));

interface Row {
  props: { item: Record<string, unknown>; index: number };
  emit: (event: "update:item", item: Record<string, unknown>) => void;
}

// The repeater items on screen, and how many have mounted so far.
const rows = vi.hoisted(() => ({ live: [] as Row[], mounts: 0 }));
vi.mock("../runtime/components/fields/MapoRepeaterItem.vue", async () => {
  const { onUnmounted } = await import("vue");
  return {
    default: {
      name: "MapoRepeaterItem",
      props: {
        item: { type: Object, required: true },
        index: { type: Number, required: true },
      },
      emits: [
        "update:item",
        "delete",
        "duplicate",
        "move-up",
        "move-down",
        "move-to",
        "toggle-select",
      ],
      setup(props: Row["props"], { emit }: { emit: Row["emit"] }) {
        const row = { props, emit };
        rows.live.push(row);
        rows.mounts++;
        onUnmounted(() => rows.live.splice(rows.live.indexOf(row), 1));
        return () => null;
      },
    },
  };
});

// Tests run in Node without a DOM: a renderer whose nodes are plain objects
// and keep their props, so a test can find a button and press it.
interface HeadlessNode {
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  props: Record<string, unknown>;
}
const headlessNode = (): HeadlessNode => ({
  parent: null,
  children: [],
  props: {},
});
const treeOrder = (node: HeadlessNode): HeadlessNode[] => [
  node,
  ...node.children.flatMap(treeOrder),
];
const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: headlessNode,
  createText: headlessNode,
  createComment: headlessNode,
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

const descriptor: RepeaterDescriptor = {
  key: "blocks",
  type: "repeater",
  fields: [{ key: "title", type: "text" }],
  attrs: { confirmDelete: false },
};

// The list in the model, and every list the repeater emitted.
const model = ref<Record<string, unknown>[]>([]);
let emitted: Record<string, unknown>[][] = [];
let app: App<HeadlessNode> | undefined;
let root = headlessNode();

const nuxtUiStub: Component = { render: () => null };
// Keeps its attributes (icon, onClick), so a test can find and press it.
const buttonStub: Component = { render: () => h("button") };
// Renders its content at once: Nuxt's ClientOnly, on the client.
const slotOnly: Component = {
  setup:
    (_, { slots }) =>
    () =>
      slots.default?.(),
};

function mountRepeater() {
  app = createApp({
    render: () =>
      h(MapoRepeater as Component, {
        modelValue: model.value,
        descriptor,
        "onUpdate:modelValue": (list: Record<string, unknown>[]) =>
          emitted.push(list),
      }),
  });
  app.component("ClientOnly", slotOnly);
  app.component("UButton", buttonStub);
  app.component("USelectMenu", nuxtUiStub);
  app.component("UIcon", nuxtUiStub);
  root = headlessNode();
  app.mount(root);
}

/** The field writes the last list the repeater emitted into the model. */
async function writeLastList() {
  model.value = emitted.at(-1)!;
  await nextTick();
}

const row = (index: number) =>
  rows.live.find((candidate) => candidate.props.index === index)!;

/** The items on screen, in their order. */
const shownItems = () =>
  [...rows.live]
    .sort((a, b) => a.props.index - b.props.index)
    .map((candidate) => candidate.props.item);

function press(title: string) {
  const button = treeOrder(root).find((node) => node.props.title === title)!;
  (button.props.onClick as () => void)();
}

async function pressAdd() {
  const add = treeOrder(root).find(
    (node) => node.props.icon === "i-lucide-plus",
  )!;
  (add.props.onClick as () => void)();
  await nextTick();
}

beforeEach(() => {
  model.value = [{ title: "A" }, { title: "B" }];
  emitted = [];
  rows.live = [];
  rows.mounts = 0;
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoRepeater, before the field has written its list", () => {
  it("keeps the edit of an item when another item's edit follows", async () => {
    mountRepeater();

    row(0).emit("update:item", { title: "A2" });
    await nextTick();
    row(1).emit("update:item", { title: "B2" });
    await nextTick();

    expect(emitted.at(-1)).toEqual([{ title: "A2" }, { title: "B2" }]);
  });

  it("adds an item for each press of Add", async () => {
    mountRepeater();

    await pressAdd();
    await pressAdd();

    expect(emitted.at(-1)).toHaveLength(4);
  });

  it("shows the list it emitted at once, and keeps its rows once the field has written it", async () => {
    mountRepeater();
    await pressAdd();

    expect(rows.live).toHaveLength(3);
    const mounts = rows.mounts;

    await writeLastList();

    expect(rows.live).toHaveLength(3);
    expect(rows.mounts).toBe(mounts);
  });

  it("shows a list that comes from outside instead", async () => {
    mountRepeater();
    await pressAdd();

    model.value = [{ title: "C" }];
    await nextTick();

    expect(rows.live.map((candidate) => candidate.props.item)).toEqual([
      { title: "C" },
    ]);
  });

  it("shows the model's list once the model changes it in place", async () => {
    mountRepeater();
    await pressAdd();

    model.value.push({ title: "C" });
    await nextTick();

    expect(shownItems()).toEqual([
      { title: "A" },
      { title: "B" },
      { title: "C" },
    ]);
  });

  it("takes a dropped order, and the next change starts from it", async () => {
    mountRepeater();

    draggable.drop!([...model.value].reverse());
    await nextTick();
    row(0).emit("update:item", { title: "B2" });
    await nextTick();

    expect(emitted.at(-1)).toEqual([{ title: "B2" }, { title: "A" }]);
  });

  it("undoes from the list it shows", async () => {
    mountRepeater();
    await pressAdd();

    press("mapo.repeater.undoLastAction");
    await nextTick();

    expect(shownItems()).toEqual([{ title: "A" }, { title: "B" }]);
    expect(emitted.at(-1)).toEqual([{ title: "A" }, { title: "B" }]);
  });
});
