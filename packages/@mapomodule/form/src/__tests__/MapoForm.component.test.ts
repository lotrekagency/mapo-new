import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick } from "vue";
import type { App, Component } from "vue";

import MapoForm from "../runtime/components/MapoForm.vue";
import type { MapoFormContext } from "../runtime/composables/useMapoForm.js";
import { defaultRegistry } from "../runtime/registry/defaults.js";

// MapoForm's fields write into `modelValue` in place. MapoForm tells the parent
// each time with `update:modelValue`, as its API documents: a parent that
// binds a copy and listens to the event gets every edit.

vi.mock("#app", () => ({
  useNuxtApp: () => ({}),
  useRuntimeConfig: () => ({ public: { mapoForm: {} } }),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/store/runtime/stores/auth", () => ({
  useAuthStore: () => ({ info: null }),
}));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: () => {} }),
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));

// The form context a field gets, to write as a field does.
const field = vi.hoisted(() => ({
  form: undefined as MapoFormContext<Record<string, unknown>> | undefined,
}));
vi.mock("../runtime/components/MapoFormField.vue", async () => {
  const { injectMapoForm } =
    await import("../runtime/composables/useMapoForm.js");
  return {
    default: {
      name: "MapoFormField",
      props: { descriptor: { type: Object, required: true } },
      setup() {
        field.form ??= injectMapoForm();
        return () => null;
      },
    },
  };
});

// Tests run in Node without a DOM: a renderer whose nodes are plain objects.
// `style` is what `v-show` sets.
interface HeadlessNode {
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  style: Record<string, string>;
}
const headlessNode = (): HeadlessNode => ({
  parent: null,
  children: [],
  style: {},
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

const nuxtUiStub: Component = { render: () => null };

let app: App<HeadlessNode> | undefined;

beforeEach(() => {
  field.form = undefined;
  // The flat section listens for Escape on the document.
  vi.stubGlobal("document", {
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { style: { overflow: "" } },
  });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("MapoForm", () => {
  it("emits update:modelValue with the model once a field has written into it", async () => {
    const model: Record<string, unknown> = { title: "" };
    const updates: unknown[] = [];
    app = createApp({
      render: () =>
        h(MapoForm as Component, {
          modelValue: model,
          fields: [{ key: "title", type: "text" }],
          registry: defaultRegistry,
          "onUpdate:modelValue": (value: unknown) => updates.push(value),
        }),
    });
    app.component("UIcon", nuxtUiStub);
    app.component("UButton", nuxtUiStub);
    app.mount(headlessNode());
    await nextTick();

    field.form!.setFieldValue("title", "Hello");

    expect(updates).toEqual([model]);
    expect(updates[0]).toBe(model);
    expect(model.title).toBe("Hello");
  });
});
