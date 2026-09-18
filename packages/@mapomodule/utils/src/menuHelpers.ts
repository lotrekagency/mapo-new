/**
 * Structural stand-ins for `vue-router`'s `RouteMeta` / `RouteRecordNormalized`.
 *
 * These are deliberately *not* imported from `vue-router`. `vue-router` declares
 * `vite`, `pinia` and `@vue/compiler-sfc` as optional peers, so pnpm hands each
 * workspace package whose dependency set differs its own instance of the same
 * version — and TypeScript treats two instances as unrelated nominal types.
 * Typing the public signatures against `vue-router` therefore broke every call
 * crossing a package boundary (`uikit` passing `router.getRoutes()` here).
 * Matching the shape structurally keeps those calls valid whichever instance the
 * caller resolves, and keeps this package free of Vue/Nuxt dependencies.
 */
export type MenuRouteMeta = Record<PropertyKey, unknown> & {
  label?: string;
  icon?: string;
  hidden?: boolean;
  parent?: string;
  sidebarFooter?: boolean;
};

/** Structural subset of `RouteRecordNormalized` used to build the menu. */
export interface MenuRouteRecord {
  path: string;
  meta?: MenuRouteMeta;
}

export interface MenuNode {
  link: string;
  label: string;
  icon: string;
  children: MenuNode[];
  meta: MenuRouteMeta;
  sidebarFooter: boolean;
}

/** Return the maximum nesting depth of a MenuNode tree (root = depth 1). */
export function calcMaxMenuNestDepth(nodes: MenuNode[], depth = 1): number {
  if (!nodes.length) return depth - 1;
  let max = depth;
  for (const node of nodes) {
    if (node.children.length) {
      const child = calcMaxMenuNestDepth(node.children, depth + 1);
      if (child > max) max = child;
    }
  }
  return max;
}

/**
 * Builds a hierarchical menu tree from flat route records.
 *
 * Routes are included only when they define a `meta.label` and are not marked
 * as hidden. Parent-child relationships are resolved through `meta.parent`.
 *
 * @param routes Flat list of normalized router records.
 * @returns Root menu nodes with nested children.
 */
export function buildRouteTree(routes: MenuRouteRecord[]): MenuNode[] {
  const nodeMap = new Map<string, MenuNode>();

  for (const route of routes) {
    const { label, icon, hidden, sidebarFooter } = route.meta ?? {};
    if (!label || hidden) continue;
    nodeMap.set(route.path, {
      link: route.path,
      label,
      icon: icon ?? "i-lucide-circle-dot",
      children: [],
      meta: route.meta ?? {},
      sidebarFooter: Boolean(sidebarFooter),
    });
  }

  const roots: MenuNode[] = [];
  for (const route of routes) {
    const { label, hidden, parent } = route.meta ?? {};
    if (!label || hidden) continue;
    const node = nodeMap.get(route.path)!;
    if (parent) {
      const parentKey = String(parent).startsWith("/") ? parent : `/${parent}`;
      if (nodeMap.has(parentKey)) {
        nodeMap.get(parentKey)!.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}
