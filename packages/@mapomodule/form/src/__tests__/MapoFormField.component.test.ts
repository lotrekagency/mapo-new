import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRenderer,
  h,
  onMounted,
  onUnmounted,
  provide,
  ref,
  shallowRef,
} from "vue";
import type { App, Component, ShallowRef } from "vue";

import MapoFormField from "../runtime/components/MapoFormField.vue";
import { FORM_KEY } from "../runtime/composables/useMapoForm.js";
import type { MapoFormContext } from "../runtime/composables/useMapoForm.js";
import type {
  AnyFieldDescriptor,
  FieldRegistry,
} from "../runtime/types/index.js";

// `useMapoForm.ts` pulls in `nuxt/app` through `useMapoT`, which cannot resolve
// outside a Nuxt build. The field only injects the form context.
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));

// Tests run in Node without a DOM. A renderer whose nodes are plain objects is
// enough to mount the component with real reactivity, watchers and events.
interface HeadlessNode {
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  // `v-show` reads and writes `style.display` on the field's root.
  style: Record<string, string>;
}

const headlessNode = (): HeadlessNode => ({
  parent: null,
  children: [],
  style: {},
});

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

/** What a test observes of a field component: its lifecycle and what it renders. */
interface FieldProbe {
  mounted: number;
  unmounted: number;
  /** The element the field renders: the browser keeps the focus on it while it stays. */
  element: HeadlessNode | null;
  /** The descriptor of the last render. */
  descriptor: unknown;
}

/**
 * A field type as the registry holds it, a lazy loader, plus a probe on the
 * component the loader resolves to.
 */
function fieldType(name: string) {
  const probe: FieldProbe = {
    mounted: 0,
    unmounted: 0,
    element: null,
    descriptor: undefined,
  };
  const component: Component = {
    name,
    props: { descriptor: { type: Object, required: true } },
    setup(props: { descriptor?: unknown }) {
      const element = ref<HeadlessNode | null>(null);
      onMounted(() => {
        probe.mounted++;
        probe.element = element.value;
      });
      onUnmounted(() => {
        probe.unmounted++;
      });
      return () => {
        probe.descriptor = props.descriptor;
        return h("input", { ref: element });
      };
    },
  };
  // `import()` resolves to a module namespace; `__esModule` makes the async
  // component take `default` from this object in the same way.
  const module = { __esModule: true, default: component };
  return { probe, loader: () => Promise.resolve(module) };
}

const registryOf = (mapping: FieldRegistry["mapping"]): FieldRegistry => ({
  mapping,
  attrs: {},
  accessor: {},
});

function formContext(
  registry: FieldRegistry,
): MapoFormContext<Record<string, unknown>> {
  return {
    model: ref<Record<string, unknown>>({ title: "Chi siamo" }),
    fields: [],
    errors: ref({}),
    languages: [],
    currentLang: ref(""),
    readonly: ref(false),
    immediate: true,
    debounce: 0,
    registry,
    setFieldValue: vi.fn(),
    getClientError: () => null,
    markTouched: vi.fn(),
    isTouched: () => false,
    submitted: ref(false),
  };
}

// The label renders `UIcon` only for async validation or expandable fields, but
// the template resolves it on every render.
const UIcon: Component = { render: () => h("i") };

let apps: App<HeadlessNode>[] = [];

/**
 * Mounts one field in a form of its own. Setting `descriptor.value` re-renders
 * the field with that object, as a recomputed `fields` array does.
 */
function mountField(
  registry: FieldRegistry,
  descriptor: ShallowRef<AnyFieldDescriptor>,
) {
  const context = formContext(registry);
  const host: Component = {
    setup() {
      provide(FORM_KEY, context);
      return () => h(MapoFormField, { descriptor: descriptor.value });
    },
  };
  const app = createApp(host);
  app.component("UIcon", UIcon);
  app.mount(headlessNode());
  apps.push(app);
}

// An async component resolves its loader over a few promise jobs; a timer runs
// after all of them.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const app of apps) app.unmount();
  apps = [];
});

describe("MapoFormField component", () => {
  it("keeps the field mounted when a new descriptor object has the same type", async () => {
    const text = fieldType("TextField");
    const descriptor = shallowRef<AnyFieldDescriptor>({
      key: "title",
      type: "text",
      label: "Title",
    });
    mountField(registryOf({ text: text.loader }), descriptor);
    await settle();
    const element = text.probe.element;

    const next: AnyFieldDescriptor = {
      key: "title",
      type: "text",
      label: "Page title",
    };
    descriptor.value = next;
    await settle();

    expect(text.probe.unmounted).toBe(0);
    expect(text.probe.mounted).toBe(1);
    expect(element).not.toBeNull();
    expect(text.probe.element).toBe(element);
    expect(text.probe.descriptor).toBe(next);
  });

  it("mounts the new type's component when the type changes", async () => {
    const text = fieldType("TextField");
    const textarea = fieldType("TextareaField");
    const descriptor = shallowRef<AnyFieldDescriptor>({
      key: "title",
      type: "text",
    });
    mountField(
      registryOf({ text: text.loader, textarea: textarea.loader }),
      descriptor,
    );
    await settle();

    descriptor.value = { key: "title", type: "textarea" };
    await settle();

    expect(text.probe.unmounted).toBe(1);
    expect(textarea.probe.mounted).toBe(1);
  });

  it("shows a field of a type already loaded at once, in any form", async () => {
    const text = fieldType("TextField");
    const registry = registryOf({ text: text.loader });
    mountField(registry, shallowRef({ key: "title", type: "text" }));
    await settle();

    mountField(registry, shallowRef({ key: "subtitle", type: "text" }));

    expect(text.probe.mounted).toBe(2);
  });
});
