<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import type { RepeaterDescriptor } from "../../types/index.js";
import { injectMapoForm } from "../../composables/useMapoForm.js";
import MapoRepeaterItem from "./MapoRepeaterItem.vue";

const props = defineProps<{
  modelValue: unknown;
  descriptor: RepeaterDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: unknown[]] }>();

const form = injectMapoForm()!;

const attrs = computed(() => props.descriptor.attrs ?? {});

// ─── Item list (reactive local copy) ────────────────────────────────────────

const items = computed<Record<string, unknown>[]>({
  get: () =>
    (Array.isArray(props.modelValue) ? props.modelValue : []) as Record<
      string,
      unknown
    >[],
  set: (val) => emit("update:modelValue", val),
});

function emitItems(newItems: Record<string, unknown>[]) {
  emit("update:modelValue", [...newItems]);
}

// Stable per-item UID: guarantees persistent :key values across reorder/duplicate
// AND identity-based selection that survives reordering and deletions.
const itemUids = new WeakMap<object, string>();
let _uidSeq = 0;
function uidFor(item: Record<string, unknown>): string {
  let id = itemUids.get(item);
  if (!id) {
    id = `it_${++_uidSeq}`;
    itemUids.set(item, id);
  }
  return id;
}

// ─── Undo stack ──────────────────────────────────────────────────────────────

const undoStack = ref<Record<string, unknown>[][]>([]);

function pushUndo() {
  undoStack.value.push(items.value.map((i) => ({ ...i })));
  if (undoStack.value.length > 20) undoStack.value.shift();
}

function undo() {
  const prev = undoStack.value.pop();
  if (prev) emit("update:modelValue", prev);
}

// ─── Template selection ──────────────────────────────────────────────────────

const templates = computed(() => attrs.value.templates);
const templateKeys = computed(() =>
  templates.value ? Object.keys(templates.value) : [],
);
const hasTemplates = computed(() => templateKeys.value.length > 0);
const selectedTemplate = ref<string>("");

// Async-safe: when templates load after mount, auto-pick the first one.
watchEffect(() => {
  if (!selectedTemplate.value && templateKeys.value[0]) {
    selectedTemplate.value = templateKeys.value[0];
  }
});

function fieldsForItem(item: Record<string, unknown>) {
  if (!templates.value) return props.descriptor.fields ?? [];
  const key = (item._template as string) ?? selectedTemplate.value;
  return templates.value[key] ?? props.descriptor.fields ?? [];
}

// ─── Item CRUD ───────────────────────────────────────────────────────────────

const canAdd = computed(
  () =>
    !props.readonly &&
    (!attrs.value.maxItems || items.value.length < attrs.value.maxItems),
);
const canDelete = computed(
  () =>
    !props.readonly &&
    (!attrs.value.minItems || items.value.length > attrs.value.minItems),
);

// Helper: how many additional items can still be added.
function remainingSlots(): number {
  if (!attrs.value.maxItems) return Number.POSITIVE_INFINITY;
  return Math.max(0, attrs.value.maxItems - items.value.length);
}

// Helper: the lower bound on items.length given minItems.
function minBound(): number {
  return attrs.value.minItems ?? 0;
}

async function askConfirm(
  message: string,
  title = "Confirm",
): Promise<boolean> {
  try {
    // Falls back to native confirm when the Pinia store is not registered.
    return await useConfirmStore().ask({ title, message });
  } catch {
    return typeof globalThis.confirm === "function"
      ? globalThis.confirm(message)
      : false;
  }
}

function addItem() {
  if (!canAdd.value) return;
  pushUndo();
  const newItem: Record<string, unknown> = hasTemplates.value
    ? { _template: selectedTemplate.value }
    : {};
  emitItems([...items.value, newItem]);
}

