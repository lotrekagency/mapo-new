import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, inject, nextTick, onUnmounted } from "vue";
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
// The signed-in user: drafts are kept under their id.
const auth = vi.hoisted(() => ({ info: { id: 7 } as { id: number } | null }));
type LeaveGuard = (
  to: unknown,
  from: unknown,
  next: (ok: boolean) => void,
) => void;
// The unsaved-changes guard each detail registers, newest last.
const leaveGuards = vi.hoisted(() => [] as LeaveGuard[]);
// One app instance for every call, as in an app: the extensions live on it.
const nuxtApp = vi.hoisted(() => ({ $mapoFormRegistry: {} }));

vi.mock("#app", () => ({
  useRouter: () => router,
  onBeforeRouteLeave: (guard: LeaveGuard) => {
    leaveGuards.push(guard);
  },
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
vi.mock("@mapomodule/store/runtime/stores/auth", () => ({
  useAuthStore: () => auth,
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
  notifyErrors?: boolean;
}
const forms: FormProps[] = [];

/** What the detail asked the forms to bring into view: the form's keys, the path. */
const reveals: { form: string[]; path: string }[] = [];

type RegisterReveal = (fn: (path: string) => Promise<boolean>) => () => void;

const MapoForm: Component = {
  name: "MapoForm",
  inheritAttrs: false,
  props: {
    annotations: Object,
    fields: Array,
    notifyErrors: { type: Boolean, default: true },
  },
  setup(props: FormProps, { slots }: SetupContext) {
    forms.push(props);
    // As the real form, it lets the detail bring its fields into view: here
    // it answers whether it has the field.
    const register = inject<RegisterReveal | null>(
      "mapoDetailRegisterReveal",
      null,
    );
    const unregister = register?.((path) => {
      const keys = (props.fields ?? []).map((field) => field.key);
      reveals.push({ form: keys, path });
      return Promise.resolve(keys.includes(path));
    });
    onUnmounted(() => {
      forms.splice(forms.indexOf(props), 1);
      unregister?.();
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
  leaveGuards.splice(0);
  auth.info = { id: 7 };
});

describe("MapoDetail actions", () => {
  it("shows server error toasts only from the main form when sidebar fields are present", async () => {
    mountDetail(
      {},
      {
        fields: [{ key: "title", type: "text" }],
        sidebarFields: [{ key: "slug", type: "text" }],
      },
    );
    await settle();

    expect(forms).toHaveLength(2);
    expect(forms.map(({ notifyErrors }) => notifyErrors)).toEqual([
      true,
      false,
    ]);
  });

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
function mountWithProbe(
  extraProps: Record<string, unknown> = {},
  extraSlots: Record<string, (bindings: never) => VNode[]> = {},
) {
  const seen: { detail?: MapoDetailContext } = {};
  const Probe: Component = {
    setup() {
      seen.detail = useMapoDetail();
      return () => h("i");
    },
  };
  mountDetail({ "body-top": () => [h(Probe)], ...extraSlots }, extraProps);
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

  it("tells what the page names the record: its model, its permissions' model and how it reads OPTIONS", async () => {
    const schemaFromMetadata = () => undefined;
    const seen = mountWithProbe({
      fields,
      modelName: "Article",
      permissionModel: "article",
      schemaFromMetadata,
    });
    await settle();
    const detail = seen.detail!;

    expect(detail.modelName?.value).toBe("Article");
    expect(detail.permissionModel?.value).toBe("article");
    expect(detail.schemaFromMetadata?.value).toBe(schemaFromMetadata);
  });

  it("names nothing the page does not name", async () => {
    const seen = mountWithProbe({ fields });
    await settle();
    const detail = seen.detail!;

    // Optional in the type: MapoDetail still gives each, empty.
    expect(detail.modelName?.value).toBeNull();
    expect(detail.permissionModel).toBeDefined();
    expect(detail.permissionModel?.value).toBeUndefined();
    expect(detail.schemaFromMetadata).toBeDefined();
    expect(detail.schemaFromMetadata?.value).toBeUndefined();
  });

  it("tells the components inside of a save, with the record, before the page moves to it", async () => {
    crud.create.mockResolvedValue({ id: 9, title: "Fresh" });
    const steps: string[] = [];
    router.replace.mockImplementation(async () => {
      steps.push("replace");
    });
    const seen = mountWithProbe({ fields, id: "new" });
    await settle();
    const detail = seen.detail!;
    detail.onSaved?.((saved) => {
      steps.push(`saved ${(saved as { id: number }).id}`);
    });

    await detail.save();

    expect(steps).toEqual(["saved 9", "replace"]);
  });

  it("stops telling a handler once removed, and a handler that throws leaves the save done", async () => {
    const seen = mountWithProbe({ fields });
    await settle();
    const detail = seen.detail!;
    const removed = vi.fn();
    const remove = detail.onSaved!(removed);
    remove();
    detail.onSaved!(() => {
      throw new Error("a broken extension");
    });

    await detail.save();

    expect(removed).not.toHaveBeenCalled();
    expect(crud.partialUpdate).toHaveBeenCalledTimes(1);
    expect(detail.isSaving.value).toBe(false);
  });

  it("takes the operator to a field through the form that holds it", async () => {
    reveals.length = 0;
    const seen = mountWithProbe({
      fields,
      sidebarFields: [{ key: "status", type: "select" }],
    });
    await settle();
    const detail = seen.detail!;

    await expect(detail.revealField?.("status")).resolves.toBe(true);
    await expect(detail.revealField?.("title")).resolves.toBe(true);
    await expect(detail.revealField?.("missing")).resolves.toBe(false);

    expect(reveals).toEqual([
      { form: ["title"], path: "status" },
      { form: ["status"], path: "status" },
      { form: ["title"], path: "title" },
      { form: ["title"], path: "missing" },
      { form: ["status"], path: "missing" },
    ]);
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

describe("MapoDetail drafts", () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  };
  const fields = [
    { key: "title", type: "text", translatable: true },
    { key: "token", type: "text", translatable: true, noDraft: true },
  ];
  const draftOf = (model: object, savedAt = Date.now()) =>
    JSON.stringify({ model, savedAt });

  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("localStorage", storage);
    // A record of its own each time: a change through the model writes into it.
    crud.detail.mockImplementation(async () => ({ id: 5, title: "News" }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Lets the autosave, debounced by two seconds, write. */
  async function autosave(): Promise<void> {
    await nextTick();
    vi.advanceTimersByTime(2000);
  }

  it("counts a new record as changed only once it holds a value", async () => {
    const seen = mountWithProbe({ fields, id: "new" });
    await settle();
    const detail = seen.detail!;
    const model = detail.model.value as Record<string, unknown>;
    expect(detail.isDirty.value).toBe(false);

    // Blank texts, an editor's empty paragraph, empty lists and objects.
    model.slug = "";
    model.translations = { en: { title: "<p><br></p>" }, it: {} };
    model.tags = [];
    expect(detail.isDirty.value).toBe(false);

    model.featured = false;
    expect(detail.isDirty.value).toBe(true);
  });

  it("counts what the page put in a new record before it opened as no change", async () => {
    // A component inside sets a value up, as a page that prefills a record.
    const seen: { detail?: MapoDetailContext } = {};
    const Prefill: Component = {
      setup() {
        seen.detail = useMapoDetail();
        (seen.detail!.model.value as Record<string, unknown>).category = 3;
        return () => h("i");
      },
    };
    mountDetail({ "body-top": () => [h(Prefill)] }, { fields, id: "new" });
    await settle();
    const detail = seen.detail!;
    const model = detail.model.value as Record<string, unknown>;
    expect(detail.isDirty.value).toBe(false);

    model.slug = "hello";
    expect(detail.isDirty.value).toBe(true);
    model.slug = "";
    expect(detail.isDirty.value).toBe(false);
    model.category = 4;
    expect(detail.isDirty.value).toBe(true);
  });

  it("asks before leaving a new record that holds a value, and before closing the tab", async () => {
    const unloads: ((event: object) => void)[] = [];
    vi.stubGlobal("addEventListener", (type: string, handler: () => void) => {
      if (type === "beforeunload") unloads.push(handler);
    });
    vi.stubGlobal("removeEventListener", () => {});
    const seen = mountWithProbe({ fields, id: "new" });
    await settle();
    const [leave] = leaveGuards;
    const left = vi.fn();
    leave!({}, {}, left);
    await settle();
    expect(confirm.ask).not.toHaveBeenCalled();
    expect(left).toHaveBeenCalledWith(true);

    (seen.detail!.model.value as Record<string, unknown>).slug = "hello";
    confirm.ask.mockResolvedValue(false);
    const kept = vi.fn();
    leave!({}, {}, kept);
    await settle();
    expect(confirm.ask).toHaveBeenCalledTimes(1);
    expect(kept).toHaveBeenCalledWith(false);

    const closing = { preventDefault: vi.fn(), returnValue: undefined };
    for (const handler of unloads) handler(closing);
    expect(closing.preventDefault).toHaveBeenCalled();
  });

  it("keeps a new record's draft under the user, without the noDraft fields", async () => {
    const sidebarFields = [{ key: "pin", type: "text", noDraft: true }];
    const seen = mountWithProbe({
      fields,
      sidebarFields,
      id: "new",
      draft: true,
    });
    await settle();
    vi.useFakeTimers();
    const model = seen.detail!.model.value as Record<string, unknown>;
    model.translations = {
      en: { title: "Hello", token: "t-en" },
      it: { token: "t-it" },
    };
    model.pin = "1234";
    await autosave();

    expect([...stored.keys()]).toEqual(["mapo:draft:7:/api/news/:new"]);
    const saved = JSON.parse(stored.get("mapo:draft:7:/api/news/:new")!);
    expect(saved.model).toEqual({
      translations: { en: { title: "Hello" }, it: {} },
    });
  });

  it("removes the draft it wrote once the record is back as loaded, and leaves an earlier one", async () => {
    stored.set("mapo:draft:7:/api/news/:5", draftOf({ title: "Earlier" }));
    const seen = mountWithProbe(
      { fields, draft: true },
      { "draft-banner": () => [h("i")] },
    );
    await settle();
    vi.useFakeTimers();
    const model = seen.detail!.model.value as Record<string, unknown>;
    // The record loads: nothing changed, and the earlier draft stays.
    await autosave();
    expect(stored.has("mapo:draft:7:/api/news/:5")).toBe(true);

    model.title = "Changed";
    await autosave();
    const saved = JSON.parse(stored.get("mapo:draft:7:/api/news/:5")!);
    expect(saved.model.title).toBe("Changed");

    model.title = "News";
    await autosave();
    expect(stored.size).toBe(0);
  });

  it("never offers a draft kept without its user, and removes it, nor another user's", async () => {
    stored.set("mapo:draft:/api/news/:5", draftOf({ title: "Whose?" }));
    stored.set("mapo:draft:8:/api/news/:5", draftOf({ title: "Another's" }));
    const found = vi.fn();
    mountWithProbe({ fields, draft: true, onDraftFound: found });
    await settle();

    expect(found).not.toHaveBeenCalled();
    expect(stored.has("mapo:draft:/api/news/:5")).toBe(false);
    expect(stored.has("mapo:draft:8:/api/news/:5")).toBe(true);
  });

  it("offers the user's draft, and restores it or discards it", async () => {
    stored.set("mapo:draft:7:/api/news/:5", draftOf({ title: "Draft" }));
    const found = vi.fn();
    // A banner of the page's own: the built-in one leaves with a transition,
    // which needs a DOM. An empty slot would render the built-in one.
    const seen = mountWithProbe(
      { fields, draft: true, onDraftFound: found },
      { "draft-banner": () => [h("i")] },
    );
    await settle();
    // The autosave a change schedules never fires after the test.
    vi.useFakeTimers();
    expect(found).toHaveBeenCalledTimes(1);
    const [draft, , restore, discard] = found.mock.calls[0]!;
    expect(draft).toEqual({ title: "Draft" });

    restore();
    expect(seen.detail!.model.value).toEqual({ id: 5, title: "Draft" });
    discard();
    expect(stored.size).toBe(0);
  });

  it("drops a draft older than a day, and clears the draft once saved", async () => {
    const dayAndMinute = 86_400_000 + 60_000;
    stored.set(
      "mapo:draft:7:/api/news/:5",
      draftOf({ title: "Stale" }, Date.now() - dayAndMinute),
    );
    const found = vi.fn();
    const seen = mountWithProbe({ fields, draft: true, onDraftFound: found });
    await settle();
    vi.useFakeTimers();
    expect(found).not.toHaveBeenCalled();
    expect(stored.size).toBe(0);

    stored.set("mapo:draft:7:/api/news/:5", draftOf({ title: "Draft" }));
    await seen.detail!.save();
    expect(stored.size).toBe(0);
  });
});

describe("MapoDetail draft parts", () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  };
  const fields = [{ key: "title", type: "text" }];
  const key = "mapo:draft:7:/api/news/:5";
  /** A page with drafts and a banner of its own: the built-in one needs a DOM to leave. */
  const mountDrafting = (props: Record<string, unknown> = {}) =>
    mountWithProbe(
      { fields, draft: true, ...props },
      { "draft-banner": () => [h("i")] },
    );

  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("localStorage", storage);
    crud.detail.mockImplementation(async () => ({ id: 5, title: "News" }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function autosave(): Promise<void> {
    await nextTick();
    vi.advanceTimersByTime(2000);
  }

  it("keeps what a part saves, on touch(), with the record unchanged", async () => {
    const seen = mountDrafting();
    await settle();
    vi.useFakeTimers();
    const draft = seen.detail!.draft!;
    let notes: object | undefined = { n: 1 };
    draft.part("notes", { save: () => notes, restore: () => {} });
    draft.part("empty", { save: () => undefined, restore: () => {} });

    draft.touch();
    await autosave();
    const saved = JSON.parse(stored.get(key)!);
    expect(saved.model).toEqual({ id: 5, title: "News" });
    expect(saved.parts).toEqual({ notes: { n: 1 } });

    // Nothing left to keep: the draft this page wrote goes.
    notes = undefined;
    draft.touch();
    await autosave();
    expect(stored.has(key)).toBe(false);
  });

  it("leaves out a part that throws, and keeps the others", async () => {
    const seen = mountDrafting();
    await settle();
    vi.useFakeTimers();
    const draft = seen.detail!.draft!;
    draft.part("broken", {
      save: () => {
        throw new Error("a broken extension");
      },
      restore: () => {},
    });
    draft.part("notes", { save: () => ({ n: 1 }), restore: () => {} });

    draft.touch();
    await autosave();
    expect(JSON.parse(stored.get(key)!).parts).toEqual({ notes: { n: 1 } });
  });

  it("restores the parts after the values, and a part that comes later gets its data then", async () => {
    stored.set(
      key,
      JSON.stringify({
        model: { title: "Draft" },
        savedAt: Date.now(),
        parts: { notes: { n: 2 }, later: { m: 3 } },
      }),
    );
    const found = vi.fn();
    const seen = mountDrafting({ onDraftFound: found });
    await settle();
    vi.useFakeTimers();
    const detail = seen.detail!;
    const titles: unknown[] = [];
    const notes = vi.fn(() => {
      titles.push((detail.model.value as { title: string }).title);
    });
    const fresh = vi.fn();
    detail.draft!.part("notes", { save: () => undefined, restore: notes });
    detail.draft!.part("fresh", { save: () => undefined, restore: fresh });

    const [, , restore] = found.mock.calls[0]!;
    restore();
    expect(notes).toHaveBeenCalledWith({ n: 2 });
    expect(titles).toEqual(["Draft"]);
    // The draft holds nothing for it: it starts again.
    expect(fresh).toHaveBeenCalledWith(undefined);

    const later = vi.fn();
    detail.draft!.part("later", { save: () => undefined, restore: later });
    expect(later).toHaveBeenCalledWith({ m: 3 });
  });

  it("gives a later part nothing once the record is saved, and stops asking a part removed", async () => {
    stored.set(
      key,
      JSON.stringify({
        model: { title: "Draft" },
        savedAt: Date.now(),
        parts: { later: { m: 3 } },
      }),
    );
    const found = vi.fn();
    const seen = mountDrafting({ onDraftFound: found });
    await settle();
    vi.useFakeTimers();
    const detail = seen.detail!;
    const removed = vi.fn(() => ({ n: 1 }));
    const remove = detail.draft!.part("gone", {
      save: removed,
      restore: () => {},
    });
    remove();

    found.mock.calls[0]![2]();
    await detail.save();
    const later = vi.fn();
    detail.draft!.part("later", { save: () => undefined, restore: later });
    expect(later).not.toHaveBeenCalled();

    detail.draft!.touch();
    await autosave();
    expect(removed).not.toHaveBeenCalled();
    expect(stored.has(key)).toBe(false);
  });

  it("keeps nothing with drafts off", async () => {
    const seen = mountWithProbe({ fields });
    await settle();
    vi.useFakeTimers();
    const draft = seen.detail!.draft!;
    draft.part("notes", { save: () => ({ n: 1 }), restore: () => {} });

    draft.touch();
    await autosave();
    expect(stored.size).toBe(0);
  });
});
