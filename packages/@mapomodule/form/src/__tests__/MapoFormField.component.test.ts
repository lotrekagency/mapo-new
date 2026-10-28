import { afterEach, describe, expect, it, vi } from "vitest";
import { h, onMounted, onUnmounted, provide, ref, shallowRef } from "vue";
import type { App, Component, Ref, SetupContext, ShallowRef } from "vue";

import MapoFormField from "../runtime/components/MapoFormField.vue";
import { FORM_KEY } from "../runtime/composables/useMapoForm.js";
import { useFieldAnnotation } from "../runtime/composables/useFieldAnnotation.js";
import type { MapoFormContext } from "../runtime/composables/useMapoForm.js";
import type {
  AnyFieldDescriptor,
  FieldAnnotation,
  FieldAnnotations,
  FieldRegistry,
} from "../runtime/types/index.js";
import { createApp, headlessNode } from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// `useMapoForm.ts` pulls in `nuxt/app` through `useMapoT`, which cannot resolve
// outside a Nuxt build. The field only injects the form context.
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));

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

interface FormOptions {
  annotations?: Ref<FieldAnnotations>;
  currentLang?: string;
}

function formContext(
  registry: FieldRegistry,
  options: FormOptions,
): MapoFormContext<Record<string, unknown>> {
  return {
    model: ref<Record<string, unknown>>({ title: "Chi siamo" }),
    fields: [],
    errors: ref({}),
    languages: [],
    currentLang: ref(options.currentLang ?? ""),
    readonly: ref(false),
    immediate: true,
    debounce: 0,
    registry,
    setFieldValue: vi.fn(),
    getClientError: () => null,
    markTouched: vi.fn(),
    isTouched: () => false,
    submitted: ref(false),
    annotations: options.annotations ?? ref({}),
  };
}

// The label renders `UIcon` only for async validation or expandable fields, but
// the template resolves it on every render.
const UIcon: Component = { render: () => h("i") };

// `UPopover` renders its trigger and, as if open, its content.
const UPopover: Component = {
  name: "UPopover",
  setup(_props: unknown, { slots }: SetupContext) {
    return () =>
      h("div", null, [slots.default?.({ open: true }), slots.content?.()]);
  },
};

// `UButton` declares what the mark binds: `icon` and `color` as props, the
// accessible name as an attribute.
interface ButtonStub {
  readonly icon: unknown;
  readonly color: unknown;
  readonly ariaLabel: unknown;
}
const buttons: ButtonStub[] = [];

const UButton: Component = {
  name: "UButton",
  inheritAttrs: false,
  props: { icon: String, color: String, label: String },
  setup(
    props: { icon?: string; color?: string },
    { attrs, slots }: SetupContext,
  ) {
    const stub: ButtonStub = {
      get icon() {
        return props.icon;
      },
      get color() {
        return props.color;
      },
      get ariaLabel() {
        return attrs["aria-label"];
      },
    };
    buttons.push(stub);
    onUnmounted(() => {
      buttons.splice(buttons.indexOf(stub), 1);
    });
    return () => h("button", null, slots.default?.());
  },
};

/** The marks next to the labels: the buttons with an accessible name. */
const marks = () => buttons.filter((button) => button.ariaLabel);

let apps: App<HeadlessNode>[] = [];

/**
 * Mounts one field in a form of its own. Setting `descriptor.value` re-renders
 * the field with that object, as a recomputed `fields` array does.
 */
