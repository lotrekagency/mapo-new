import { afterEach, describe, expect, it, vi } from "vitest";
import { h, provide } from "vue";
import type { App, Component } from "vue";

import MapoForm from "../runtime/components/MapoForm.vue";
import type { FieldRegistry } from "../runtime/types/index.js";
import { createApp, headlessNode } from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// The form runs `useMapoForm`, which reads these at setup.
vi.mock("#app", () => ({
  useNuxtApp: () => ({}),
  useRuntimeConfig: () => ({ public: {} }),
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/auth", () => ({
  useAuthStore: () => ({ info: null }),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
// The layout is out of scope: the tests look at what the form registers.
vi.mock("../runtime/components/MapoFormGroup.vue", () => ({
  default: { name: "MapoFormGroup", render: () => null },
}));
vi.mock("../runtime/components/MapoFormTabs.vue", () => ({
  default: { name: "MapoFormTabs", render: () => null },
}));
vi.mock("../runtime/components/MapoFormFlatSection.vue", () => ({
  default: { name: "MapoFormFlatSection", render: () => null },
}));

const registry: FieldRegistry = { mapping: {}, attrs: {}, accessor: {} };

let app: App<HeadlessNode> | undefined;

/** Mounts a form inside a detail page that collects its `revealField`. */
function mountInDetail(register: (fn: unknown) => () => void) {
  const host: Component = {
    setup() {
      provide("mapoDetailRegisterReveal", register);
      // A generic component: `h()` cannot infer its props.
      return () =>
        h(MapoForm as Component, {
          modelValue: { title: "" },
          fields: [{ key: "title", type: "text" }],
          registry,
        });
    },
  };
  app = createApp(host);
  app.mount(headlessNode());
}

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoForm in a detail page", () => {
  it("lets the detail bring its fields into view, while it is there", async () => {
    const unregister = vi.fn();
    const register = vi.fn((_fn: unknown) => unregister);
    mountInDetail(register);

    expect(register).toHaveBeenCalledTimes(1);
    const revealField = register.mock.calls[0]?.[0] as (
      path: string,
    ) => Promise<boolean>;
    await expect(revealField("summary")).resolves.toBe(false);

    app?.unmount();
    app = undefined;
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