async function deleteItem(index: number) {
  if (!canDelete.value) return;
  if (attrs.value.confirmDelete !== false) {
    const confirmed = await askConfirm(
      "Are you sure you want to delete this item?",
      "Delete item",
    );
    if (!confirmed) return;
  }
  pushUndo();
  const next = [...items.value];
  next.splice(index, 1);
  emitItems(next);
}

function duplicateItem(index: number) {
  if (remainingSlots() < 1) return;
  const source = items.value[index];
  if (!source) return;
  pushUndo();
  const copy = { ...source };
  const next = [...items.value];
  next.splice(index + 1, 0, copy);
  emitItems(next);
}

function updateItem(index: number, val: Record<string, unknown>) {
  const oldItem = items.value[index];
  if (oldItem && oldItem !== val) {
    const existingUid = itemUids.get(oldItem);
    if (existingUid) itemUids.set(val, existingUid);
  }
  const next = [...items.value];
  next[index] = val;
  emitItems(next);
}

function moveUp(index: number) {
  moveTo(index, index - 1);
}

function moveDown(index: number) {
  moveTo(index, index + 1);
}

function moveTo(from: number, to: number) {
  if (to < 0 || to >= items.value.length || from === to) return;
  pushUndo();
  const next = [...items.value];
  const [item] = next.splice(from, 1);
  if (item === undefined) return;
  next.splice(to, 0, item);
  emitItems(next);
}

// ─── Global collapse/expand ──────────────────────────────────────────────────

const collapseVersion = ref(0);
const globalExpanded = ref(attrs.value.defaultExpanded ?? false);

function collapseAll() {
  globalExpanded.value = false;
  collapseVersion.value++;
}
function expandAll() {
  globalExpanded.value = true;
  collapseVersion.value++;
}

// ─── Drag & drop (SSR-safe via ClientOnly) ───────────────────────────────────

function onDragStart() {
  pushUndo();
}

// ─── Bulk actions ────────────────────────────────────────────────────────────

const selectionMode = ref(false);
// Identity-based selection: survives reorder, delete, undo.
const selectedUids = ref<Set<string>>(new Set());
const anchorUid = ref<string | null>(null);

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) {
    selectedUids.value = new Set();
    anchorUid.value = null;
    // Auto-collapse all when leaving selection mode for tidiness.
    collapseVersion.value++;
  } else {
    // Auto-collapse all when entering selection mode so the user sees the whole list.
    globalExpanded.value = false;
    collapseVersion.value++;
  }
}

function isSelected(uid: string): boolean {
  return selectedUids.value.has(uid);
}

function toggleSelect(uid: string, withShift = false) {
  if (withShift && anchorUid.value && anchorUid.value !== uid) {
    // Range select between anchor and current.
    const uids = items.value.map(uidFor);
    const a = uids.indexOf(anchorUid.value);
    const b = uids.indexOf(uid);
    if (a !== -1 && b !== -1) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const next = new Set(selectedUids.value);
      for (let i = lo; i <= hi; i++) {
        const uid = uids[i];
        if (uid) next.add(uid);
      }
      selectedUids.value = next;
      return;
    }
  }
  const next = new Set(selectedUids.value);
  if (next.has(uid)) next.delete(uid);
  else next.add(uid);
  selectedUids.value = next;
  anchorUid.value = uid;
}

function selectAll() {
  selectedUids.value = new Set(items.value.map(uidFor));
}

function clearSelection() {
  selectedUids.value = new Set();
  anchorUid.value = null;
}

// Resolve current selection to the array of items, in current order.
function selectedItems(): Record<string, unknown>[] {
  return items.value.filter((i) => selectedUids.value.has(uidFor(i)));
}

async function bulkDelete() {
  const count = selectedUids.value.size;
  if (count === 0) return;
  // Enforce minItems: would deletion drop below the lower bound?
  if (items.value.length - count < minBound()) {
    await askConfirm(
      `Cannot delete: at least ${minBound()} items must remain.`,
      "Action blocked",
    );
    return;
  }
  const confirmed = await askConfirm(
    `Delete ${count} selected items?`,
    "Delete items",
  );
  if (!confirmed) return;
  pushUndo();
  emitItems(items.value.filter((i) => !selectedUids.value.has(uidFor(i))));
  clearSelection();
}

