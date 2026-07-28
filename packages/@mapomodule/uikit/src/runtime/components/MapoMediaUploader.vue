<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { humanFileSize } from "@mapomodule/utils";
import { useMediaStore } from "../stores/media.js";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useRuntimeConfig } from "#app";
import type { MediaUploadPayload } from "../types/media.js";

// USelect items cannot carry `null` values, so the library root uses a sentinel.
const ROOT_FOLDER = -1;

interface UploadEntry {
  file: File;
  title: string;
  alt_text: string;
  description: string;
  folder: number;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  previewUrl?: string;
}

const emit = defineEmits<{
  /** Emitted after at least one file uploaded successfully (legacy parity: the manager switches back to the gallery). */
  uploaded: [];
}>();

const { t } = useI18n();
const store = useMediaStore();
const snack = useSnackStore();

// Configurable size limits via runtimeConfig.public.mapoMedia
const config = useRuntimeConfig();
const mediaConfig = (config.public.mapoMedia ?? {}) as {
  maxImageSize?: number;
  maxVideoSize?: number;
  maxDefaultSize?: number;
};
const MAX_IMAGE = (mediaConfig.maxImageSize ?? 10) * 1024 * 1024;
const MAX_VIDEO = (mediaConfig.maxVideoSize ?? 100) * 1024 * 1024;
const MAX_DEFAULT = (mediaConfig.maxDefaultSize ?? 10) * 1024 * 1024;

const entries = ref<UploadEntry[]>([]);
const uploading = ref(false);

const canUpload = computed(
  () =>
    entries.value.length > 0 &&
    entries.value.some((e) => e.status === "pending"),
);

const pendingCount = computed(
  () => entries.value.filter((e) => e.status === "pending").length,
);

// Destination options: the current folder plus its subfolders (legacy parity).
const folderOptions = computed(() => [
  {
    label: store.parentFolder?.path ?? "/",
    value: store.parentFolder?.id ?? ROOT_FOLDER,
  },
  ...store.folders.map((f) => ({ label: f.path ?? f.name, value: f.id })),
]);

function onFiles(files: File[]) {
  for (const file of files) {
    const limit = file.type.startsWith("image/")
      ? MAX_IMAGE
      : file.type.startsWith("video/")
        ? MAX_VIDEO
        : MAX_DEFAULT;

    if (file.size > limit) {
      snack.show(
        t("mapo.mediaUploader.fileTooLarge", {
          name: file.name,
          max: (limit / (1024 * 1024)).toFixed(0),
        }),
        "error",
      );
      continue;
    }

    const previewUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : undefined;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    entries.value.push({
      file,
      title: baseName,
      alt_text: baseName,
      description: "",
      folder: store.parentFolder?.id ?? ROOT_FOLDER,
      progress: 0,
      status: "pending",
      previewUrl,
    });
  }
}

function remove(index: number) {
  const entry = entries.value[index];
  if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  entries.value.splice(index, 1);
}

async function upload() {
  uploading.value = true;
  let successCount = 0;

  for (const entry of entries.value) {
    if (entry.status !== "pending") continue;
    entry.status = "uploading";
    entry.progress = 0;

    const payload: MediaUploadPayload = {
      file: entry.file,
      title: entry.title || undefined,
      alt_text: entry.alt_text || undefined,
      description: entry.description || undefined,
      folder: entry.folder === ROOT_FOLDER ? null : entry.folder,
    };

    try {
      await store.uploadMedia(payload, (pct) => {
        entry.progress = pct;
      });
      entry.status = "done";
      entry.progress = 100;
      successCount++;
    } catch (err) {
      entry.status = "error";
      entry.error =
        err instanceof Error
          ? err.message
          : t("mapo.mediaUploader.uploadFailed");
    }
  }

  uploading.value = false;

  if (successCount > 0) {
    snack.show(
      t("mapo.mediaUploader.success", { numberFiles: successCount }),
      "success",
    );
    await store.getRoot({ page: 1 });
    // Clean up completed entries
    entries.value = entries.value.filter((e) => e.status !== "done");
    emit("uploaded");
  }
}

function clearAll() {
  entries.value.forEach((e) => {
    if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
  });
  entries.value = [];
}

onUnmounted(clearAll);
</script>

