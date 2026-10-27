import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick, onUnmounted } from "vue";
import type { App, Component, SetupContext } from "vue";

import MapoDetailLangSwitch from "../runtime/components/MapoDetailLangSwitch.vue";

const route = vi.hoisted(() => ({ query: {} as Record<string, string> }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("#app", () => ({ useRoute: () => route, useRouter: () => router }));

// Tests run in Node without a DOM. A renderer whose nodes are plain objects is
// enough to mount the component with real reactivity, watchers and events. The
// tabs are template refs the switch scrolls into view, hence the no-op method.
interface HeadlessNode {
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  scrollIntoView(): void;
}

const headlessNode = (): HeadlessNode => ({
  parent: null,
  children: [],
  scrollIntoView: () => {},
});

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

// `USelectMenu` declares the contract the switch binds: `modelValue` and `items`
// in, `update:modelValue` out with the picked item's value (`value-key="value"`),
// and a default slot that receives `modelValue` and `open`.
interface SelectItem {
  label: string;
  value: string;
}
let select: { readonly items: SelectItem[]; pick(value: string): void } | null =
  null;

const USelectMenu: Component = {
  name: "USelectMenu",
  props: { modelValue: String, items: Array },
  emits: ["update:modelValue"],
  setup(
    props: { modelValue?: string; items?: SelectItem[] },
    { emit, slots }: SetupContext<["update:modelValue"]>,
  ) {
    select = {
      get items() {
        return props.items ?? [];
      },
      pick: (value) => emit("update:modelValue", value),
    };
    onUnmounted(() => {
      select = null;
    });
    return () =>
      h(
        "button",
        null,
        slots.default?.({ modelValue: props.modelValue, open: false }),
      );
  },
};

const NINE_LANGS = ["it", "en", "fr", "de", "es", "pt", "nl", "pl", "ru"];
const changes = vi.fn();

let app: App<HeadlessNode> | undefined;

function mountSwitch(props: Record<string, unknown>) {
  const root: Component = {
    render: () =>
      h(MapoDetailLangSwitch as Component, {
        modelValue: "it",
        "onUpdate:modelValue": changes,
        ...props,
      }),
  };
  app = createApp(root);
  app.component("USelectMenu", USelectMenu);
  app.mount(headlessNode());
}

beforeEach(() => {
  route.query = {};
  router.replace.mockReset();
  changes.mockReset();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoDetailLangSwitch", () => {
  it("shows only the tabs up to the threshold", async () => {
    mountSwitch({ langs: NINE_LANGS.slice(0, 8) });
    await nextTick();

    expect(select).toBeNull();
  });

  it("adds the select above the threshold", async () => {
    mountSwitch({ langs: NINE_LANGS });
    await nextTick();

    expect(select?.items.map((item) => item.value)).toEqual(NINE_LANGS);
  });

  it("follows a custom threshold", async () => {
    mountSwitch({ langs: ["it", "en"], langThreshold: 0 });
    await nextTick();

    expect(select).not.toBeNull();
  });

  it("switches language from the select", async () => {
    mountSwitch({ langs: NINE_LANGS });
    await nextTick();

    select?.pick("de");

    expect(changes).toHaveBeenCalledWith("de");
    expect(router.replace).toHaveBeenCalledWith({ query: { lang: "de" } });
  });
});