function bulkDuplicate() {
  const count = selectedUids.value.size;
  if (count === 0) return;
  // Cap by maxItems.
  const slots = remainingSlots();
  if (slots <= 0) return;
  const toDup = selectedItems().slice(0, slots);
  pushUndo();
  // Insert each copy right after its original. Walk from the end so indices stay valid.
  const next = [...items.value];
  const dupSet = new Set(toDup.map(uidFor));
  for (let i = next.length - 1; i >= 0; i--) {
    const item = next[i];
    if (item && dupSet.has(uidFor(item))) {
      next.splice(i + 1, 0, { ...item });
    }
  }
  emitItems(next);
  clearSelection();
}

function bulkMoveToTop() {
  if (selectedUids.value.size === 0) return;
  pushUndo();
  const selected = items.value.filter((i) => selectedUids.value.has(uidFor(i)));
  const rest = items.value.filter((i) => !selectedUids.value.has(uidFor(i)));
  emitItems([...selected, ...rest]);
}

const hasSelection = computed(() => selectedUids.value.size > 0);
const selectionCount = computed(() => selectedUids.value.size);

// ─── Errors ──────────────────────────────────────────────────────────────────

const parentErrors = computed(() => form.errors.value);
const errorPrefix = (index: number) =>
  `${props.descriptor.key as string}.${index}`;
</script>

