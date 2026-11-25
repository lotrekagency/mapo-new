import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, markRaw, nextTick, reactive, ref } from "vue";
import type { App, Component, VNode } from "vue";

import MapoFocusPortal from "../runtime/components/MapoFocusPortal.vue";
import MapoFormFlatSection from "../runtime/components/MapoFormFlatSection.vue";
import MapoFormGroup from "../runtime/components/MapoFormGroup.vue";
import MapoRepeaterItem from "../runtime/components/fields/MapoRepeaterItem.vue";
import { useFocusMode } from "../runtime/composables/useFocusMode.js";
import type { FocusTarget } from "../runtime/composables/useFocusMode.js";

// Mapo's full-screen layers (focus mode, a field expanded from a group or a
// flat section) and the Nuxt UI overlays their fields open: select menus,
// popovers, modals. Nuxt UI overlays have no z-index and stack by their place
// in <body>, where each one goes when it mounts. So a layer has no z-index,
// takes the last place in <body> each time it opens, and closes on Escape only
// while nothing opened after it is still open.
// Focus mode also edits a copy of the repeater item, and hands every edit
// made in it to the item.

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({
    public: { mapoForm: { groups: { expanded: true } } },
  }),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../runtime/composables/useMapoForm.js", async () => {
  const { ref } = await import("vue");
  return {
    injectMapoForm: () => undefined,
    // A repeater item builds a form of its own; its fields are stubs here.
    useMapoForm: () => ({
      readonly: ref(false),
      ctx: { submitted: ref(false) },
    }),
  };
});
// The model focus mode gives its sub-form: the fields write into it in place.
// The sub-form renders `content`, when a test gives it some.
const subForm = vi.hoisted(() => ({
  model: undefined as Record<string, unknown> | undefined,
  content: undefined as (() => VNode) | undefined,
}));
vi.mock("../runtime/components/MapoForm.vue", () => ({
  default: {
    name: "MapoForm",
    props: { modelValue: { type: Object, required: true } },
    render(this: { modelValue: Record<string, unknown> }) {
      subForm.model = this.modelValue;
      return subForm.content?.() ?? null;
    },
  },
}));

interface FieldExpand {
  expandField: (key: string) => void;
  collapseField: () => void;
}

// The expand controls a group or a flat section gives its fields.
const fieldExpand = vi.hoisted(() => ({
  controls: undefined as FieldExpand | undefined,
}));
vi.mock("../runtime/components/MapoFormField.vue", async () => {
  const { inject } = await import("vue");
  return {
    default: {
      name: "MapoFormField",
      props: { descriptor: { type: Object, required: true } },
      setup() {
        fieldExpand.controls ??= inject<FieldExpand | undefined>(
          "mapoGroupExpand",
          undefined,
        );
        return () => null;
      },
    },
  };
});

// Tests run in Node without a DOM. A renderer whose nodes are plain objects
// keeps each element's tag and props; `querySelector` gives the `Teleport`s
// their target. `classList`, `ownerDocument` and the listeners are what
// `Transition` touches, `compareDocumentPosition` what `isTopLayer` reads. The
// nodes are raw, as DOM nodes are to Vue: a template ref holds the node itself.
interface HeadlessNode {
  type: string;
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  props: Record<string, unknown>;
  style: Record<string, string>;
  classList: { add: () => void; remove: () => void };
  ownerDocument: { body: { offsetHeight: number } };
  addEventListener: () => void;
  removeEventListener: () => void;
  compareDocumentPosition: (other: HeadlessNode) => number;
}

/** A node and its descendants, in document order. */
const treeOrder = (node: HeadlessNode): HeadlessNode[] => [
  node,
  ...node.children.flatMap(treeOrder),
];

const headlessNode = (type: string): HeadlessNode =>
  markRaw({
    type,
    parent: null,
    children: [],
    props: {},
    style: {},
    classList: { add: () => {}, remove: () => {} },
    ownerDocument: { body: { offsetHeight: 0 } },
    addEventListener: () => {},
    removeEventListener: () => {},
    compareDocumentPosition(other: HeadlessNode) {
      const order = treeOrder(body);
      const self = order.indexOf(this);
      const at = order.indexOf(other);
      // Node.DOCUMENT_POSITION_FOLLOWING and DOCUMENT_POSITION_PRECEDING.
      return at > self ? 4 : at < self ? 2 : 0;
    },
  });
const body = headlessNode("body");

