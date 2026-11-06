<script setup lang="ts">
// A detail extension placed in "body-top", above the form: a source for the
// AI, and what became of each field. useMapoAiFill() of @mapomodule/ai does
// the work: it sends the form's fields and the backend's OPTIONS with the
// source to POST /_mapo/ai/run, writes each verified value into an empty
// field and marks the others on their fields (Apply, Restore, Ignore). The
// panel only picks the source and shows the outcome. Nothing is saved until
// Save.
import type {
  MapoAiFillAction,
  MapoAiFillField,
  MapoAiSourcePart,
  MapoAiStatus,
} from "mapomodule/types";
import AiSourceFile from "~/components/ai/AiSourceFile.vue";
import { AI_ARTICLE_SAMPLES } from "#shared/aiArticleSamples";

const detail = useMapoDetail();
const ai = detail
  ? useMapoAiFill(detail, {
      entity: {
        label: "Article",
        description: "An article of the city magazine.",
        // The permission the gateway asks: add_article, or change_article
        // for an article that exists.
        model: "article",
      },
    })
  : undefined;

// What the gateway gives the signed-in user: the provider and its model,
// or `allowed: false` for an account the app keeps out.
const { fetch } = useMapoFetch();
const status = ref<MapoAiStatus>();
onMounted(async () => {
  status.value = await fetch<MapoAiStatus>("/_mapo/ai/status").catch(
    () => undefined,
  );
});

const source = ref(AI_ARTICLE_SAMPLES[0]?.text ?? "");
const instructions = ref("");

// A file read into the box: its parts go to the AI, named after the file,
// as long as the box holds the text read; once edited, the box's text goes.
const fromFile = shallowRef<{ text: string; parts: MapoAiSourcePart[] }>();
function useFile(read: { text: string; parts: MapoAiSourcePart[] }) {
  source.value = read.text;
  fromFile.value = read;
}
const sourceToSend = () =>
  fromFile.value?.text === source.value ? fromFile.value.parts : source.value;

const isAllowed = computed(() => status.value?.allowed !== false);
const canFill = computed(
  () =>
    !!detail &&
    isAllowed.value &&
    source.value.trim() !== "" &&
    !detail.readonly.value &&
    !detail.isBusy.value,
);

const ACTIONS: Record<
  MapoAiFillAction,
  { label: string; color: "success" | "warning" | "info" | "error" | "neutral" }
> = {
  apply: { label: "verified", color: "success" },
  confirm: { label: "to confirm", color: "warning" },
  manual: { label: "to choose", color: "info" },
  discard: { label: "discarded", color: "error" },
  empty: { label: "not given", color: "neutral" },
};

const summary = computed(() => {
  const fields = ai?.fields.value ?? [];
  const applied = fields.filter((field) => field.applied).length;
  const count = (action: MapoAiFillAction) =>
    fields.filter((field) => field.action === action).length;
  return [
    `${applied} in the form`,
    `${count("confirm")} to confirm`,
    `${count("manual")} to choose`,
    `${count("discard")} discarded`,
    `${count("empty")} not given`,
  ].join(" · ");
});

const answer = computed(() => ai?.response.value);
const refusal = computed(() =>
  answer.value?.status === "refused" ? answer.value.refusal : undefined,
);
const isUnreadable = computed(
  () => answer.value?.status === "answered" && !answer.value.result.readable,
);

/** What the list says about a field, besides its action. */
function note(field: MapoAiFillField): string {
  const { outcome } = field;
  if (outcome.status === "discarded") return outcome.reason;
  if (outcome.status !== "filled") return "";
  const proof = outcome.verified ? "quoted" : "no quote proves it";
  const notes = [
    proof,
    ...(field.replaces ? ["replaces a value"] : []),
    ...(field.shown ? [] : ["the field is hidden"]),
  ];
  return notes.join(", ");
}

function fill() {
  void ai?.fill(sourceToSend(), { instructions: instructions.value });
}
</script>