<template>
  <div class="mapo-repeater space-y-2">
    <!-- ── Main toolbar ────────────────────────────────────────────────────── -->
    <div
      class="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2"
    >
      <span class="text-sm font-medium text-gray-700">
        {{ items.length }} {{ items.length === 1 ? "item" : "items" }}
        <span v-if="attrs.maxItems" class="text-gray-400"
          >/ {{ attrs.maxItems }}</span
        >
      </span>

      <div class="flex flex-1 flex-wrap items-center justify-end gap-2">
        <UButton size="xs" variant="ghost" color="neutral" @click="collapseAll">
          Collapse all
        </UButton>
        <UButton size="xs" variant="ghost" color="neutral" @click="expandAll">
          Expand all
        </UButton>
        <UButton
          v-if="undoStack.length"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-undo-2"
          title="Undo last action"
          @click="undo"
        />

        <!-- Bulk selection mode -->
        <UButton
          size="xs"
          :variant="selectionMode ? 'solid' : 'ghost'"
          color="neutral"
          icon="i-lucide-check-square"
          title="Bulk selection"
          :label="selectionMode ? 'Exit selection' : 'Select'"
          @click="toggleSelectionMode"
        />

        <!-- Template selector -->
        <USelectMenu
          v-if="hasTemplates"
          v-model="selectedTemplate"
          :items="templateKeys"
          size="xs"
          class="w-32"
        />

        <UButton
          size="sm"
          color="primary"
          icon="i-lucide-plus"
          :disabled="!canAdd"
          @click="addItem"
        >
          Add
        </UButton>
      </div>
    </div>

    <!-- ── Bulk actions bar (visible when there is a selection) ───────────── -->
    <Transition name="slide-down">
      <div
        v-if="selectionMode && hasSelection"
        class="flex items-center gap-2 rounded border border-primary-200 bg-primary-50 px-3 py-2"
      >
        <span class="text-sm font-medium text-primary-700">
          {{ selectionCount }} selected
        </span>
        <div class="flex flex-1 flex-wrap items-center gap-2">
          <UButton size="xs" variant="ghost" color="neutral" @click="selectAll">
            All
          </UButton>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            @click="clearSelection"
          >
            Clear
          </UButton>
          <UButton
            size="xs"
            variant="outline"
            color="neutral"
            icon="i-lucide-copy"
            :disabled="remainingSlots() <= 0"
            :title="
              remainingSlots() < selectionCount
                ? `Only ${remainingSlots()} of ${selectionCount} can be duplicated (maxItems reached)`
                : 'Duplicate selected'
            "
            @click="bulkDuplicate"
          >
            Duplicate ({{ Math.min(selectionCount, remainingSlots()) }})
          </UButton>
          <UButton
            size="xs"
            variant="outline"
            color="neutral"
            icon="i-lucide-arrow-up"
            @click="bulkMoveToTop"
          >
            Move to top
          </UButton>
          <UButton
            size="xs"
            variant="outline"
            color="error"
            icon="i-lucide-trash-2"
            :disabled="!canDelete"
            @click="bulkDelete"
          >
            Delete ({{ selectionCount }})
          </UButton>
        </div>
      </div>
    </Transition>

    <!-- ── Item list with drag&drop (ClientOnly for SSR) ───────────────────── -->
    <ClientOnly>
      <VueDraggable
        v-model="items"
        handle=".drag-handle"
        :animation="150"
        :disabled="readonly || selectionMode"
        @start="onDragStart"
      >
        <MapoRepeaterItem
          v-for="(item, index) in items"
          :key="`${uidFor(item)}-${collapseVersion}`"
          :uid="uidFor(item)"
          :item="item"
          :fields="fieldsForItem(item)"
          :index="index"
          :error-prefix="errorPrefix(index)"
          :parent-errors="parentErrors"
          :languages="form.languages"
          :current-lang="form.currentLang.value"
          :readonly="readonly ?? false"
          :registry="form.registry"
          :preview-label="attrs.previewLabel"
          :default-expanded="globalExpanded"
          :allow-duplicate="attrs.allowDuplicate"
          :repeater-descriptor="descriptor"
          :total-items="items.length"
          :selected="isSelected(uidFor(item))"
          :selection-mode="selectionMode"
          @update:item="updateItem(index, $event)"
          @delete="deleteItem(index)"
          @duplicate="duplicateItem(index)"
          @move-up="moveUp(index)"
          @move-down="moveDown(index)"
          @move-to="moveTo(index, $event)"
          @toggle-select="toggleSelect(uidFor(item), $event)"
        />
      </VueDraggable>

      <!-- SSR fallback: list without drag -->
      <template #fallback>
        <MapoRepeaterItem
          v-for="(item, index) in items"
          :key="`${uidFor(item)}-${collapseVersion}`"
          :uid="uidFor(item)"
          :item="item"
          :fields="fieldsForItem(item)"
          :index="index"
          :error-prefix="errorPrefix(index)"
          :parent-errors="parentErrors"
          :languages="form.languages"
          :current-lang="form.currentLang.value"
          :readonly="readonly ?? false"
          :registry="form.registry"
          :preview-label="attrs.previewLabel"
          :default-expanded="globalExpanded"
          :allow-duplicate="attrs.allowDuplicate"
          :repeater-descriptor="descriptor"
          :total-items="items.length"
          :selected="isSelected(uidFor(item))"
          :selection-mode="selectionMode"
          @update:item="updateItem(index, $event)"
          @delete="deleteItem(index)"
          @duplicate="duplicateItem(index)"
          @move-up="moveUp(index)"
          @move-down="moveDown(index)"
          @move-to="moveTo(index, $event)"
          @toggle-select="toggleSelect(uidFor(item), $event)"
        />
      </template>
    </ClientOnly>

    <!-- ── Empty state ─────────────────────────────────────────────────────── -->
    <div
      v-if="items.length === 0"
      class="rounded border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400"
    >
      No items. Click "Add" to start.
    </div>
  </div>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition:
    grid-template-rows 250ms ease,
    opacity 200ms ease;
  display: grid;
}
.slide-down-enter-from,
.slide-down-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  grid-template-rows: 1fr;
  opacity: 1;
}
</style>
