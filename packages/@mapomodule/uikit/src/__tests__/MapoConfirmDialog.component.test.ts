import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick, onUnmounted, ref } from "vue";
import type { App, Component, SetupContext } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";

import MapoConfirmDialog from "../runtime/components/MapoConfirmDialog.vue";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

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

// Nuxt UI overlays have no z-index: they stack in the order their portals enter
// <body>, which is the order the overlays mount. The stubs record that order.
const mountOrder: string[] = [];

// `UModal` declares what the dialog binds: `open` in, and `after:leave` out once
// the close animation has ended.
let modal: { readonly open: boolean | undefined; finishLeave(): void } | null =
  null;

const UModal: Component = {
  name: "UModal",
  props: { open: Boolean, dismissible: Boolean },
  emits: ["after:leave"],
  setup(props: { open?: boolean }, { emit }: SetupContext<["after:leave"]>) {
    mountOrder.push("confirm");
    modal = {
      get open() {
        return props.open;
      },
      finishLeave: () => emit("after:leave"),
    };
    onUnmounted(() => {
      modal = null;
    });
    return () => h("div");
  },
};

// An overlay that a page opens once the layout is already there, like the media
// editor drawer.
const Drawer: Component = {
  name: "Drawer",
  setup() {
    mountOrder.push("drawer");
    return () => h("div");
  },
};

const drawerOpen = ref(false);

let app: App<HeadlessNode> | undefined;

/** Mounts the dialog the way the layout does; returns the store that drives it. */
function mountLayout() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const root: Component = {
    // The page comes first, then the root components, as in `mapo-default`.
    render: () => [
      drawerOpen.value ? h(Drawer) : null,
      h(MapoConfirmDialog as Component),
    ],
  };
  app = createApp(root);
  app.use(pinia);
  app.component("UModal", UModal);
  app.component("UButton", passthrough("UButton"));
  app.mount(headlessNode());
  return useConfirmStore();
}

beforeEach(() => {
  mountOrder.length = 0;
  drawerOpen.value = false;
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoConfirmDialog", () => {
  it("opens above an overlay the page opened after the layout", async () => {
    const confirm = mountLayout();
    drawerOpen.value = true;
    await nextTick();

    void confirm.ask({ message: "Delete?" });
    await nextTick();

    expect(modal?.open).toBe(true);
    expect(mountOrder).toEqual(["drawer", "confirm"]);
  });

  it("stays mounted until its close animation has ended", async () => {
    const confirm = mountLayout();
    const answer = confirm.ask({ message: "Delete?" });
    await nextTick();

    confirm.confirm();
    await nextTick();

    expect(modal?.open).toBe(false);
    modal?.finishLeave();
    await nextTick();

    expect(modal).toBeNull();
    await expect(answer).resolves.toBe(true);
  });

  it("stays open when asked again while it was closing", async () => {
    const confirm = mountLayout();
    void confirm.ask({ message: "First?" });
    await nextTick();
    confirm.cancel();
    await nextTick();
    const closing = modal;

    void confirm.ask({ message: "Second?" });
    await nextTick();
    // The first close animation reports its end after the second question.
    closing?.finishLeave();
    await nextTick();

    expect(modal?.open).toBe(true);
  });
});
