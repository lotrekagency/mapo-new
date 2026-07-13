<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { humanFileSize } from "@mapomodule/utils";
import type { MediaItem } from "../types/media.js";

const props = defineProps<{
  media: MediaItem;
  accept?: string;
}>();

const emit = defineEmits<{
  "update:file": [file: File | null];
  "update:maintainUrl": [value: boolean];
}>();

const newFile = ref<File | null>(null);
const maintainUrl = ref(false);
const previewUrl = ref<string | null>(null);

const isImage = computed(() =>
  newFile.value
    ? newFile.value.type.startsWith("image/")
    : props.media.mime_type?.startsWith("image/"),
);

// Accept the whole mime family of the current file (legacy parity): a JPEG
// can be replaced with any image, not only another JPEG.
const acceptTypes = computed(() => {
  if (props.accept) return props.accept;
  const family = props.media.mime_type?.split("/")[0];
  return family && ["image", "video", "audio"].includes(family)
    ? `${family}/*`
    : "*/*";
});

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
}

function onFileSelected(files: File[]) {
  const file = files[0] ?? null;
  newFile.value = file;
  emit("update:file", file);
  revokePreview();
  if (file && file.type.startsWith("image/")) {
    previewUrl.value = URL.createObjectURL(file);
  }
}

function clearFile() {
  newFile.value = null;
  revokePreview();
  emit("update:file", null);
}

onUnmounted(revokePreview);

function onMaintainUrlChange(v: boolean) {
  maintainUrl.value = v;
  emit("update:maintainUrl", v);
}
</script>

<template>
  <div class="mapo-media-file-changer space-y-2">
    <p class="text-xs font-medium text-muted">Replace file</p>

    <MapoDropArea
      :accept="acceptTypes"
      :multiple="false"
      @files="onFileSelected"
    >
      <template #default="{ triggerPick, isDragging }">
        <div
          class="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 transition-colors"
          :class="
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-default hover:border-accented'
          "
          @click="triggerPick"
        >
          <!-- New file preview -->
          <div v-if="newFile" class="flex items-center gap-2 flex-1">
            <img
              v-if="isImage && previewUrl"
              :src="previewUrl"
              class="size-12 rounded object-cover"
              alt=""
            />
            <UIcon v-else name="i-lucide-file" class="size-8 text-dimmed" />
            <div class="flex-1 min-w-0">
              <p class="truncate text-xs font-medium">
                {{ newFile.name }}
              </p>
              <p class="text-xs text-dimmed">
                {{ humanFileSize(newFile.size) }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              color="neutral"
              @click.stop="clearFile"
            />
          </div>

          <!-- Placeholder -->
          <div
            v-else
            class="flex flex-1 items-center gap-2 text-sm text-dimmed"
          >
            <UIcon name="i-lucide-upload" class="size-5" />
            <span>Drag or click to choose a file</span>
          </div>
        </div>
      </template>
    </MapoDropArea>

    <UCheckbox
      v-if="newFile"
      :model-value="maintainUrl"
      label="Keep current URL"
      @update:model-value="onMaintainUrlChange"
    />
  </div>
</template>
