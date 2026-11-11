<script setup lang="ts">
// A panel of the app's own, placed above the article's form as a detail
// extension (app/pages/articles/own-panel/[id].vue): what a project writes
// when Magic Fill's panel is not the one it wants. useMapoAiFill() of
// @mapomodule/ai does the work: it sends the form's fields and the
// backend's OPTIONS with the source to POST /_mapo/ai/run, writes each
// verified value into an empty field and marks the others on their fields
// (Apply, Keep, Restore, Ignore). useMapoAiRead() reads a file into the box
// (components/AiSourceFile.vue). The panel only picks the source, shows
// what became of each field, and takes the operator to the next value to
// check, with the detail's revealField(). Nothing is saved until Save.
import type {
  MapoAiFillAction,
  MapoAiFillField,
  MapoAiSourcePart,
} from "mapomodule/types";

const detail = useMapoDetail();
const ai = detail
  ? useMapoAiFill(detail, {
      entity: {
        label: "Article",
        description: "An article of the city's magazine.",
        // The permission the gateway asks: add_article, or change_article
        // for an article that exists.
        model: "article",
      },
    })
  : undefined;

// What the gateway gives the signed-in user, asked once for the app.
const { status, refresh } = useMapoAiStatus();
onMounted(refresh);

/** A text to start from, as the operator would paste it. */
const SAMPLE = `Ten years of open data
How the city opened its records to everyone

Milan, 4 November 2026. The city council published its first open dataset in 2016.
Ten years later, more than 400 datasets are online, from bus timetables to air quality.
Reading time: about 6 minutes. Status: in review.`;

/** The files of public/ai-files/ an article can be filled from. */
const SAMPLES = [
  { file: "open-data.md", label: "Markdown" },
  { file: "open-data.html", label: "Web page" },
  { file: "articles.csv", label: "CSV" },
  { file: "articles.xlsx", label: "Excel" },
];

const source = ref(SAMPLE);
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
  unchanged: { label: "already held", color: "neutral" },
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
    `${count("unchanged")} already held`,
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

// "Next to check": the marks that wait for the operator, one after the
// other, each brought into view by the detail (its tab, its group, its
// item), as Magic Fill's banner does.
const lastChecked = ref<string>();
async function nextToCheck() {
  const path = ai?.nextToCheck(lastChecked.value);
  if (!path || !detail?.revealField) return;
  lastChecked.value = path;
  await detail.revealField(path);
}
</script>

<template>
  <UCard v-if="detail && ai" :ui="{ body: 'space-y-3' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sparkles" class="text-primary" />
          <span class="font-medium">The app's own panel</span>
          <UBadge v-if="status?.default" color="neutral" variant="subtle">
            {{ status.default.provider }} · {{ status.default.models.fill }}
          </UBadge>
        </div>
        <NuxtLink to="/" class="text-xs text-muted underline">
          What the gateway gives you
        </NuxtLink>
      </div>
    </template>

    <UAlert
      v-if="!isAllowed"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-x"
      title="The app keeps you out of the AI"
      description="mapo.ai.users, or the app's mapo-ai:user hook, refuses this account: run answers 403."
    />

    <AiSourceFile
      :readers="status?.readers"
      :samples="SAMPLES"
      @read="useFile"
    />
    <UTextarea
      v-model="source"
      :rows="7"
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
        v-if="ai.toCheck.value.length"
        color="neutral"
        variant="soft"
        icon="i-lucide-scan-search"
        @click="nextToCheck"
      >
        Next to check ({{ ai.toCheck.value.length }})
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
