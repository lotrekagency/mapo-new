import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, onUnmounted } from "vue";
import type { App, Component, SetupContext, VNode } from "vue";

import MapoDetail from "../runtime/components/MapoDetail.vue";

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

vi.mock("#app", () => ({
  useRouter: () => router,
  onBeforeRouteLeave: () => {},
  useNuxtApp: () => ({ $mapoFormRegistry: {} }),
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

const stubs: Record<string, Component> = {
  UButton,
  UCard: passthrough("UCard"),
  UAlert: passthrough("UAlert"),
  UIcon: passthrough("UIcon"),
  UModal: passthrough("UModal"),
  MapoForm: passthrough("MapoForm"),
  MapoDetailLangSwitch: passthrough("MapoDetailLangSwitch"),
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

function mountDetail(slots: Record<string, (bindings: never) => VNode[]> = {}) {
  const root: Component = {
    render: () =>
      h(MapoDetail as Component, { endpoint: "/api/news/", id: 5 }, slots),
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
