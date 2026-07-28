<script setup lang="ts">
import { ref, computed, resolveComponent } from "vue";
import { useI18n } from "vue-i18n";
import type { EnhancedMediaDescriptor } from "@mapomodule/form/types";
import type { MediaItem } from "../../types/media.js";

const { t } = useI18n();

interface EnhancedMediaValue {
  media: MediaItem | null;
  alt?: string;
  caption?: string;
  [key: string]: unknown;
}

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

const MediaDialog = resolveComponent("MapoMediaManagerDialog");
</script>

<template>
  <div class="mapo-enhanced-media-field space-y-3">
    <div class="flex gap-3">
      <!-- Preview -->
      <div class="shrink-0">
        <div
          class="flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors"
          :class="
            current ? 'border-default' : 'border-accented hover:border-primary'
          "
          @click="!readonly && !disabled && (dialogOpen = true)"
        >
          <MapoMediaPreview v-if="current" :media="current" size="md" />
          <div v-else class="flex flex-col items-center gap-1 text-dimmed">
            <UIcon name="i-lucide-image-plus" class="size-7" />
            <span class="text-[10px]">{{ t("mapo.select") }}</span>
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
              :title="t('mapo.change')"
              @click="dialogOpen = true"
            />
            <UButton
              v-if="!readonly && !disabled"
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              color="neutral"
              :title="t('mapo.remove')"
              @click="clear"
            />
          </div>
        </div>

        <UInput
          v-model="altValue"
          size="sm"
          :placeholder="t('mapo.enhancedMediaField.altText')"
          :disabled="readonly || disabled || !current"
        />
        <UInput
          v-model="captionValue"
          size="sm"
          :placeholder="t('mapo.enhancedMediaField.caption')"
          :disabled="readonly || disabled || !current"
        />
      </div>
    </div>

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
