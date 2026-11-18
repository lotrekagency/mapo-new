import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick, ref } from "vue";
import type { App, Component, Ref } from "vue";

import MapoWygEditor from "../runtime/components/fields/MapoWygEditor.vue";
import type { EditorDescriptor } from "../runtime/types/index.js";

// The editor field with and without the HTML source view (`attrs.source`).
// Tiptap needs a DOM, which these tests do not have: `@tiptap/vue-3` is
// replaced by an editor that keeps its document as an HTML string and
// normalizes what it is given, the way a schema would.

interface FakeEditor {
  getHTML: () => string;
  commands: { setContent: ReturnType<typeof vi.fn> };
  setEditable: ReturnType<typeof vi.fn>;
  isActive: () => boolean;
  chain: () => unknown;
  can: () => unknown;
  destroy: ReturnType<typeof vi.fn>;
}

const tiptap = vi.hoisted(() => ({ editor: undefined as unknown }));

/**
 * What the fake schema does to HTML: whitespace between tags goes, a `<span>`
 * (no extension supports it) is unwrapped, an empty document is one empty
 * paragraph.
 */
const normalize = (html: string) =>
  html
    .replace(/>[ \t\n\f\r]+</g, "><")
    .replace(/<\/?span[^>]*>/g, "")
    .trim() || "<p></p>";

function createFakeEditor(content: string): FakeEditor {
  let html = normalize(content);
  // A command chain: any command returns the chain, `run()` applies nothing.
  const chain: unknown = new Proxy(() => chain, {
    get: () => () => chain,
  });
  return {
    getHTML: () => html,
    commands: {
      setContent: vi.fn((value: string) => {
        html = normalize(value);
      }),
    },
    setEditable: vi.fn(),
    isActive: () => false,
    chain: () => chain,
    can: () => chain,
    destroy: vi.fn(),
  };
}

vi.mock("@tiptap/vue-3", async () => {
  const { h, shallowRef } = await import("vue");
  return {
    useEditor: (options: { content: string }) => {
      tiptap.editor = createFakeEditor(options.content);
      return shallowRef(tiptap.editor);
    },
    EditorContent: {
      name: "EditorContent",
      props: { editor: { type: Object, default: undefined } },
      render: () => h("editor-content"),
    },
  };
});

// The DOM sanitizer returns its input without a DOM; this stand-in removes the
// vectors it targets, so the tests see whether the source goes through it.
vi.mock("../runtime/utils/sanitizeHtml.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sanitizeHtml: vi.fn((html: string) =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\shref="javascript:[^"]*"/gi, ""),
  ),
}));

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

// Nodes are plain objects: each keeps its tag, its props (attributes and
// listeners included) and its text; `style` takes what `v-show` writes.
interface HeadlessNode {
  type: string;
  text: string;
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  props: Record<string, unknown>;
  style: Record<string, string>;
}

const headlessNode = (type: string, text = ""): HeadlessNode => ({
  type,
  text,
  parent: null,
  children: [],
  props: {},
  style: {},
});

const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: (type) => headlessNode(type),
  createText: (text) => headlessNode("#text", text),
  createComment: (text) => headlessNode("#comment", text),
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.children = [];
    node.text = text;
  },
  patchProp(node, key, _previous, next) {
    node.props[key] = next;
  },
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

// Nuxt UI stand-ins: the element each one renders keeps the attributes and
// listeners the editor passes.
const stubs: Record<string, Component> = {
  UButton: {
    setup:
      (_, { slots }) =>
      () =>
        h("button", slots.default?.()),
  },
  UTooltip: {
    props: { text: { type: String, default: "" } },
    setup:
      (props, { slots }) =>
      () =>
        h("tooltip", { text: props.text }, slots.default?.()),
  },
  USeparator: { render: () => h("separator") },
  UTextarea: {
    props: { modelValue: { type: String, default: "" } },
    emits: ["update:modelValue"],
    setup:
      (props, { emit }) =>
      () =>
        h("textarea", {
          value: props.modelValue,
          onInput: (value: string) => emit("update:modelValue", value),
        }),
  },
  MapoMediaManagerDialog: { render: () => null },
};

const all = (node: HeadlessNode): HeadlessNode[] => [
  node,
  ...node.children.flatMap(all),
];

let app: App<HeadlessNode> | undefined;
let root: HeadlessNode;
let modelValue: Ref<string>;
let emitted: string[];

const fakeEditor = () => tiptap.editor as FakeEditor;
const buttons = () => all(root).filter((node) => node.type === "button");
const sourceToggle = () =>
  buttons().find((node) => node.props.icon === "i-lucide-code-xml");
const textarea = () => all(root).find((node) => node.type === "textarea");
const editorContent = () =>
  all(root).find((node) => node.type === "editor-content")!;
const isHidden = (node: HeadlessNode) => node.style.display === "none";

function click(node: HeadlessNode | undefined) {
  (node!.props.onClick as () => void)();
}

/** Types into the source textarea: the stub reports it as `update:modelValue`. */
function typeSource(html: string) {
  (textarea()!.props.onInput as (value: string) => void)(html);
}