const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: (type) => headlessNode(type),
  createText: () => headlessNode("#text"),
  createComment: () => headlessNode("#comment"),
  setText: () => {},
  setElementText: () => {},
  patchProp(node, key, _previous, next) {
    node.props[key] = next;
  },
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
  querySelector: () => body,
});

const nuxtUiStub: Component = { render: () => null };
// A button keeps its attributes (title, onClick), so a test can find and press it.
const buttonStub: Component = { render: () => h("button") };

// The keydown listeners the layers add to `window` and `document`, and how
// long a transition lasts.
const keydownListeners = new Set<(event: KeyboardEvent) => void>();
let transitionSeconds = 0;

let app: App<HeadlessNode> | undefined;
let root = headlessNode("root");

/** Mounts components side by side, as a layout would. */
function mountAll(...components: [Component, Record<string, unknown>][]) {
  app = createApp({
    render: () => components.map(([component, props]) => h(component, props)),
  });
  for (const name of ["UIcon", "UBadge", "UCheckbox", "UInput"])
    app.component(name, nuxtUiStub);
  app.component("UButton", buttonStub);
  root = headlessNode("root");
  app.mount(root);
}

/** Lets the renders, the transitions and what follows them run. */
async function settle() {
  for (let i = 0; i < 3; i++) await nextTick();
}

/** Appends a node to <body>, as an overlay opened at that moment would be. */
function addToBody(props: Record<string, unknown> = {}): HeadlessNode {
  const node = headlessNode("div");
  node.props = props;
  node.parent = body;
  body.children.push(node);
  return node;
}

/** A Nuxt UI overlay, as Reka UI marks it. */
const nuxtUiOverlay = { "data-dismissable-layer": "" };

/** The Mapo layers in <body>, in order. */
const layers = () =>
  body.children.filter((node) => "data-mapo-layer" in node.props);

function pressEscape() {
  for (const listener of [...keydownListeners])
    listener({ key: "Escape" } as KeyboardEvent);
}

function focusTarget(): FocusTarget {
  return {
    descriptor: { key: "blocks", type: "repeater" },
    fields: [],
    model: {},
    errors: ref({}),
    onUpdate: () => {},
    registry: {} as FocusTarget["registry"],
    languages: [],
    currentLang: "",
    breadcrumb: ["Blocks", "Block 1"],
  };
}

const expandableField = { key: "body", type: "textarea", expandable: true };
const group: [Component, Record<string, unknown>] = [
  MapoFormGroup,
  { name: "content", fields: [expandableField] },
];
const flatSection: [Component, Record<string, unknown>] = [
  MapoFormFlatSection,
  { fields: [expandableField] },
];

