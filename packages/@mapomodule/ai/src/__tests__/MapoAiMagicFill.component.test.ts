import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, createRenderer, h, onUnmounted, ref } from "vue";
import type { App, Component, SetupContext } from "vue";
import type {
  AnyFieldDescriptor,
  FieldAnnotations,
} from "@mapomodule/form/types";
import MapoAiMagicFillAction from "../runtime/components/MapoAiMagicFillAction.vue";
import MapoAiMagicFillBanner from "../runtime/components/MapoAiMagicFillBanner.vue";
import MapoAiMagicFillPanel from "../runtime/components/MapoAiMagicFillPanel.vue";
import MapoAiMagicFillPreview from "../runtime/components/MapoAiMagicFillPreview.vue";
import { useMapoAiMagicFill } from "../runtime/composables/useMapoAiMagicFill";
import type { MapoAiMagicFillDetail } from "../runtime/composables/useMapoAiMagicFill";
import { useMapoAiStatus } from "../runtime/composables/useMapoAiStatus";

/** What the mocked `useNuxtApp()` returns: `$mapoFetch` and `$i18n` of the test. */
const nuxt = vi.hoisted(() => ({ app: {} as Record<string, unknown> }));

vi.mock("nuxt/app", () => ({ useNuxtApp: () => nuxt.app }));

// Tests run in Node without a DOM: a renderer whose nodes are plain objects
// mounts the components with real reactivity, watchers and events.
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

/** Each `UButton` mounted: its label, its state, and a click as a person makes it. */
interface ButtonStub {
  readonly label: string;
  readonly disabled: boolean;
  click(): void;
}
const buttons: ButtonStub[] = [];

const UButton: Component = {
  name: "UButton",
  props: { label: String, loading: Boolean, disabled: Boolean },
  emits: ["click"],
  setup(
    props: { label?: string; loading?: boolean; disabled?: boolean },
    { emit }: SetupContext<["click"]>,
  ) {
    const stub: ButtonStub = {
      get label() {
        return props.label ?? "";
      },
      get disabled() {
        return props.disabled === true || props.loading === true;
      },
      click() {
        if (!stub.disabled) emit("click");
      },
    };
    buttons.push(stub);
    onUnmounted(() => buttons.splice(buttons.indexOf(stub), 1));
    return () => h("button");
  },
};

/** Each slideover mounted, and whether it is open. */
const slideovers: Array<{ readonly open: boolean }> = [];

/** As Nuxt UI's: its body and footer only while open. */
const USlideover: Component = {
  name: "USlideover",
  props: { open: Boolean },
  emits: ["update:open"],
  setup(props: { open?: boolean }, { slots }: SetupContext) {
    const stub = {
      get open() {
        return props.open === true;
      },
    };
    slideovers.push(stub);
    onUnmounted(() => slideovers.splice(slideovers.indexOf(stub), 1));
    return () =>
      props.open
        ? h("div", null, [slots.body?.(), slots.footer?.()])
        : h("div");
  },
};

/** Each collapsible mounted: its trigger's label, whether it is open, and a click on its trigger. */
interface CollapsibleStub {
  readonly label: string;
  readonly open: boolean;
  toggle(): void;
}
const collapsibles: CollapsibleStub[] = [];

/** As Nuxt UI's: its trigger, which opens and closes it, and its content while open. */
const UCollapsible: Component = {
  name: "UCollapsible",
  props: { open: Boolean },
  emits: ["update:open"],
  setup(
    props: { open?: boolean },
    { slots, emit }: SetupContext<["update:open"]>,
  ) {
    let label = "";
    const stub: CollapsibleStub = {
      get label() {
        return label;
      },
      get open() {
        return props.open === true;
      },
      toggle() {
        emit("update:open", !props.open);
      },
    };
    collapsibles.push(stub);
    onUnmounted(() => collapsibles.splice(collapsibles.indexOf(stub), 1));
    return () => {
      const trigger = slots.default?.() ?? [];
      label = String(trigger[0]?.props?.label ?? "");
      return h("div", null, [trigger, props.open ? slots.content?.() : null]);
    };
  },
};

