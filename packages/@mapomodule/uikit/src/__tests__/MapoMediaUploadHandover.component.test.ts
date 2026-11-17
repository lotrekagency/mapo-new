import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, onUnmounted } from "vue";
import type { App, Component, SetupContext } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { Pinia } from "pinia";

import MapoMediaGallery from "../runtime/components/MapoMediaGallery.vue";
import MapoMediaUploader from "../runtime/components/MapoMediaUploader.vue";
import { useMediaStore } from "../runtime/stores/media";

// "Upload here" in the gallery and files dropped on it reach the uploader
// through the store's hand-over queue. The CRUD layer and the runtime config
// are in-memory doubles.
const crud = vi.hoisted(() => ({ options: vi.fn(), list: vi.fn() }));

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({ public: {} }),
  useNuxtApp: () => ({}),
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));
vi.mock("@mapomodule/core/runtime/api/crud", () => ({ useCrud: () => crud }));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/confirm", () => ({
  useConfirmStore: () => ({ ask: vi.fn() }),
}));
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));

// Tests run in Node without a DOM. A renderer whose nodes are plain objects is
// enough to mount the component with real reactivity, watchers and events.
interface HeadlessNode {
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  text?: string;
}

const headlessNode = (): HeadlessNode => ({ parent: null, children: [] });

const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: headlessNode,
  createText: (text) => ({ ...headlessNode(), text }),
  createComment: headlessNode,
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.text = text;
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

const textOf = (node: HeadlessNode): string =>
  (node.text ?? "") + node.children.map(textOf).join("");

// `MapoDropArea` declares the contract both components bind: a `files` event
// and a default slot that receives `triggerPick`.
let dropArea: { drop(files: File[]): void; readonly picks: number } | null =
  null;
const MapoDropArea: Component = {
  name: "MapoDropArea",
  emits: ["files"],
  setup(_props: unknown, { emit, slots }: SetupContext<["files"]>) {
    let picks = 0;
    dropArea = {
      drop: (files) => emit("files", files),
      get picks() {
        return picks;
      },
    };
    onUnmounted(() => {
      dropArea = null;
    });
    return () =>
      h(
        "div",
        null,
        slots.default?.({
          triggerPick: () => {
            picks++;
          },
          isDragging: false,
        }),
      );
  },
};

// `UButton` with its label, `click` is what both components listen to.
const buttons: { label: string; click(): void }[] = [];
const UButton: Component = {
  name: "UButton",
  emits: ["click"],
  setup(_props: unknown, { emit, slots }: SetupContext<["click"]>) {
    const stub = {
      get label() {
        return (slots.default?.() ?? [])
          .map((node) =>
            typeof node.children === "string" ? node.children : "",
          )
          .join("")
          .trim();
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

// One `UInput` per text field of each queued file.
let inputs = 0;
const UInput: Component = {
  name: "UInput",
  setup() {
    inputs++;
    onUnmounted(() => {
      inputs--;
    });
    return () => h("input");
  },
};

const passthrough = (name: string): Component => ({
  name,
  inheritAttrs: false,
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h("div", null, slots.default?.());
  },
});

const stubs: Record<string, Component> = {
  MapoDropArea,
  UButton,
  UInput,
  UIcon: passthrough("UIcon"),
  UCheckbox: passthrough("UCheckbox"),
  USkeleton: passthrough("USkeleton"),
  UPagination: passthrough("UPagination"),
  UFormField: passthrough("UFormField"),
  USelect: passthrough("USelect"),
  UProgress: passthrough("UProgress"),
  UBadge: passthrough("UBadge"),
  MapoMediaPreview: passthrough("MapoMediaPreview"),
};

let app: App<HeadlessNode> | undefined;
let pinia: Pinia;
let root: HeadlessNode;
const uploadRequests: number[] = [];

function mount(component: Component) {
  root = headlessNode();
  app = createApp({
    render: () =>
      h(component, { onUpload: () => uploadRequests.push(Date.now()) }),
  });
  app.use(pinia);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(root);
}

const settle = () => new Promise((resolve) => setTimeout(resolve));
const photo = () => new File(["x"], "photo.png", { type: "image/png" });

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  uploadRequests.length = 0;
  inputs = 0;
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("upload from the gallery", () => {
  it("tells where the files land: the folder on screen", async () => {
    const store = useMediaStore();
    store.parentFolders = [{ id: 3, name: "Photos", parent: null }];
    mount(MapoMediaGallery as Component);
    await settle();

    expect(textOf(root)).toContain(
      'mapo.mediaGallery.dropHint {"folder":"Photos"}',
    );
  });

  it("queues the files dropped on it and asks for the Upload tab", async () => {
    mount(MapoMediaGallery as Component);
    const files = [photo(), photo()];

    dropArea?.drop(files);

    expect(useMediaStore().queuedUploads).toEqual(files);
    expect(uploadRequests).toHaveLength(1);
  });

  it("opens the file picker from Upload here", async () => {
    mount(MapoMediaGallery as Component);
    await settle();

    buttons.find((b) => b.label === "mapo.mediaGallery.uploadHere")?.click();

    expect(dropArea?.picks).toBe(1);
  });

  it("lets the uploader queue the handed-over files when it opens", async () => {
    useMediaStore().queueUploads([photo(), photo()]);

    mount(MapoMediaUploader as Component);
    await settle();

    // Title, alt text and description for each of the two files.
    expect(inputs).toBe(6);
    expect(useMediaStore().queuedUploads).toEqual([]);
  });
});
