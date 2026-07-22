<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRuntimeConfig } from "#app";
import {
  humanFileSize,
  deepClone,
  getNestedValue,
  setNestedValue,
} from "@mapomodule/utils";
import { usePermissions } from "@mapomodule/store/runtime/composables/usePermissions";
import { useMediaStore } from "../stores/media.js";
import type { MediaItem } from "../types/media.js";

defineProps<{
  languages?: string[];
  defaultLang?: string;
}>();

const store = useMediaStore();

// Model-permission gating (legacy parity): edit/delete only with the
// change/delete permission on the configured media model.
const runtimeConfig = useRuntimeConfig();
const permissionsModel =
  ((runtimeConfig.public.mapoMedia ?? {}) as { permissionsModel?: string })
    .permissionsModel ?? "media";
const { canChange, canDelete } = usePermissions();
const canEdit = computed(() => canChange(permissionsModel));
const canRemove = computed(() => canDelete(permissionsModel));

const editing = ref(false);
const saving = ref(false);
const newFile = ref<File | null>(null);
const maintainUrl = ref(false);
const currentLang = ref("");
// Pristine copy taken when entering edit mode, restored on Cancel — the form
// mutates store.editMedia directly, so without this Cancel would leave the
// unsaved edits visible in the info panel (legacy used deepClone the same way).
let editSnapshot: MediaItem | null = null;

const media = computed(() => store.editMedia);

// Reset the edit session only when a DIFFERENT media is opened. Watching the
// object itself would fire on every keystroke: setFieldValue reassigns
// store.editMedia (setNestedValue is immutable) and would close the form.
watch(
  () => store.editMedia?.id,
  (id, oldId) => {
    if (id != null && id !== oldId) {
      editing.value = false;
      newFile.value = null;
      maintainUrl.value = false;
      editSnapshot = null;
    }
  },
);

const metaRows = computed(() => {
  if (!media.value) return [];
  const m = media.value;
  return [
    { label: "File", value: m.file?.split("/").pop() ?? "", isUrl: false },
    { label: "MIME", value: m.mime_type, isUrl: false },
    {
      label: "Size",
      value: m.size ? humanFileSize(m.size) : "—",
      isUrl: false,
    },
    { label: "Created", value: formatDate(m.created), isUrl: false },
    { label: "URL", value: m.file, isUrl: true },
  ];
});

const editFields = computed(() => {
  const lang = currentLang.value;
  const prefix = lang ? `translations.${lang}.` : "";
  return [
    { path: `${prefix}title`, label: "Title", type: "text" },
    { path: `${prefix}alt_text`, label: "Alt text", type: "text" },
    { path: `${prefix}description`, label: "Description", type: "textarea" },
  ];
});

function getFieldValue(path: string): string {
  if (!media.value) return "";
  return (
    (getNestedValue(
      media.value as unknown as Record<string, unknown>,
      path,
    ) as string) ?? ""
  );
}

function setFieldValue(path: string, value: string) {
  if (!media.value) return;
  store.editMedia = setNestedValue(
    media.value as unknown as Record<string, unknown>,
    path,
    value,
  ) as unknown as MediaItem;
}

function startEditing() {
  editSnapshot = media.value ? deepClone(media.value) : null;
  editing.value = true;
}

function cancelEditing() {
  if (editSnapshot) store.editMedia = editSnapshot;
  editSnapshot = null;
  editing.value = false;
  newFile.value = null;
}