const STUBS: Record<string, Component> = {
  UButton,
  USlideover,
  UCollapsible,
  UAlert: passthrough("UAlert"),
  UIcon: passthrough("UIcon"),
  UTextarea: passthrough("UTextarea"),
  UFileUpload: passthrough("UFileUpload"),
  USelect: passthrough("USelect"),
  // Registered by name, as the module registers them for the app.
  MapoAiMagicFillPanel,
  MapoAiMagicFillPreview,
};

const STATUS = {
  contract: 2,
  allowed: true,
  admin: false,
  providers: [{ id: "mock", label: "Mock", models: ["mock"] }],
  default: { provider: "mock", models: { fill: "mock", extract: "mock" } },
  limits: {
    perUserPerMinute: 20,
    maxSourceChars: 1000,
    maxInstructionsChars: 100,
    maxFileBytes: 1000,
  },
  readers: [
    { id: "text", label: "Text", extensions: ["txt"], types: ["text/plain"] },
  ],
};

const PREVIEW = {
  task: "fill",
  provider: { id: "mock", model: "mock" },
  prompt: 1,
  instructions: "# Rules (Mapo, version 1)",
  parts: [{ chars: 0 }],
  entities: [{ label: "Article", fields: [{ key: "title" }], skipped: [] }],
};

function filled(value: string, verified: boolean) {
  return {
    status: "filled",
    value,
    verified,
    quotes: verified ? [{ quote: value, where: "", found: true }] : [],
  };
}

/** The paths the gateway was asked, in order. */
const requests: string[] = [];

