<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useMediaStore } from "../stores/media.js";
import type { MediaItem, SelectMode } from "../types/media.js";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    selectionMode?: Exclude<SelectMode, "none">;
    mime?: string | null;
    noFolders?: boolean;
    languages?: string[];
    defaultLang?: string;
    /** Current value of the host field — pre-seeds the picker selection. */
    selected?: MediaItem | MediaItem[] | null;
  }>(),
  {
    modelValue: false,
    selectionMode: "single",
    mime: null,
    noFolders: false,
    languages: undefined,
    defaultLang: undefined,
    selected: null,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  /** Emitted when the user confirms their selection */
  confirm: [value: MediaItem | MediaItem[]];
}>();

const { t } = useI18n();
const store = useMediaStore();
const open = ref(props.modelValue);

watch(
  () => props.modelValue,
  (v) => (open.value = v),
);

watch(open, (v) => emit("update:modelValue", v));

const hasSelection = computed(() => {
  if (props.selectionMode === "single") return !!store.selection;
  return Array.isArray(store.selection) && store.selection.length > 0;
});

const selectionCount = computed(() => {
  if (props.selectionMode === "multi" && Array.isArray(store.selection)) {
    return store.selection.length;
  }
  return 0;
});

function confirm() {
  if (!store.selection) return;
  emit("confirm", store.selection as MediaItem | MediaItem[]);
  open.value = false;
}

function cancel() {
  open.value = false;
}

// Legacy parity: in single mode the first pick confirms and closes right away.
// Guarded against the pre-seeded selection so reopening the dialog with a
// current value doesn't auto-close it.
watch(
  () => store.selection,
  (sel) => {
    if (!open.value || props.selectionMode !== "single") return;
    if (Array.isArray(sel) || !sel) return;
    const initial = props.selected as MediaItem | null;
    if (sel.id !== initial?.id) confirm();
  },
);
</script>

<template>
  <!-- Activator slot: the caller provides the trigger button -->
  <slot name="activator" :open="() => (open = true)" />

  <UModal v-model:open="open" :ui="{ content: 'max-w-5xl w-full h-[80vh]' }">
    <!-- #content gives full control: the default slot is the trigger in Nuxt UI v4 -->
    <template #content>
      <div class="flex h-full flex-col">
        <!-- Header -->
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UIcon name="i-lucide-image" class="size-4 text-dimmed" />
          <span class="flex-1 font-semibold text-highlighted">
            {{
              selectionMode === "multi"
                ? t("mapo.mediaManager.selectMedia")
                : t("mapo.mediaManager.selectAMedia")
            }}
          </span>
          <UButton
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="cancel"
          />
        </div>

        <!-- Body: media manager fills remaining space -->
        <div class="min-h-0 flex-1">
          <MapoMediaManager
            :selection-mode="selectionMode"
            :mime="mime"
            :no-folders="noFolders"
            :languages="languages"
            :default-lang="defaultLang"
            :initial-selection="selected"
          />
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-between gap-2 border-t border-default px-4 py-3"
        >
          <p
            v-if="selectionMode === 'multi' && selectionCount > 0"
            class="text-sm text-muted"
          >
            {{ t("mapo.mediaGallery.nSelected", { number: selectionCount }) }}
          </p>
          <div class="ml-auto flex gap-2">
            <UButton variant="ghost" color="neutral" @click="cancel">
              {{ t("mapo.cancel") }}
            </UButton>
            <UButton
              color="primary"
              :disabled="!hasSelection"
              icon="i-lucide-check"
              @click="confirm"
            >
              {{ t("mapo.confirm") }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