async function save() {
  if (!media.value) return;
  saving.value = true;
  try {
    // Snapshot the edited metadata BEFORE replacing the file: replaceFile
    // syncs editMedia with the server response, which would otherwise
    // silently discard the user's unsaved title/alt/description edits.
    const edited = { ...media.value };
    if (newFile.value) {
      await store.replaceFile(edited.id, newFile.value, maintainUrl.value);
    }
    await store.updateMedia(edited);
    editSnapshot = null;
    editing.value = false;
    newFile.value = null;
    maintainUrl.value = false;
  } finally {
    saving.value = false;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
</script>

<template>
  <USlideover
    :open="!!media"
    side="right"
    class="mapo-media-editor"
    :ui="{ content: 'max-w-md w-full' }"
    @update:open="!$event && store.closeEditor()"
  >
    <!-- #content: the default slot is the trigger in Nuxt UI v4 -->
    <template #content>
      <div v-if="media" class="flex h-full flex-col">
        <!-- Header -->
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="store.closeEditor()"
          />
          <p class="flex-1 truncate text-sm font-semibold text-highlighted">
            {{ media.title || media.file?.split("/").pop() }}
          </p>
          <UButton
            v-if="!editing && canEdit"
            icon="i-lucide-pencil"
            size="xs"
            variant="soft"
            color="neutral"
            @click="startEditing"
          >
            Edit
          </UButton>
          <UButton
            icon="i-lucide-external-link"
            size="xs"
            variant="ghost"
            color="neutral"
            :href="media.file"
            target="_blank"
            title="Open in new tab"
          />
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- Preview -->
          <div class="flex justify-center bg-elevated p-4">
            <MapoMediaPreview :media="media" size="lg" contain />
          </div>

          <!-- Metadata table -->
          <div class="border-b border-default px-4 py-3">
            <p
              class="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed"
            >
              Info
            </p>
            <dl class="space-y-1">
              <div
                v-for="row in metaRows"
                :key="row.label"
                class="flex gap-2 text-xs"
              >
                <dt class="w-24 shrink-0 text-dimmed">
                  {{ row.label }}
                </dt>
                <dd class="flex-1 truncate font-mono text-default">
                  <a
                    v-if="row.isUrl"
                    :href="row.value"
                    target="_blank"
                    rel="noopener"
                    class="text-primary hover:underline"
                    >{{ row.value }}</a
                  >
                  <span v-else>{{ row.value }}</span>
                </dd>
              </div>
            </dl>

            <!-- Linked models (Camomilla `links`) -->
            <div v-if="media.links?.length" class="mt-3">
              <p
                class="mb-1 text-xs font-semibold uppercase tracking-wide text-dimmed"
              >
                Linked models
              </p>
              <ul class="space-y-0.5 text-xs text-muted">
                <li
                  v-for="link in media.links"
                  :key="`${link.model}-${link.id}`"
                >
                  <b>{{ link.model }} (id: {{ link.id }})</b> — {{ link.name }}
                </li>
              </ul>
            </div>
          </div>

          <!-- Edit form (shown when editing) -->
          <div v-if="editing" class="space-y-4 px-4 py-3">
            <!-- Lang switch -->
            <UFieldGroup v-if="languages && languages.length > 1" size="xs">
              <UButton
                :variant="currentLang === '' ? 'solid' : 'outline'"
                color="neutral"
                @click="currentLang = ''"
              >
                Default
              </UButton>
              <UButton
                v-for="lang in languages"
                :key="lang"
                :variant="currentLang === lang ? 'solid' : 'outline'"
                color="neutral"
                @click="currentLang = lang"
              >
                {{ lang.toUpperCase() }}
              </UButton>
            </UFieldGroup>

            <!-- Field inputs -->
            <div class="space-y-3">
              <UFormField
                v-for="field in editFields"
                :key="field.path"
                :label="field.label"
                size="sm"
              >
                <UTextarea
                  v-if="field.type === 'textarea'"
                  :model-value="getFieldValue(field.path)"
                  :rows="2"
                  class="w-full"
                  @update:model-value="setFieldValue(field.path, $event)"
                />
                <UInput
                  v-else
                  :model-value="getFieldValue(field.path)"
                  class="w-full"
                  @update:model-value="setFieldValue(field.path, $event)"
                />
              </UFormField>
            </div>

            <!-- File replace -->
            <MapoMediaFileChanger
              :media="media"
              @update:file="newFile = $event"
              @update:maintain-url="maintainUrl = $event"
            />
          </div>
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-between gap-2 border-t border-default px-4 py-3"
        >
          <UButton
            v-if="canRemove"
            icon="i-lucide-trash-2"
            size="sm"
            variant="soft"
            color="error"
            @click="store.deleteMedia(media)"
          >
            Delete
          </UButton>
          <span v-else />

          <div class="flex gap-2">
            <UButton
              v-if="editing"
              size="sm"
              variant="ghost"
              color="neutral"
              @click="cancelEditing"
            >
              Cancel
            </UButton>
            <UButton
              v-if="editing"
              size="sm"
              color="primary"
              :loading="saving"
              icon="i-lucide-save"
              @click="save"
            >
              Save
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