function mount(
  attrs: EditorDescriptor["attrs"] = {},
  state: { readonly?: boolean } = {},
) {
  root = headlessNode("root");
  const descriptor: EditorDescriptor = { key: "body", type: "editor", attrs };
  const host: Component = {
    render: () =>
      h(MapoWygEditor, {
        modelValue: modelValue.value,
        descriptor,
        readonly: state.readonly,
        disabled: state.readonly,
        "onUpdate:modelValue": (value: string) => emitted.push(value),
      }),
  };
  app = createApp(host);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(root);
}

beforeEach(() => {
  vi.useFakeTimers();
  modelValue = ref("<p>Hello <strong>world</strong></p><h2>Title</h2>");
  emitted = [];
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.useRealTimers();
});

describe("MapoWygEditor without the new attrs", () => {
  it("renders the built-in toolbar only, enabled, and the editor", () => {
    mount();

    expect(buttons()).toHaveLength(10);
    expect(buttons().every((node) => !node.props.disabled)).toBe(true);
    expect(sourceToggle()).toBeUndefined();
    expect(textarea()).toBeUndefined();
    expect(isHidden(editorContent())).toBe(false);
  });

  it("disables the built-in toolbar when read-only", () => {
    mount({}, { readonly: true });

    expect(buttons().every((node) => node.props.disabled)).toBe(true);
  });
});

describe("MapoWygEditor source view", () => {
  it("shows the editor's HTML laid out in a textarea, keeping the editor mounted", async () => {
    mount({ source: true });

    click(sourceToggle());
    await nextTick();

    expect(textarea()!.props.value).toBe(
      "<p>Hello <strong>world</strong></p>\n<h2>Title</h2>",
    );
    expect(isHidden(editorContent())).toBe(true);
    expect(sourceToggle()!.props["aria-pressed"]).toBe(true);
    expect(fakeEditor().destroy).not.toHaveBeenCalled();
  });

  it("disables every other toolbar button and keeps the toggle active", async () => {
    mount({ source: true });

    click(sourceToggle());
    await nextTick();

    const others = buttons().filter((node) => node !== sourceToggle());
    expect(others.every((node) => node.props.disabled)).toBe(true);
    expect(sourceToggle()!.props.disabled).toBeFalsy();
  });

  it("writes the typing into the editor after a pause and emits the editor's HTML", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();

    typeSource("<p>One</p>\n<p>Two <span>words</span></p>");
    expect(fakeEditor().commands.setContent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);

    expect(fakeEditor().commands.setContent).toHaveBeenCalledWith(
      "<p>One</p>\n<p>Two <span>words</span></p>",
      false,
    );
    // Normalized by the editor: the layout whitespace and the unsupported tag are gone.
    expect(emitted).toEqual(["<p>One</p><p>Two words</p>"]);
  });

  it("passes the source through the sanitizer, so script, handlers and javascript: links never reach the value", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();

    typeSource(
      '<p onclick="steal()">Hi</p><script>alert(1)</script><p><a href="javascript:alert(1)">link</a></p>',
    );
    vi.advanceTimersByTime(250);

    expect(fakeEditor().commands.setContent).toHaveBeenCalledWith(
      "<p>Hi</p><p><a>link</a></p>",
      false,
    );
    expect(emitted).toEqual(["<p>Hi</p><p><a>link</a></p>"]);
  });

  it("emits nothing when the typing leaves the document as it was", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();

    typeSource("<p>Hello <strong>world</strong></p>\n\n<h2>Title</h2>  ");
    vi.advanceTimersByTime(250);

    expect(emitted).toEqual([]);
  });

  it("goes back to the editor, already up to date, and round-trips again", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();
    typeSource("<ul><li><p>Item</p></li></ul>");

    // Leaving before the pause still applies the typing.
    click(sourceToggle());
    await nextTick();

    expect(emitted).toEqual(["<ul><li><p>Item</p></li></ul>"]);
    expect(textarea()).toBeUndefined();
    expect(isHidden(editorContent())).toBe(false);
    expect(fakeEditor().getHTML()).toBe("<ul><li><p>Item</p></li></ul>");

    click(sourceToggle());
    await nextTick();

    expect(textarea()!.props.value).toBe(
      "<ul>\n  <li>\n    <p>Item</p>\n  </li>\n</ul>",
    );
  });

  it("does not rewrite the textarea when the field's own value comes back", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();

    typeSource("<p>Typed</p>\n");
    vi.advanceTimersByTime(250);
    modelValue.value = emitted[0]!;
    await nextTick();

    expect(textarea()!.props.value).toBe("<p>Typed</p>\n");
    expect(fakeEditor().commands.setContent).toHaveBeenCalledTimes(1);
  });

  it("shows a value set from outside, dropping the typing it replaces", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();
    typeSource("<p>Not saved</p>");

    modelValue.value = "<p>Draft</p><p>restored</p>";
    await nextTick();
    vi.advanceTimersByTime(250);

    expect(textarea()!.props.value).toBe("<p>Draft</p>\n<p>restored</p>");
    expect(fakeEditor().getHTML()).toBe("<p>Draft</p><p>restored</p>");
    expect(emitted).toEqual([]);
  });

  it("applies the typing at once when the textarea loses the focus", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();

    typeSource("<p>Saved right away</p>");
    (textarea()!.props.onBlur as () => void)();

    expect(emitted).toEqual(["<p>Saved right away</p>"]);
    vi.advanceTimersByTime(250);
    expect(emitted).toHaveLength(1);
  });

  it("applies pending typing when the field unmounts", async () => {
    mount({ source: true });
    click(sourceToggle());
    await nextTick();

    typeSource("<p>Last words</p>");
    app!.unmount();
    app = undefined;

    expect(emitted).toEqual(["<p>Last words</p>"]);
  });

  it("shows the source of a read-only field without letting it change", async () => {
    mount({ source: true }, { readonly: true });

    expect(sourceToggle()!.props.disabled).toBeFalsy();
    click(sourceToggle());
    await nextTick();

    expect(textarea()!.props.readonly).toBe(true);
    typeSource("<p>Changed</p>");
    vi.advanceTimersByTime(250);

    expect(textarea()!.props.value).toBe(
      "<p>Hello <strong>world</strong></p>\n<h2>Title</h2>",
    );
    expect(fakeEditor().commands.setContent).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });
});

