import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, h, nextTick, ref } from "vue";
import type { App, Component, Ref } from "vue";
import TextAlign from "@tiptap/extension-text-align";

import MapoWygEditor from "../runtime/components/fields/MapoWygEditor.vue";
import type { EditorDescriptor } from "../runtime/types/index.js";

// The editor field: its toolbar (links, alignment, custom buttons) and the
// HTML source view (`attrs.source`).
// Tiptap needs a DOM, which these tests do not have: `@tiptap/vue-3` is
// replaced by an editor that keeps its document as an HTML string and
// normalizes what it is given, the way a schema would.

interface FakeEditor {
  getHTML: () => string;
  commands: { setContent: ReturnType<typeof vi.fn> };
  setEditable: ReturnType<typeof vi.fn>;
  isActive: ReturnType<typeof vi.fn>;
  getAttributes: ReturnType<typeof vi.fn>;
  state: { selection: { empty: boolean } };
  chain: () => unknown;
  can: () => unknown;
  destroy: ReturnType<typeof vi.fn>;
  /** The commands run through `chain()`, in order, with their arguments. */
  calls: [string, ...unknown[]][];
}

const tiptap = vi.hoisted(() => ({
  editor: undefined as unknown,
  options: undefined as { extensions: { name: string }[] } | undefined,
}));

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
  const calls: [string, ...unknown[]][] = [];
  // A command chain: any command returns the chain and is recorded, `run()`
  // applies nothing. `can()` answers through a chain that records nothing.
  const chain: unknown = new Proxy(() => chain, {
    get:
      (_target, name) =>
      (...args: unknown[]) => {
        calls.push([String(name), ...args]);
        return chain;
      },
  });
  const dryRun: unknown = new Proxy(() => dryRun, {
    get: () => () => dryRun,
  });
  return {
    getHTML: () => html,
    commands: {
      setContent: vi.fn((value: string) => {
        html = normalize(value);
      }),
    },
    setEditable: vi.fn(),
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({})),
    state: { selection: { empty: false } },
    chain: () => chain,
    can: () => dryRun,
    destroy: vi.fn(),
    calls,
  };
}

