<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { humanFileSize } from "@mapomodule/utils";
import { useMediaStore } from "../stores/media.js";
import type { MediaItem } from "../types/media.js";

const { t } = useI18n();
const store = useMediaStore();

const isPickerMode = computed(
  () => store.selectMode === "single" || store.selectMode === "multi",
);

const multiSelection = computed<MediaItem[]>(() =>
  store.selectMode === "multi" && Array.isArray(store.selection)
    ? store.selection
    : [],
);

function isInSelection(media: MediaItem): boolean {
  if (store.selectMode === "single") {
    return (store.selection as MediaItem | null)?.id === media.id;
  }
  if (store.selectMode === "multi") {
    return (
      (store.selection as MediaItem[])?.some((m) => m.id === media.id) ?? false
    );
  }
  return false;
}

function onClickItem(media: MediaItem) {
  if (isPickerMode.value) {
    store.select(media);
  } else {
    store.openEditor(media);
  }
}

// Selection strip drag reorder (legacy parity: v1 used vuedraggable) —
// the picker order is the order the m2m relation is saved in.
const dragIndex = ref<number | null>(null);

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDragOverItem(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return;
  const items = [...multiSelection.value];
  const [moved] = items.splice(dragIndex.value, 1);
  if (!moved) return;
  items.splice(index, 0, moved);
  dragIndex.value = index;
  store.setSelection(items);
}

function onDragEnd() {
  dragIndex.value = null;
}
</script>

<template>
  <div class="mapo-media-gallery flex flex-col gap-3">
    <!-- Multi-picker selection strip: click to deselect, drag to reorder -->
    <div
      v-if="multiSelection.length > 0"
      class="flex items-center gap-2 overflow-x-auto rounded-lg bg-elevated p-2"
    >
      <div
        v-for="(media, i) in multiSelection"
        :key="media.id"
        class="group relative shrink-0 cursor-grab"
        :class="{ 'opacity-50': dragIndex === i }"
        draggable="true"
        @dragstart="onDragStart(i)"
        @dragover.prevent="onDragOverItem(i)"
        @dragend="onDragEnd"
        @click.stop="store.select(media)"
      >
        <MapoMediaPreview :media="media" size="xs" />
        <div
          class="absolute inset-0 hidden items-center justify-center rounded bg-black/50 text-white group-hover:flex"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </div>
      </div>
      <span class="ml-auto shrink-0 pl-2 text-xs text-muted">
        {{
          t("mapo.mediaGallery.nSelected", { number: multiSelection.length })
        }}
      </span>
    </div>

    <!-- Bulk actions bar -->
    <div
      v-if="!isPickerMode && store.editList.length > 0"
      class="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2"
    >
      <UCheckbox
        :model-value="
          store.editListState.indeterminate
            ? 'indeterminate'
            : store.editListState.value
        "
        :label="
          store.editListState.value
            ? t('mapo.mediaGallery.deselectAll')
            : t('mapo.mediaGallery.selectAll')
        "
        @update:model-value="store.editSelectAll()"
      />
      <span class="text-sm text-muted">
        {{
          t("mapo.mediaGallery.nSelected", { number: store.editList.length })
        }}
      </span>
      <div class="flex-1" />
      <UButton
        icon="i-lucide-trash-2"
        size="xs"
        color="error"
        variant="soft"
        @click="store.deleteSelected()"
      >
        {{ t("mapo.mediaGallery.deleteSelectedLabel") }}
      </UButton>
      <UButton
        icon="i-lucide-x"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="store.editList = []"
      />
    </div>

    <!-- Loading skeleton -->
    <div
      v-if="store.loading"
      class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3"
    >
      <USkeleton v-for="n in 12" :key="n" class="aspect-square rounded-lg" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="store.medias.length === 0"
      class="flex flex-col items-center gap-3 py-16 text-center"
    >
      <UIcon name="i-lucide-image-off" class="size-12 text-dimmed" />
      <p class="text-sm text-muted">
        {{ t("mapo.mediaGallery.noMediaFound") }}
      </p>
    </div>

    <!-- Grid -->
    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3"
    >
      <div
        v-for="media in store.medias"
        :key="media.id"
        class="group relative cursor-pointer overflow-hidden rounded-lg bg-elevated"
        :class="{
          'ring-2 ring-primary': isInSelection(media),
          'ring-2 ring-primary ring-offset-1': store.editListSet.has(media.id),
        }"
        @click="onClickItem(media)"
      >
        <!-- Preview -->
        <div class="aspect-square">
          <MapoMediaPreview :media="media" size="lg" class="size-full" />
        </div>

        <!-- Hover overlay with filename -->
        <div
          class="absolute inset-x-0 bottom-0 translate-y-full bg-black/60 px-1.5 py-1 transition-transform group-hover:translate-y-0"
        >
          <p class="truncate text-[10px] text-white">
            {{ media.title || media.file?.split("/").pop() }}
          </p>
          <p class="text-[9px] text-white/60">
            {{ humanFileSize(media.size) }}
          </p>
        </div>

        <!-- Selection checkmark (picker mode) -->
        <div
          v-if="isPickerMode && isInSelection(media)"
          class="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-inverted"
        >
          <UIcon name="i-lucide-check" class="size-3" />
        </div>

        <!-- Bulk checkbox (gallery mode, no selection) -->
        <div
          v-if="!isPickerMode"
          class="absolute left-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
          :class="{ '!opacity-100': store.editListSet.has(media.id) }"
          @click.stop
        >
          <UCheckbox
            :model-value="store.editListSet.has(media.id)"
            @update:model-value="store.editSelect(media.id)"
          />
        </div>

        <!-- Edit button (gallery mode, visible on hover) -->
        <div
          v-if="!isPickerMode"
          class="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <UButton
            icon="i-lucide-pencil"
            size="xs"
            variant="solid"
            color="neutral"
            class="shadow"
            @click.stop="store.openEditor(media)"
          />
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="store.pages > 1" class="flex justify-center pt-2">
      <!-- The backend paginator only exposes page/pages (no item count), so the
           page count is mapped 1:1 with items-per-page=1. -->
      <UPagination
        :page="store.page"
        :total="store.pages"
        :items-per-page="1"
        @update:page="store.getRoot({ page: $event })"
      />
    </div>
  </div>
</template>
