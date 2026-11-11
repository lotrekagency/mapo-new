<script setup lang="ts">
/**
 * Magic Fill's panel, sliding in from the right: the source (a pasted
 * text, files read through the gateway's `read`), the operator's
 * instructions, "What I send to the AI", the provider and the model, and
 * Extract. Closing it neither stops nor loses a call: the banner above the
 * form follows it. The button or the banner renders it, and only the first
 * panel mounted on a detail shows: one slideover, whoever renders it.
 */
import { computed, onBeforeUnmount, shallowRef } from "vue";
import {
  joinMagicFill,
  useMapoAiMagicFill,
} from "../composables/useMapoAiMagicFill";
import type {
  MapoAiMagicFillDetail,
  MapoAiMagicFillFile,
  MapoAiMagicFillProblem,
} from "../composables/useMapoAiMagicFill";
import { sourceChars } from "../shared/magicFill";
import type { MapoAiProviderChoice } from "../shared/magicFill";

const props = defineProps<{
  /** The detail it fills: the context of `MapoDetail`, from `useMapoDetail()`. */
  detail: MapoAiMagicFillDetail;
}>();

const magic = useMapoAiMagicFill(props.detail);
const {
  t,
  open,
  text,
  files,
  instructions,
  choice,
  choices,
  status,
  parts,
  problems,
  phase,
} = magic;
const { error } = magic.fill;
const presence = joinMagicFill(magic, "panel");
onBeforeUnmount(presence.leave);
const { isFirst } = presence;

/** The upload stays empty: what the operator chooses goes to Magic Fill's list. */
const NO_FILES: File[] = [];

const limits = computed(() => status.value?.limits);
const readers = computed(() => status.value?.readers ?? []);
const takesFiles = computed(
  () => (limits.value?.maxFileBytes ?? 1) > 0 && readers.value.length > 0,
);
const takesInstructions = computed(
  () => (limits.value?.maxInstructionsChars ?? 1) > 0,
);
const accept = computed(() =>
  readers.value
    .flatMap((reader) => [
      ...reader.extensions.map((extension) => `.${extension}`),
      ...reader.types,
    ])
    .join(","),
);
const filesHint = computed(() =>
  t("mapo.ai.magicFill.filesHint", {
    formats: readers.value
      .map((reader) => reader.label ?? reader.id)
      .join(", "),
    size: sizeText(limits.value?.maxFileBytes ?? 0),
  }),
);
const charsText = computed(() => {
  const n = sourceChars(parts.value);
  const max = limits.value?.maxSourceChars;
  return max === undefined
    ? t("mapo.ai.magicFill.charsNoLimit", { n })
    : t("mapo.ai.magicFill.chars", { n, max });
});
const instructionsText = computed(() =>
  t("mapo.ai.magicFill.chars", {
    n: instructions.value.trim().length,
    max: limits.value?.maxInstructionsChars ?? 0,
  }),
);

/** The id of a choice in the select. */
function keyOf(one: MapoAiProviderChoice): string {
  return `${one.provider}/${one.model}`;
}
const choiceItems = computed(() =>
  choices.value.map((one) => ({
    label: `${one.providerLabel} · ${one.model}`,
    value: keyOf(one),
  })),
);
const choiceKey = computed({
  get: () => (choice.value ? keyOf(choice.value) : undefined),
  set: (key: string | undefined) => {
    choice.value = choices.value.find((one) => keyOf(one) === key);
  },
});

const isRunning = computed(() => phase.value !== "idle");
const canExtract = computed(
  () => problems.value.length === 0 && !isRunning.value,
);
// "Empty" is what every new panel starts as: Extract says it, not a list.
const shownProblems = computed(() =>
  problems.value.filter((problem) => problem.kind !== "empty"),
);
const instructionsOpen = shallowRef(false);
const previewOpen = shallowRef(false);

function problemText(problem: MapoAiMagicFillProblem): string {
  const values =
    "max" in problem
      ? { max: problem.max, chars: "chars" in problem ? problem.chars : 0 }
      : {};
  return t(`mapo.ai.magicFill.problems.${problem.kind}`, values);
}

function fileText(file: MapoAiMagicFillFile): string {
  return t(`mapo.ai.magicFill.fileStates.${file.state}`, {
    n: file.chars ?? 0,
  });
}

function fileIcon(file: MapoAiMagicFillFile): string {
  if (file.state === "reading") return "i-lucide-loader-circle";
  if (file.state === "read") return "i-lucide-file-text";
  return "i-lucide-file-x";
}

/** The files the operator chooses go to Magic Fill; the upload stays empty. */
function onFiles(chosen: File[] | File | null | undefined): void {
  const list = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
  if (list.length) magic.attach(list);
}

