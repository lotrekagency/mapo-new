import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, nextTick, provide, ref } from "vue";
import type { App, Component, Ref } from "vue";

import MapoFormGroup from "../runtime/components/MapoFormGroup.vue";
import { FORM_KEY } from "../runtime/composables/useMapoForm.js";
import type { MapoFormContext } from "../runtime/composables/useMapoForm.js";
import type { AnyFieldDescriptor } from "../runtime/types/index.js";
import type { FieldRevealRequest } from "../runtime/utils/reveal.js";
import { createApp, findAll, headlessNode } from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// `useMapoForm.ts` pulls in `nuxt/app` through `useMapoT`, which cannot resolve
// outside a Nuxt build. The group only injects the form context.
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));
// The group reads whether groups start open from the app's config.
vi.mock("#app", () => ({ useRuntimeConfig: () => ({ public: {} }) }));
// The fields are out of scope: each renders its key, so a test sees which
// ones the group shows.
vi.mock("../runtime/components/MapoFormField.vue", async () => {
  const { h: render } = await import("vue");
  return {
    default: {
      name: "MapoFormField",
      props: { descriptor: { type: Object, required: true } },
      setup: (props: { descriptor: AnyFieldDescriptor }) => () =>
        render("div", { "data-field": props.descriptor.key }),
    },
  };
});

const UIcon: Component = { render: () => h("i") };

let app: App<HeadlessNode> | undefined;

interface GroupProps {
  fields: AnyFieldDescriptor[];
  subtabs?: Map<string, AnyFieldDescriptor[]>;
}

/** Mounts a closed group in a form whose `reveal` the test sets. */
function mountGroup(
  reveal: Ref<FieldRevealRequest | undefined>,
  props: GroupProps,
) {
  const context = {
    model: ref({}),
    currentLang: ref(""),
    reveal,
  } as unknown as MapoFormContext<Record<string, unknown>>;
  const host: Component = {
    setup() {
      provide(FORM_KEY, context);
      return () =>
        h(MapoFormGroup, { name: "details", initialExpanded: false, ...props });
    },
  };
  app = createApp(host);
  app.component("UIcon", UIcon);
  const root = headlessNode();
  app.mount(root);
  return root;
}

/** Whether a node shows: no element around it is hidden by `v-show`. */
function isShown(node: HeadlessNode | null): boolean {
  if (!node) return true;
  return node.style.display !== "none" && isShown(node.parent);
}

/** The keys of the fields the group shows. */
const shownFields = (root: HeadlessNode) =>
  findAll(root, (node) => node.props["data-field"] !== undefined)
    .filter(isShown)
    .map((node) => node.props["data-field"]);

/** A request of `revealField()` for the field of `key`. */
const request = (key: string): FieldRevealRequest => ({
  path: key,
  key,
  rest: "",
  settle: vi.fn(),
});

const field = (key: string): AnyFieldDescriptor => ({ key, type: "text" });

// The group listens for Escape on the page, which the headless renderer has not.
beforeEach(() => {
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    body: { style: {} },
  });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("MapoFormGroup reveal", () => {
  it("opens when the form reveals one of its fields", async () => {
    const reveal = ref<FieldRevealRequest | undefined>();
    const root = mountGroup(reveal, {
      fields: [field("title"), field("slug")],
    });
    expect(shownFields(root)).toEqual([]);

    reveal.value = request("slug");
    await nextTick();

    expect(shownFields(root)).toEqual(["title", "slug"]);
  });

  it("opens the sub-tab that holds the field", async () => {
    const reveal = ref<FieldRevealRequest | undefined>();
    const subtabs = new Map([
      ["Basics", [field("name")]],
      ["More", [field("notes")]],
    ]);
    const root = mountGroup(reveal, { fields: [], subtabs });

    reveal.value = request("notes");
    await nextTick();

    expect(shownFields(root)).toEqual(["notes"]);
  });

  it("stays closed for a field of another group", async () => {
    const reveal = ref<FieldRevealRequest | undefined>();
    const root = mountGroup(reveal, { fields: [field("title")] });

    reveal.value = request("seo_title");
    await nextTick();

    expect(shownFields(root)).toEqual([]);
  });
});
