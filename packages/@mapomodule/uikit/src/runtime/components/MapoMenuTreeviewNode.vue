<script setup lang="ts">
import { ref, computed, inject, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VueDraggable } from "vue-draggable-plus";
import type { MenuTreeNode } from "../types/menu.js";
import { MENU_DND_CTX, type MenuDndContext } from "./menuDndContext.js";

/**
 * Recursive node renderer for `MapoMenuTreeview`.
 *
 * Each node hosts a nested `VueDraggable` bound to `node.nodes`, all sharing
 * the same drag group so nodes can be re-parented by dropping them onto
 * another node's child list. Depth/revert validation lives in the treeview
 * root via the injected drag context.
 */
const props = withDefaults(
  defineProps<{
    node: MenuTreeNode;
    depth?: number;
    selectedId?: string | number | null;
    readonly?: boolean;
  }>(),
  { depth: 1, selectedId: null, readonly: false },
);

const emit = defineEmits<{
  /** Node clicked — bubble up to select it in the editor. */
  select: [node: MenuTreeNode];
  /** Delete requested (confirm handled by the treeview root). */
  delete: [node: MenuTreeNode];
}>();

const { t } = useI18n();
const dnd = inject<MenuDndContext | null>(MENU_DND_CTX, null);

/**
 * The node, as a shared reference.
 *
 * Like the tree in `MapoMenuTreeview`, a node is owned by the manager's model
 * and passed down by reference on purpose: renaming it and letting the nested
 * drag & drop list reorder `node.nodes` in place is what keeps the recursion in
 * sync without bubbling every keystroke up through the tree.
 */
const node = computed(() => props.node);

const open = ref(true);
const isSelected = computed(
  () => String(props.node.id) === String(props.selectedId ?? ""),
);
const hasErrors = computed(
  () => !!props.node.errors && Object.keys(props.node.errors).length > 0,
);

// ─── Inline rename (double-click, v1 parity) ─────────────────────────────────
const editingTitle = ref(false);
const draftTitle = ref(props.node.title);

watch(
  () => props.node.title,
  (val) => {
    draftTitle.value = val;
  },
);

function startRename() {
  if (props.readonly) return;
  draftTitle.value = props.node.title;
  editingTitle.value = true;
}

function commitRename() {
  if (!editingTitle.value) return;
  node.value.title = draftTitle.value.trim();
  editingTitle.value = false;
}

/**
 * Delete the node with the Del key while its title has focus.
 *
 * Written as a handler instead of `@keydown.delete`: the build-time SFC
 * transformer emits invalid JS for that modifier, since `delete` is a reserved
 * word.
 */
function onRowKeydown(event: KeyboardEvent) {
  if (event.key === "Delete") emit("delete", props.node);
}

// Single keydown handler — multiple @keydown.<key> modifiers on one element
// compile to duplicate object keys (TS1117 under vue-tsc).
function onRenameKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.stopPropagation();
    event.preventDefault();
    commitRename();
  } else if (event.key === "Escape") {
    event.stopPropagation();
    editingTitle.value = false;
  }
}

/** Expand this node when `child` was just added inside it (used by the root). */
function openIfChild(child: MenuTreeNode) {
  if (node.value.nodes.some((n) => String(n.id) === String(child.id))) {
    open.value = true;
  }
  childRefs.value.forEach((r) => r?.openIfChild(child));
}

type NodeInstance = { openIfChild: (child: MenuTreeNode) => void };

const childRefs = ref<Array<NodeInstance | null>>([]);

// Declared here rather than inline in the template: template expressions are
// transpiled as plain JS at build time, so a TS cast there fails to parse.
function setChildRef(index: number, el: unknown) {
  childRefs.value[index] = (el as NodeInstance | null) ?? null;
}

defineExpose({ openIfChild });
</script>

<script lang="ts">
export default { name: "MapoMenuTreeviewNode" };
</script>

<template>
  <div class="mapo-menu-node">
    <!-- Node row -->
    <div
      class="group/nodo flex items-center gap-1 rounded px-1 py-0.5 transition-colors"
      :class="
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-elevated text-default'
      "
    >
      <!-- Expand toggle -->
      <UButton
        :icon="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        size="xs"
        variant="ghost"
        color="neutral"
        :class="{ invisible: node.nodes.length === 0 }"
        tabindex="-1"
        @click.stop="open = !open"
      />

      <!-- Drag handle -->
      <UIcon
        v-if="!readonly"
        name="i-lucide-grip-vertical"
        class="mapo-menu-drag-handle size-3.5 shrink-0 cursor-grab text-dimmed opacity-0 transition-opacity group-hover/nodo:opacity-100"
      />

      <!-- Title (inline editable on double-click) -->
      <UInput
        v-if="editingTitle"
        v-model="draftTitle"
        size="xs"
        autofocus
        class="flex-1"
        @blur="commitRename"
        @keydown="onRenameKeydown"
        @click.stop
      />
      <button
        v-else
        type="button"
        class="min-w-0 flex-1 truncate py-0.5 text-left text-sm"
        :class="{ 'italic text-dimmed': !node.title }"
        @click.stop="emit('select', node)"
        @dblclick.stop="startRename"
        @keydown="onRowKeydown"
      >
        {{ node.title || "…" }}
      </button>

      <!-- Error dot -->
      <span
        v-if="hasErrors"
        class="size-2 shrink-0 rounded-full bg-error"
        :title="t('mapo.menuNodeEditor.nodeErrors')"
      />

      <!-- Row actions -->
      <div
        v-if="!readonly"
        class="hidden items-center gap-0.5 group-hover/nodo:flex"
      >
        <UButton
          icon="i-lucide-trash-2"
          size="xs"
          variant="ghost"
          color="error"
          tabindex="-1"
          @click.stop="emit('delete', node)"
        />
      </div>
    </div>

    <!-- Children (nested draggable, same group ⇒ cross-parent moves) -->
    <div v-show="open || dnd?.dragging.value" class="ml-5">
      <VueDraggable
        v-model="node.nodes"
        group="mapo-menu-nodes"
        handle=".mapo-menu-drag-handle"
        :animation="150"
        :disabled="readonly"
        ghost-class="mapo-menu-ghost"
        class="min-h-1.5 space-y-0.5"
        @start="dnd?.onStart()"
        @end="dnd?.onEnd()"
      >
        <MapoMenuTreeviewNode
          v-for="(child, i) in node.nodes"
          :key="child.id"
          :ref="(el) => setChildRef(i, el)"
          :node="child"
          :depth="depth + 1"
          :selected-id="selectedId"
          :readonly="readonly"
          @select="emit('select', $event)"
          @delete="emit('delete', $event)"
        />
      </VueDraggable>
    </div>
  </div>
</template>

<style scoped>
.mapo-menu-ghost {
  opacity: 0.4;
}
</style>