function mountField(
  registry: FieldRegistry,
  descriptor: ShallowRef<AnyFieldDescriptor>,
  options: FormOptions = {},
  slots: Record<string, (bindings: never) => unknown> = {},
) {
  const context = formContext(registry, options);
  const host: Component = {
    setup() {
      provide(FORM_KEY, context);
      return () => h(MapoFormField, { descriptor: descriptor.value }, slots);
    },
  };
  const app = createApp(host);
  app.component("UIcon", UIcon);
  app.component("UPopover", UPopover);
  app.component("UButton", UButton);
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

describe("MapoFormField annotations", () => {
  const ai: FieldAnnotation = {
    label: "Suggested by AI",
    icon: "i-lucide-sparkles",
    color: "info",
  };
  const toCheck: FieldAnnotation = { ...ai, label: "To check", dot: true };

  it("follows the annotation map and keeps the field mounted", async () => {
    const text = fieldType("TextField");
    const annotations = ref<FieldAnnotations>({ title: ai });
    mountField(
      registryOf({ text: text.loader }),
      shallowRef({ key: "title", type: "text" }),
      { annotations },
    );
    await settle();
    expect(marks()).toEqual([
      {
        icon: "i-lucide-sparkles",
        color: "info",
        ariaLabel: "Suggested by AI",
      },
    ]);

    annotations.value = { title: toCheck };
    await settle();
    expect(marks().map((mark) => mark.ariaLabel)).toEqual(["To check"]);

    annotations.value = {};
    await settle();
    expect(marks()).toEqual([]);
    expect(text.probe.mounted).toBe(1);
    expect(text.probe.unmounted).toBe(0);
  });

  it("marks a translatable field in the current language, or by its bare key", async () => {
    const text = fieldType("TextField");
    const annotations = ref<FieldAnnotations>({
      "translations.it.title": toCheck,
    });
    mountField(
      registryOf({ text: text.loader }),
      shallowRef({ key: "title", type: "text", translatable: true }),
      { annotations, currentLang: "it" },
    );
    await settle();
    expect(marks().map((mark) => mark.ariaLabel)).toEqual(["To check"]);

    annotations.value = { title: ai };
    await settle();
    expect(marks().map((mark) => mark.ariaLabel)).toEqual(["Suggested by AI"]);

    annotations.value = { "translations.en.title": ai };
    await settle();
    expect(marks()).toEqual([]);
  });

  it("gives the annotation to the label slot and the popover body slot", async () => {
    const text = fieldType("TextField");
    const labelSlot = vi.fn(() => []);
    const bodySlot = vi.fn(() => []);
    mountField(
      registryOf({ text: text.loader }),
      shallowRef({ key: "title", type: "text" }),
      { annotations: ref({ title: ai }) },
      { "field.title.annotation": bodySlot },
    );
    await settle();
    expect(bodySlot).toHaveBeenLastCalledWith(
      expect.objectContaining({ annotation: ai }),
    );

    mountField(
      registryOf({ text: text.loader }),
      shallowRef({ key: "title", type: "text" }),
      { annotations: ref({ title: ai }) },
      { "field.title.label": labelSlot },
    );
    await settle();
    expect(labelSlot).toHaveBeenLastCalledWith(
      expect.objectContaining({ annotation: ai }),
    );
  });
});

describe("useFieldAnnotation", () => {
  const ai: FieldAnnotation = { label: "Suggested by AI", color: "info" };
  const toCheck: FieldAnnotation = { label: "To check", dot: true };

  /** A custom field that keeps the annotation it reads at every render. */
  function annotatedFieldType() {
    const seen: { annotation: FieldAnnotation | undefined } = {
      annotation: undefined,
    };
    const component: Component = {
      name: "AnnotatedField",
      props: { descriptor: { type: Object, required: true } },
      setup(props: { descriptor?: AnyFieldDescriptor }) {
        const annotation = useFieldAnnotation(
          () => props.descriptor as AnyFieldDescriptor,
        );
        return () => {
          seen.annotation = annotation.value;
          return h("input");
        };
      },
    };
    const module = { __esModule: true, default: component };
    return { seen, loader: () => Promise.resolve(module) };
  }

  it("lets a custom field read the annotation its mark shows", async () => {
    const field = annotatedFieldType();
    const annotations = ref<FieldAnnotations>({ title: ai });
    mountField(
      registryOf({ custom: field.loader }),
      shallowRef({ key: "title", type: "custom" }),
      { annotations },
    );
    await settle();
    expect(field.seen.annotation).toEqual(ai);
    expect(marks().map((mark) => mark.ariaLabel)).toEqual(["Suggested by AI"]);

    annotations.value = { title: toCheck };
    await settle();
    expect(field.seen.annotation).toEqual(toCheck);

    annotations.value = {};
    await settle();
    expect(field.seen.annotation).toBeUndefined();
  });

  it("applies the current language and the bare key, as the mark does", async () => {
    const field = annotatedFieldType();
    mountField(
      registryOf({ custom: field.loader }),
      shallowRef({ key: "title", type: "custom", translatable: true }),
      { annotations: ref({ title: ai }), currentLang: "it" },
    );
    await settle();

    expect(field.seen.annotation).toEqual(ai);
  });

  it("is undefined outside a form", () => {
    let read: FieldAnnotation | undefined = ai;
    const standalone: Component = {
      setup() {
        const annotation = useFieldAnnotation({ key: "title", type: "text" });
        return () => {
          read = annotation.value;
          return h("input");
        };
      },
    };
    const app = createApp(standalone);
    app.mount(headlessNode());
    apps.push(app);

    expect(read).toBeUndefined();
  });
});
