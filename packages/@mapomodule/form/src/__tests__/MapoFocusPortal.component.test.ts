import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, h, ref } from "vue";
import type { App, Component, SetupContext } from "vue";

import MapoFocusPortal from "../runtime/components/MapoFocusPortal.vue";
import { useFocusMode } from "../runtime/composables/useFocusMode.js";
import type { FieldAnnotations } from "../runtime/types/index.js";
import { createApp, headlessNode } from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// The portal renders the item with `MapoForm`: the stub keeps the props it
// receives, which is what the portal is responsible for.
const form = vi.hoisted(() => ({
  props: null as { errors?: unknown; annotations?: unknown } | null,
}));
vi.mock("../runtime/components/MapoForm.vue", () => ({
  default: {
    name: "MapoForm",
    props: [
      "modelValue",
      "fields",
      "errors",
      "languages",
      "currentLang",
      "registry",
      "annotations",
    ],
    setup(props: { errors?: unknown; annotations?: unknown }) {
      form.props = props;
      return () => null;
    },
  },
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const passthrough = (name: string): Component => ({
  name,
  inheritAttrs: false,
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h("span", null, slots.default?.());
  },
});

let app: App<HeadlessNode> | undefined;

beforeEach(() => {
  // The portal listens for Escape on `window`; `<Transition>` measures the
  // element through `window` and waits for animation frames.
  vi.stubGlobal("window", {
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: () => ({}),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 0;
  });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  useFocusMode().exit();
  form.props = null;
  vi.unstubAllGlobals();
});

describe("MapoFocusPortal", () => {
  it("passes the item's errors and annotations to its form", () => {
    const annotations = ref<FieldAnnotations>({
      title: { label: "Suggested by AI" },
    });
    useFocusMode().enter({
      descriptor: { key: "blocks", type: "repeater" },
      fields: [{ key: "title", type: "text" }],
      model: { title: "La storia" },
      errors: ref({ title: ["Too long."] }),
      annotations: computed(() => annotations.value),
      onUpdate: vi.fn(),
      registry: { mapping: {}, attrs: {}, accessor: {} },
      languages: [],
      currentLang: "",
      breadcrumb: ["Page", "Blocks", "Block 1"],
    });

    const host: Component = { render: () => h(MapoFocusPortal) };
    app = createApp(host);
    app.component("UIcon", passthrough("UIcon"));
    app.component("UButton", passthrough("UButton"));
    app.mount(headlessNode());

    expect(form.props?.errors).toEqual({ title: ["Too long."] });
    expect(form.props?.annotations).toEqual({
      title: { label: "Suggested by AI" },
    });
  });
});