vi.mock("@tiptap/vue-3", async () => {
  const { h, shallowRef } = await import("vue");
  return {
    useEditor: (options: {
      content: string;
      extensions: { name: string }[];
    }) => {
      tiptap.options = options;
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

// The module's runtime config; `beforeEach` restores what the module writes by default.
const runtimeConfig = vi.hoisted(() => ({
  public: {
    mapoForm: undefined as
      | { editor: { source: boolean; textAlign?: boolean } }
      | undefined,
  },
}));
vi.mock("#app", () => ({ useRuntimeConfig: () => runtimeConfig }));

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
  UInput: {
    props: { modelValue: { type: String, default: "" } },
    emits: ["update:modelValue"],
    setup:
      (props, { emit }) =>
      () =>
        h("input", {
          value: props.modelValue,
          onInput: (value: string) => emit("update:modelValue", value),
        }),
  },
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
  runtimeConfig.public.mapoForm = { editor: { source: true } };
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.useRealTimers();
});

describe("MapoWygEditor without attrs", () => {
  it("renders the built-in toolbar and the source toggle, enabled, and the editor", () => {
    mount();

    expect(buttons()).toHaveLength(12);
    expect(buttons().every((node) => !node.props.disabled)).toBe(true);
    expect(sourceToggle()).toBeDefined();
    expect(textarea()).toBeUndefined();
    expect(isHidden(editorContent())).toBe(false);
  });

  it("renders the built-in toolbar only when the field turns the source view off", () => {
    mount({ source: false });

    expect(buttons()).toHaveLength(11);
    expect(sourceToggle()).toBeUndefined();
  });

  it("disables the built-in toolbar when read-only, not the source toggle", () => {
    mount({}, { readonly: true });

    const builtIn = buttons().filter((node) => node !== sourceToggle());
    expect(builtIn.every((node) => node.props.disabled)).toBe(true);
    expect(sourceToggle()!.props.disabled).toBeFalsy();
  });
});

describe("MapoWygEditor source toggle default", () => {
  it("follows the module option when the field does not set attrs.source", () => {
    runtimeConfig.public.mapoForm = { editor: { source: false } };
    mount();

    expect(sourceToggle()).toBeUndefined();
  });

  it("lets the field's attrs.source win over the module option, both ways", () => {
    runtimeConfig.public.mapoForm = { editor: { source: false } };
    mount({ source: true });
    expect(sourceToggle()).toBeDefined();
    app!.unmount();

    runtimeConfig.public.mapoForm = { editor: { source: true } };
    mount({ source: false });
    expect(sourceToggle()).toBeUndefined();
  });

  it("shows the toggle when the app has no form runtime config", () => {
    runtimeConfig.public.mapoForm = undefined;
    mount();

    expect(sourceToggle()).toBeDefined();
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
    // 11 built-in, 2 custom, the source toggle.
    expect(buttons()).toHaveLength(14);

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
    // 11 built-in, 1 custom, the source toggle.
    expect(buttons()).toHaveLength(13);
  });
});

/** A button by its accessible name, or by its text when it has none. */
const byLabel = (label: string) =>
  buttons().find(
    (node) => node.props["aria-label"] === label || node.props.label === label,
  );

describe("MapoWygEditor links", () => {
  const linkButton = () => byLabel("mapo.wygEditor.link");
  const linkInput = () => all(root).find((node) => node.type === "input");
  const typeLink = (url: string) =>
    (linkInput()!.props.onInput as (value: string) => void)(url);
  const alert = () => all(root).find((node) => node.props.role === "alert");
  /** Fires the input's keydown listeners, as `@keydown.<key>` binds them. */
  function press(key: string) {
    const event = { key, preventDefault: vi.fn() };
    const handlers = [linkInput()!.props.onKeydown].flat() as Array<
      (event: unknown) => void
    >;
    handlers.forEach((handler) => handler(event));
    return event;
  }
  async function openLink(url?: string) {
    click(linkButton());
    await nextTick();
    if (url !== undefined) {
      typeLink(url);
      await nextTick();
    }
  }

  it("opens a bar with the address of the link at the selection, and closes it", async () => {
    mount();
    fakeEditor().getAttributes.mockReturnValue({ href: "/contatti/" });

    await openLink();

    expect(fakeEditor().getAttributes).toHaveBeenCalledWith("link");
    expect(linkInput()!.props.value).toBe("/contatti/");
    expect(linkButton()!.props["aria-expanded"]).toBe(true);

    click(byLabel("mapo.wygEditor.linkCancel"));
    await nextTick();
    expect(linkInput()).toBeUndefined();
  });

  it("links the selection, extending the link already there", async () => {
    mount();
    await openLink("https://example.com");

    click(byLabel("mapo.wygEditor.linkApply"));
    await nextTick();

    expect(fakeEditor().calls).toEqual([
      ["focus"],
      ["extendMarkRange", "link"],
      ["setLink", { href: "https://example.com" }],
      ["run"],
    ]);
    expect(linkInput()).toBeUndefined();
  });

  it("inserts the address as linked text when nothing is selected", async () => {
    mount();
    fakeEditor().state.selection.empty = true;
    await openLink("/contatti/");

    click(byLabel("mapo.wygEditor.linkApply"));

    expect(fakeEditor().calls).toEqual([
      ["focus"],
      [
        "insertContent",
        {
          type: "text",
          text: "/contatti/",
          marks: [{ type: "link", attrs: { href: "/contatti/" } }],
        },
      ],
      ["run"],
    ]);
  });

  it("adds https:// to an address that starts with www.", async () => {
    mount();
    await openLink("www.example.com");

    click(byLabel("mapo.wygEditor.linkApply"));

    expect(fakeEditor().calls).toContainEqual([
      "setLink",
      { href: "https://www.example.com" },
    ]);
  });

  it("refuses an address outside the allowlist and keeps the bar open with an error", async () => {
    mount();
    await openLink("javascript:alert(1)");

    click(byLabel("mapo.wygEditor.linkApply"));
    await nextTick();

    expect(fakeEditor().calls).toEqual([]);
    expect(alert()!.text).toContain("mapo.wygEditor.linkInvalid");
    expect(linkInput()!.props["aria-invalid"]).toBe(true);
  });

  it("removes the link with its button, or when the address is emptied", async () => {
    mount();
    fakeEditor().isActive.mockImplementation((name) => name === "link");
    await openLink();

    click(byLabel("mapo.wygEditor.linkRemove"));
    await nextTick();
    expect(fakeEditor().calls).toEqual([
      ["focus"],
      ["extendMarkRange", "link"],
      ["unsetLink"],
      ["run"],
    ]);
    expect(linkInput()).toBeUndefined();

    fakeEditor().calls.length = 0;
    await openLink("  ");
    click(byLabel("mapo.wygEditor.linkApply"));
    expect(fakeEditor().calls).toEqual([
      ["focus"],
      ["extendMarkRange", "link"],
      ["unsetLink"],
      ["run"],
    ]);
  });

  it("applies with Enter and closes with Escape, keeping the keys from the page's form", async () => {
    mount();
    await openLink("/pagina/");

    const enter = press("Enter");
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(fakeEditor().calls).toContainEqual([
      "setLink",
      { href: "/pagina/" },
    ]);
    await nextTick();
    expect(linkInput()).toBeUndefined();

    await openLink();
    const escape = press("Escape");
    expect(escape.preventDefault).toHaveBeenCalled();
    await nextTick();
    expect(linkInput()).toBeUndefined();
  });

  it("closes the bar for the source view and disables the button on a read-only field", async () => {
    mount();
    await openLink();

    click(sourceToggle());
    await nextTick();
    expect(linkInput()).toBeUndefined();
    expect(linkButton()!.props.disabled).toBe(true);
    app!.unmount();

    mount({}, { readonly: true });
    expect(linkButton()!.props.disabled).toBe(true);
  });
});

describe("MapoWygEditor alignment", () => {
  const alignButtons = () =>
    ["alignLeft", "alignCenter", "alignRight"].map((key) =>
      byLabel(`mapo.wygEditor.${key}`),
    );
  const loadedTextAlign = () =>
    tiptap.options!.extensions.filter(
      (extension) => extension.name === "textAlign",
    ) as unknown as { options: { types: string[]; alignments: string[] } }[];

  it("has no buttons and loads no TextAlign by default", () => {
    mount();

    expect(alignButtons().every((node) => node === undefined)).toBe(true);
    expect(loadedTextAlign()).toHaveLength(0);
  });

  it("adds left, centre and right with attrs.textAlign, for paragraphs and headings", () => {
    mount({ textAlign: true });

    expect(alignButtons().map((node) => node?.props.icon)).toEqual([
      "i-lucide-align-left",
      "i-lucide-align-center",
      "i-lucide-align-right",
    ]);
    expect(loadedTextAlign()).toHaveLength(1);
    expect(loadedTextAlign()[0]!.options.types).toEqual([
      "heading",
      "paragraph",
    ]);
    expect(loadedTextAlign()[0]!.options.alignments).toEqual([
      "left",
      "center",
      "right",
    ]);
  });

  it("follows the module option, and the field's attrs.textAlign wins", () => {
    runtimeConfig.public.mapoForm = {
      editor: { source: true, textAlign: true },
    };
    mount();
    expect(alignButtons().every((node) => node !== undefined)).toBe(true);
    app!.unmount();

    mount({ textAlign: false });
    expect(alignButtons().every((node) => node === undefined)).toBe(true);
  });

  it("centres and right-aligns with setTextAlign; left removes the alignment", () => {
    mount({ textAlign: true });
    const [left, center, right] = alignButtons();

    click(center);
    click(right);
    click(left);

    expect(fakeEditor().calls).toEqual([
      ["focus"],
      ["setTextAlign", "center"],
      ["run"],
      ["focus"],
      ["setTextAlign", "right"],
      ["run"],
      ["focus"],
      ["unsetTextAlign"],
      ["run"],
    ]);
  });

  it("marks the selection's alignment as pressed, left when none is set", async () => {
    mount({ textAlign: true });
    expect(alignButtons().map((node) => node!.props["aria-pressed"])).toEqual([
      true,
      false,
      false,
    ]);

    fakeEditor().isActive.mockImplementation(
      (attributes) =>
        typeof attributes === "object" &&
        (attributes as { textAlign?: string }).textAlign === "center",
    );
    // Opening the link bar re-renders the toolbar with the new selection.
    click(byLabel("mapo.wygEditor.link"));
    await nextTick();

    expect(alignButtons().map((node) => node!.props["aria-pressed"])).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("keeps a TextAlign the field loads itself, instead of adding its own", () => {
    const own = TextAlign.configure({ types: ["paragraph"] });
    mount({ textAlign: true, extensions: [own] });

    expect(loadedTextAlign()).toEqual([own]);
  });

  it("disables the buttons on a read-only field", () => {
    mount({ textAlign: true }, { readonly: true });

    expect(alignButtons().every((node) => node!.props.disabled)).toBe(true);
  });
});
