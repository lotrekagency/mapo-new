import { afterEach, describe, expect, it, vi } from "vitest";
import { h, onUnmounted } from "vue";
import type { App, Component, SetupContext, VNode } from "vue";

import MapoFormAnnotation from "../runtime/components/MapoFormAnnotation.vue";
import type { FieldAnnotation } from "../runtime/types/index.js";
import {
  createApp,
  findAll,
  headlessNode,
  textOf,
} from "./headlessRenderer.js";
import type { HeadlessNode } from "./headlessRenderer.js";

// `UPopover` renders its trigger and, as if open, its content; it keeps the
// `content` and `ui` props the annotation passes.
const popover = { content: undefined as unknown, ui: undefined as unknown };
const UPopover: Component = {
  name: "UPopover",
  props: { content: Object, ui: Object },
  setup(props: { content?: object; ui?: object }, { slots }: SetupContext) {
    return () => {
      popover.content = props.content;
      popover.ui = props.ui;
      return h("div", null, [
        slots.default?.({ open: true }),
        slots.content?.(),
      ]);
    };
  },
};

// `UButton` declares what the annotation binds: `icon`, `color` and `label` as
// props, the accessible name as an attribute, `click` as the event.
interface ButtonStub {
  readonly icon: unknown;
  readonly color: unknown;
  readonly label: unknown;
  readonly ariaLabel: unknown;
  click(): void;
}
const buttons: ButtonStub[] = [];

const UButton: Component = {
  name: "UButton",
  inheritAttrs: false,
  props: { icon: String, color: String, label: String },
  emits: ["click"],
  setup(
    props: { icon?: string; color?: string; label?: string },
    { attrs, emit, slots }: SetupContext<["click"]>,
  ) {
    const stub: ButtonStub = {
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
      click: () => emit("click"),
    };
    buttons.push(stub);
    onUnmounted(() => {
      buttons.splice(buttons.indexOf(stub), 1);
    });
    return () => h("button", null, slots.default?.());
  },
};

let app: App<HeadlessNode> | undefined;

/** Mounts the annotation and returns the root node of what it renders. */
function mountAnnotation(
  annotation: FieldAnnotation,
  slots: Record<string, (bindings: never) => VNode[]> = {},
) {
  const root = headlessNode();
  const host: Component = {
    render: () => h(MapoFormAnnotation, { annotation }, slots),
  };
  app = createApp(host);
  app.component("UPopover", UPopover);
  app.component("UButton", UButton);
  app.mount(root);
  return root;
}

/** The dot on the mark: the only element hidden from assistive technology. */
const dots = (root: HeadlessNode) =>
  findAll(root, (node) => node.props["aria-hidden"] === "true");

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("MapoFormAnnotation", () => {
  it("names the mark with the label and falls back to the default icon and color", () => {
    const root = mountAnnotation({ label: "Note" });

    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatchObject({
      icon: "i-lucide-info",
      color: "neutral",
      ariaLabel: "Note",
    });
    expect(dots(root)).toHaveLength(0);
  });

  it("shows the title, the description and a dot when asked", () => {
    const root = mountAnnotation({
      label: "To check",
      icon: "i-lucide-sparkles",
      color: "warning",
      dot: true,
      description: "No citation found in the source.",
    });

    expect(buttons[0]).toMatchObject({
      icon: "i-lucide-sparkles",
      color: "warning",
    });
    expect(textOf(root)).toBe("To check No citation found in the source.");
    expect(dots(root)).toHaveLength(1);
  });

  it("renders one button per action and runs it on click", () => {
    const confirm = vi.fn();
    mountAnnotation({
      label: "Suggested by AI",
      actions: [
        { label: "Confirm", icon: "i-lucide-check", onClick: confirm },
        { label: "Restore", color: "error", onClick: vi.fn() },
      ],
    });

    const actions = buttons.filter((button) => button.label);
    expect(actions).toMatchObject([
      { label: "Confirm", icon: "i-lucide-check", color: "neutral" },
      { label: "Restore", color: "error" },
    ]);
    actions[0]?.click();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("names the popover and lifts it above the expand panel and the focus portal", () => {
    mountAnnotation({ label: "Suggested by AI" });

    expect(popover.content).toMatchObject({ "aria-label": "Suggested by AI" });
    expect(popover.ui).toEqual({ content: "z-[10000]" });
  });

  it("lets the body slot replace the description", () => {
    const root = mountAnnotation(
      { label: "Suggested by AI", description: "Replaced" },
      { body: () => [h("q", null, "From page 1")] },
    );

    expect(textOf(root)).toBe("Suggested by AI From page 1");
  });
});
