<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { useMediaStore } from "../stores/media.js";
import {
  ROOT_FOLDER_KEY,
  buildFolderTree,
  canMoveFolderTo,
  findFolderNode,
  folderKey,
  folderNodeIcon,
  type FolderNode,
} from "../utils/mediaFolders.js";
import { startMediaDrag, type MediaDrag } from "../utils/mediaDrag.js";
import type { MediaFolder } from "../types/media.js";

const { t } = useI18n();
const store = useMediaStore();

const editingFolder = ref<Partial<MediaFolder> | null>(null);
const folderName = ref("");
const saving = ref(false);

const ALL_MIME_FILTERS = computed(() => [
  {
    label: t("mapo.mediaFolders.allFolder"),
    icon: "i-lucide-layers",
    mime: null as string | null,
  },
  {
    label: t("mapo.mediaFolders.imageFolder"),
    icon: "i-lucide-image",
    mime: "image/*",
  },
  {
    label: t("mapo.mediaFolders.videoFolder"),
    icon: "i-lucide-film",
    mime: "video/*",
  },
  {
    label: t("mapo.mediaFolders.audioFolder"),
    icon: "i-lucide-music",
    mime: "audio/*",
  },
  // Family filter (legacy parity): pdf, zip, office docs — not just pdf.
  {
    label: t("mapo.mediaFolders.docFolder"),
    icon: "i-lucide-file-text",
    mime: "application/*",
  },
]);

// When the host locks a mime (picker fields), only the matching filter is
// offered — "All" would let the user select media of the wrong type.
const mimeFilters = computed(() =>
  store.lockedMime
    ? ALL_MIME_FILTERS.value.filter((f) => f.mime === store.lockedMime)
    : ALL_MIME_FILTERS.value,
);

function startCreate() {
  editingFolder.value = {};
  folderName.value = "";
}

function startEdit(folder: MediaFolder) {
  editingFolder.value = { ...folder };
  folderName.value = folder.name;
}

function cancelEdit() {
  editingFolder.value = null;
  folderName.value = "";
}

async function saveFolder() {
  if (!folderName.value.trim()) return;
  saving.value = true;
  try {
    await store.updateOrCreateFolder({
      ...editingFolder.value,
      name: folderName.value.trim(),
    });
    cancelEdit();
  } finally {
    saving.value = false;
  }
}

function selectMime(mime: string | null) {
  store.setMimeType(mime);
  // Mime filters act as virtual folders spanning the whole library (legacy
  // behavior); clearing back to "All" returns to the current folder scope.
  store.getRoot({ page: 1, all: !!mime });
}

// Single keyup handler — @keyup.enter + @keyup.esc on the same element compile
// to duplicate object keys (TS1117 under vue-tsc).
function onNameKeyup(event: KeyboardEvent) {
  if (event.key === "Enter") saveFolder();
  else if (event.key === "Escape") cancelEdit();
}

// ─── Folder tree ─────────────────────────────────────────────────────────────

const nodeKey = (node: FolderNode) => node.key;

const tree = computed(() =>
  buildFolderTree(store.folderChildren, {
    root: t("mapo.mediaManager.root"),
    loading: t("mapo.loading"),
  }),
);

// The folder on screen is the selected node.
const selectedNode = computed(() =>
  findFolderNode(tree.value, folderKey(store.parentFolder?.id)),
);

const hasNoFolders = computed(
  () => store.folderChildren[ROOT_FOLDER_KEY]?.length === 0,
);

// The branches the user opened, plus the path to the folder on screen, opened
// whenever that path changes (not on every navigation, so a branch the user
// closes stays closed).
const expanded = ref<string[]>([ROOT_FOLDER_KEY]);
watch(
  () => store.parentFolders.map((folder) => folderKey(folder.id)).join("/"),
  () => {
    const path = store.parentFolders.map((folder) => folderKey(folder.id));
    expanded.value = [
      ...new Set([...expanded.value, ROOT_FOLDER_KEY, ...path]),
    ];
  },
  { immediate: true },
);

// A click selects and toggles a node in one go: the folder it navigates to is
// loaded by the navigation, so the toggle must not load it a second time.
let navigatingTo: string | null = null;

// The folder on screen drives the selection, so Reka's own selection is
// cancelled: it would mark the node before the navigation lands, and unmark
// the current folder when it is clicked again. Returns the navigation so
// Vue's error handling sees a failure.
function onSelectNode(event: { preventDefault(): void }, node: FolderNode) {
  event.preventDefault();
  if (node.pending) return;
  navigatingTo = node.key;
  return store.navigateToFolder(node.folder).finally(() => {
    navigatingTo = null;
  });
}