/** The gateway: `status`, `run` answering `fields`, and `run/preview`. */
function gateway(
  status: Record<string, unknown>,
  fields: Record<string, unknown> = {},
): void {
  nuxt.app = {
    $i18n: { t: (key: string) => key },
    $mapoFetch: async (path: string) => {
      requests.push(path);
      if (path === "/_mapo/ai/status") return status;
      if (path === "/_mapo/ai/run/preview") return PREVIEW;
      if (path === "/_mapo/ai/run") {
        return {
          task: "fill",
          status: "answered",
          result: { readable: true, fields, warnings: [] },
          provider: { id: "mock", model: "mock" },
          prompt: 1,
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
      throw new Error(`No route ${path}`);
    },
  };
}

/** A detail, shaped as `useMapoDetail()` gives it. */
function detail(fields: AnyFieldDescriptor[]) {
  return {
    model: ref<Record<string, unknown>>({}),
    fields: computed(() => fields),
    annotations: ref<FieldAnnotations>({}),
    metadata: async () => undefined,
    isNew: computed(() => true),
    readonly: ref(false),
    isBusy: ref(false),
  } satisfies MapoAiMagicFillDetail;
}

let app: App<HeadlessNode> | undefined;

/**
 * Mounts the button and the banner on one detail, as MapoDetail renders
 * them, and what else a test adds, as an override would.
 */
function mountDetail(
  form: MapoAiMagicFillDetail,
  extra: Component[] = [],
): void {
  const root: Component = {
    render: () => [
      h(MapoAiMagicFillBanner, { detail: form }),
      h(MapoAiMagicFillAction, { detail: form }),
      ...extra.map((part) => h(part, { detail: form })),
    ],
  };
  app = createApp(root);
  for (const [name, stub] of Object.entries(STUBS)) app.component(name, stub);
  app.mount(headlessNode());
}

const settle = () => new Promise((resolve) => setTimeout(resolve));
const button = (label: string) => buttons.find((one) => one.label === label);

beforeEach(() => {
  buttons.splice(0);
  slideovers.splice(0);
  collapsibles.splice(0);
  requests.splice(0);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("Magic Fill's parts on a detail", () => {
  const FIELDS: AnyFieldDescriptor[] = [
    { key: "title", type: "text", label: "Title" },
    { key: "excerpt", type: "textarea", label: "Excerpt" },
  ];

  it("show the button once status lets the user in, render one panel, and open it", async () => {
    gateway(STATUS);
    mountDetail(detail(FIELDS));
    expect(button("mapo.ai.magicFill.action")).toBeUndefined();

    await useMapoAiStatus().refresh();
    await settle();

    const open = button("mapo.ai.magicFill.action");
    expect(open?.disabled).toBe(false);
    expect(slideovers).toHaveLength(1);
    expect(slideovers[0]?.open).toBe(false);
    open?.click();
    await settle();
    expect(slideovers[0]?.open).toBe(true);
    // Extract waits for a source.
    expect(button("mapo.ai.magicFill.extract")?.disabled).toBe(true);
  });

  it("show one panel when an override renders the panel itself", async () => {
    gateway(STATUS);
    mountDetail(detail(FIELDS), [MapoAiMagicFillPanel]);

    await useMapoAiStatus().refresh();
    await settle();

    expect(slideovers).toHaveLength(1);
  });

  it("turn the button off when no model can be called for the user", async () => {
    gateway({ ...STATUS, providers: [] });
    mountDetail(detail(FIELDS));

    await useMapoAiStatus().refresh();
    await settle();

    expect(button("mapo.ai.magicFill.action")?.disabled).toBe(true);
  });

  it("show nothing to a user the app keeps out", async () => {
    gateway({ contract: 2, allowed: false, admin: false });
    mountDetail(detail(FIELDS));

    await useMapoAiStatus().refresh();
    await settle();

    expect(buttons).toEqual([]);
    expect(slideovers).toEqual([]);
  });

  it("sum up an answer: Undo all, and Apply for a value that waits", async () => {
    gateway(STATUS, {
      title: filled("About us", true),
      excerpt: filled("A summary", false),
    });
    const form = detail(FIELDS);
    mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Title: About us";

    await magic.extract();
    await settle();

    expect(form.model.value.title).toBe("About us");
    expect(button("mapo.ai.magicFill.summary.undoAll")).toBeDefined();
    const apply = button("mapo.apply");
    expect(apply?.disabled).toBe(false);
    apply?.click();
    expect(form.model.value.excerpt).toBe("A summary");
  });

  it("compose what is sent when it opens with nothing current, not at every opening", async () => {
    gateway(STATUS);
    const form = detail(FIELDS);
    mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    button("mapo.ai.magicFill.action")?.click();
    await settle();
    const whatISend = () =>
      collapsibles.find((one) => one.label === "mapo.ai.magicFill.whatISend");
    const composed = () =>
      requests.filter((path) => path === "/_mapo/ai/run/preview").length;
    async function reopen(): Promise<void> {
      whatISend()?.toggle();
      await settle();
      whatISend()?.toggle();
      await settle();
    }

    whatISend()?.toggle();
    await settle();
    expect(composed()).toBe(1);

    await reopen();
    expect(composed()).toBe(1);

    useMapoAiMagicFill(form).text.value = "Title: About us";
    await settle();
    expect(composed()).toBe(1);
    await reopen();
    expect(composed()).toBe(2);
  });

  it("never apply a value into a hidden field from the summary", async () => {
    const hidden: AnyFieldDescriptor[] = [
      ...FIELDS,
      { key: "notes", type: "text", label: "Notes", show: () => false },
    ];
    gateway(STATUS, { notes: filled("Secret plan", true) });
    const form = detail(hidden);
    mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Notes: Secret plan";

    await magic.extract();
    await settle();

    const apply = button("mapo.apply");
    expect(apply?.disabled).toBe(true);
    apply?.click();
    expect(form.model.value.notes).toBeUndefined();
  });
});
