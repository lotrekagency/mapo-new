import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, onUnmounted } from "vue";
import type { App, Component, SetupContext, VNode } from "vue";

import MapoDetail from "../runtime/components/MapoDetail.vue";
import MapoDetailExtensions from "../runtime/components/MapoDetailExtensions.vue";
import {
  defineDetailExtension,
  detailExtensions,
} from "../runtime/composables/defineDetailExtension.js";
import { useMapoDetail } from "../runtime/composables/useMapoDetail.js";
import type { MapoDetailContext } from "../runtime/types/detail.js";

type AfterEachHook = (to: unknown, from: unknown, failure?: unknown) => void;

// The detail reads the router, the stores and the CRUD layer at setup: replace
// them with in-memory doubles. `vi.hoisted` lets the mock factories share them.
const router = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  afterEach: vi.fn<(hook: AfterEachHook) => () => void>(),
  // Vue Router keeps the previous location of the current entry in `state.back`.
  options: { history: { state: { back: "/news" as string | null } } },
}));
const crud = vi.hoisted(() => ({
  options: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  partialUpdate: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const confirm = vi.hoisted(() => ({ ask: vi.fn() }));
// One app instance for every call, as in an app: the extensions live on it.
const nuxtApp = vi.hoisted(() => ({ $mapoFormRegistry: {} }));

vi.mock("#app", () => ({
  useRouter: () => router,
  onBeforeRouteLeave: () => {},
  useNuxtApp: () => nuxtApp,
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => crud }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => confirm,
}));
vi.mock("@mapomodule/store/runtime/composables/usePermissions", () => ({
  usePermissions: () => ({
    canAdd: () => true,
    canChange: () => true,
    canDelete: () => true,
  }),
}));

// Tests run in Node without a DOM. A renderer whose nodes are plain objects is
// enough to mount the component with real reactivity, watchers and events.
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

const slotText = (nodes: VNode[] | undefined) =>
  (nodes ?? [])
    .map((node) => (typeof node.children === "string" ? node.children : ""))
    .join("")
    .trim();

// `UButton` declares what the detail binds: `loading` and `disabled` in, `click`
// out. Like the real one, a loading or disabled button emits no click.
interface ButtonStub {
  readonly label: string;
  readonly loading: boolean;
  readonly disabled: boolean;
  click(): void;
}
const buttons: ButtonStub[] = [];

const UButton: Component = {
  name: "UButton",
  props: { loading: Boolean, disabled: Boolean },
  emits: ["click"],
  setup(
    props: { loading?: boolean; disabled?: boolean },
    { emit, slots }: SetupContext<["click"]>,
  ) {
    const stub: ButtonStub = {
      get label() {
        return slotText(slots.default?.());
      },
      get loading() {
        return props.loading ?? false;
      },
      get disabled() {
        return props.disabled ?? false;
      },
      click() {
        if (stub.loading) return;
        if (stub.disabled) return;
        emit("click");
      },
    };
    buttons.push(stub);
    onUnmounted(() => {
      buttons.splice(buttons.indexOf(stub), 1);
    });
    return () => h("button", null, slots.default?.());
  },
};

// `MapoForm` keeps the props of each instance, body and sidebar alike.
interface FormProps {
  annotations?: object;
  fields?: { key: string; type: string; attrs?: Record<string, unknown> }[];
}
const forms: FormProps[] = [];

const MapoForm: Component = {
  name: "MapoForm",
  inheritAttrs: false,
  props: { annotations: Object, fields: Array },
  setup(props: FormProps, { slots }: SetupContext) {
    forms.push(props);
    onUnmounted(() => {
      forms.splice(forms.indexOf(props), 1);
    });
    return () => h("div", null, slots.default?.());
  },
};

const stubs: Record<string, Component> = {
  UButton,
  UCard: passthrough("UCard"),
  UAlert: passthrough("UAlert"),
  UIcon: passthrough("UIcon"),
  UModal: passthrough("UModal"),
  MapoForm,
  MapoDetailLangSwitch: passthrough("MapoDetailLangSwitch"),
  MapoDetailExtensions,
};

const button = (label: string) => {
  const found = buttons.find((stub) => stub.label === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
};

/** What a custom action panel reads from the `side-buttons` slot. */
interface ActionBindings {
  isSaving: boolean;
  save: (andBack?: boolean) => Promise<void>;
}

let app: App<HeadlessNode> | undefined;

function mountDetail(
  slots: Record<string, (bindings: never) => VNode[]> = {},
  extraProps: Record<string, unknown> = {},
) {
  const props = { endpoint: "/api/news/", id: 5, ...extraProps };
  const root: Component = {
    render: () => h(MapoDetail as Component, props, slots),
  };
  app = createApp(root);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(headlessNode());
}

// Runs the pending CRUD promises and the renders they trigger.
const settle = () => new Promise((resolve) => setTimeout(resolve));

const afterEachHooks = new Set<AfterEachHook>();

/** Ends the navigation router.back() started; `failure` as Vue Router reports it. */
const finishNavigation = (failure?: Error) => {
  for (const hook of [...afterEachHooks]) hook({}, {}, failure);
};

const record = { id: 5, title: "News" };

beforeEach(() => {
  router.back.mockReset();
  router.replace.mockReset();
  router.afterEach.mockReset();
  router.afterEach.mockImplementation((hook) => {
    afterEachHooks.add(hook);
    return () => afterEachHooks.delete(hook);
  });
  router.options.history.state.back = "/news";
  afterEachHooks.clear();
  for (const fn of Object.values(crud)) fn.mockReset();
  crud.options.mockResolvedValue({});
  crud.detail.mockResolvedValue(record);
  crud.partialUpdate.mockResolvedValue(record);
  crud.delete.mockResolvedValue(undefined);
  confirm.ask.mockReset();
  confirm.ask.mockResolvedValue(true);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  detailExtensions(nuxtApp).splice(0);
});

describe("MapoDetail actions", () => {
  it("keeps the buttons busy until the page has gone back after Save", async () => {
    mountDetail();
    await settle();

    button("mapo.save").click();
    await settle();

    expect(crud.partialUpdate).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    // The page is still on screen while the previous route loads.
    expect(button("mapo.save").loading).toBe(true);
    expect(button("mapo.saveContinue").disabled).toBe(true);
    expect(button("mapo.back").disabled).toBe(true);
    expect(button("mapo.delete").disabled).toBe(true);
  });

  it("frees the buttons when the navigation back is cancelled", async () => {
    mountDetail();
    await settle();
    button("mapo.save").click();
    await settle();

    // A guard kept the page, such as the unsaved-changes one.
    finishNavigation(new Error("aborted"));
    await settle();

    expect(button("mapo.save").loading).toBe(false);
    expect(button("mapo.back").disabled).toBe(false);
  });

  it("saves once and stays busy when a custom button saves twice", async () => {
    let bindings: ActionBindings | undefined;
    mountDetail({
      "side-buttons": (slotProps: ActionBindings) => {
        bindings = slotProps;
        return [];
      },
    });
    await settle();

    void bindings?.save(true);
    void bindings?.save(true);
    await settle();

    expect(crud.partialUpdate).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(bindings?.isSaving).toBe(true);
  });

  it("goes back once when Back is clicked twice", async () => {
    mountDetail();
    await settle();

    button("mapo.back").click();
    button("mapo.back").click();
    await settle();

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(button("mapo.back").loading).toBe(true);
  });

  it("does not lock the buttons when there is no previous page", async () => {
    router.options.history.state.back = null;
    mountDetail();
    await settle();

    button("mapo.save").click();
    await settle();

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(button("mapo.save").loading).toBe(false);
    expect(button("mapo.back").disabled).toBe(false);
  });

  it("keeps Delete busy until the page has gone back", async () => {
    mountDetail();
    await settle();

    button("mapo.delete").click();
    await settle();
    button("mapo.delete").click();
    await settle();

    expect(crud.delete).toHaveBeenCalledTimes(1);
    expect(confirm.ask).toHaveBeenCalledTimes(1);
    expect(button("mapo.delete").loading).toBe(true);
  });
});

describe("MapoDetail annotations", () => {
  it("passes the annotations to the body and the sidebar forms", async () => {
    const annotations = { title: { label: "Suggested by AI" } };
    mountDetail(
      {},
      { annotations, sidebarFields: [{ key: "status", type: "text" }] },
    );
    await settle();

    expect(forms).toHaveLength(2);
    for (const form of forms) expect(form.annotations).toEqual(annotations);
  });
});

describe("MapoDetail schema mode", () => {
  // What Django REST Framework serves on OPTIONS, with no `schema`.
  const drfMetadata = {
    name: "News List",
    actions: {
      POST: {
        title: { type: "string", required: true, label: "Title" },
        status: {
          type: "choice",
          label: "Status",
          choices: [{ value: "draft", display_name: "Draft" }],
        },
        author: { type: "field", required: true, label: "Author" },
      },
    },
  };

  it("builds the body fields from DRF metadata", async () => {
    crud.options.mockResolvedValue(drfMetadata);
    mountDetail({}, { experimentalFieldsFromSchema: true });
    await settle();

    const body = forms[0]!.fields!;
    expect(body.map((field) => [field.key, field.type])).toEqual([
      ["title", "text"],
      ["status", "select"],
      ["author", "field:author"],
    ]);
    expect(body[1]!.attrs?.options).toEqual([
      { text: "Draft", value: "draft" },
    ]);
  });

  it("reads the OPTIONS response with schemaFromMetadata when given", async () => {
    crud.options.mockResolvedValue(drfMetadata);
    const schemaFromMetadata = vi.fn(() => ({
      type: "object",
      properties: { headline: { type: "string", title: "Headline" } },
    }));
    mountDetail({}, { experimentalFieldsFromSchema: true, schemaFromMetadata });
    await settle();

    expect(schemaFromMetadata).toHaveBeenCalledWith(drfMetadata);
    expect(forms[0]!.fields!.map((field) => field.key)).toEqual(["headline"]);
  });

  it("derives nothing without the opt-in", async () => {
    crud.options.mockResolvedValue(drfMetadata);
    mountDetail();
    await settle();

    expect(forms[0]!.fields).toEqual([]);
  });
});

/** Mounts a component in `body-top` that keeps the context it reads. */
function mountWithProbe(extraProps: Record<string, unknown> = {}) {
  const seen: { detail?: MapoDetailContext } = {};
  const Probe: Component = {
    setup() {
      seen.detail = useMapoDetail();
      return () => h("i");
    },
  };
  mountDetail({ "body-top": () => [h(Probe)] }, extraProps);
  return seen;
}

describe("MapoDetail context", () => {
  const fields = [{ key: "title", type: "text" }];

  it("shares the record, the fields and the state with the components inside", async () => {
    const seen = mountWithProbe({ fields, languages: ["it", "en"] });
    await settle();
    const detail = seen.detail!;

    expect(detail.endpoint.value).toBe("/api/news/");
    expect(detail.id.value).toBe(5);
    expect(detail.isNew.value).toBe(false);
    expect(detail.model.value).toEqual(record);
    expect(detail.fields.value).toEqual(fields);
    expect(detail.languages.value).toEqual(["it", "en"]);
    expect(detail.readonly.value).toBe(false);
    expect(detail.isDirty.value).toBe(false);

    (detail.model.value as { title: string }).title = "Changed";
    expect(detail.isDirty.value).toBe(true);
  });

  it("saves through the context as the buttons do", async () => {
    const seen = mountWithProbe({ fields });
    await settle();

    await seen.detail!.save();

    expect(crud.partialUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows the marks set from inside under the annotations prop", async () => {
    const fromProp = { title: { label: "From the page" } };
    const seen = mountWithProbe({ fields, annotations: fromProp });
    await settle();

    seen.detail!.annotations.value = {
      title: { label: "From inside" },
      slug: { label: "From inside" },
    };
    await settle();

    expect(forms[0]!.annotations).toEqual({
      title: { label: "From the page" },
      slug: { label: "From inside" },
    });
  });

  it("asks the endpoint for OPTIONS once, whoever asks", async () => {
    crud.options.mockResolvedValue({ name: "News List" });
    // No languages: the detail asks OPTIONS for them itself.
    const seen = mountWithProbe({ fields });
    await settle();

    expect(await seen.detail!.metadata()).toEqual({ name: "News List" });
    await seen.detail!.metadata();
    expect(crud.options).toHaveBeenCalledTimes(1);
  });

  it("answers metadata() with undefined when the endpoint has no OPTIONS", async () => {
    crud.options.mockRejectedValue(new Error("405"));
    const seen = mountWithProbe({ fields, languages: ["it"] });
    await settle();

    expect(await seen.detail!.metadata()).toBeUndefined();
  });

  it("passes the fields rendered to the slots", async () => {
    let bindings: { fields?: unknown; sidebarFields?: unknown } = {};
    const sidebarFields = [{ key: "status", type: "text" }];
    mountDetail(
      {
        "side-bottom": (slotProps: typeof bindings) => {
          bindings = slotProps;
          return [];
        },
      },
      { fields, sidebarFields },
    );
    await settle();

    expect(bindings.fields).toEqual(fields);
    expect(bindings.sidebarFields).toEqual(sidebarFields);
  });
});

describe("MapoDetail extensions", () => {
  /** A component that notes when it renders, under its name. */
  const rendered: string[] = [];
  const noting = (name: string): Component => ({
    setup() {
      rendered.push(name);
      return () => h("i");
    },
  });

  beforeEach(() => {
    rendered.splice(0);
  });

  it("renders each extension in its place", async () => {
    defineDetailExtension({
      key: "fill",
      placement: "actions",
      component: noting("fill"),
    });
    defineDetailExtension({
      key: "summary",
      placement: "body-top",
      component: noting("summary"),
    });
    mountDetail();
    await settle();

    expect(rendered.sort()).toEqual(["fill", "summary"]);
  });

  it("lets a page show none of them, or only some", async () => {
    defineDetailExtension({
      key: "a",
      placement: "actions",
      component: noting("a"),
    });
    defineDetailExtension({
      key: "b",
      placement: "actions",
      component: noting("b"),
    });

    mountDetail({}, { extensions: false });
    await settle();
    expect(rendered).toEqual([]);
    app?.unmount();

    mountDetail({}, { extensions: ["b"] });
    await settle();
    expect(rendered).toEqual(["b"]);
  });

  it("asks visible() with the context", async () => {
    const visible = vi.fn((detail: MapoDetailContext) => !detail.isNew.value);
    defineDetailExtension({
      key: "duplicate",
      placement: "actions",
      component: noting("duplicate"),
      visible,
    });
    mountDetail({}, { id: "new" });
    await settle();

    expect(visible).toHaveBeenCalled();
    expect(rendered).toEqual([]);
  });

  it("orders them, replaces a key registered again, and removes them", async () => {
    defineDetailExtension({
      key: "late",
      placement: "actions",
      component: noting("late"),
      order: 2,
    });
    defineDetailExtension({
      key: "early",
      placement: "actions",
      component: noting("old"),
    });
    defineDetailExtension({
      key: "early",
      placement: "actions",
      component: noting("early"),
      order: 1,
    });
    const remove = defineDetailExtension({
      key: "gone",
      placement: "actions",
      component: noting("gone"),
      order: 3,
    });
    remove();
    mountDetail();
    await settle();

    expect(rendered).toEqual(["early", "late"]);
  });

  it("loads a component from a loader", async () => {
    const loaded = noting("loaded");
    defineDetailExtension({
      key: "lazy",
      placement: "body-top",
      component: () => Promise.resolve({ default: loaded }),
    });
    mountDetail();
    // The record, then the loader, then the render of what it loaded.
    for (let step = 0; step < 4; step++) await settle();

    expect(rendered).toEqual(["loaded"]);
  });
});