function onToggleNode(
  event: { detail: { isExpanded: boolean } },
  node: FolderNode,
) {
  const isOpening = !event.detail.isExpanded;
  const isLoaded = store.folderChildren[node.key] !== undefined;
  const isNavigatingThere = navigatingTo === node.key;
  if (!isOpening || isLoaded || isNavigatingThere || node.pending) return;
  // On failure the branch keeps its placeholder; opening it again retries.
  store.loadFolderChildren(node.folder?.id ?? null).catch(() => {});
}

function isRenaming(node: FolderNode): boolean {
  const renamingId = editingFolder.value?.id;
  return renamingId != null && node.folder?.id === renamingId;
}

// ─── Moving a folder ─────────────────────────────────────────────────────────

const movingFolder = ref<MediaFolder | null>(null);
const pickerOpen = ref(false);
// While a move runs the tree still shows the folder in its old place: the row
// actions wait for it (the store refuses a second move anyway).
const isMoving = computed(() => store.movingFolderId !== null);
// The picker hides the folder with everything under it: a folder cannot go
// inside itself or one of its subfolders.
const pickerExclude = computed(() =>
  movingFolder.value ? [movingFolder.value.id] : [],
);

function startMove(folder: MediaFolder) {
  movingFolder.value = folder;
  pickerOpen.value = true;
}

// Returns the move so Vue's error handling sees a failure.
function onMoveConfirm(target: MediaFolder | null) {
  const folder = movingFolder.value;
  if (!folder) return;
  return store.moveFolder(folder, target?.id ?? null);
}

// ─── Dragging onto the tree ──────────────────────────────────────────────────

// Gallery cards and folders dropped on a row move into that folder, by the
// same store actions as "Move to…". A folder is not taken by itself, its
// subfolders or the folder it is in, nor while another folder moves.
const dropKey = ref<string | null>(null);
// A closed branch opens when a drag rests on it, to reach its subfolders.
const OPEN_ON_HOVER_MS = 700;
let openTimer: ReturnType<typeof setTimeout> | undefined;

function canDragRow(node: FolderNode): boolean {
  return !!node.folder && !isRenaming(node) && !isMoving.value;
}

function canDropOn(node: FolderNode): boolean {
  const drag = store.dragged;
  if (!drag || node.pending) return false;
  if (drag.kind === "media") return true;
  if (isMoving.value) return false;
  const targetId = node.folder?.id ?? null;
  return canMoveFolderTo(store.folderChildren, drag.folder, targetId);
}

function onRowDragStart(event: DragEvent, node: FolderNode) {
  if (!node.folder || !canDragRow(node)) return;
  const drag: MediaDrag = { kind: "folder", folder: node.folder };
  startMediaDrag(event, drag);
  store.dragged = drag;
}

