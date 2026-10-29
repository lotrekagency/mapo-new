import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRenderer,
  defineComponent,
  h,
  nextTick,
  onMounted,
  watchEffect,
} from "vue";
import type { App, Component } from "vue";

import MapoListActions from "../runtime/components/MapoListActions.vue";
import type { ActionDescriptor } from "../runtime/types/list";

const permissions = vi.hoisted(() => ({
  canDelete: vi.fn(),
  checkPermission: vi.fn(),
}));
const crud = vi.hoisted(() => ({ delete: vi.fn() }));

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => ({ ask: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/composables/usePermissions", () => ({
  usePermissions: () => permissions,
}));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({
  useCrud: () => crud,
}));

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

let actionItems: { label: string }[];
let applyDisabled: boolean;

// eslint-disable-next-line vue/one-component-per-file
const USelect: Component = defineComponent({
  name: "USelect",
  props: {
    items: { type: Array, default: () => [] },
    modelValue: { type: String, default: undefined },
  },
  emits: ["update:modelValue"],
  setup(
    props: { items?: { label: string }[] },
    { emit }: { emit: (event: "update:modelValue", value: string) => void },
  ) {
    actionItems = props.items ?? [];
    onMounted(() => {
      const firstAction = props.items?.[0];
      if (firstAction) emit("update:modelValue", firstAction.label);
    });
    return () => h("select");
  },
});

// eslint-disable-next-line vue/one-component-per-file -- Separate UI control stub.
const UButton: Component = defineComponent({
  name: "UButton",
  props: { disabled: Boolean },
  setup(props: { disabled?: boolean }) {
    watchEffect(() => {
      applyDisabled = !!props.disabled;
    });
    return () => h("button");
  },
});

function mount(props: {
  permissionModel?: string;
  defaultActions?: boolean;
  actions?: ActionDescriptor<{ id: number }>[];
}): App<HeadlessNode> {
  // eslint-disable-next-line vue/one-component-per-file -- Mount the generic component under test.
  const app = createApp(MapoListActions as Component, {
    selection: [{ id: 1 }],
    selectionQuery: new URLSearchParams(),
    endpoint: "/api/items/",
    ...props,
  });
  app.component("USelect", USelect);
  app.component("UButton", UButton);
  app.mount(headlessNode());
  return app;
}

describe("MapoListActions", () => {
  beforeEach(() => {
    permissions.canDelete.mockReset();
    permissions.checkPermission.mockReset();
    crud.delete.mockReset();
    actionItems = [];
    applyDisabled = true;
  });

  it("uses the model delete permission for its built-in action", async () => {
    permissions.canDelete.mockReturnValue(false);
    const deniedApp = mount({ permissionModel: "article" });
    await nextTick();
    await nextTick();

    expect(actionItems.map(({ label }) => label)).toContain(
      "mapo.listActions.permanentDelete",
    );
    expect(permissions.canDelete).toHaveBeenCalledWith("article");
    expect(applyDisabled).toBe(true);

    deniedApp.unmount();
    permissions.canDelete.mockReturnValue(true);
    const allowedApp = mount({ permissionModel: "article" });
    await nextTick();
    await nextTick();

    expect(applyDisabled).toBe(false);
    allowedApp.unmount();
  });

  it("preserves the built-in action when no permission model is provided", async () => {
    const app = mount({});
    await nextTick();
    await nextTick();

    expect(actionItems.map(({ label }) => label)).toContain(
      "mapo.listActions.permanentDelete",
    );
    expect(applyDisabled).toBe(false);
    expect(permissions.canDelete).not.toHaveBeenCalled();

    app.unmount();
  });

  it("can omit the built-in action without omitting custom actions", async () => {
    const customAction: ActionDescriptor<{ id: number }> = {
      label: "Archive",
      handler: async () => {},
    };
    const app = mount({ defaultActions: false, actions: [customAction] });
    await nextTick();
    await nextTick();

    expect(actionItems.map(({ label }) => label)).toEqual(["Archive"]);

    app.unmount();
  });
});
