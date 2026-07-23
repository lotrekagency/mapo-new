<script setup lang="ts">
import { ref, computed } from "vue";
import type {
  EnhancedMediaDescriptor,
  EnhancedMediaValue,
  MediaItem,
} from "../../types/index.js";
import { useMediaManager } from "../../composables/useMediaManager.js";

const props = defineProps<{
  modelValue: EnhancedMediaValue | null | undefined;
  descriptor: EnhancedMediaDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: EnhancedMediaValue | null];
}>();

const dialogOpen = ref(false);

// Picker dialog comes from @mapomodule/uikit, resolved at runtime.
const { MediaDialog, available } = useMediaManager();

const current = computed<MediaItem | null>(
  () => props.modelValue?.media ?? null,
);

const altValue = computed({
  get: () => props.modelValue?.alt ?? "",
  set: (v: string) =>
    emit("update:modelValue", {
      ...(props.modelValue ?? { media: null }),
      alt: v,
    }),
});

const captionValue = computed({
  get: () => props.modelValue?.caption ?? "",
  set: (v: string) =>
    emit("update:modelValue", {
      ...(props.modelValue ?? { media: null }),
      caption: v,
    }),
});

const mime = computed(() => props.descriptor.attrs?.mime as string | undefined);

function onConfirm(selection: MediaItem | MediaItem[]) {
  const media = Array.isArray(selection) ? (selection[0] ?? null) : selection;
  emit("update:modelValue", {
    ...(props.modelValue ?? {}),
    media,
    alt: props.modelValue?.alt ?? media?.alt_text ?? "",
    caption: props.modelValue?.caption ?? "",
  });
}

function clear() {
  emit("update:modelValue", null);
}
</script>

<template>
  <div class="mapo-enhanced-media-field space-y-3">
    <MapoMediaUnavailable v-if="!available" />

    <template v-else>
      <div class="flex gap-3">
        <!-- Preview -->
        <div class="shrink-0">
          <div
            class="flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors"
            :class="
              current
                ? 'border-default'
                : 'border-accented hover:border-primary'
            "
            @click="!readonly && !disabled && (dialogOpen = true)"
          >
            <MapoMediaPreview v-if="current" :media="current" size="md" />
            <div v-else class="flex flex-col items-center gap-1 text-dimmed">
              <UIcon name="i-lucide-image-plus" class="size-7" />
              <span class="text-[10px]">Select</span>
            </div>
          </div>
        </div>

        <!-- Metadata fields -->
        <div class="flex-1 space-y-2">
          <div v-if="current" class="flex items-start justify-between gap-2">
            <p class="truncate text-xs text-muted">
              {{ current.title || current.file?.split("/").pop() }}
            </p>
            <div class="flex gap-1">
              <UButton
                v-if="!readonly && !disabled"
                icon="i-lucide-refresh-cw"
                size="xs"
                variant="ghost"
                color="neutral"
                title="Change"
                @click="dialogOpen = true"
              />
              <UButton
                v-if="!readonly && !disabled"
                icon="i-lucide-x"
                size="xs"
                variant="ghost"
                color="neutral"
                title="Remove"
                @click="clear"
              />
            </div>
          </div>

          <UInput
            v-model="altValue"
            size="sm"
            placeholder="Alt text"
            :disabled="readonly || disabled || !current"
          />
          <UInput
            v-model="captionValue"
            size="sm"
            placeholder="Caption"
            :disabled="readonly || disabled || !current"
          />
        </div>
      </div>

      <!-- Dialog -->
      <component
        :is="MediaDialog"
        v-model="dialogOpen"
        selection-mode="single"
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
