<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import type { MediaM2mDescriptor, MediaItem } from "../../types/index.js";
import { useMediaManager } from "../../composables/useMediaManager.js";

const props = defineProps<{
  modelValue: MediaItem[] | number[] | null | undefined;
  descriptor: MediaM2mDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: MediaItem[]];
}>();

const { t } = useI18n();

const dialogOpen = ref(false);

// Picker dialog comes from @mapomodule/uikit, resolved at runtime.
const { MediaDialog, available } = useMediaManager();

const current = computed<MediaItem[]>(() => {
  if (!props.modelValue) return [];
  return props.modelValue.filter((v): v is MediaItem => typeof v === "object");
});

const mime = computed(() => props.descriptor.attrs?.mime as string | undefined);

function onConfirm(selection: MediaItem | MediaItem[]) {
  emit("update:modelValue", Array.isArray(selection) ? selection : [selection]);
}

function removeItem(id: number) {
  emit(
    "update:modelValue",
    current.value.filter((m) => m.id !== id),
  );
}

// HTML5 drag reorder — order matters for m2m relations (legacy parity).
const dragIndex = ref<number | null>(null);

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDragOverItem(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return;
  const items = [...current.value];
  const [moved] = items.splice(dragIndex.value, 1);
  if (!moved) return;
  items.splice(index, 0, moved);
  dragIndex.value = index;
  emit("update:modelValue", items);
}

function onDragEnd() {
  dragIndex.value = null;
}
</script>

<template>
  <div class="mapo-media-m2m-field space-y-2">
    <MapoMediaUnavailable v-if="!available" />

    <template v-else>
      <!-- Selected items grid -->
      <div v-if="current.length > 0" class="flex flex-wrap gap-2">
        <div
          v-for="(media, i) in current"
          :key="media.id"
          class="group relative"
          :class="{
            'opacity-50': dragIndex === i,
            'cursor-grab': !readonly && !disabled,
          }"
          :draggable="!readonly && !disabled"
          @dragstart="onDragStart(i)"
          @dragover.prevent="onDragOverItem(i)"
          @dragend="onDragEnd"
        >
          <MapoMediaPreview :media="media" size="sm" />
          <button
            v-if="!readonly && !disabled"
            class="absolute -right-1.5 -top-1.5 hidden size-4 items-center justify-center rounded-full bg-error text-inverted group-hover:flex"
            type="button"
            @click="removeItem(media.id)"
          >
            <UIcon name="i-lucide-x" class="size-2.5" />
          </button>
        </div>
      </div>

      <!-- Add button -->
      <UButton
        v-if="!readonly && !disabled"
        icon="i-lucide-plus"
        size="sm"
        variant="soft"
        color="neutral"
        @click="dialogOpen = true"
      >
        {{
          current.length > 0
            ? t("mapo.mediaM2MField.addMedia")
            : t("mapo.mediaField.selectMedia")
        }}
      </UButton>

      <!-- Dialog -->
      <component
        :is="MediaDialog"
        v-model="dialogOpen"
        selection-mode="multi"
        :mime="mime"
        :selected="current"
        @confirm="onConfirm"
      />
    </template>

    <!-- Errors -->
    <p v-for="err in errors" :key="err" class="text-xs text-error" role="alert">
      {{ err }}
    </p>
  </div>
</template>
