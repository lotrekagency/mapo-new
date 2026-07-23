<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { debounce } from "@mapomodule/utils";
import { useMediaStore } from "../stores/media.js";
import type { SelectMode } from "../types/media.js";

const props = withDefaults(
  defineProps<{
    selectionMode?: SelectMode;
    mime?: string | null;
    noFolders?: boolean;
    languages?: string[];
    defaultLang?: string;
    /** Pre-seed the picker selection (e.g. the field's current value). */
    initialSelection?:
      | import("../types/media.js").MediaItem
      | import("../types/media.js").MediaItem[]
      | null;
  }>(),
  {
    selectionMode: "none",
    mime: null,
    noFolders: false,
    languages: undefined,
    defaultLang: undefined,
    initialSelection: null,
  },
);

const emit = defineEmits<{
  /** Emitted on every selection change in single/multi picker mode */
  "update:selection": [
    value:
      | import("../types/media.js").MediaItem
      | import("../types/media.js").MediaItem[]
      | null,
  ];
}>();

const store = useMediaStore();
// string (not a union) because UTabs' v-model emits string | number
const activeTab = ref<string>("gallery");
const tabItems = [
  { label: "Gallery", icon: "i-lucide-images", value: "gallery" },
  { label: "Upload", icon: "i-lucide-upload-cloud", value: "upload" },
];
const searchValue = ref("");
const showFolders = ref(!props.noFolders);

// Searches span the whole library (`all: true`, legacy behavior); clearing the
// field drops back to the current folder scope.
const debouncedSearch = debounce((val: string) => {
  store.getRoot({ page: 1, search: val, all: !!val });
}, 500);

watch(searchValue, (val) => debouncedSearch(val));

watch(
  () => store.selection,
  (sel) => {
    if (props.selectionMode !== "none") {
      emit("update:selection", sel);
    }
  },
);

onMounted(async () => {
  store.setSelectionMode(props.selectionMode);
  if (props.initialSelection) store.setSelection(props.initialSelection);
  // The mime prop is a hard constraint (picker fields): lock it so the
  // folders panel cannot widen the filter past it.
  if (props.mime) store.lockMimeType(props.mime);
  // Detail fetches send language_code when a default language is provided
  // (legacy parity: v1 passed $i18n.locale).
  if (props.defaultLang) store.setLang(props.defaultLang);
  await store.getRoot({ page: 1 });
});

onUnmounted(() => {
  store.reset();
});
</script>

<template>
  <div class="mapo-media-manager flex h-full overflow-hidden">
    <!-- Folders sidebar -->
    <div
      v-if="showFolders"
      class="w-48 shrink-0 border-r border-default bg-default"
    >
      <MapoMediaFolders />
    </div>

    <!-- Main area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Top bar: breadcrumbs + search + tabs toggle -->
      <div
        class="flex items-center gap-3 border-b border-default bg-default px-4 py-2"
      >
        <!-- Toggle folders button -->
        <UButton
          v-if="!noFolders"
          :icon="
            showFolders
              ? 'i-lucide-panel-left-close'
              : 'i-lucide-panel-left-open'
          "
          size="xs"
          variant="ghost"
          color="neutral"
          @click="showFolders = !showFolders"
        />

        <!-- Breadcrumbs -->
        <MapoMediaBreadcrumbs class="flex-1" />

        <!-- Search -->
        <div v-if="activeTab === 'gallery'" class="w-48 shrink-0">
          <UInput
            v-model="searchValue"
            size="xs"
            placeholder="Search..."
            icon="i-lucide-search"
            :loading="store.loading"
          />
        </div>

        <!-- Refresh -->
        <UButton
          icon="i-lucide-refresh-cw"
          size="xs"
          variant="ghost"
          color="neutral"
          title="Refresh"
          @click="store.getRoot()"
        />

        <!-- Tab switcher -->
        <UTabs
          v-model="activeTab"
          :items="tabItems"
          :content="false"
          size="xs"
          color="neutral"
        />
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4">
        <MapoMediaGallery v-if="activeTab === 'gallery'" />
        <MapoMediaUploader v-else @uploaded="activeTab = 'gallery'" />
      </div>

      <!-- Custom actions (legacy parity: v1 exposed an `actions` card slot) -->
      <div
        v-if="$slots.actions"
        class="flex items-center justify-end gap-2 border-t border-default px-4 py-2"
      >
        <slot name="actions" />
      </div>
    </div>

    <!-- Editor drawer (overlays from right, only in gallery mode, none-selection) -->
    <MapoMediaEditor
      v-if="activeTab === 'gallery'"
      :languages="languages"
      :default-lang="defaultLang"
    />
  </div>
</template>
