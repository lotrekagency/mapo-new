<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRuntimeConfig } from "#app";
import {
  humanFileSize,
  deepClone,
  getNestedValue,
  setNestedValue,
} from "@mapomodule/utils";
import { usePermissions } from "@mapomodule/store/runtime/composables/usePermissions";
import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { getErrorData } from "@mapomodule/core/runtime/utils/fetchError";
import { useMediaStore } from "../stores/media.js";
import { pickLanguage } from "../utils/langInfo.js";
import { describeMediaErrors, pickMetadata } from "../utils/mediaMetadata.js";
import type { MediaItem } from "../types/media.js";

const props = defineProps<{
  /** Overrides the languages read from the endpoint. Rarely needed. */
  languages?: string[];
  /**
   * Language the editor opens on, when it is among the languages. Default: the
   * first one. A `?lang=` in the page URL wins, as in `MapoDetail`.
   */
  defaultLang?: string;
}>();

const { t } = useI18n();
const store = useMediaStore();
const snack = useSnackStore();

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
// Remounts the file changer, clearing the file it shows, once that file is stored.
const fileChangerKey = ref(0);

// The languages actually offered. An explicit prop wins; otherwise the store's
// list: the manager's own, or the media endpoint's OPTIONS metadata, so a host
// page never has to restate what the backend already knows — and a media model
// nobody registered for translation shows no switcher rather than tabs whose
// values it discards.
const activeLangs = computed(() =>
  props.languages?.length ? props.languages : store.activeLanguages,
);

// The language being edited, `""` when media are not translated. There is no
// "untranslated" tab next to the languages: on a backend that translates media
// the plain fields are the active language's columns under another name, and
// Camomilla drops them on write, so every edit goes to a translation.
const currentLang = ref("");
watch(
  activeLangs,
  (langs) => {
    const isOffered = langs.includes(currentLang.value);
    if (isOffered) return;
    currentLang.value = pickLanguage(
      langs,
      props.defaultLang ?? store.initialLanguage,
    );
  },
  { immediate: true },
);

onMounted(() => {
  store.deriveLanguages();
});
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
    {
      label: t("mapo.file"),
      value: m.file?.split("/").pop() ?? "",
      isUrl: false,
    },
    { label: t("mapo.mime"), value: m.mime_type, isUrl: false },
    {
      label: t("mapo.size"),
      value: m.size ? humanFileSize(m.size) : "—",
      isUrl: false,
    },
    { label: t("mapo.created"), value: formatDate(m.created), isUrl: false },
    { label: t("mapo.url"), value: m.file, isUrl: true },
  ];
});

const editFields = computed(() => {
  const lang = currentLang.value;
  const prefix = lang ? `translations.${lang}.` : "";
  return [
    { path: `${prefix}title`, label: t("mapo.title"), type: "text" },
    { path: `${prefix}alt_text`, label: t("mapo.altTag"), type: "text" },
    {
      path: `${prefix}description`,
      label: t("mapo.description"),
      type: "textarea",
    },
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

// Field labels for the error toast, keyed like the backend reports the fields.
const errorLabels = computed(() => ({
  title: t("mapo.title"),
  alt_text: t("mapo.altTag"),
  description: t("mapo.description"),
  file: t("mapo.file"),
}));

function notifySaveError(error: unknown) {
  const lines = describeMediaErrors(getErrorData(error), errorLabels.value);
  snack.show(lines.join("\n") || t("mapo.genericError"), "error");
}

async function save() {
  if (!media.value) return;
  saving.value = true;
  // Snapshot the edited metadata BEFORE replacing the file: replaceFile
  // syncs editMedia with the server response, which would otherwise
  // silently discard the user's unsaved title/alt/description edits.
  const edited = { ...media.value };
  try {
    if (newFile.value) {
      const replaced = await store.replaceFile(
        edited.id,
        newFile.value,
        maintainUrl.value,
      );
      // The file is stored: a retry after a failed metadata save must not
      // upload it again, and the form keeps the edits over the server copy.
      newFile.value = null;
      maintainUrl.value = false;
      fileChangerKey.value++;
      store.editMedia = { ...replaced, ...pickMetadata(edited) };
    }
    await store.updateMedia(edited, editSnapshot ?? undefined);
    editSnapshot = null;
    editing.value = false;
    newFile.value = null;
    maintainUrl.value = false;
  } catch (error) {
    // Stay in edit mode with the edits on screen, so they can be fixed.
    notifySaveError(error);
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
            {{ t("mapo.edit") }}
          </UButton>
          <UButton
            icon="i-lucide-external-link"
            size="xs"
            variant="ghost"
            color="neutral"
            :href="media.file"
            target="_blank"
            :title="t('mapo.mediaEditor.openInNewTab')"
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
              {{ t("mapo.mediaEditor.details") }}
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
                {{ t("mapo.linkedModels") }}
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
            <!-- Lang switch: the one MapoDetail and the menu manager use, so
                 an app that replaces it (MapoOverride) replaces it here too.
                 The drawer has no route of its own: the URL stays as it is. -->
            <MapoDetailLangSwitch
              v-if="activeLangs.length > 1"
              v-model="currentLang"
              :langs="activeLangs"
              no-route-change
            />

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
              :key="fileChangerKey"
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
            {{ t("mapo.delete") }}
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
              {{ t("mapo.cancel") }}
            </UButton>
            <UButton
              v-if="editing"
              size="sm"
              color="primary"
              :loading="saving"
              icon="i-lucide-save"
              @click="save"
            >
              {{ t("mapo.save") }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
