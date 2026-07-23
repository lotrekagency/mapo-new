<script setup lang="ts">
/**
 * Media Picker Dialog — demonstrates MapoMediaManagerDialog in all three modes:
 *   - single: selects one MediaItem
 *   - multi:  selects multiple MediaItem[]
 *   - mime filter: only images
 */
import type { MediaItem } from "@mapomodule/uikit/types";

definePageMeta({
  layout: "mapo-default",
  label: "Media Picker",
  icon: "i-lucide-image-plus",
  parent: "media",
  middleware: ["auth"],
});

const singleSelection = ref<MediaItem | null>(null);
const multiSelection = ref<MediaItem[]>([]);
const imageOnlySelection = ref<MediaItem | null>(null);

function onSingleConfirm(selection: MediaItem | MediaItem[]) {
  singleSelection.value = Array.isArray(selection)
    ? (selection[0] ?? null)
    : selection;
}

function onMultiConfirm(selection: MediaItem | MediaItem[]) {
  multiSelection.value = Array.isArray(selection) ? selection : [selection];
}

function onImageConfirm(selection: MediaItem | MediaItem[]) {
  imageOnlySelection.value = Array.isArray(selection)
    ? (selection[0] ?? null)
    : selection;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-6">
    <div>
      <h1 class="text-2xl font-bold">Media Picker Dialog</h1>
      <p class="mt-1 text-sm text-gray-500">
        Demos: single, multi, e filtro per tipo MIME
      </p>
    </div>

    <!-- Single selection -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Single picker</h2>
        <p class="text-sm text-gray-500">
          Seleziona un solo media — emette <code>confirm</code> con
          <code>MediaItem</code>.
        </p>
      </template>

      <div class="flex items-start gap-4">
        <div
          class="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-gray-50"
        >
          <MapoMediaPreview
            v-if="singleSelection"
            :media="singleSelection"
            size="md"
          />
          <UIcon v-else name="i-lucide-image" class="size-8 text-gray-300" />
        </div>

        <div class="flex-1 space-y-2">
          <div v-if="singleSelection" class="text-sm">
            <p class="font-medium">
              {{
                singleSelection.title || singleSelection.file?.split("/").pop()
              }}
            </p>
            <p class="text-gray-400">
              {{ singleSelection.mime_type }} ·
              {{ formatSize(singleSelection.size) }}
            </p>
            <p class="break-all font-mono text-xs text-gray-400">
              {{ singleSelection.file }}
            </p>
          </div>
          <p v-else class="text-sm text-gray-400">Nessun media selezionato</p>

          <div class="flex gap-2">
            <MapoMediaManagerDialog
              selection-mode="single"
              @confirm="onSingleConfirm"
            >
              <template #activator="{ open }">
                <UButton
                  icon="i-lucide-image-plus"
                  variant="soft"
                  color="neutral"
                  @click="open()"
                >
                  {{ singleSelection ? "Cambia media" : "Seleziona media" }}
                </UButton>
              </template>
            </MapoMediaManagerDialog>

            <UButton
              v-if="singleSelection"
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              @click="singleSelection = null"
            />
          </div>
        </div>
      </div>

      <template v-if="singleSelection" #footer>
        <details class="text-xs">
          <summary class="cursor-pointer text-gray-400 hover:text-gray-600">
            Oggetto JSON restituito
          </summary>
          <pre
            class="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800"
            >{{ JSON.stringify(singleSelection, null, 2) }}</pre
          >
        </details>
      </template>
    </UCard>

    <!-- Multi selection -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Multi picker</h2>
        <p class="text-sm text-gray-500">
          Seleziona più media — emette <code>confirm</code> con
          <code>MediaItem[]</code>.
        </p>
      </template>

      <div class="space-y-3">
        <div v-if="multiSelection.length > 0" class="flex flex-wrap gap-2">
          <div v-for="media in multiSelection" :key="media.id" class="relative">
            <MapoMediaPreview :media="media" size="sm" />
          </div>
        </div>
        <p v-else class="text-sm text-gray-400">Nessun media selezionato</p>

        <MapoMediaManagerDialog
          selection-mode="multi"
          @confirm="onMultiConfirm"
        >
          <template #activator="{ open }">
            <UButton
              icon="i-lucide-images"
              variant="soft"
              color="neutral"
              @click="open()"
            >
              Seleziona media ({{ multiSelection.length }} selezionati)
            </UButton>
          </template>
        </MapoMediaManagerDialog>
      </div>
    </UCard>

    <!-- Image only -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Filtro MIME: <code>image/*</code></h2>
        <p class="text-sm text-gray-500">
          Il dialog mostra solo immagini grazie al prop
          <code>mime="image/*"</code>.
        </p>
      </template>

      <div class="flex items-start gap-4">
        <div
          class="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-gray-50"
        >
          <MapoMediaPreview
            v-if="imageOnlySelection"
            :media="imageOnlySelection"
            size="md"
          />
          <UIcon v-else name="i-lucide-image" class="size-8 text-gray-300" />
        </div>

        <div class="space-y-2">
          <p v-if="imageOnlySelection" class="text-sm font-medium">
            {{
              imageOnlySelection.title ||
              imageOnlySelection.file?.split("/").pop()
            }}
          </p>
          <p v-else class="text-sm text-gray-400">
            Nessuna immagine selezionata
          </p>

          <MapoMediaManagerDialog
            selection-mode="single"
            mime="image/*"
            @confirm="onImageConfirm"
          >
            <template #activator="{ open }">
              <UButton
                icon="i-lucide-image-plus"
                variant="soft"
                color="primary"
                @click="open()"
              >
                Seleziona immagine
              </UButton>
            </template>
          </MapoMediaManagerDialog>
        </div>
      </div>
    </UCard>
  </div>
</template>
