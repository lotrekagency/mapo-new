import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h } from "vue";
import type { App, Component } from "vue";

import MapoAiSettings from "../runtime/components/MapoAiSettings.vue";

/** What the page asks the gateway: the test decides the answer of `status`. */
const client = vi.hoisted(() => ({
  call: vi.fn<(path: string) => Promise<unknown>>(),
  t: (key: string) => key,
  failureOf: () => "mapo.ai.errors.failed",
}));

vi.mock("../runtime/composables/settingsClient", () => ({
  useSettingsClient: () => client,
}));

/** The sections of the page, each a component that renders its name. */
const sections = vi.hoisted(() => {
  const mounted: string[] = [];
  return { mounted };
});

function section(name: string) {
  return {
    default: {
      name,
      setup() {
        sections.mounted.push(name);
        return () => null;
      },
    },
  };
}

vi.mock("../runtime/components/MapoAiSettingsPersonal.vue", () =>
  section("Personal"),
);
vi.mock("../runtime/components/MapoAiSettingsUsage.vue", () =>
  section("Usage"),
);
vi.mock("../runtime/components/MapoAiSettingsKeys.vue", () => section("Keys"));
vi.mock("../runtime/components/MapoAiSettingsBehaviour.vue", () =>
  section("Behaviour"),
);
vi.mock("../runtime/components/MapoAiSettingsActions.vue", () =>
  section("Actions"),
);

// Tests run in Node without a DOM: nodes are plain objects.
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

/** The titles of the alerts the page shows. */
const alerts: string[] = [];
const UAlert: Component = {
  name: "UAlert",
  props: { title: String },
  setup(props: { title?: string }) {
    return () => {
      if (props.title) alerts.push(props.title);
      return null;
    };
  },
};

let app: App<HeadlessNode> | undefined;

async function mountSettings() {
  app = createApp({ render: () => h(MapoAiSettings) });
  app.component("UAlert", UAlert);
  app.mount(headlessNode());
  await new Promise((resolve) => setTimeout(resolve));
}

afterEach(() => {
  app?.unmount();
  app = undefined;
  alerts.length = 0;
  sections.mounted.length = 0;
  client.call.mockReset();
});

describe("MapoAiSettings", () => {
  it("reads status as outside data: an answer it cannot read shows an error, not the settings", async () => {
    client.call.mockResolvedValue({ allowed: "yes", admin: "yes" });

    await mountSettings();

    expect(alerts).toContain("mapo.ai.errors.badAnswer");
    expect(sections.mounted).toEqual([]);
  });

  it("shows the settings of a status it can read", async () => {
    client.call.mockResolvedValue({ contract: 2, allowed: true, admin: false });

    await mountSettings();

    expect(alerts).toEqual([]);
    expect(sections.mounted).toEqual(["Personal", "Usage"]);
  });
});
