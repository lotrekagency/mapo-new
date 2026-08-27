/**
 * Menu Manager types — the canonical tree contract matches the Camomilla
 * `/api/camomilla/menus` payload (v1 parity): a menu is a keyed collection
 * of recursively nested nodes, optionally translated per language.
 */

/** Link carried by a menu node: relational (a CMS page) or static (raw URL). */
export interface MenuNodeLink {
  /** `"RE"` = relational (page picked from the backend), `"ST"` = static URL. */
  link_type?: "RE" | "ST";
  /** Static URL used when `link_type === "ST"`. */
  static?: string;
  /** Content-type id used when `link_type === "RE"`. */
  content_type?: number | string | null;
  /** Routable node id of the linked page when `link_type === "RE"`. */
  url_node?: number | string | null;
  [key: string]: unknown;
}

/** A single node of the menu tree. */
export interface MenuTreeNode {
  /**
   * Node identity. Nodes created client-side get a random string id;
   * the backend may replace it with a numeric one on save.
   */
  id: string | number;
  title: string;
  link: MenuNodeLink;
  /**
   * Free-form node metadata (e.g. `style`, `target_bank`).
   * `target_bank` keeps the v1/Camomilla key for data compatibility.
   */
  meta: Record<string, unknown>;
  /** Child nodes. */
  nodes: MenuTreeNode[];
  /** Per-field backend validation errors attached by the manager. */
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}

/** Per-language node tree used when the menu is translatable. */
export interface MenuTranslation {
  nodes: MenuTreeNode[];
  [key: string]: unknown;
}

/** The full menu payload handled by `MapoMenuManager`. */
export interface MapoMenu {
  id?: number | string;
  /** Unique menu identifier (e.g. `"navbar"`, `"footer"`). */
  key: string;
  enabled?: boolean;
  /** Node tree used when the menu is NOT translatable. */
  nodes?: MenuTreeNode[];
  /** Per-language node trees used when the menu IS translatable. */
  translations?: Record<string, MenuTranslation>;
  [key: string]: unknown;
}

/** Create an empty client-side node with a unique temporary id. */
export function createMenuNode(
  partial: Partial<MenuTreeNode> = {},
): MenuTreeNode {
  return {
    id: Math.random().toString(36).slice(2),
    title: "",
    link: {},
    meta: {},
    nodes: [],
    ...partial,
  };
}

/** Maximum nesting depth of a menu node tree (a flat list = depth 1). */
export function menuTreeDepth(nodes: MenuTreeNode[]): number {
  if (!nodes.length) return 0;
  return 1 + Math.max(...nodes.map((n) => menuTreeDepth(n.nodes ?? [])));
}

/** Depth-first search for a node id. Returns the node and its ancestor chain. */
export function findMenuNode(
  nodes: MenuTreeNode[],
  id: string | number,
  parents: MenuTreeNode[] = [],
): { node: MenuTreeNode; parents: MenuTreeNode[] } | null {
  for (const node of nodes) {
    if (String(node.id) === String(id)) return { node, parents };
    const found = findMenuNode(node.nodes ?? [], id, [...parents, node]);
    if (found) return found;
  }
  return null;
}

/** Remove a node (by id) anywhere in the tree. Returns `true` when removed. */
export function removeMenuNode(
  nodes: MenuTreeNode[],
  id: string | number,
): boolean {
  const index = nodes.findIndex((n) => String(n.id) === String(id));
  if (index !== -1) {
    nodes.splice(index, 1);
    return true;
  }
  return nodes.some((n) => removeMenuNode(n.nodes ?? [], id));
}
