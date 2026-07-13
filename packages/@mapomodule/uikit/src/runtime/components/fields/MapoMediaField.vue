<script setup lang="ts">
import { ref, computed, resolveComponent } from "vue";
import type { MediaDescriptor } from "@mapomodule/form/types";
import type { MediaItem } from "../../types/media.js";

const props = defineProps<{
  modelValue: MediaItem | number | null | undefined;
  descriptor: MediaDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: MediaItem | null];
}>();

const dialogOpen = ref(false);

const current = computed<MediaItem | null>(() => {
  if (!props.modelValue) return null;
  if (typeof props.modelValue === "object") return props.modelValue;
  return null;
});

const mime = computed(() => props.descriptor.attrs?.mime as string | undefined);

function onConfirm(selection: MediaItem | MediaItem[]) {
  emit(
    "update:modelValue",
    Array.isArray(selection) ? (selection[0] ?? null) : selection,
  );
}

function clear() {
  emit("update:modelValue", null);
}

// MapoMediaManagerDialog is globally registered by uikit module — no import needed
const MediaDialog = resolveComponent("MapoMediaManagerDialog");
</script>

<template>
  <div class="mapo-media-field space-y-2">
    <!-- Selected media preview -->
    <div
      v-if="current"
      class="flex items-center gap-3 rounded-lg border border-default p-2"
    >
      <MapoMediaPreview :media="current" size="sm" />
      <div class="flex-1 min-w-0">
        <p class="truncate text-xs font-medium">
          {{ current.title || current.file?.split("/").pop() }}
        </p>
        <p class="text-xs text-dimmed">
          {{ current.mime_type }}
        </p>
      </div>
      <UButton
        v-if="!readonly && !disabled"
        icon="i-lucide-x"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="clear"
      />
    </div>

    <!-- Trigger button -->
    <UButton
      v-if="!readonly && !disabled"
      :icon="current ? 'i-lucide-refresh-cw' : 'i-lucide-image-plus'"
      size="sm"
      variant="soft"
      color="neutral"
      :block="!current"
      @click="dialogOpen = true"
    >
      {{ current ? "Change" : "Select media" }}
    </UButton>

    <!-- Errors -->
    <p v-for="err in errors" :key="err" class="text-xs text-error" role="alert">
      {{ err }}
    </p>

    <!-- Dialog -->
    <component
      :is="MediaDialog"
      v-model="dialogOpen"
      selection-mode="single"
      :mime="mime"
      :selected="current"
      @confirm="onConfirm"
    />
  </div>
</template>
