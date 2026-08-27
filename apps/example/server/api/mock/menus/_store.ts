/**
 * In-memory menu store for the example app.
 * Emulates the Camomilla menus contract consumed by `MapoMenuManager`:
 *   - list/detail return `{ id, key, nodes | translations }`
 *   - `<endpoint>/page_types` lists linkable content types
 *   - `<endpoint>/page_types/:id` lists routable pages of that type
 */

export interface MockMenuNode {
  id: string | number;
  title: string;
  link: Record<string, unknown>;
  meta: Record<string, unknown>;
  nodes: MockMenuNode[];
}

export interface MockMenu {
  id: number;
  key: string;
  enabled: boolean;
  translations: Record<string, { nodes: MockMenuNode[] }>;
}

let menuIdSeq = 2;

function node(
  id: string,
  title: string,
  link: Record<string, unknown>,
  nodes: MockMenuNode[] = [],
): MockMenuNode {
  return { id, title, link, meta: {}, nodes };
}

export const mockMenus: MockMenu[] = [
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
              node("it-porte", "Porte", {
                link_type: "RE",
                content_type: 1,
                url_node: 13,
              }),
            ],
          ),
          node("it-contatti", "Contatti", {
            link_type: "ST",
            static: "/contatti",
          }),
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
        ],
      },
      en: { nodes: [] },
    },
  },
];

/** Content types offered by the node editor's relational picker. */
export const mockPageTypes = [
  { id: 1, verbose_name_plural: "Pagine", model: "page" },
  { id: 2, verbose_name_plural: "Articoli", model: "article" },
];

/** Routable pages per content type, keyed by content-type id. */
export const mockPagesByType: Record<
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

export function findMenu(id: string | number): MockMenu | undefined {
  return mockMenus.find((m) => String(m.id) === String(id));
}

export function createMenu(payload: Partial<MockMenu>): MockMenu {
  const menu: MockMenu = {
    id: ++menuIdSeq,
    key: payload.key ?? `menu-${menuIdSeq}`,
    enabled: payload.enabled ?? true,
    translations: payload.translations ?? {},
  };
  mockMenus.push(menu);
  return menu;
}

export function updateMenu(
  id: string | number,
  payload: Partial<MockMenu>,
): MockMenu | undefined {
  const menu = findMenu(id);
  if (!menu) return undefined;
  Object.assign(menu, payload, { id: menu.id });
  return menu;
}
