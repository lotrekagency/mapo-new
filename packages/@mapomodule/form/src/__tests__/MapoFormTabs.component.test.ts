import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick, onUnmounted, provide, ref } from "vue";
import type { App, Component, Ref, SetupContext } from "vue";

import MapoFormTabs from "../runtime/components/MapoFormTabs.vue";
import { FORM_KEY } from "../runtime/composables/useMapoForm.js";
import type { MapoFormContext } from "../runtime/composables/useMapoForm.js";
import type {
  AnyFieldDescriptor,
  FieldAnnotation,
  FieldAnnotations,
} from "../runtime/types/index.js";
import type { TabEntry } from "../runtime/types/layout.js";
import type { FieldRevealRequest } from "../runtime/utils/reveal.js";
import {
  createApp,
  findAll,
  headlessNode,
  textOf,
} from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// `useMapoForm.ts` pulls in `nuxt/app` through `useMapoT`, which cannot resolve
// outside a Nuxt build. The tabs only inject the form context.
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));
// The translation shows its key and its parameters, so a test can read them.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, named: Record<string, unknown> = {}) =>
      `${key} ${JSON.stringify(named)}`,
  }),
}));
// The panels are out of scope: the tests look at the tab bar.
vi.mock("../runtime/components/MapoFormGroup.vue", () => ({
  default: { name: "MapoFormGroup", render: () => null },
}));
vi.mock("../runtime/components/MapoFormFlatSection.vue", () => ({
  default: { name: "MapoFormFlatSection", render: () => null },
}));

// `UBadge` declares what the tab binds: `icon`, `color` and `label` as props,
// the role and the accessible name as attributes.
interface BadgeStub {
  readonly icon: unknown;
  readonly color: unknown;
  readonly label: unknown;
  readonly role: unknown;
  readonly ariaLabel: unknown;
}
const badges: BadgeStub[] = [];

const UBadge: Component = {
  name: "UBadge",
  inheritAttrs: false,
  props: { icon: String, color: String, label: [String, Number] },
  setup(
    props: { icon?: string; color?: string; label?: string | number },
    { attrs }: SetupContext,
  ) {
    const stub: BadgeStub = {
      get icon() {
        return props.icon;
      },
      get color() {
        return props.color;
      },
      get label() {
        return props.label;
      },
      get role() {
        return attrs.role;
      },
      get ariaLabel() {
        return attrs["aria-label"];
      },
    };
    badges.push(stub);
    onUnmounted(() => {
      badges.splice(badges.indexOf(stub), 1);
    });
    return () => h("span");
  },
};

const tab = (name: string, fields: AnyFieldDescriptor[]): TabEntry => ({
  name,
  groups: new Map([["__flat__", { fields, subtabs: new Map() }]]),
  children: new Map(),
});

const tabs = [
  tab("content", [
    { key: "title", type: "text" },
    { key: "slug", type: "text" },
    { key: "summary", type: "textarea" },
  ]),
  tab("seo", [{ key: "seo_title", type: "text" }]),
];

let app: App<HeadlessNode> | undefined;

function mountTabs(
  annotations: Ref<FieldAnnotations>,
  reveal?: Ref<FieldRevealRequest | undefined>,
  entries: TabEntry[] = tabs,
) {
  const context = {
    model: ref({}),
    errors: ref({}),
    currentLang: ref(""),
    annotations,
    reveal,
  } as unknown as MapoFormContext<Record<string, unknown>>;
  const host: Component = {
    setup() {
      provide(FORM_KEY, context);
      return () => h(MapoFormTabs, { tabs: entries });
    },
  };
  app = createApp(host);
  app.component("UBadge", UBadge);
  const root = headlessNode();
  app.mount(root);
  return root;
}

/** The names of the tabs that show as open, outer tabs first. */
function openTabs(root: HeadlessNode): string[] {
  return findAll(root, (node) => node.tag === "button")
    .filter((button) =>
      String(button.props.class).includes("border-primary-500"),
    )
    .map(textOf);
}

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoFormTabs annotations", () => {
  const ai: FieldAnnotation = {
    label: "Suggested by AI",
    icon: "i-lucide-sparkles",
    color: "info",
  };
  const toCheck: FieldAnnotation = {
    ...ai,
    label: "To check",
    color: "warning",
  };

  it("shows a badge per icon and color, with its count and an accessible name", async () => {
    const annotations = ref<FieldAnnotations>({
      title: ai,
      summary: ai,
      slug: toCheck,
      seo_title: ai,
    });
    mountTabs(annotations);

    expect(badges).toEqual([
      {
        icon: "i-lucide-sparkles",
        color: "info",
        label: 2,
        role: "img",
        ariaLabel:
          'mapo.form.annotationCount {"n":2,"labels":"Suggested by AI"}',
      },
      {
        icon: "i-lucide-sparkles",
        color: "warning",
        label: 1,
        role: "img",
        ariaLabel: 'mapo.form.annotationCount {"n":1,"labels":"To check"}',
      },
      {
        icon: "i-lucide-sparkles",
        color: "info",
        label: 1,
        role: "img",
        ariaLabel:
          'mapo.form.annotationCount {"n":1,"labels":"Suggested by AI"}',
      },
    ]);
  });

  it("updates the badges when the map changes", async () => {
    const annotations = ref<FieldAnnotations>({ seo_title: ai });
    mountTabs(annotations);
    expect(badges.map((badge) => badge.label)).toEqual([1]);

    annotations.value = { title: ai, slug: ai };
    await nextTick();
    expect(badges.map((badge) => badge.label)).toEqual([2]);

    annotations.value = {};
    await nextTick();
    expect(badges).toEqual([]);
  });
});

describe("MapoFormTabs reveal", () => {
  /** A request of `revealField()` for the field of `key`. */
  const request = (key: string): FieldRevealRequest => ({
    path: key,
    key,
    rest: "",
    settle: vi.fn(),
  });

  it("opens the tab that holds the field the form reveals", async () => {
    const reveal = ref<FieldRevealRequest | undefined>();
    const root = mountTabs(ref({}), reveal);
    expect(openTabs(root)).toEqual(["content"]);

    reveal.value = request("seo_title");
    await nextTick();

    expect(openTabs(root)).toEqual(["seo"]);
  });

  it("opens a child tab and the tab around it", async () => {
    const more: TabEntry = {
      name: "more",
      groups: new Map(),
      children: new Map([
        ["meta", tab("meta", [{ key: "canonical", type: "text" }])],
        ["social", tab("social", [{ key: "og_title", type: "text" }])],
      ]),
    };
    const reveal = ref<FieldRevealRequest | undefined>();
    const root = mountTabs(ref({}), reveal, [...tabs, more]);
    expect(openTabs(root)).toEqual(["content", "meta"]);

    reveal.value = request("og_title");
    await nextTick();

    expect(openTabs(root)).toEqual(["more", "social"]);
  });

  it("leaves the open tab for a field no tab holds", async () => {
    const reveal = ref<FieldRevealRequest | undefined>();
    const root = mountTabs(ref({}), reveal);

    reveal.value = request("missing");
    await nextTick();

    expect(openTabs(root)).toEqual(["content"]);
  });
});
