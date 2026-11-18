<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useMediaStore } from "../stores/media.js";
import {
  ROOT_FOLDER_KEY,
  buildFolderTree,
  findFolderNode,
  folderKey,
  folderNodeIcon,
  type FolderNode,
} from "../utils/mediaFolders.js";
import type { MediaFolder } from "../types/media.js";

/**
 * Dialog to pick a media folder, the root included, from the same folder tree
 * as the manager's sidebar (it shares the store's folder cache and loads the
 * branches it opens). Used to move media and folders.
 */
const props = withDefaults(
  defineProps<{
    /** Whether the dialog is open (`v-model:open`). */
    open: boolean;
    /** Dialog title. Default: "Move to folder". */
    title?: string;
    /** Label of the confirm button. Default: "Move here". */
    confirmLabel?: string;
    /**
     * Folder ids that cannot be picked, hidden with everything under them:
     * a folder cannot go inside itself.
     */
    exclude?: number[];
  }>(),
  {
    title: undefined,
    confirmLabel: undefined,
    exclude: () => [],
  },
);

const emit = defineEmits<{
  /** The dialog opened or closed. */
  "update:open": [open: boolean];
  /** The folder picked: `null` is the root. */
  confirm: [folder: MediaFolder | null];
}>();

const { t } = useI18n();
const store = useMediaStore();

const pickedKey = ref<string | null>(null);
const expanded = ref<string[]>([ROOT_FOLDER_KEY]);

// Opens on the folder on screen: its path expanded, nothing picked yet.
function prepare() {
  pickedKey.value = null;
  const path = store.parentFolders.map((folder) => folderKey(folder.id));
  expanded.value = [ROOT_FOLDER_KEY, ...path];
  const hasRoot = store.folderChildren[ROOT_FOLDER_KEY] !== undefined;
  if (!hasRoot) store.loadFolderChildren(null).catch(() => {});
}

// Nuxt UI overlays have no z-index: they stack in the order they mount. The
// picker can open from the editor drawer, so it mounts when it opens, above
// it, and unmounts once its close animation has ended.
const modalMounted = ref(props.open);
if (props.open) prepare();
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    modalMounted.value = true;
    prepare();
  },
);

function onAfterLeave() {
  // Opened again while closing: it is open again.
  if (props.open) return;
  modalMounted.value = false;
}

const excluded = computed(() => new Set(props.exclude));
const tree = computed(() =>
  buildFolderTree(
    store.folderChildren,
    { root: t("mapo.mediaManager.root"), loading: t("mapo.loading") },
    { exclude: excluded.value },
  ),
);
const pickedNode = computed(() =>
  pickedKey.value ? findFolderNode(tree.value, pickedKey.value) : undefined,
);
const nodeKey = (node: FolderNode) => node.key;

// The picked folder is this component's state: Reka's own selection is
// cancelled, as in the sidebar, so a second click does not unpick it.
function onSelectNode(event: { preventDefault(): void }, node: FolderNode) {
  event.preventDefault();
  if (node.pending) return;
  pickedKey.value = node.key;
}

function onToggleNode(
  event: { detail: { isExpanded: boolean } },
  node: FolderNode,
) {
  const isOpening = !event.detail.isExpanded;
  const isLoaded = store.folderChildren[node.key] !== undefined;
  if (!isOpening || isLoaded || node.pending) return;
  // On failure the branch keeps its placeholder; opening it again retries.
  store.loadFolderChildren(node.folder?.id ?? null).catch(() => {});
}

function close() {
  emit("update:open", false);
}

function confirm() {
  const node = pickedNode.value;
  if (!node) return;
  emit("confirm", node.folder);
  close();
}
</script>

<template>
  <UModal
    v-if="modalMounted"
    :open="open"
    :title="title ?? t('mapo.mediaMove.title')"
    :ui="{ content: 'max-w-md' }"
    @update:open="emit('update:open', $event)"
    @after:leave="onAfterLeave"
  >
    <template #body>
      <UTree
        v-model:expanded="expanded"
        :items="tree"
        :model-value="pickedNode"
        :get-key="nodeKey"
        size="sm"
        color="neutral"
        class="max-h-[50vh] overflow-y-auto"
        @select="onSelectNode"
        @toggle="onToggleNode"
      >
        <template #item-leading="{ item, expanded: isOpen, ui }">
          <UIcon
            :name="folderNodeIcon(item, isOpen)"
            :class="[ui.linkLeadingIcon(), item.pending && 'animate-spin']"
          />
        </template>
      </UTree>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          :label="t('mapo.cancel')"
          @click="close"
        />
        <UButton
          color="primary"
          icon="i-lucide-folder-input"
          :disabled="!pickedNode"
          @click="confirm"
        >
          {{ confirmLabel ?? t("mapo.mediaMove.confirm") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
