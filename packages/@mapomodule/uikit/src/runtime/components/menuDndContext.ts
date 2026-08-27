import type { InjectionKey, Ref } from "vue";

/**
 * Drag context shared between `MapoMenuTreeview` (provider) and every nested
 * `MapoMenuTreeviewNode` draggable list.
 *
 * SortableJS nested lists mutate `node.nodes` arrays in place, so max-depth
 * enforcement is centralised in the root: it snapshots the tree on drag start
 * and reverts the whole tree if the drop produced an invalid nesting.
 */
export interface MenuDndContext {
  /** True while any node in the tree is being dragged. */
  dragging: Ref<boolean>;
  /** Called by any nested draggable when a drag starts. */
  onStart: () => void;
  /** Called by any nested draggable when a drag ends (validate + maybe revert). */
  onEnd: () => void;
}

export const MENU_DND_CTX: InjectionKey<MenuDndContext> = Symbol(
  "mapo-menu-dnd-context",
);
