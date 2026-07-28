<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useMediaStore } from "../stores/media.js";
import type { MediaFolder } from "../types/media.js";

const { t } = useI18n();
const store = useMediaStore();

const editingFolder = ref<Partial<MediaFolder> | null>(null);
const folderName = ref("");
const saving = ref(false);

const ALL_MIME_FILTERS = computed(() => [
  {
    label: t("mapo.mediaFolders.allFolder"),
    icon: "i-lucide-layers",
    mime: null as string | null,
  },
  {
    label: t("mapo.mediaFolders.imageFolder"),
    icon: "i-lucide-image",
    mime: "image/*",
  },
  {
    label: t("mapo.mediaFolders.videoFolder"),
    icon: "i-lucide-film",
    mime: "video/*",
  },
  {
    label: t("mapo.mediaFolders.audioFolder"),
    icon: "i-lucide-music",
    mime: "audio/*",
  },
  // Family filter (legacy parity): pdf, zip, office docs — not just pdf.
  {
    label: t("mapo.mediaFolders.docFolder"),
    icon: "i-lucide-file-text",
    mime: "application/*",
  },
]);

// When the host locks a mime (picker fields), only the matching filter is
// offered — "All" would let the user select media of the wrong type.
const mimeFilters = computed(() =>
  store.lockedMime
    ? ALL_MIME_FILTERS.value.filter((f) => f.mime === store.lockedMime)
    : ALL_MIME_FILTERS.value,
);

function startCreate() {
  editingFolder.value = {};
  folderName.value = "";
}

function startEdit(folder: MediaFolder) {
  editingFolder.value = { ...folder };
  folderName.value = folder.name;
}

function cancelEdit() {
  editingFolder.value = null;
  folderName.value = "";
}

async function saveFolder() {
  if (!folderName.value.trim()) return;
  saving.value = true;
  try {
    await store.updateOrCreateFolder({
      ...editingFolder.value,
      name: folderName.value.trim(),
    });
    cancelEdit();
  } finally {
    saving.value = false;
  }
}

function selectMime(mime: string | null) {
  store.setMimeType(mime);
  // Mime filters act as virtual folders spanning the whole library (legacy
  // behavior); clearing back to "All" returns to the current folder scope.
  store.getRoot({ page: 1, all: !!mime });
}

// Single keyup handler — @keyup.enter + @keyup.esc on the same element compile
// to duplicate object keys (TS1117 under vue-tsc).
function onNameKeyup(event: KeyboardEvent) {
  if (event.key === "Enter") saveFolder();
  else if (event.key === "Escape") cancelEdit();
}
</script>

<template>
  <div class="mapo-media-folders flex h-full flex-col gap-2 py-2">
    <!-- MIME filters -->
    <div class="space-y-0.5 px-2">
      <p
        class="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-dimmed"
      >
        {{ t("mapo.mime") }}
      </p>
      <UButton
        v-for="f in mimeFilters"
        :key="f.mime ?? 'all'"
        variant="ghost"
        color="neutral"
        size="xs"
        block
        :icon="f.icon"
        class="justify-start"
        :class="{ 'bg-elevated': store.mimeType === f.mime }"
        @click="selectMime(f.mime)"
      >
        {{ f.label }}
      </UButton>
    </div>

    <USeparator />

    <!-- Folders header -->
    <div class="flex items-center justify-between px-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
        {{ t("mapo.mediaFolders.folders") }}
      </p>
      <UButton
        icon="i-lucide-folder-plus"
        size="xs"
        variant="ghost"
        color="neutral"
        :title="t('mapo.mediaFolders.newFolder')"
        @click="startCreate"
      />
    </div>

    <!-- New folder input -->
    <div v-if="editingFolder && !editingFolder.id" class="px-2">
      <UInput
        v-model="folderName"
        size="xs"
        :placeholder="t('mapo.mediaFolders.folderName')"
        autofocus
        @keyup="onNameKeyup"
      >
        <template #trailing>
          <UButton
            icon="i-lucide-check"
            size="xs"
            variant="ghost"
            color="primary"
            :loading="saving"
            @click="saveFolder"
          />
        </template>
      </UInput>
    </div>

    <!-- Folder list -->
    <div class="flex-1 overflow-y-auto px-2">
      <div v-for="folder in store.folders" :key="folder.id">
        <!-- Editing this folder -->
        <UInput
          v-if="editingFolder?.id === folder.id"
          v-model="folderName"
          size="xs"
          autofocus
          @keyup="onNameKeyup"
        >
          <template #trailing>
            <UButton
              icon="i-lucide-check"
              size="xs"
              variant="ghost"
              color="primary"
              :loading="saving"
              @click="saveFolder"
            />
          </template>
        </UInput>

        <!-- Folder row -->
        <div
          v-else
          class="group flex items-center gap-1 rounded px-1 py-1 hover:bg-elevated"
        >
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-folder"
            class="flex-1 justify-start truncate"
            @click="store.navigateToFolder(folder)"
          >
            {{ folder.name }}
          </UButton>
          <div class="hidden items-center gap-0.5 group-hover:flex">
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              @click.stop="startEdit(folder)"
            />
            <UButton
              icon="i-lucide-trash-2"
              size="xs"
              variant="ghost"
              color="error"
              @click.stop="store.deleteFolder(folder)"
            />
          </div>
        </div>
      </div>

      <p
        v-if="store.folders.length === 0"
        class="px-2 py-3 text-xs text-dimmed italic"
      >
        {{ t("mapo.mediaFolders.noFolders") }}
      </p>
    </div>

    <!-- Back -->
    <div v-if="store.parentFolder" class="border-t border-default px-2 pt-2">
      <UButton
        icon="i-lucide-arrow-left"
        size="xs"
        variant="ghost"
        color="neutral"
        block
        class="justify-start"
        @click="store.navigateToFolder(null)"
      >
        {{ t("mapo.mediaFolders.goBack") }}
      </UButton>
    </div>
  </div>
</template>
