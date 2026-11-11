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
  /** The text of a text node. */
  text?: string;
}

const headlessNode = (): HeadlessNode => ({ parent: null, children: [] });
const textNode = (text: string): HeadlessNode => ({ ...headlessNode(), text });

const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: headlessNode,
  createText: textNode,
  createComment: headlessNode,
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.children = text ? [{ ...textNode(text), parent: node }] : [];
  },
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

/** The text a node renders, its pieces joined by single spaces. */
function textOf(node: HeadlessNode): string {
  const pieces = [node.text ?? "", ...node.children.map(textOf)];
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

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

/** Each `UAlert` mounted, by its title. */
const alerts: Array<{ readonly title: string }> = [];

const UAlert: Component = {
  name: "UAlert",
  props: { title: String },
  setup(props: { title?: string }, { slots }: SetupContext) {
    const stub = {
      get title() {
        return props.title ?? "";
      },
    };
    alerts.push(stub);
    onUnmounted(() => alerts.splice(alerts.indexOf(stub), 1));
    return () => h("div", null, slots.default?.());
  },
};

/** Each `UCheckbox` mounted: its label, its state, and a click as a person makes it. */
interface CheckboxStub {
  readonly label: string;
  readonly checked: boolean;
  /** Its state as Nuxt UI's takes it: `true`, `false` or "indeterminate". */
  readonly value: boolean | string;
  readonly disabled: boolean;
  click(): void;
}
const checkboxes: CheckboxStub[] = [];

/** As Nuxt UI's: its label, then its description slot. */
const UCheckbox: Component = {
  name: "UCheckbox",
  props: {
    label: String,
    description: String,
    modelValue: { type: [Boolean, String], default: false },
    disabled: Boolean,
  },
  emits: ["update:modelValue"],
  setup(
    props: {
      label?: string;
      description?: string;
      modelValue?: boolean | string;
      disabled?: boolean;
    },
    { emit, slots }: SetupContext<["update:modelValue"]>,
  ) {
    const stub: CheckboxStub = {
      get label() {
        return props.label ?? "";
      },
      get checked() {
        return props.modelValue === true;
      },
      get value() {
        return props.modelValue ?? false;
      },
      get disabled() {
        return props.disabled === true;
      },
      click() {
        if (!stub.disabled) emit("update:modelValue", !stub.checked);
      },
    };
    checkboxes.push(stub);
    onUnmounted(() => checkboxes.splice(checkboxes.indexOf(stub), 1));
    return () =>
      h("div", null, [
        props.label ?? "",
        props.description ?? "",
        slots.description?.(),
      ]);
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
  UCheckbox,
  USlideover,
  UCollapsible,
  UAlert,
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

/** A value: verified by its quote, or with no quote at all. */
function filled(value: string, verified: boolean) {
  return {
    status: "filled",
    value,
    verified,
    quotes: verified ? [{ quote: value, where: "", found: true }] : [],
  };
}

/** A value whose quote the source does not have: it waits, marked. */
function unfound(value: string) {
  return {
    status: "filled",
    value,
    verified: false,
    quotes: [{ quote: value, where: "", found: false }],
  };
}

/** The paths the gateway was asked, in order. */
const requests: string[] = [];

/** The next answers of `run`, before the one `gateway()` gives every time. */
const runs: unknown[] = [];

const REFUSED = {
  task: "fill",
  status: "refused",
  refusal: "No.",
  provider: { id: "mock", model: "mock" },
  prompt: 1,
  usage: { inputTokens: 1, outputTokens: 1 },
};

/**
 * The gateway: `status`, `run` answering `fields`, and `run/preview`; and
 * the backend's paths the relations read, from `backend`.
 */
function gateway(
  status: Record<string, unknown>,
  fields: Record<string, unknown> = {},
  backend: Record<string, unknown> = {},
): void {
  nuxt.app = {
    $i18n: { t: (key: string) => key },
    $mapoFetch: async (path: string) => {
      requests.push(path);
      if (Object.hasOwn(backend, path)) return backend[path];
      if (path === "/_mapo/ai/status") return status;
      if (path === "/_mapo/ai/run/preview") return PREVIEW;
      if (path === "/_mapo/ai/run") {
        if (runs.length) return runs.shift();
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
 * them, and what else a test adds, as an override would; returns the root
 * of what they render.
 */
function mountDetail(
  form: MapoAiMagicFillDetail,
  extra: Component[] = [],
): HeadlessNode {
  const root: Component = {
    render: () => [
      h(MapoAiMagicFillBanner, { detail: form }),
      h(MapoAiMagicFillAction, { detail: form }),
      ...extra.map((part) => h(part, { detail: form })),
    ],
  };
  app = createApp(root);
  for (const [name, stub] of Object.entries(STUBS)) app.component(name, stub);
  const node = headlessNode();
  app.mount(node);
  return node;
}

const settle = () => new Promise((resolve) => setTimeout(resolve));
const button = (label: string) => buttons.find((one) => one.label === label);
const checkbox = (label: string) =>
  checkboxes.find((one) => one.label === label);
const APPLY_SELECTED = "mapo.ai.magicFill.summary.applySelected";

beforeEach(() => {
  buttons.splice(0);
  checkboxes.splice(0);
  alerts.splice(0);
  slideovers.splice(0);
  collapsibles.splice(0);
  requests.splice(0);
  runs.splice(0);
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

  it("sum up an answer: Undo all, and a value that waits for an empty field, ticked to apply", async () => {
    gateway(STATUS, {
      title: filled("About us", true),
      excerpt: unfound("A summary"),
    });
    const form = detail(FIELDS);
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Title: About us";

    await magic.extract();
    await settle();

    expect(form.model.value.title).toBe("About us");
    expect(button("mapo.ai.magicFill.summary.undoAll")).toBeDefined();
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.toFillTitle");
    expect(checkbox("Excerpt")?.checked).toBe(true);
    const apply = button(APPLY_SELECTED);
    expect(apply?.disabled).toBe(false);
    apply?.click();
    expect(form.model.value.excerpt).toBe("A summary");
  });

  it("list a value with no quote at all apart, unticked", async () => {
    gateway(STATUS, { excerpt: filled("A summary", false) });
    const form = detail(FIELDS);
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Title: About us";

    await magic.extract();
    await settle();

    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.unprovenTitle");
    expect(checkbox("Excerpt")?.checked).toBe(false);
    expect(button(APPLY_SELECTED)?.disabled).toBe(true);
    expect(form.annotations.value).toEqual({});
  });

  it("show a replacement before and after, unticked, and apply it once ticked", async () => {
    gateway(STATUS, { title: filled("About us", true) });
    const form = { ...detail(FIELDS), isNew: computed(() => false) };
    form.model.value = { title: "Home" };
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Title: About us";

    await magic.extract();
    await settle();

    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.toReplaceTitle");
    expect(textOf(root)).toMatch(
      /Home .*mapo\.ai\.magicFill\.summary\.replacedBy About us/,
    );
    expect(checkbox("Title")?.checked).toBe(false);
    expect(button(APPLY_SELECTED)?.disabled).toBe(true);
    checkbox("Title")?.click();
    await settle();
    expect(checkbox("Title")?.checked).toBe(true);
    button(APPLY_SELECTED)?.click();
    await settle();
    expect(form.model.value.title).toBe("About us");
    expect(checkbox("Title")).toBeUndefined();
  });

  it("name a choice by its label and a record by its name, and leave a record found under another name unticked", async () => {
    gateway(
      STATUS,
      {
        status: unfound("review"),
        category: {
          status: "filled",
          value: { search: "Culture" },
          verified: true,
          quotes: [{ quote: "Culture", where: "", found: true }],
        },
      },
      {
        "/api/categories": { count: 80, next: "/p2", results: [] },
        "/api/categories?search=Culture": [{ id: 5, name: "Culture & Arts" }],
      },
    );
    const form = detail([
      {
        key: "status",
        type: "select",
        label: "Status",
        attrs: {
          items: [
            { label: "Draft", value: "draft" },
            { label: "In review", value: "review" },
          ],
        },
      },
      {
        key: "category",
        type: "fks",
        label: "Category",
        attrs: { endpoint: "/api/categories", returnObject: false },
      },
    ]);
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Status: in review. Category: Culture.";

    await magic.extract();
    await settle();

    const text = textOf(root);
    expect(text).toContain("Status In review");
    expect(text).toContain("Category Culture & Arts");
    expect(text).toContain("mapo.ai.fill.relationRenamed");
    expect(checkbox("Status")?.checked).toBe(true);
    expect(checkbox("Category")?.checked).toBe(false);
    checkbox("Category")?.click();
    await settle();
    button(APPLY_SELECTED)?.click();
    await settle();
    expect(form.model.value).toEqual({ status: "review", category: 5 });
  });

  it("ignore every value that waits, and keep what is in the form", async () => {
    gateway(STATUS, {
      title: filled("About us", true),
      excerpt: unfound("A summary"),
    });
    const form = detail(FIELDS);
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Title: About us";
    await magic.extract();
    await settle();

    button("mapo.ai.magicFill.summary.ignoreAll")?.click();
    await settle();

    expect(form.model.value).toEqual({ title: "About us" });
    expect(checkboxes).toEqual([]);
    expect(button(APPLY_SELECTED)).toBeUndefined();
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.applied");
    expect(Object.keys(form.annotations.value)).toEqual(["title"]);
  });

  it("list a list's items with a tick each, and add the ticked ones after the field's own", async () => {
    const SPEAKERS: AnyFieldDescriptor[] = [
      {
        key: "speakers",
        type: "repeater",
        label: "Speakers",
        fields: [{ key: "name", type: "text", label: "Name" }],
      },
    ];
    const speaker = (name: string, verified: boolean) => ({
      fields: { name: filled(name, verified) },
      verified,
    });
    gateway(STATUS, {
      speakers: {
        status: "filled",
        value: [{ name: "Anna" }, { name: "Luca" }, { name: "Marco" }],
        verified: false,
        quotes: [],
        items: [
          speaker("Anna", true),
          speaker("Luca", true),
          speaker("Marco", false),
        ],
      },
    });
    const form = { ...detail(SPEAKERS), isNew: computed(() => false) };
    form.model.value = { speakers: [{ name: "Luca", photo: 7 }] };
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Anna, Luca and Marco";

    await magic.extract();
    await settle();

    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.addsTo");
    // Each item says whether a quote proves it: the list, two of whose
    // items are proved, does not say that none is.
    expect(textOf(root)).not.toContain(
      "mapo.ai.magicFill.summary.reasons.not-proven",
    );
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.itemVerified");
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.itemToCheck");
    expect(checkbox("Speakers")?.value).toBe("indeterminate");
    expect(checkbox("Anna")?.checked).toBe(true);
    expect(checkbox("Luca")?.disabled).toBe(true);
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.itemHeld");
    expect(checkbox("Marco")?.checked).toBe(false);
    checkbox("Marco")?.click();
    await settle();
    expect(checkbox("Speakers")?.value).toBe(true);
    button(APPLY_SELECTED)?.click();
    await settle();
    expect(form.model.value.speakers).toEqual([
      { name: "Luca", photo: 7 },
      { name: "Anna" },
      { name: "Marco" },
    ]);
  });

  it("turn off the box of a list that has nothing to add", async () => {
    const SPEAKERS: AnyFieldDescriptor[] = [
      {
        key: "speakers",
        type: "repeater",
        label: "Speakers",
        fields: [{ key: "name", type: "text", label: "Name" }],
      },
    ];
    const list = (...names: string[]) => ({
      status: "filled",
      value: names.map((name) => ({ name })),
      verified: true,
      quotes: [],
      items: names.map((name) => ({
        fields: { name: filled(name, true) },
        verified: true,
      })),
    });
    // The second answer gives the list as the field holds it after the
    // first: the AI wrote in the field, so the list waits, all held.
    gateway(STATUS, { speakers: list("Luca", "Anna") });
    runs.push({
      task: "fill",
      status: "answered",
      result: {
        readable: true,
        fields: { speakers: list("Anna") },
        warnings: [],
      },
      provider: { id: "mock", model: "mock" },
      prompt: 1,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const form = { ...detail(SPEAKERS), isNew: computed(() => false) };
    form.model.value = { speakers: [{ name: "Luca", photo: 7 }] };
    const { extract } = await ready(form);
    await extract();
    button(APPLY_SELECTED)?.click();
    await settle();
    expect(form.model.value.speakers).toHaveLength(2);

    await extract();

    expect(checkbox("Speakers")?.disabled).toBe(true);
    expect(checkbox("Luca")?.disabled).toBe(true);
    expect(checkbox("Anna")?.disabled).toBe(true);
  });

  it("count what the record already holds, with nothing to tick", async () => {
    gateway(STATUS, { title: filled("Home", true) });
    const form = { ...detail(FIELDS), isNew: computed(() => false) };
    form.model.value = { title: "Home" };
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Title: Home";

    await magic.extract();
    await settle();

    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.unchanged");
    // Nothing the record did not hold: the answer found nothing new.
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.nothing");
    expect(checkboxes).toEqual([]);
    expect(form.annotations.value).toEqual({});
  });

  /** Mounts the parts on a detail, lets status answer, and gives the panel a source. */
  async function ready(form: MapoAiMagicFillDetail) {
    const root = mountDetail(form);
    await useMapoAiStatus().refresh();
    await settle();
    const magic = useMapoAiMagicFill(form);
    magic.text.value = "Title: About us";
    async function extract(): Promise<void> {
      await magic.extract();
      await settle();
    }
    return { root, extract };
  }
  const NOTHING = "mapo.ai.magicFill.summary.nothing";

  it("say that a first answer found nothing", async () => {
    gateway(STATUS, {
      title: { status: "empty" },
      excerpt: { status: "empty" },
    });
    const { root, extract } = await ready(detail(FIELDS));

    await extract();

    expect(textOf(root)).toContain(NOTHING);
    expect(button("mapo.ai.magicFill.summary.undoAll")).toBeUndefined();
  });

  it("say that a second answer giving the same values found nothing new, and keep the session's summary", async () => {
    gateway(STATUS, {
      title: filled("About us", true),
      excerpt: filled("A summary", false),
    });
    const { root, extract } = await ready(detail(FIELDS));
    await extract();
    expect(textOf(root)).not.toContain(NOTHING);

    await extract();

    expect(textOf(root)).toContain(NOTHING);
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.applied");
    expect(button("mapo.ai.magicFill.summary.undoAll")).toBeDefined();
  });

  it("keep the session's summary and Undo all beside a later refusal", async () => {
    gateway(STATUS, { title: filled("About us", true) });
    const form = detail(FIELDS);
    const { root, extract } = await ready(form);
    await extract();
    runs.push(REFUSED);

    await extract();

    expect(alerts.map((alert) => alert.title)).toEqual([
      "mapo.ai.magicFill.summary.refused",
    ]);
    expect(textOf(root)).toContain("mapo.ai.magicFill.summary.title");
    expect(textOf(root)).not.toContain(NOTHING);
    button("mapo.ai.magicFill.summary.undoAll")?.click();
    expect(form.model.value).toEqual({});
  });

  it("name the model of the session's last answer for a session taken back from a draft, with no hint to start", async () => {
    gateway(STATUS, { title: filled("About us", true) });
    // Messages with their values, to see which model the summary names.
    nuxt.app.$i18n = {
      t: (key: string, params: Record<string, unknown> = {}) =>
        Object.keys(params).length ? `${key} ${JSON.stringify(params)}` : key,
    };
    const before = detail(FIELDS);
    const { extract } = await ready(before);
    await extract();
    const kept: unknown = JSON.parse(
      JSON.stringify(useMapoAiMagicFill(before).fill.snapshot()),
    );
    app?.unmount();

    // The page loads again; its draft puts the values back, then the session.
    const after = detail(FIELDS);
    after.model.value = { title: "About us" };
    const root = mountDetail(after);
    await settle();
    useMapoAiMagicFill(after).fill.resume(kept);
    await settle();

    expect(textOf(root)).toContain(
      'mapo.ai.magicFill.summary.by {"provider":"mock","model":"mock"}',
    );
    expect(textOf(root)).not.toContain("mapo.ai.magicFill.actionHint");
    expect(button("mapo.ai.magicFill.summary.undoAll")).toBeDefined();
  });

  it("offer Undo all while the AI's earlier value waits under a new proposal", async () => {
    gateway(STATUS, { title: filled("Ten years", true) });
    runs.push({
      task: "fill",
      status: "answered",
      result: {
        readable: true,
        fields: { title: filled("About us", true) },
        warnings: [],
      },
      provider: { id: "mock", model: "mock" },
      prompt: 1,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const form = detail(FIELDS);
    const { extract } = await ready(form);
    await extract();

    await extract();

    expect(form.model.value.title).toBe("About us");
    button("mapo.ai.magicFill.summary.undoAll")?.click();
    expect(form.model.value).toEqual({});
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

    const notes = checkbox("Notes");
    expect(notes?.disabled).toBe(true);
    expect(notes?.checked).toBe(false);
    notes?.click();
    await settle();
    const apply = button(APPLY_SELECTED);
    expect(apply?.disabled).toBe(true);
    apply?.click();
    expect(form.model.value.notes).toBeUndefined();
  });
});