<template>
  <div class="mapo-media-uploader space-y-4">
    <!-- Drop zone -->
    <MapoDropArea accept="*/*" multiple :disabled="uploading" @files="onFiles">
      <template #default="{ triggerPick, isDragging }">
        <div
          class="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors"
          :class="
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-default hover:border-accented'
          "
          @click="triggerPick"
        >
          <UIcon name="i-lucide-upload-cloud" class="size-10 text-dimmed" />
          <div class="text-center">
            <p class="text-sm font-medium text-muted">
              {{ t("mapo.mediaUploader.dragHere") }}
              <span class="text-primary">{{
                t("mapo.mediaUploader.browse")
              }}</span>
            </p>
            <p class="mt-0.5 text-xs text-dimmed">
              {{
                t("mapo.mediaUploader.limits", {
                  img: (MAX_IMAGE / (1024 * 1024)).toFixed(0),
                  vid: (MAX_VIDEO / (1024 * 1024)).toFixed(0),
                })
              }}
            </p>
          </div>
        </div>
      </template>
    </MapoDropArea>

    <!-- File list -->
    <div v-if="entries.length > 0" class="space-y-2">
      <div class="flex items-center justify-between">
        <p class="text-xs font-medium text-muted">
          {{
            t(
              "mapo.mediaUploader.nSelected",
              { n: entries.length },
              entries.length,
            )
          }}
        </p>
        <UButton
          v-if="!uploading"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          @click="clearAll"
        >
          {{ t("mapo.clear") }}
        </UButton>
      </div>

      <div class="space-y-2 max-h-96 overflow-y-auto pr-1">
        <div
          v-for="(entry, i) in entries"
          :key="i"
          class="rounded-lg border p-3 transition-colors"
          :class="{
            'border-success/40 bg-success/10': entry.status === 'done',
            'border-error/40 bg-error/10': entry.status === 'error',
            'border-default':
              entry.status === 'pending' || entry.status === 'uploading',
          }"
        >
          <div class="flex items-start gap-3">
            <!-- Preview -->
            <div class="size-12 shrink-0 overflow-hidden rounded bg-elevated">
              <img
                v-if="entry.previewUrl"
                :src="entry.previewUrl"
                class="size-full object-cover"
                alt=""
              />
              <div v-else class="flex size-full items-center justify-center">
                <UIcon name="i-lucide-file" class="size-6 text-dimmed" />
              </div>
            </div>

            <div class="flex-1 min-w-0 space-y-1.5">
              <!-- Filename + size -->
              <div class="flex items-center gap-2">
                <span class="truncate text-xs font-medium text-default">
                  {{ entry.file.name }}
                </span>
                <span class="shrink-0 text-xs text-dimmed">
                  {{ humanFileSize(entry.file.size) }}
                </span>
              </div>

              <!-- Metadata inputs (only for pending) -->
              <div
                v-if="entry.status === 'pending'"
                class="grid grid-cols-2 gap-1.5"
              >
                <UInput
                  v-model="entry.title"
                  size="xs"
                  :placeholder="t('mapo.title')"
                />
                <UInput
                  v-model="entry.alt_text"
                  size="xs"
                  :placeholder="t('mapo.altTag')"
                />
                <UInput
                  v-model="entry.description"
                  size="xs"
                  :placeholder="t('mapo.description')"
                />
                <USelect
                  v-model="entry.folder"
                  :items="folderOptions"
                  size="xs"
                  :placeholder="t('mapo.folder')"
                />
              </div>

              <!-- Progress bar -->
              <div v-if="entry.status === 'uploading'" class="space-y-0.5">
                <UProgress :model-value="entry.progress" size="xs" />
                <p class="text-right text-xs text-dimmed">
                  {{ entry.progress }}%
                </p>
              </div>

              <!-- Status badges -->
              <div
                v-if="entry.status === 'done'"
                class="flex items-center gap-1 text-success"
              >
                <UIcon name="i-lucide-check-circle" class="size-3.5" />
                <span class="text-xs">{{
                  t("mapo.mediaUploader.uploaded")
                }}</span>
              </div>
              <div
                v-if="entry.status === 'error'"
                class="flex items-center gap-1 text-error"
              >
                <UIcon name="i-lucide-alert-circle" class="size-3.5" />
                <span class="text-xs">{{ entry.error }}</span>
              </div>
            </div>

            <!-- Remove -->
            <UButton
              v-if="
                !uploading ||
                entry.status === 'done' ||
                entry.status === 'error'
              "
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              color="neutral"
              @click="remove(i)"
            />
          </div>
        </div>
      </div>

      <!-- Upload CTA -->
      <div class="flex justify-end pt-2">
        <UButton
          icon="i-lucide-upload"
          :loading="uploading"
          :disabled="!canUpload"
          color="primary"
          @click="upload"
        >
          {{
            t("mapo.mediaUploader.uploadCta", { n: pendingCount }, pendingCount)
          }}
        </UButton>
      </div>
    </div>
  </div>
</template>
