<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useMediaStore } from "../stores/media.js";
import type { MediaFolder } from "../types/media.js";

const { t } = useI18n();
const store = useMediaStore();

const items = computed(() => [
  {
    label: t("mapo.mediaManager.root"),
    icon: "i-lucide-folder-open",
    folder: null as MediaFolder | null,
  },
  ...store.parentFolders.map((f) => ({
    label: f.name,
    icon: "i-lucide-folder",
    folder: f,
  })),
]);

function navigate(folder: MediaFolder | null) {
  store.navigateToFolder(folder);
}
</script>

<template>
  <nav class="flex items-center gap-1 overflow-x-auto py-1 text-sm">
    <template v-for="(item, i) in items" :key="i">
      <UButton
        variant="ghost"
        color="neutral"
        size="xs"
        :icon="item.icon"
        :disabled="i === items.length - 1"
        :class="
          i === items.length - 1
            ? 'font-semibold text-highlighted'
            : 'text-muted hover:text-highlighted'
        "
        @click="navigate(item.folder)"
      >
        {{ item.label }}
      </UButton>
      <UIcon
        v-if="i < items.length - 1"
        name="i-lucide-chevron-right"
        class="size-3 shrink-0 text-dimmed"
      />
    </template>
  </nav>
</template>