function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function close(): void {
  open.value = false;
}
</script>

<template>
  <USlideover
    v-if="isFirst"
    v-model:open="open"
    :title="t('mapo.ai.magicFill.title')"
    :description="t('mapo.ai.magicFill.intro')"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="space-y-5 text-sm">
        <section class="space-y-1">
          <label for="mapo-ai-magic-fill-text" class="font-medium">
            {{ t("mapo.ai.magicFill.text") }}
          </label>
          <UTextarea
            id="mapo-ai-magic-fill-text"
            v-model="text"
            class="w-full"
            :rows="8"
            autoresize
            :maxrows="16"
            :placeholder="t('mapo.ai.magicFill.textPlaceholder')"
          />
          <p class="text-xs text-muted">{{ charsText }}</p>
        </section>

        <section v-if="takesFiles" class="space-y-2">
          <p class="font-medium">{{ t("mapo.ai.magicFill.files") }}</p>
          <UFileUpload
            :model-value="NO_FILES"
            multiple
            :accept="accept"
            :preview="false"
            :label="t('mapo.ai.magicFill.filesLabel')"
            :description="filesHint"
            class="w-full"
            @update:model-value="onFiles"
          />
          <ul v-if="files.length" class="space-y-1">
            <li
              v-for="file in files"
              :key="file.id"
              class="flex items-center gap-2"
            >
              <UIcon
                :name="fileIcon(file)"
                class="size-4 shrink-0"
                :class="
                  file.state === 'reading'
                    ? 'animate-spin motion-reduce:animate-none'
                    : ''
                "
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
              <span
                class="shrink-0 text-xs"
                :class="file.state === 'read' ? 'text-muted' : 'text-error'"
              >
                {{ fileText(file) }}
              </span>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                :aria-label="
                  t('mapo.ai.magicFill.removeFile', { name: file.name })
                "
                @click="magic.detach(file.id)"
              />
            </li>
          </ul>
        </section>

        <UCollapsible v-if="takesInstructions" v-model:open="instructionsOpen">
          <UButton
            color="neutral"
            variant="ghost"
            class="px-0"
            :label="t('mapo.ai.magicFill.instructions')"
            :trailing-icon="
              instructionsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
            "
          />
          <template #content>
            <div class="space-y-1 pt-1">
              <UTextarea
                v-model="instructions"
                class="w-full"
                :rows="3"
                autoresize
                :aria-label="t('mapo.ai.magicFill.instructions')"
              />
              <p class="text-xs text-muted">
                {{ t("mapo.ai.magicFill.instructionsHint") }}
                {{ instructionsText }}
              </p>
            </div>
          </template>
        </UCollapsible>

        <UCollapsible v-model:open="previewOpen">
          <UButton
            color="neutral"
            variant="ghost"
            class="px-0"
            :label="t('mapo.ai.magicFill.whatISend')"
            :trailing-icon="
              previewOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
            "
          />
          <template #content>
            <MapoAiMagicFillPreview class="pt-1" :detail="detail" />
          </template>
        </UCollapsible>

        <section class="space-y-1">
          <label for="mapo-ai-magic-fill-model" class="font-medium">
            {{ t("mapo.ai.magicFill.model") }}
          </label>
          <USelect
            v-if="choiceItems.length > 1"
            id="mapo-ai-magic-fill-model"
            v-model="choiceKey"
            class="w-full"
            :items="choiceItems"
            :aria-label="t('mapo.ai.magicFill.model')"
          />
          <p v-else-if="choice" id="mapo-ai-magic-fill-model">
            {{ choice.providerLabel }} · {{ choice.model }}
          </p>
          <p v-if="choice" class="text-xs text-muted">
            {{
              t("mapo.ai.magicFill.sentTo", { provider: choice.providerLabel })
            }}
          </p>
        </section>

        <ul v-if="shownProblems.length" class="space-y-1 text-error">
          <li v-for="problem in shownProblems" :key="problem.kind">
            {{ problemText(problem) }}
          </li>
        </ul>
        <UAlert
          v-if="error && !isRunning"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="error.message"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('mapo.ai.magicFill.close')"
          @click="close"
        />
        <UButton
          v-if="isRunning"
          color="neutral"
          variant="outline"
          :label="t('mapo.ai.magicFill.cancel')"
          @click="magic.cancel()"
        />
        <UButton
          icon="i-lucide-sparkles"
          :label="t('mapo.ai.magicFill.extract')"
          :loading="isRunning"
          :disabled="!canExtract"
          :title="
            problems.some((problem) => problem.kind === 'empty')
              ? t('mapo.ai.magicFill.problems.empty')
              : undefined
          "
          @click="magic.extract()"
        />
      </div>
    </template>
  </USlideover>
</template>
