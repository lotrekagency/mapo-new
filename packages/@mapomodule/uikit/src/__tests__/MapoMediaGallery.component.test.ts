import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h } from "vue";
import type { App, Component, SetupContext } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { Pinia } from "pinia";

import MapoMediaGallery from "../runtime/components/MapoMediaGallery.vue";
import { useMediaStore } from "../runtime/stores/media";
import { MEDIA_DRAG_TYPE } from "../runtime/utils/mediaDrag";
import type { MediaItem } from "../runtime/types/media";

// Gallery cards dragged onto the folder tree: what a drag carries and when a
// card can be dragged at all.
const permissions = vi.hoisted(() => ({ canChange: true }));

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({ public: {} }),
  useNuxtApp: () => ({}),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => ({}) }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => ({ ask: vi.fn() }),
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));
vi.mock("@mapomodule/store/runtime/composables/usePermissions", () => ({
  usePermissions: () => ({ canChange: () => permissions.canChange }),
}));

// Tests run in Node without a DOM. A renderer whose nodes are plain objects
// keeps each element's props, so the tests can call its listeners.
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

const passthrough = (name: string): Component => ({
  name,
  inheritAttrs: false,
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h("div", null, slots.default?.({ triggerPick: () => {} }));
  },
});

const stubs: Record<string, Component> = Object.fromEntries(
  [
    "MapoDropArea",
    "UButton",
    "UCheckbox",
    "USkeleton",
    "UPagination",
    "UIcon",
    "MapoMediaPreview",
    "MapoMediaFolderPicker",
  ].map((name) => [name, passthrough(name)]),
);

const media = (id: number): MediaItem => ({
  id,
  file: `/media/${id}.jpg`,
  mime_type: "image/jpeg",
  title: `Photo ${id}`,
  alt_text: "",
  description: "",
  size: 1000,
  created: "2026-11-01T00:00:00Z",
  modified: "2026-11-01T00:00:00Z",
});

// A drag event with the data transfer the gallery writes to.
function dragEvent() {
  const data: Record<string, string> = {};
  const dataTransfer = {
    types: [] as string[],
    effectAllowed: "all",
    setData(type: string, value: string) {
      data[type] = value;
      dataTransfer.types.push(type);
    },
  };
  return { event: { dataTransfer }, data };
}

const all = (node: HeadlessNode): HeadlessNode[] => [
  node,
  ...node.children.flatMap(all),
];
// The cards, in the order of `store.medias`: the elements a drag starts from.
const cards = () => all(root).filter((node) => "onDragstart" in node.props);
const settle = () => new Promise((resolve) => setTimeout(resolve));

let app: App<HeadlessNode> | undefined;
let pinia: Pinia;
let root: HeadlessNode;

async function mountGallery() {
  root = headlessNode();
  app = createApp({ render: () => h(MapoMediaGallery as Component) });
  app.use(pinia);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(root);
  await settle();
}

function dragCard(index: number) {
  const drag = dragEvent();
  const onDragstart = cards()[index]?.props.onDragstart as (e: unknown) => void;
  onDragstart(drag.event);
  return drag;
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  permissions.canChange = true;
  useMediaStore().medias = [media(7), media(8), media(9)];
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoMediaGallery dragging cards", () => {
  it("drags a card as a media drag", async () => {
    await mountGallery();

    const { data } = dragCard(0);

    expect(cards()[0]?.props.draggable).toBe(true);
    expect(useMediaStore().dragged).toEqual({ kind: "media", ids: [7] });
    expect(data[MEDIA_DRAG_TYPE]).toBeDefined();
  });

  it("takes the whole bulk selection from one of its cards", async () => {
    useMediaStore().editList = [8, 9];
    await mountGallery();

    dragCard(2);

    expect(useMediaStore().dragged).toEqual({ kind: "media", ids: [8, 9] });
  });

  it("dims the dragged cards until the drag ends", async () => {
    useMediaStore().editList = [8, 9];
    await mountGallery();

    dragCard(1);
    await settle();
    const dimmed = () =>
      cards().map((card) => String(card.props.class).includes("opacity-50"));
    expect(dimmed()).toEqual([false, true, true]);

    (cards()[1]?.props.onDragend as () => void)();
    await settle();
    expect(useMediaStore().dragged).toBeNull();
    expect(dimmed()).toEqual([false, false, false]);
  });

  it("does not drag without the change permission, nor in a picker", async () => {
    permissions.canChange = false;
    await mountGallery();

    dragCard(0);
    expect(cards()[0]?.props.draggable).toBe(false);
    expect(useMediaStore().dragged).toBeNull();

    app?.unmount();
    permissions.canChange = true;
    useMediaStore().setSelectionMode("single");
    await mountGallery();

    dragCard(0);
    expect(useMediaStore().dragged).toBeNull();
  });
});
