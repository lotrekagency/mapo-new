<script setup lang="ts">
/**
 * The admins' instructions, by task: layer 3 of every prompt, after Mapo's
 * rules and the app's, which win where they disagree. The preview shows
 * the rules the model reads for a task with the instructions as written,
 * before they are saved; it calls no model.
 */
import { ref, shallowRef, watch } from "vue";
import { useSettingsClient } from "../composables/settingsClient";
import type {
  MapoAiPreviewResponse,
  MapoAiSettingsAnswer,
  MapoAiSettingsInput,
  MapoAiTaskInstructions,
} from "../shared/gateway";

const props = defineProps<{
  /** The settings, as the gateway answers them. */
  settings: MapoAiSettingsAnswer;
  /** Saves a change: resolves with why it failed, or nothing. */
  save: (change: MapoAiSettingsInput) => Promise<string | undefined>;
}>();

/** The tasks, in the order the page shows them. */
const TASKS = ["all", "fill", "extract"] as const;
/** Characters of one instruction, as the gateway takes them. */
const MAX_INSTRUCTION = 4000;

const client = useSettingsClient();
const { t } = client;
const draft = ref<MapoAiTaskInstructions>({ all: "", fill: "", extract: "" });
const busy = shallowRef(false);
const notice = shallowRef<{ color: "success" | "error"; text: string }>();
const previewTask = ref<"fill" | "extract">("fill");
const preview = shallowRef<string>();

watch(
  () => props.settings.instructions.admin,
  (admin) => {
    draft.value = { ...admin };
  },
  { immediate: true },
);

const taskItems = [
  { label: t("mapo.ai.settings.behaviour.instructions.fill"), value: "fill" },
  {
    label: t("mapo.ai.settings.behaviour.instructions.extract"),
    value: "extract",
  },
];

/** The app's rules for a task, which come before the admins'. */
function appRules(task: (typeof TASKS)[number]): string {
  const text = props.settings.instructions.app[task];
  return text
    ? t("mapo.ai.settings.behaviour.instructions.app", { text })
    : t("mapo.ai.settings.behaviour.instructions.appNone");
}

async function submit(): Promise<void> {
  busy.value = true;
  const failed = await props.save({ instructions: { ...draft.value } });
  notice.value = failed
    ? { color: "error", text: failed }
    : { color: "success", text: t("mapo.ai.settings.behaviour.saved") };
  busy.value = false;
}

async function showPreview(): Promise<void> {
  busy.value = true;
  try {
    const answer = await client.call<MapoAiPreviewResponse>(
      "/_mapo/ai/settings/preview",
      {
        method: "POST",
        body: { task: previewTask.value, instructions: { ...draft.value } },
      },
    );
    preview.value = answer.text;
  } catch (error) {
    notice.value = { color: "error", text: client.failureOf(error) };
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t("mapo.ai.settings.behaviour.instructions.title") }}
      </h3>
      <p class="text-sm text-muted">
        {{ t("mapo.ai.settings.behaviour.instructions.help") }}
      </p>
    </div>
    <UFormField
      v-for="task in TASKS"
      :key="task"
      :label="t(`mapo.ai.settings.behaviour.instructions.${task}`)"
      :help="appRules(task)"
    >
      <UTextarea
        v-model="draft[task]"
        :rows="3"
        :maxlength="MAX_INSTRUCTION"
        autoresize
        class="w-full"
      />
    </UFormField>
    <div class="flex flex-wrap items-center gap-2">
      <UButton :disabled="busy" @click="submit()">
        {{ t("mapo.ai.settings.behaviour.save") }}
      </UButton>
      <USelect
        v-model="previewTask"
        :items="taskItems"
        :aria-label="t('mapo.ai.settings.behaviour.instructions.previewTask')"
        class="w-48"
      />
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-eye"
        :disabled="busy"
        @click="showPreview()"
      >
        {{ t("mapo.ai.settings.behaviour.instructions.preview") }}
      </UButton>
    </div>
    <UAlert
      v-if="notice"
      :color="notice.color"
      variant="subtle"
      :title="notice.text"
    />
    <div v-if="preview" class="space-y-1">
      <p class="text-xs text-muted">
        {{ t("mapo.ai.settings.behaviour.instructions.previewNote") }}
      </p>
      <div
        class="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-elevated p-3 font-mono text-xs"
        v-text="preview"
      />
    </div>
  </section>
</template>
