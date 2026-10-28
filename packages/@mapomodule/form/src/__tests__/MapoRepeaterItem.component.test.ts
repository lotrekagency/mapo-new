import { afterEach, describe, expect, it, vi } from "vitest";
import { h, onUnmounted, provide, ref, unref } from "vue";
import type { App, Component, SetupContext } from "vue";

import MapoRepeaterItem from "../runtime/components/fields/MapoRepeaterItem.vue";
import { FORM_KEY } from "../runtime/composables/useMapoForm.js";
import type { MapoFormContext } from "../runtime/composables/useMapoForm.js";
import { useFocusMode } from "../runtime/composables/useFocusMode.js";
import { useFieldAnnotation } from "../runtime/composables/useFieldAnnotation.js";
import type {
  AnyFieldDescriptor,
  FieldAnnotation,
  FieldAnnotations,
  FieldRegistry,
} from "../runtime/types/index.js";
import { createApp, headlessNode } from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// The item runs its own `useMapoForm`, which reads these at setup.
vi.mock("@mapomodule/i18n/runtime/composables/useMapoT", () => ({
  useMapoT: () => (key: string) => key,
}));
vi.mock("@mapomodule/store/runtime/stores/snack", () => ({
  useSnackStore: () => ({ show: vi.fn() }),
}));
vi.mock("@mapomodule/store/runtime/stores/auth", () => ({
  useAuthStore: () => ({ info: null }),
}));
// The translation shows its key and its parameters, so a test can read them.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, named: Record<string, unknown> = {}) =>
      `${key} ${JSON.stringify(named)}`,
  }),
}));

const suggested: FieldAnnotation = {
  label: "Suggested by AI",
  icon: "i-lucide-sparkles",
  color: "info",
};

// A text field the registry loads lazily, as the real ones are. It reads its
// annotation as a custom field would.
const seen: { annotation: FieldAnnotation | undefined } = {
  annotation: undefined,
};
const TextField: Component = {
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
const textModule = { __esModule: true, default: TextField };
const registry: FieldRegistry = {
  mapping: { text: () => Promise.resolve(textModule) },
  attrs: {},
  accessor: {},
};

const passthrough = (name: string): Component => ({
  name,
  inheritAttrs: false,
  setup(_props: unknown, { slots }: SetupContext) {
    return () => h("span", null, slots.default?.());
  },
});

// `UPopover` renders its trigger and, as if open, its content.
const UPopover: Component = {
  name: "UPopover",
  setup(_props: unknown, { slots }: SetupContext) {
    return () =>
      h("div", null, [slots.default?.({ open: true }), slots.content?.()]);
  },
};

// `UButton` and `UBadge` keep what the item binds: icon, color and label as
// props, the accessible name and the click handler as attributes.
interface Stub {
  readonly icon: unknown;
  readonly color: unknown;
  readonly label: unknown;
  readonly ariaLabel: unknown;
  click(): void;
}
const buttons: Stub[] = [];
const badges: Stub[] = [];

function recording(name: string, list: Stub[]): Component {
  return {
    name,
    inheritAttrs: false,
    props: { icon: String, color: String, label: [String, Number] },
    setup(
      props: { icon?: string; color?: string; label?: string | number },
      { attrs, slots }: SetupContext,
    ) {
      const stub: Stub = {
        get icon() {
          return props.icon;
        },
        get color() {
          return props.color;
        },
        get label() {
          return props.label;
        },
        get ariaLabel() {
          return attrs["aria-label"];
        },
        click: () => (attrs.onClick as (() => void) | undefined)?.(),
      };
      list.push(stub);
      onUnmounted(() => {
        list.splice(list.indexOf(stub), 1);
      });
      return () => h("span", null, slots.default?.());
    },
  };
}

let app: App<HeadlessNode> | undefined;

/** Mounts the first item of `blocks`, inside a form that marks `annotations`. */
function mountItem(annotations: FieldAnnotations) {
  const context = {
    annotations: ref(annotations),
    submitted: ref(false),
    immediate: true,
    debounce: 0,
  } as unknown as MapoFormContext<Record<string, unknown>>;
  const host: Component = {
    setup() {
      provide(FORM_KEY, context);
      return () =>
        h(MapoRepeaterItem, {
          item: { title: "La storia" },
          fields: [{ key: "title", type: "text", label: "Title" }],
          index: 0,
          errorPrefix: "blocks.0",
          parentErrors: {},
          languages: [],
          currentLang: "",
          readonly: false,
          registry,
          defaultExpanded: true,
          repeaterDescriptor: { key: "blocks", type: "repeater" },
        });
    },
  };
  app = createApp(host);
  for (const name of ["UIcon", "UInput", "UCheckbox"])
    app.component(name, passthrough(name));
  app.component("UPopover", UPopover);
  app.component("UButton", recording("UButton", buttons));
  app.component("UBadge", recording("UBadge", badges));
  app.mount(headlessNode());
}

// The field component resolves its loader over a few promise jobs.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  app?.unmount();
  app = undefined;
  useFocusMode().exit();
});

describe("MapoRepeaterItem annotations", () => {
  const annotations = {
    "blocks.0.title": suggested,
    "blocks.1.title": { ...suggested, label: "Another item" },
  };

  it("shows the parent's marks for this item on its fields", async () => {
    mountItem(annotations);
    await settle();

    const marks = buttons.filter((button) => button.ariaLabel);
    expect(marks.map((mark) => mark.ariaLabel)).toEqual(["Suggested by AI"]);
  });

  it("lets a custom field in the item read its annotation with item keys", async () => {
    mountItem(annotations);
    await settle();

    expect(seen.annotation).toEqual(suggested);
  });

  it("counts them on the item header", async () => {
    mountItem(annotations);
    await settle();

    const counts = badges.filter((badge) => badge.ariaLabel);
    expect(counts).toMatchObject([
      {
        icon: "i-lucide-sparkles",
        color: "info",
        label: 1,
        ariaLabel:
          'mapo.form.annotationCount {"n":1,"labels":"Suggested by AI"}',
      },
    ]);
  });

  it("hands them to focus mode", async () => {
    mountItem(annotations);
    await settle();

    const maximize = buttons.find(
      (button) => button.icon === "i-lucide-maximize-2",
    );
    maximize?.click();

    const target = useFocusMode().focusTarget.value;
    expect(unref(target?.annotations)).toEqual({ title: suggested });
  });
});