beforeEach(() => {
  body.children = [];
  keydownListeners.clear();
  transitionSeconds = 0;
  fieldExpand.controls = undefined;
  subForm.model = undefined;
  subForm.content = undefined;
  const listen = (_type: string, listener: (event: KeyboardEvent) => void) =>
    keydownListeners.add(listener);
  const unlisten = (_type: string, listener: (event: KeyboardEvent) => void) =>
    keydownListeners.delete(listener);
  vi.stubGlobal("window", {
    addEventListener: listen,
    removeEventListener: unlisten,
    getComputedStyle: () => ({
      transitionDuration: `${transitionSeconds}s`,
      transitionDelay: "0s",
    }),
  });
  vi.stubGlobal("document", {
    addEventListener: listen,
    removeEventListener: unlisten,
    body: { style: {} },
    // What `isTopLayer` selects: the Mapo layers and the Nuxt UI overlays.
    querySelectorAll: () =>
      treeOrder(body).filter(
        (node) =>
          "data-mapo-layer" in node.props ||
          "data-dismissable-layer" in node.props,
      ),
  });
  // A class, as `instanceof Node` checks (Vitest's own matchers) need one.
  vi.stubGlobal(
    "Node",
    class {
      static DOCUMENT_POSITION_FOLLOWING = 4;
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 0;
  });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  useFocusMode().exit();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each([
  {
    name: "MapoFocusPortal",
    mount: () => mountAll([MapoFocusPortal, {}]),
    open: () => useFocusMode().enter(focusTarget()),
    close: () => useFocusMode().exit(),
  },
  {
    name: "MapoFormGroup's expanded field",
    mount: () => mountAll(group),
    open: () => fieldExpand.controls?.expandField("body"),
    close: () => fieldExpand.controls?.collapseField(),
  },
  {
    name: "MapoFormFlatSection's expanded field",
    mount: () => mountAll(flatSection),
    open: () => fieldExpand.controls?.expandField("body"),
    close: () => fieldExpand.controls?.collapseField(),
  },
])("$name", (layer) => {
  /** Opens the layer, and checks it is the one Mapo layer in <body>. */
  async function open() {
    layer.open();
    await settle();
    expect(layers()).toHaveLength(1);
  }

  it("opens last in <body>, after what is already there", async () => {
    layer.mount();
    const earlier = addToBody();

    layer.open();
    await settle();

    expect(layers()).toHaveLength(1);
    expect(body.children.indexOf(layers()[0]!)).toBeGreaterThan(
      body.children.indexOf(earlier),
    );
  });

  it("leaves <body> once closed, and takes the last place again when reopened", async () => {
    layer.mount();
    await open();
    layer.close();
    await settle();

    expect(body.children).toEqual([]);

    const later = addToBody();
    layer.open();
    await settle();

    expect(body.children.indexOf(layers()[0]!)).toBeGreaterThan(
      body.children.indexOf(later),
    );
  });

  it("stays open when reopened while it is closing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    transitionSeconds = 0.2;
    layer.mount();
    await open();
    vi.advanceTimersByTime(300);
    layer.close();
    await settle();

    vi.advanceTimersByTime(50);
    layer.open();
    await settle();
    vi.advanceTimersByTime(500);
    await settle();

    expect(layers()).toHaveLength(1);

    layer.close();
    await settle();
    vi.advanceTimersByTime(300);
    await settle();

    expect(body.children).toEqual([]);
  });

  it("has no z-index, so the overlays opened from it show above it", async () => {
    layer.mount();
    await open();

    expect(String(layers()[0]!.props.class)).not.toMatch(/(^|\s)z-/);
  });

  it("closes on Escape", async () => {
    layer.mount();
    await open();

    pressEscape();
    await settle();

    expect(layers()).toEqual([]);
  });

  it("closes on Escape above an overlay that was open before it", async () => {
    layer.mount();
    addToBody(nuxtUiOverlay);
    await open();

    pressEscape();
    await settle();

    expect(layers()).toEqual([]);
  });

  it("leaves Escape to an overlay opened above it", async () => {
    layer.mount();
    await open();
    addToBody(nuxtUiOverlay);

    pressEscape();
    await settle();

    expect(layers()).toHaveLength(1);
  });
});

describe.each([
  { name: "MapoFormGroup", expandable: group },
  { name: "MapoFormFlatSection", expandable: flatSection },
])("Focus mode opened from a field expanded in $name", ({ expandable }) => {
  it("stacks above the field, and Escape closes one layer at a time", async () => {
    mountAll(expandable, [MapoFocusPortal, {}]);
    fieldExpand.controls?.expandField("body");
    await settle();
    useFocusMode().enter(focusTarget());
    await settle();

    expect(layers()).toHaveLength(2);
    const [field, focus] = layers();
    expect(focus?.props.class).toContain("mapo-focus-portal");
    expect(field?.props.class).not.toContain("mapo-focus-portal");

    pressEscape();
    await settle();

    expect(layers()).toEqual([field]);

    pressEscape();
    await settle();

    expect(layers()).toEqual([]);
  });
});

describe("Focus mode's edits", () => {
  /** Opens an item in focus mode, as MapoRepeaterItem does: with a snapshot
   * of its model, whose nested objects are the item's own. */
  async function openItem(item: Record<string, unknown>) {
    const onUpdate = vi.fn();
    mountAll([MapoFocusPortal, {}]);
    useFocusMode().enter({ ...focusTarget(), model: { ...item }, onUpdate });
    await settle();
    return { onUpdate, model: subForm.model! };
  }

  /** A repeater item's props, as MapoRepeater gives them. */
  const itemProps = (item: Record<string, unknown>) => ({
    item,
    fields: [{ key: "title", type: "text" }],
    index: 0,
    errorPrefix: "blocks.0",
    parentErrors: {},
    languages: [],
    currentLang: "",
    readonly: false,
    registry: {},
    defaultExpanded: true,
  });

  /** The focus mode buttons of the repeater items, on the page and in <body>. */
  const focusModeButtons = () =>
    [...treeOrder(root), ...treeOrder(body)].filter(
      (node) => node.props.title === "mapo.repeater.editFullScreen",
    );

  /** Opens the first repeater item in focus mode, from its button. */
  async function pressFocusMode() {
    (focusModeButtons()[0]!.props.onClick as () => void)();
    await settle();
  }

  it("reach the item while focus mode is open, and opening is not one", async () => {
    const { onUpdate, model } = await openItem(reactive({ status: "draft" }));

    expect(onUpdate).not.toHaveBeenCalled();

    model.status = "published";
    await settle();

    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "published" }),
    );
  });

  it("reach the item when they land after focus mode closed", async () => {
    // A field writes once its debounce runs out: here, after Escape.
    const { onUpdate, model } = await openItem(reactive({ status: "draft" }));
    useFocusMode().exit();
    await settle();

    model.status = "published";
    await settle();

    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "published" }),
    );
  });

  it("reach the objects nested in the item", async () => {
    const item = reactive({ cta: { label: "Read" } });
    const { model } = await openItem(item);

    (model.cta as { label: string }).label = "Read more";

    expect(item.cta.label).toBe("Read more");
  });

  it("stop once focus mode closed: the item's own later edits stay", async () => {
    const item = reactive({ status: "draft", cta: { label: "Read" } });
    const { onUpdate, model } = await openItem(item);
    model.status = "published";
    await settle();
    useFocusMode().exit();
    await settle();
    onUpdate.mockClear();

    // Edited in the repeater: focus mode must not hand its copy back.
    item.cta.label = "Read more";
    await settle();

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("start from a model given as a ref", async () => {
    const onUpdate = vi.fn();
    mountAll([MapoFocusPortal, {}]);
    const model = ref({ status: "draft" }) as unknown as Record<
      string,
      unknown
    >;
    useFocusMode().enter({ ...focusTarget(), model, onUpdate });
    await settle();

    expect(subForm.model).toEqual({ status: "draft" });

    subForm.model!.status = "published";
    await settle();

    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "published" }),
    );
  });

  it("go to the item open now, once another one replaced the first", async () => {
    const first = vi.fn();
    const second = vi.fn();
    mountAll([MapoFocusPortal, {}]);
    useFocusMode().enter({
      ...focusTarget(),
      model: { status: "draft" },
      onUpdate: first,
    });
    await settle();
    subForm.model!.status = "published";
    await settle();
    useFocusMode().exit();
    await settle();

    useFocusMode().enter({
      ...focusTarget(),
      model: { status: "draft", title: "B" },
      onUpdate: second,
    });
    await settle();

    expect(subForm.model).toEqual({ status: "draft", title: "B" });
    expect(second).not.toHaveBeenCalled();

    subForm.model!.status = "archived";
    await settle();

    expect(second).toHaveBeenLastCalledWith({ status: "archived", title: "B" });
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("reach the page through the repeater item, which keeps what it got after focus mode opened", async () => {
    const updates: Record<string, unknown>[] = [];
    const props = reactive({
      ...itemProps({ title: "Old", status: "draft" }),
      "onUpdate:item": (item: Record<string, unknown>) =>
        updates.push({ ...item }),
    });
    mountAll([MapoRepeaterItem, props], [MapoFocusPortal, {}]);
    await settle();
    await pressFocusMode();

    // The item gets a new title after focus mode opened. Here the parent
    // re-syncs it; an inline write that was still in its debounce would write
    // it into the item's model instead, and the hand-back treats both alike.
    props.item = { title: "New", status: "draft" };
    await settle();
    const before = updates.length;
    subForm.model!.status = "published";
    await settle();

    expect(updates.slice(before)).toEqual([
      { title: "New", status: "published" },
    ]);
  });

  it("cannot go to a nested item: a repeater in the item shows its items with no focus mode button", async () => {
    mountAll(
      [MapoRepeaterItem, itemProps({ title: "Page" })],
      [MapoFocusPortal, {}],
    );
    await settle();
    subForm.content = () =>
      h(MapoRepeaterItem as Component, itemProps({ title: "Card" }));

    await pressFocusMode();

    expect(layers()).toHaveLength(1);
    const nestedItems = treeOrder(layers()[0]!).filter((node) =>
      String(node.props.class).includes("mapo-repeater-item"),
    );
    expect(nestedItems).toHaveLength(1);
    expect(focusModeButtons()).toHaveLength(1);
    expect(treeOrder(root)).toContain(focusModeButtons()[0]);
  });
});
