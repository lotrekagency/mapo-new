import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, inject, onUnmounted, provide } from "vue";
import type { App, Component, SetupContext, VNode } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { Pinia } from "pinia";

import MapoMediaEditor from "../runtime/components/MapoMediaEditor.vue";
import { useMediaStore } from "../runtime/stores/media";
import type { MediaItem } from "../runtime/types/media";

// The editor reads the store, which reads the CRUD layer and the runtime
// config: replace them with in-memory doubles. `vi.hoisted` lets the mock
// factories share them.
const crud = vi.hoisted(() => ({
  options: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  partialUpdate: vi.fn(),
  delete: vi.fn(),
}));
const snack = vi.hoisted(() => ({ show: vi.fn() }));

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({ public: {} }),
  useNuxtApp: () => ({}),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => crud }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => snack,
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => ({ ask: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/composables/usePermissions", () => ({
  usePermissions: () => ({ canChange: () => true, canDelete: () => true }),
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
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

// `UButton`: its label is the slot text, `click` is what the editor listens to.
interface ButtonStub {
  readonly label: string;
  click(): void;
}
const buttons: ButtonStub[] = [];

const UButton: Component = {
  name: "UButton",
  emits: ["click"],
  setup(_props: unknown, { emit, slots }: SetupContext<["click"]>) {
    const stub: ButtonStub = {
      get label() {
        return slotText(slots.default?.());
      },
      click: () => emit("click"),
    };
    buttons.push(stub);
    onUnmounted(() => {
      buttons.splice(buttons.indexOf(stub), 1);
    });
    return () => h("button", null, slots.default?.());
  },
};

// `UFormField` hands its label to the input inside, so a test finds an input
// by the label the user reads.
const FIELD_LABEL = Symbol("field-label");
const UFormField: Component = {
  name: "UFormField",
  props: { label: String },
  setup(props: { label?: string }, { slots }: SetupContext) {
    provide(FIELD_LABEL, props.label ?? "");
    return () => h("div", null, slots.default?.());
  },
};

interface InputStub {
  readonly label: string;
  readonly value: string;
  type(value: string): void;
}
const inputs: InputStub[] = [];

const inputComponent = (name: string): Component => ({
  name,
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup(
    props: { modelValue?: string },
    { emit }: SetupContext<["update:modelValue"]>,
  ) {
    const stub: InputStub = {
      label: inject(FIELD_LABEL, ""),
      get value() {
        return props.modelValue ?? "";
      },
      type: (value) => emit("update:modelValue", value),
    };
    inputs.push(stub);
    onUnmounted(() => {
      inputs.splice(inputs.indexOf(stub), 1);
    });
    return () => h("input");
  },
});

// `USlideover` renders its `#content` slot while open.
const USlideover: Component = {
  name: "USlideover",
  props: { open: Boolean },
  setup(props: { open?: boolean }, { slots }: SetupContext) {
    return () => (props.open ? h("div", null, slots.content?.()) : null);
  },
};

const stubs: Record<string, Component> = {
  UButton,
  UFormField,
  USlideover,
  UInput: inputComponent("UInput"),
  UTextarea: inputComponent("UTextarea"),
  UFieldGroup: passthrough("UFieldGroup"),
  MapoMediaPreview: passthrough("MapoMediaPreview"),
  MapoMediaFileChanger: passthrough("MapoMediaFileChanger"),
};

const button = (label: string) => buttons.find((stub) => stub.label === label);
const input = (label: string) => {
  const found = inputs.find((stub) => stub.label === label);
  if (!found) throw new Error(`no input ${label}`);
  return found;
};

// Runs the pending CRUD promises and the renders they trigger.
const settle = () => new Promise((resolve) => setTimeout(resolve));

const stored: MediaItem = {
  id: 7,
  file: "/media/photo.jpg",
  mime_type: "image/jpeg",
  title: "Foto",
  alt_text: "Una foto",
  description: "",
  size: 1000,
  created: "2026-11-01T00:00:00Z",
  modified: "2026-11-01T00:00:00Z",
  translations: {
    it: { title: "Foto", alt_text: "Una foto", description: "" },
    en: { title: "Photo", alt_text: "A photo", description: "" },
  },
};

let app: App<HeadlessNode> | undefined;
let pinia: Pinia;

async function openEditor(props: Record<string, unknown> = {}) {
  app = createApp({ render: () => h(MapoMediaEditor as Component, props) });
  app.use(pinia);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(headlessNode());
  useMediaStore().editMedia = structuredClone(stored);
  await settle();
  button("mapo.edit")?.click();
  await settle();
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  for (const fn of Object.values(crud)) fn.mockReset();
  snack.show.mockReset();
  crud.options.mockResolvedValue({
    lang_info: { translatable: true, languages: ["it", "en"] },
  });
  crud.list.mockResolvedValue({
    media: { items: [], paginator: { page: 1, pages: 1 } },
    folders: [],
    parent_folder: null,
  });
  crud.partialUpdate.mockImplementation((_id: number, body: unknown) =>
    Promise.resolve({ ...stored, ...(body as object) }),
  );
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoMediaEditor", () => {
  it("offers one tab per language and no untranslated one", async () => {
    await openEditor();

    expect(button("IT")).toBeDefined();
    expect(button("EN")).toBeDefined();
    expect(buttons.map((stub) => stub.label)).not.toContain(
      "mapo.mediaEditor.defaultLang",
    );
  });

  it("saves the edit as a translation, sending only what changed", async () => {
    await openEditor();
    expect(input("mapo.title").value).toBe("Foto");

    input("mapo.title").type("Nuovo titolo");
    button("mapo.save")?.click();
    await settle();

    expect(crud.partialUpdate).toHaveBeenCalledWith(7, {
      translations: { it: { title: "Nuovo titolo" } },
    });
    expect(snack.show).toHaveBeenCalledWith(
      "mapo.mediaManager.fileInfo",
      "success",
    );
    expect(button("mapo.save")).toBeUndefined();
  });

  it("opens on the default language when it is offered", async () => {
    await openEditor({ defaultLang: "en" });

    expect(input("mapo.altTag").value).toBe("A photo");
    input("mapo.altTag").type("A new photo");
    button("mapo.save")?.click();
    await settle();

    expect(crud.partialUpdate).toHaveBeenCalledWith(7, {
      translations: { en: { alt_text: "A new photo" } },
    });
  });

  it("edits the plain fields of media that are not translated", async () => {
    crud.options.mockResolvedValue({ lang_info: { translatable: false } });
    await openEditor();

    expect(button("IT")).toBeUndefined();
    input("mapo.title").type("New title");
    button("mapo.save")?.click();
    await settle();

    expect(crud.partialUpdate).toHaveBeenCalledWith(7, { title: "New title" });
  });

  it("keeps the editor open and shows the backend errors in a toast", async () => {
    crud.partialUpdate.mockRejectedValue(
      Object.assign(new Error("Bad Request"), {
        status: 400,
        data: {
          title_it: ["Ensure this field has no more than 200 characters."],
        },
      }),
    );
    await openEditor();

    input("mapo.title").type("x".repeat(300));
    button("mapo.save")?.click();
    await settle();

    expect(snack.show).toHaveBeenCalledWith(
      "mapo.title (IT): Ensure this field has no more than 200 characters.",
      "error",
    );
    expect(snack.show).not.toHaveBeenCalledWith(
      "mapo.mediaManager.fileInfo",
      "success",
    );
    expect(button("mapo.save")).toBeDefined();
    expect(input("mapo.title").value).toBe("x".repeat(300));
  });
});
