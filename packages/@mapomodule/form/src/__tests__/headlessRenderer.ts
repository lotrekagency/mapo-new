import { createRenderer } from "vue";

/**
 * A node of the headless renderer. Component tests run in Node without a DOM;
 * nodes that are plain objects are enough to mount a component with real
 * reactivity, watchers and events, and to read back what it rendered.
 */
export interface HeadlessNode {
  /** Tag of an element; absent on text and comment nodes. */
  tag?: string;
  /** Content of a text node. */
  text?: string;
  /** Attributes and DOM props, as the last render set them. */
  props: Record<string, unknown>;
  parent: HeadlessNode | null;
  children: HeadlessNode[];
  // `v-show` reads and writes `style.display` on the element it is set on.
  style: Record<string, string>;
  // `<Transition>` adds and removes its classes on the element, and reads
  // `ownerDocument.body.offsetHeight` to force a reflow before leaving.
  classList: {
    add(...names: string[]): void;
    remove(...names: string[]): void;
  };
  ownerDocument: { body: { offsetHeight: number } };
}

const headlessDocument = { body: { offsetHeight: 0 } };

export const headlessNode = (tag?: string): HeadlessNode => ({
  tag,
  props: {},
  parent: null,
  children: [],
  style: {},
  classList: { add: () => {}, remove: () => {} },
  ownerDocument: headlessDocument,
});

/** Where `<Teleport to="body">` renders. */
export const headlessBody = headlessNode("body");

export const { createApp } = createRenderer<HeadlessNode, HeadlessNode>({
  createElement: (tag) => headlessNode(tag),
  createText: (text) => ({ ...headlessNode(), text }),
  createComment: () => headlessNode(),
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.children = text ? [{ ...headlessNode(), text, parent: node }] : [];
  },
  patchProp: (el, key, _previous, next) => {
    el.props[key] = next;
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
  querySelector: (selector) => (selector === "body" ? headlessBody : null),
  nextSibling: (node) =>
    node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
});

/** The text a node renders, its descendants' included, without extra spaces. */
export function textOf(node: HeadlessNode): string {
  const own = node.text ?? "";
  const nested = node.children.map(textOf).join(" ");
  return `${own} ${nested}`.replace(/\s+/g, " ").trim();
}

/** The elements under a node, in document order, that match the test. */
export function findAll(
  node: HeadlessNode,
  test: (candidate: HeadlessNode) => boolean,
): HeadlessNode[] {
  const own = test(node) ? [node] : [];
  return [...own, ...node.children.flatMap((child) => findAll(child, test))];
}