<template>
  <UCard v-if="detail && ai" :ui="{ body: 'space-y-3' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sparkles" class="text-primary" />
          <span class="font-medium">Fill with AI</span>
          <UBadge v-if="status?.default" color="neutral" variant="subtle">
            {{ status.default.provider }} · {{ status.default.models.fill }}
          </UBadge>
        </div>
        <NuxtLink to="/ai/status" class="text-xs text-muted underline">
          What the gateway gives you
        </NuxtLink>
      </div>
    </template>

    <UAlert
      v-if="!isAllowed"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-x"
      title="This app keeps you out of the AI"
      description="server/plugins/mapo-ai-rules.ts refuses the viewer account with the mapo-ai:user hook, so run answers 403."
    />

    <div class="flex flex-wrap gap-1">
      <UButton
        v-for="sample in AI_ARTICLE_SAMPLES"
        :key="sample.label"
        size="xs"
        color="neutral"
        variant="soft"
        :title="sample.description"
        @click="source = sample.text"
      >
        {{ sample.label }}
      </UButton>
    </div>
    <AiSourceFile :readers="status?.readers" @read="useFile" />
    <UTextarea
      v-model="source"
      :rows="8"
      class="w-full"
      :ui="{ base: 'font-mono text-xs' }"
      aria-label="Source for the AI"
    />
    <UInput
      v-model="instructions"
      class="w-full"
      placeholder="Your instructions for this source (optional)"
      aria-label="Your instructions for the AI"
    />

    <div class="flex flex-wrap gap-2">
      <UButton
        icon="i-lucide-sparkles"
        :loading="ai.pending.value"
        :disabled="!canFill"
        @click="fill"
      >
        Fill
      </UButton>
      <UButton
        v-if="ai.pending.value"
        color="neutral"
        variant="soft"
        icon="i-lucide-square"
        @click="ai.cancel()"
      >
        Cancel
      </UButton>
      <UButton
        v-if="ai.fields.value.some((field) => field.applied)"
        color="neutral"
        variant="soft"
        icon="i-lucide-undo-2"
        @click="ai.undo()"
      >
        Undo
      </UButton>
      <UButton
        v-if="ai.fields.value.length"
        color="neutral"
        variant="ghost"
        icon="i-lucide-eraser"
        @click="ai.dismiss()"
      >
        Clear the marks
      </UButton>
    </div>

    <UAlert
      v-if="ai.error.value"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="ai.error.value.message"
      :description="`HTTP ${ai.error.value.status}${ai.error.value.retryAfter ? ` · Retry-After ${ai.error.value.retryAfter} s` : ''}`"
    />
    <UAlert
      v-if="refusal"
      color="warning"
      variant="subtle"
      icon="i-lucide-message-circle-x"
      title="The AI refused"
      :description="refusal"
    />
    <UAlert
      v-if="isUnreadable"
      color="warning"
      variant="subtle"
      icon="i-lucide-file-question"
      title="The answer had not the shape asked"
      description="The gateway read it as empty: no field is filled."
    />

    <div v-if="ai.fields.value.length" class="space-y-1">
      <p class="text-xs text-muted">{{ summary }}</p>
      <ul class="divide-y divide-default text-xs">
        <li
          v-for="field in ai.fields.value"
          :key="field.path"
          class="flex items-center gap-2 py-1"
        >
          <UBadge
            size="sm"
            variant="subtle"
            :color="ACTIONS[field.action].color"
          >
            {{ ACTIONS[field.action].label }}
          </UBadge>
          <code>{{ field.path }}</code>
          <span class="truncate text-muted">{{ note(field) }}</span>
          <UBadge
            v-if="field.applied"
            size="sm"
            color="success"
            variant="outline"
          >
            in the form
          </UBadge>
        </li>
      </ul>
    </div>
    <p v-if="answer" class="text-xs text-muted">
      {{ answer.provider.id }} · {{ answer.provider.model }} · Mapo's base rules
      v{{ answer.prompt }} · {{ answer.usage.inputTokens }} tokens read,
      {{ answer.usage.outputTokens }} written
    </p>
  </UCard>
</template>