// For dragenter and dragover alike: a drop target cancels both.
function onRowDragOver(event: DragEvent, node: FolderNode) {
  if (!canDropOn(node)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  if (dropKey.value === node.key) return;
  dropKey.value = node.key;
  openWhenResting(node);
}

function onRowDragLeave(event: DragEvent, node: FolderNode) {
  // Passing from the row's icon to its label is no leave.
  const row = event.currentTarget as HTMLElement | null;
  const into = event.relatedTarget as HTMLElement | null;
  if (row && into && row.contains(into)) return;
  if (dropKey.value !== node.key) return;
  dropKey.value = null;
  clearTimeout(openTimer);
}

// Returns the move so Vue's error handling sees a failure.
function onRowDrop(event: DragEvent, node: FolderNode) {
  const drag = store.dragged;
  if (!drag || !canDropOn(node)) return;
  event.preventDefault();
  store.dragged = null;
  const targetId = node.folder?.id ?? null;
  if (drag.kind === "media") return store.moveMedia(drag.ids, targetId);
  return store.moveFolder(drag.folder, targetId);
}

// Ends a drag started on a row, dropped or not.
function onRowDragEnd() {
  store.dragged = null;
}

function openWhenResting(node: FolderNode) {
  clearTimeout(openTimer);
  const isOpen = expanded.value.includes(node.key);
  const hasBranch = !!node.children?.length;
  if (isOpen || !hasBranch) return;
  openTimer = setTimeout(() => {
    expanded.value = [...expanded.value, node.key];
    const isLoaded = store.folderChildren[node.key] !== undefined;
    if (isLoaded) return;
    store.loadFolderChildren(node.folder?.id ?? null).catch(() => {});
  }, OPEN_ON_HOVER_MS);
}

// However a drag ends (dropped, cancelled, from the gallery or a row), the
// highlight and a pending branch opening go with it.
watch(
  () => store.dragged,
  (drag) => {
    if (drag) return;
    dropKey.value = null;
    clearTimeout(openTimer);
  },
);
onBeforeUnmount(() => clearTimeout(openTimer));
</script>

<template>
  <div class="mapo-media-folders flex h-full flex-col gap-2 py-2">
    <!-- MIME filters -->
    <div class="space-y-0.5 px-2">
      <p
        class="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-dimmed"
      >
        {{ t("mapo.mime") }}
      </p>
      <UButton
        v-for="f in mimeFilters"
        :key="f.mime ?? 'all'"
        variant="ghost"
        color="neutral"
        size="xs"
        block
        :icon="f.icon"
        class="justify-start"
        :class="{ 'bg-elevated': store.mimeType === f.mime }"
        @click="selectMime(f.mime)"
      >
        {{ f.label }}
      </UButton>
    </div>

    <USeparator />

    <!-- Folders header -->
    <div class="flex items-center justify-between px-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
        {{ t("mapo.mediaFolders.folders") }}
      </p>
      <UButton
        icon="i-lucide-folder-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        :title="t('mapo.mediaFolders.newFolder')"
        @click="startCreate"
      />
    </div>

    <!-- New folder input -->
    <div v-if="editingFolder && !editingFolder.id" class="px-2">
      <UInput
        v-model="folderName"
        size="xs"
        :placeholder="t('mapo.mediaFolders.folderName')"
        autofocus
        @keyup="onNameKeyup"
      >
        <template #trailing>
          <UButton
            icon="i-lucide-check"
            size="xs"
            variant="ghost"
            color="primary"
            :loading="saving"
            @click="saveFolder"
          />
        </template>
      </UInput>
    </div>

    <!-- Folder tree: the root, then the folders, loaded branch by branch -->
    <div class="flex-1 overflow-y-auto px-2">
      <UTree
        v-model:expanded="expanded"
        :items="tree"
        :model-value="selectedNode"
        :get-key="nodeKey"
        size="sm"
        color="neutral"
        @select="onSelectNode"
        @toggle="onToggleNode"
      >
        <!-- The whole row is the tree item, so the rename and delete buttons
             sit next to the label instead of inside another button. The row
             is also where folders are dragged from and media and folders are
             dropped. -->
        <template #item-wrapper="{ item, expanded: isOpen, selected, ui }">
          <div
            :class="[
              ui.link({ selected, disabled: !!item.pending }),
              dropKey === item.key &&
                'bg-primary/10 ring-1 ring-inset ring-primary',
            ]"
            :draggable="canDragRow(item)"
            @dragstart="onRowDragStart($event, item)"
            @dragend="onRowDragEnd"
            @dragenter="onRowDragOver($event, item)"
            @dragover="onRowDragOver($event, item)"
            @dragleave="onRowDragLeave($event, item)"
            @drop="onRowDrop($event, item)"
          >
            <UIcon
              :name="folderNodeIcon(item, isOpen)"
              :class="[ui.linkLeadingIcon(), item.pending && 'animate-spin']"
            />

            <UInput
              v-if="isRenaming(item)"
              v-model="folderName"
              size="xs"
              class="min-w-0 flex-1"
              autofocus
              @click.stop
              @keydown.stop
              @keyup="onNameKeyup"
            >
              <template #trailing>
                <UButton
                  icon="i-lucide-check"
                  size="xs"
                  variant="ghost"
                  color="primary"
                  :loading="saving"
                  :aria-label="t('mapo.save')"
                  @click.stop="saveFolder"
                />
              </template>
            </UInput>
            <template v-else>
              <span :class="ui.linkLabel()">{{ item.label }}</span>
            </template>

            <span :class="ui.linkTrailing()">
              <UIcon
                v-if="item.children?.length"
                name="i-lucide-chevron-down"
                :class="ui.linkTrailingIcon()"
              />
            </span>

            <!-- Laid over the end of the row, so they take no room from the
                 name; transparent until the row is hovered or a button has
                 the keyboard focus. -->
            <span
              v-if="item.folder && !isRenaming(item)"
              class="absolute end-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-default opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            >
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                color="neutral"
                :aria-label="t('mapo.edit')"
                :disabled="isMoving"
                @click.stop="startEdit(item.folder)"
              />
              <UButton
                icon="i-lucide-folder-input"
                size="xs"
                variant="ghost"
                color="neutral"
                :aria-label="t('mapo.mediaMove.moveTo')"
                :disabled="isMoving"
                :loading="store.movingFolderId === item.folder.id"
                @click.stop="startMove(item.folder)"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                :aria-label="t('mapo.delete')"
                :disabled="isMoving"
                @click.stop="store.deleteFolder(item.folder)"
              />
            </span>
          </div>
        </template>
      </UTree>

      <template v-if="hasNoFolders">
        <p class="px-2 py-3 text-xs text-dimmed italic">
          {{ t("mapo.mediaFolders.noFolders") }}
        </p>
      </template>
    </div>

    <MapoMediaFolderPicker
      v-model:open="pickerOpen"
      :title="t('mapo.mediaMove.folderTitle', { name: movingFolder?.name })"
      :exclude="pickerExclude"
      @confirm="onMoveConfirm"
    />
  </div>
</template>
