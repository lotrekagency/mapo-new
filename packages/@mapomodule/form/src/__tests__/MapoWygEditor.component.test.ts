import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick, ref } from "vue";
import type { App, Component, SetupContext } from "vue";

import MapoWygEditor from "../runtime/components/fields/MapoWygEditor.vue";
import type { EditorDescriptor } from "../runtime/types/index.js";
import { createApp, headlessNode } from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// Tiptap needs a DOM: the test sees the editor through what the field asks
// of it. `setEditable` is the call under test.
const tiptap = vi.hoisted(() => {
  const chain: Record<string, () => unknown> = new Proxy(
    {},
    { get: () => () => chain },
  );
  return {
    editor: {
      setEditable: vi.fn(),
      getHTML: () => "<p>Ten years of open data</p>",
      isActive: () => false,
      chain: () => chain,
      commands: { setContent: vi.fn() },
      destroy: vi.fn(),
    },
  };
});

vi.mock("@tiptap/vue-3", async () => {
  const { shallowRef } = await import("vue");
  return {
    useEditor: () => shallowRef(tiptap.editor),
    EditorContent: { name: "EditorContent", render: () => null },
  };
});
vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-link", () => ({
  default: { configure: () => ({}) },
}));
vi.mock("@tiptap/extension-underline", () => ({ default: {} }));
vi.mock("@tiptap/extension-image", () => ({
  default: { configure: () => ({}) },
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

/** Renders its default slot: the toolbar's Nuxt UI parts. */
const passThrough = (name: string): Component => ({
  name,
  setup:
    (_props: object, { slots }: SetupContext) =>
    () =>
      h("div", null, slots.default?.()),
});

let app: App<HeadlessNode> | undefined;

const descriptor: EditorDescriptor = { key: "body", type: "editor" };

afterEach(() => {
  app?.unmount();
  app = undefined;
  tiptap.editor.setEditable.mockClear();
});

describe("MapoWygEditor", () => {
  it("makes the editor read-only without an update, so the value stays the one the field holds", async () => {
    const readonly = ref(false);
    const updates: unknown[] = [];
    const host: Component = {
      render: () =>
        h(MapoWygEditor, {
          modelValue: "<p>Ten years of open data</p>",
          descriptor,
          readonly: readonly.value,
          "onUpdate:modelValue": (value: unknown) => updates.push(value),
        }),
    };
    app = createApp(host);
    for (const name of ["UButton", "USeparator", "UTooltip"]) {
      app.component(name, passThrough(name));
    }
    app.mount(headlessNode());

    readonly.value = true;
    await nextTick();
    expect(tiptap.editor.setEditable).toHaveBeenLastCalledWith(false, false);

    readonly.value = false;
    await nextTick();
    expect(tiptap.editor.setEditable).toHaveBeenLastCalledWith(true, false);
    expect(updates).toEqual([]);
  });
});
