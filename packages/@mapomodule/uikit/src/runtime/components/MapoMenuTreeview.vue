<script setup lang="ts">
import { ref, computed, provide } from "vue";
import { useI18n } from "vue-i18n";
import { VueDraggable } from "vue-draggable-plus";
import { deepClone } from "@mapomodule/utils";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import {
  createMenuNode,
  menuTreeDepth,
  removeMenuNode,
  type MenuTreeNode,
} from "../types/menu.js";
import { MENU_DND_CTX, type MenuDndContext } from "./menuDndContext.js";
import MapoMenuTreeviewNode from "./MapoMenuTreeviewNode.vue";

/**
 * Drag & drop tree of menu nodes (left pane of `MapoMenuManager`).
 *
 * The node arrays are mutated in place by the nested draggables; the tree is
 * owned by the parent through the `nodes` prop. `update:nodes` is emitted on
 * every structural change so a parent can also `v-model:nodes`.
 */
const props = withDefaults(
  defineProps<{
    nodes: MenuTreeNode[];
    /** Currently selected node (v-model). */
    modelValue?: MenuTreeNode | null;
    title?: string;
    /** Max nesting depth; `-1` = unlimited. */
    maxDepth?: number;
    readonly?: boolean;
    /** Show a skeleton instead of the empty state while the tree is being fetched. */
    loading?: boolean;
  }>(),
  {
    modelValue: null,
    title: "",
    maxDepth: -1,
    readonly: false,
    loading: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [node: MenuTreeNode | null];
  "update:nodes": [nodes: MenuTreeNode[]];
}>();

defineSlots<{
  /** Content above the tree (e.g. a language switch). */
  top(): unknown;
  /** Content below the tree (e.g. a save button). */
  bottom(): unknown;
}>();

const { t } = useI18n();
const confirm = useConfirmStore();
const snack = useSnackStore();

/**
 * The node tree, as a writable reference.
 *
 * `nodes` is deliberately shared by reference with the parent's model: the
 * nested drag & drop lists reorder and re-parent nodes by mutating these arrays
 * in place, which is what keeps every level of the recursion in sync without a
 * round-trip through the manager. Going through this computed makes that intent
 * explicit — and lets `VueDraggable` write back a replaced array through the
 * setter when it doesn't splice.
 */
const tree = computed({
  get: () => props.nodes,
  set: (value: MenuTreeNode[]) => emit("update:nodes", value),
});

// ─── Selection ────────────────────────────────────────────────────────────────

function select(node: MenuTreeNode | null) {
  emit("update:modelValue", node);
}

// ─── Depth-validated drag & drop ─────────────────────────────────────────────
// Nested SortableJS lists mutate the arrays in place: snapshot on start,
// validate on end, restore the snapshot when the drop exceeds maxDepth.

const dragging = ref(false);
let snapshot: MenuTreeNode[] | null = null;

const dndCtx: MenuDndContext = {
  dragging,
  onStart() {
    dragging.value = true;
    snapshot = deepClone(tree.value);
  },
  onEnd() {
    dragging.value = false;
    if (
      props.maxDepth > 0 &&
      snapshot &&
      menuTreeDepth(tree.value) > props.maxDepth
    ) {
      tree.value.splice(0, tree.value.length, ...snapshot);
      snack.show(
        t("mapo.menuTreeview.maxDepthReached", { max: props.maxDepth }),
        "warning",
      );
    }
    snapshot = null;
    emit("update:nodes", tree.value);
  },
};

provide(MENU_DND_CTX, dndCtx);

// ─── Node CRUD ────────────────────────────────────────────────────────────────

type NodeInstance = { openIfChild: (child: MenuTreeNode) => void };

const nodeRefs = ref<Array<NodeInstance | null>>([]);

// Declared here rather than inline in the template: template expressions are
// transpiled as plain JS at build time, so a TS cast there fails to parse.
function setNodeRef(index: number, el: unknown) {
  nodeRefs.value[index] = (el as NodeInstance | null) ?? null;
}

/**
 * Create a node. Appended to the selected node's children when possible
 * (respecting maxDepth), to the root otherwise. The new node is selected
 * right away so the editor opens on it (v1 opened an inline rename instead).
 */
function newNode() {
  if (props.readonly) return;
  const node = createMenuNode();
  const target = props.modelValue;
  if (target) {
    const targetDepth = depthOf(target);
    if (props.maxDepth > 0 && targetDepth + 1 > props.maxDepth) {
      tree.value.push(node);
    } else {
      target.nodes.push(node);
      nodeRefs.value.forEach((r) => r?.openIfChild(node));
    }
  } else {
    tree.value.push(node);
  }
  select(node);
  emit("update:nodes", tree.value);
}

function depthOf(
  node: MenuTreeNode,
  nodes: MenuTreeNode[] = tree.value,
  depth = 1,
): number {
  for (const n of nodes) {
    if (String(n.id) === String(node.id)) return depth;
    const found = depthOf(node, n.nodes ?? [], depth + 1);
    if (found > 0) return found;
  }
  return 0;
}

async function deleteNode(node: MenuTreeNode) {
  if (props.readonly) return;
  const ok = await confirm.ask({
    title: t("mapo.menuTreeview.deleteTitle"),
    message: t("mapo.menuTreeview.areYouSureDelete"),
    confirmText: t("mapo.delete"),
    dangerous: true,
  });
  if (!ok) return;
  silentDeleteNode(node);
}

/** Remove without confirmation (used for empty aborted nodes). */
function silentDeleteNode(node: MenuTreeNode) {
  removeMenuNode(tree.value, node.id);
  if (String(props.modelValue?.id) === String(node.id)) select(null);
  emit("update:nodes", tree.value);
}

function deleteSelectedNode() {
  if (props.modelValue) deleteNode(props.modelValue);
}

defineExpose({ deleteSelectedNode, newNode });
</script>

<template>
  <div class="mapo-menu-treeview flex h-full flex-col">
    <slot name="top" />

    <!-- Toolbar -->
    <div
      class="flex items-center justify-between border-b border-default px-3 py-2"
    >
      <p class="truncate text-sm font-semibold text-highlighted">
        {{ title }}
      </p>
      <UButton
        v-if="!readonly"
        icon="i-lucide-list-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        :title="t('mapo.menuTreeview.newNode')"
        @click="newNode"
      />
    </div>

    <!-- Tree -->
    <div class="flex-1 overflow-y-auto p-2" @click.self="select(null)">
      <VueDraggable
        v-model="tree"
        group="mapo-menu-nodes"
        handle=".mapo-menu-drag-handle"
        :animation="150"
        :disabled="readonly"
        ghost-class="mapo-menu-ghost"
        class="min-h-8 space-y-0.5"
        @start="dndCtx.onStart()"
        @end="dndCtx.onEnd()"
      >
        <MapoMenuTreeviewNode
          v-for="(node, i) in nodes"
          :key="node.id"
          :ref="(el) => setNodeRef(i, el)"
          :node="node"
          :depth="1"
          :selected-id="modelValue?.id ?? null"
          :readonly="readonly"
          @select="select($event)"
          @delete="deleteNode($event)"
        />
      </VueDraggable>

      <!-- Loading skeleton — shown instead of the empty state so a menu that
           is still being fetched never reads as "no nodes". -->
      <div v-if="loading && nodes.length === 0" class="space-y-1.5 p-1">
        <USkeleton v-for="n in 4" :key="n" class="h-6 w-full" />
      </div>

      <!-- Empty state -->
      <button
        v-else-if="nodes.length === 0 && !readonly"
        type="button"
        class="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-default py-8 text-dimmed transition-colors hover:border-accented hover:text-muted"
        @click="newNode"
      >
        <UIcon name="i-lucide-list-plus" class="size-8" />
        <span class="text-xs">{{ t("mapo.menuTreeview.noRootNodes") }}</span>
      </button>
    </div>

    <slot name="bottom" />
  </div>
</template>

<style scoped>
.mapo-menu-ghost {
  opacity: 0.4;
}
</style>
