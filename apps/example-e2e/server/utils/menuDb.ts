/**
 * In-memory menu database for the E2E app.
 *
 * Mirrors the Camomilla `menus` contract consumed by `MapoMenuManager`:
 *   - a menu is `{ id, key, enabled }` plus either `nodes` (flat) or
 *     `translations.<lang>.nodes` (translatable)
 *   - `<endpoint>/page_types` lists linkable content types
 *   - `<endpoint>/page_types/:id` lists the routable pages of that type
 */

export interface MenuNode {
  id: string | number;
  title: string;
  link: Record<string, unknown>;
  meta: Record<string, unknown>;
  nodes: MenuNode[];
}

export interface Menu {
  id: number;
  key: string;
  enabled: boolean;
  /** Present on translatable menus. */
  translations?: Record<string, { nodes: MenuNode[] }>;
  /** Present on non-translatable menus. */
  nodes?: MenuNode[];
}

let menuIdSeq = 3;

function node(
  id: string,
  title: string,
  link: Record<string, unknown> = {},
  nodes: MenuNode[] = [],
  meta: Record<string, unknown> = {},
): MenuNode {
  return { id, title, link, meta, nodes };
}

const menus = new Map<number, Menu>([
  [
    1,
    {
      id: 1,
      key: "navbar",
      enabled: true,
      translations: {
        it: {
          nodes: [
            node("it-home", "Home", { link_type: "ST", static: "/" }),
            node(
              "it-prodotti",
              "Prodotti",
              { link_type: "RE", content_type: 1, url_node: 11 },
              [
                node("it-finestre", "Finestre", {
                  link_type: "RE",
                  content_type: 1,
                  url_node: 12,
                }),
                node(
                  "it-porte",
                  "Porte",
                  { link_type: "RE", content_type: 1, url_node: 13 },
                  [
                    node("it-porte-interne", "Porte interne", {
                      link_type: "ST",
                      static: "/porte/interne",
                    }),
                  ],
                ),
              ],
            ),
            node(
              "it-contatti",
              "Contatti",
              { link_type: "ST", static: "/contatti" },
              [],
              { target_bank: true },
            ),
          ],
        },
        en: {
          nodes: [
            node("en-home", "Home", { link_type: "ST", static: "/en" }),
            node("en-products", "Products", {
              link_type: "RE",
              content_type: 1,
              url_node: 11,
            }),
          ],
        },
      },
    },
  ],
  [
    2,
    {
      id: 2,
      key: "footer",
      enabled: true,
      translations: {
        it: {
          nodes: [
            node("it-privacy", "Privacy policy", {
              link_type: "ST",
              static: "/privacy",
            }),
            node("it-cookie", "Cookie policy", {
              link_type: "ST",
              static: "/cookie",
            }),
          ],
        },
        en: { nodes: [] },
      },
    },
  ],
  [
    3,
    {
      // Non-translatable: a single tree under `nodes`.
      id: 3,
      key: "sidebar-links",
      enabled: false,
      nodes: [
        node("sb-docs", "Docs", { link_type: "ST", static: "/docs" }),
        node("sb-support", "Support", {
          link_type: "ST",
          static: "https://example.com/support",
        }),
      ],
    },
  ],
]);

/** Content types offered by the node editor's relational picker. */
export const pageTypes = [
  { id: 1, verbose_name_plural: "Pagine", model: "page" },
  { id: 2, verbose_name_plural: "Articoli", model: "article" },
];

/** Routable pages per content type. */
export const pagesByType: Record<
  number,
  Array<{ name: string; url_node_id: number }>
> = {
  1: [
    { name: "Home", url_node_id: 10 },
    { name: "Prodotti", url_node_id: 11 },
    { name: "Prodotti / Finestre", url_node_id: 12 },
    { name: "Prodotti / Porte", url_node_id: 13 },
  ],
  2: [
    { name: "Blog — Novità 2026", url_node_id: 20 },
    { name: "Blog — Case study", url_node_id: 21 },
  ],
};

export function listMenus(search?: string) {
  let results = [...menus.values()];
  if (search) {
    const q = search.toLowerCase();
    results = results.filter((m) => m.key.toLowerCase().includes(q));
  }
  return {
    count: results.length,
    next: null,
    previous: null,
    results: results.map(({ id, key, enabled }) => ({ id, key, enabled })),
  };
}

export function getMenu(id: string | number): Menu | undefined {
  return menus.get(Number(id));
}

export function createMenu(payload: Partial<Menu>): Menu {
  const menu: Menu = {
    id: ++menuIdSeq,
    key: payload.key ?? `menu-${menuIdSeq}`,
    enabled: payload.enabled ?? true,
    ...(payload.translations
      ? { translations: payload.translations }
      : { nodes: payload.nodes ?? [] }),
  };
  menus.set(menu.id, menu);
  return menu;
}

export function saveMenu(
  id: string | number,
  payload: Partial<Menu>,
): Menu | undefined {
  const menu = menus.get(Number(id));
  if (!menu) return undefined;
  Object.assign(menu, payload, { id: menu.id });
  return menu;
}

/**
 * Validate a node tree the way DRF would: the error structure mirrors the
 * payload, so the manager can match each message to the node that produced it.
 * Returns one object per node — empty when the node is valid.
 */
export function validateNodes(
  nodes: Array<Partial<MenuNode>> = [],
): Record<string, unknown>[] {
  return nodes.map((n) => {
    const errors: Record<string, unknown> = {};

    if (!String(n.title ?? "").trim()) {
      errors.title = ["This field cannot be blank."];
    }

    const link = (n.link ?? {}) as Record<string, unknown>;
    if (link.link_type === "ST" && !String(link.static ?? "").trim()) {
      errors.link = { static: ["Enter a valid URL."] };
    }
    if (link.link_type === "RE" && link.url_node == null) {
      errors.link = { url_node: ["Select a page."] };
    }

    const children = validateNodes(n.nodes ?? []);
    if (children.some((c) => Object.keys(c).length > 0)) {
      errors.nodes = children;
    }

    return errors;
  });
}

/** True when a validation result tree carries at least one message. */
export function hasErrors(tree: Record<string, unknown>[]): boolean {
  return tree.some((e) => Object.keys(e).length > 0);
}
