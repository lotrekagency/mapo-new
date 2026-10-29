import { describe, expect, it, vi } from "vitest";
import { createRenderer, nextTick, ref } from "vue";
import type { Component } from "vue";
import { createPinia, setActivePinia } from "pinia";

import MapoSnackBar from "../runtime/components/MapoSnackBar.vue";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";

const toast = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  toasts: null as { value: { id: string }[] } | null,
}));

vi.mock("@nuxt/ui/composables/useToast", () => ({
  useToast: () => toast,
}));

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

describe("MapoSnackBar", () => {
  it("removes store messages evicted from Nuxt UI's toast queue", async () => {
    setActivePinia(createPinia());
    const activeToasts = ref<{ id: string }[]>([]);
    toast.toasts = activeToasts;
    toast.add.mockImplementation((item: { id: string }) => {
      activeToasts.value = [...activeToasts.value, item].slice(-5);
    });
    toast.remove.mockImplementation((id: string) => {
      activeToasts.value = activeToasts.value.filter((item) => item.id !== id);
    });

    const app = createApp(MapoSnackBar as Component);
    app.mount(headlessNode());
    const snack = useSnackStore();

    for (let index = 0; index < 8; index++) {
      snack.show(`Message ${index}`);
    }
    await nextTick();

    expect(snack.messages).toHaveLength(5);
    expect(snack.messages.map(({ id }) => String(id))).toEqual(
      activeToasts.value.map(({ id }) => id),
    );

    snack.dismissAll();
    await nextTick();

    expect(activeToasts.value).toEqual([]);
    app.unmount();
  });
});