describe("MapoWygEditor custom toolbar buttons", () => {
  /** The toolbar's elements in order, without the anchors of fragments. */
  const toolbarRow = () =>
    all(root)
      .find((node) => node.children.some((child) => child.type === "tooltip"))!
      .children.filter((node) => !node.type.startsWith("#"));
  const tooltipOf = (label: string) =>
    all(root).find(
      (node) => node.type === "tooltip" && node.props.text === label,
    );
  const buttonOf = (label: string) =>
    buttons().find((node) => node.props["aria-label"] === label);
  const hasActiveClass = (node: HeadlessNode | undefined) =>
    String(node!.props.class ?? "").includes("bg-gray-200");

  it("renders the buttons after the built-in ones, past a separator", () => {
    mount({
      toolbar: [
        {
          key: "table",
          icon: "i-lucide-table",
          label: "Insert table",
          action: () => {},
        },
        { key: "quote", label: "Quote", action: () => {} },
      ],
    });

    const row = toolbarRow();
    const table = row.indexOf(tooltipOf("Insert table")!);
    expect(row[table - 1]!.type).toBe("separator");
    expect(row[table - 2]).toBe(tooltipOf("mapo.wygEditor.insertImage"));
    expect(row[table + 1]).toBe(tooltipOf("Quote"));
    expect(buttons()).toHaveLength(12);

    expect(buttonOf("Insert table")!.props.icon).toBe("i-lucide-table");
    // A button with no icon shows its label.
    expect(buttonOf("Quote")!.props.label).toBe("Quote");
  });

  it("runs the action with the editor on click", () => {
    const action = vi.fn();
    mount({ toolbar: [{ key: "x", label: "X", action }] });

    click(buttonOf("X"));

    expect(action).toHaveBeenCalledWith(fakeEditor());
  });

  it("shows the active state and disables the button as its predicates say", () => {
    mount({
      toolbar: [
        {
          key: "on",
          label: "On",
          action: () => {},
          isActive: () => true,
          isDisabled: () => false,
        },
        { key: "off", label: "Off", action: () => {}, isDisabled: () => true },
      ],
    });

    expect(hasActiveClass(buttonOf("On"))).toBe(true);
    expect(buttonOf("On")!.props.disabled).toBe(false);
    expect(hasActiveClass(buttonOf("Off"))).toBe(false);
    expect(buttonOf("Off")!.props.disabled).toBe(true);
  });

  it("disables the buttons when read-only and in the source view", async () => {
    const toolbar = [{ key: "x", label: "X", action: () => {} }];
    mount({ toolbar }, { readonly: true });
    expect(buttonOf("X")!.props.disabled).toBe(true);
    app!.unmount();

    mount({ toolbar, source: true });
    expect(buttonOf("X")!.props.disabled).toBe(false);
    click(sourceToggle());
    await nextTick();
    expect(buttonOf("X")!.props.disabled).toBe(true);
  });

  it("keeps the source toggle last, after the custom buttons", () => {
    mount({
      toolbar: [{ key: "x", label: "X", action: () => {} }],
      source: true,
    });

    const row = toolbarRow();
    expect(row.at(-1)).toBe(tooltipOf("mapo.wygEditor.source"));
    expect(row.at(-2)!.type).toBe("separator");
    expect(row.at(-3)).toBe(tooltipOf("X"));
  });

  it("treats a predicate that throws as inactive and disabled, without breaking the toolbar", () => {
    const missingCommand = () => {
      throw new TypeError("addRowAfter is not a function");
    };
    mount({
      toolbar: [
        {
          key: "row",
          label: "Add row",
          action: () => {},
          isActive: missingCommand,
          isDisabled: missingCommand,
        },
      ],
    });

    expect(hasActiveClass(buttonOf("Add row"))).toBe(false);
    expect(buttonOf("Add row")!.props.disabled).toBe(true);
    expect(buttons()).toHaveLength(11);
  });
});
