<script setup lang="ts">
// The AI lab for cloud models: a detail extension placed in "body-top" that
// fills the record through the AI gateway with Mapo's `openai` or
// `anthropic` provider, and shows what each call took: the time, the tokens
// (those read from or written to the provider's prompt cache among them),
// the model that answered and an estimate of the cost. useMapoAiFill() does
// the work, as in AiFillPanel.vue. The providers are on when the dev server
// has their keys (nuxt.config.ts); the page passes what the AI should know
// about the record and the sources to offer: the article
// (pages/ai/cloud/[id].vue) and the block page
// (pages/ai/cloud/blocks/[id].vue).
import type {
  MapoAiFillEntity,
  MapoAiFillField,
  MapoAiSourcePart,
  MapoAiStatus,
} from "mapomodule/types";
import AiLabOutcomes from "~/components/ai/AiLabOutcomes.vue";
import AiSourceFile from "~/components/ai/AiSourceFile.vue";
import type { AiSample } from "#shared/aiArticleSamples";
import { AI_CLOUD_PRICES_DATE, estimateAiCost } from "#shared/aiCloudPrices";

const props = defineProps<{
  /** What the AI should know about the record. */
  entity: MapoAiFillEntity;
  /** The sources the panel offers, the first in the box. */
  samples: AiSample[];
}>();

/** A line of the log: when, what. */
interface LogLine {
  time: number;
  text: string;
}

/** The lab's providers: Mapo's own, for the clouds of OpenAI and Anthropic. */
const LAB_PROVIDERS = ["openai", "anthropic"];
/** How often the page says how long it has waited. */
const TICK_MS = 500;

const detail = useMapoDetail();
const ai = detail ? useMapoAiFill(detail, { entity: props.entity }) : undefined;

// What the gateway gives the signed-in user: the lab's providers, when the
// dev server has their keys.
const { fetch } = useMapoFetch();
const status = ref<MapoAiStatus>();
const providers = computed(() =>
  LAB_PROVIDERS.flatMap((id) =>
    (status.value?.providers ?? []).filter((one) => one.id === id),
  ),
);
const providerId = ref("");
const lab = computed(() =>
  providers.value.find((one) => one.id === providerId.value),
);
const model = ref("");
onMounted(async () => {
  status.value = await fetch<MapoAiStatus>("/_mapo/ai/status").catch(
    () => undefined,
  );
  providerId.value = providers.value[0]?.id ?? "";
});
// Each provider offers its own models: the first, when the provider changes.
watch(lab, (chosen) => {
  model.value = chosen?.models[0] ?? "";
});
const providerItems = computed(() =>
  providers.value.map((one) => ({
    label: one.label ? `${one.label} (${one.id})` : one.id,
    value: one.id,
  })),
);

const source = ref(props.samples[0]?.text ?? "");
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
    !!lab.value &&
    model.value !== "" &&
    isAllowed.value &&
    source.value.trim() !== "" &&
    !detail.readonly.value &&
    !detail.isBusy.value,
);

// ─── The log ─────────────────────────────────────────────────────────────────

const lines = ref<LogLine[]>([]);
const startedAt = ref(0);
const now = ref(0);
/** The model the call under way asked for: the answer may name another. */
const asked = ref("");
/** The model the answer shown was asked for, kept with it until a new answer. */
const answeredAsked = ref("");
const tookSeconds = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
/** The operator stopped waiting: the previous answer stays, and is no news. */
let isCancelled = false;

function say(text: string) {
  lines.value = [...lines.value, { time: Date.now(), text }];
}

function offset(time: number): string {
  return `+${((time - startedAt.value) / 1000).toFixed(1)} s`;
}

function stopTicking() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

onBeforeUnmount(stopTicking);

async function fill() {
  if (!ai || !canFill.value) return;
  lines.value = [];
  isCancelled = false;
  asked.value = model.value;
  startedAt.value = Date.now();
  now.value = startedAt.value;
  say(
    `useMapoAiFill() reads the backend's schema (OPTIONS of ${detail?.endpoint.value}/) and the form's fields, and posts them with the source (${source.value.length} characters) to /_mapo/ai/run: provider ${providerId.value}, model ${model.value}`,
  );
  timer = setInterval(() => {
    now.value = Date.now();
  }, TICK_MS);
  await ai.fill(sourceToSend(), {
    instructions: instructions.value,
    provider: { id: providerId.value, model: model.value },
  });
  stopTicking();
  tookSeconds.value = (Date.now() - startedAt.value) / 1000;
  // A failed or cancelled call leaves the previous answer: it keeps its own.
  if (!ai.error.value && !isCancelled) answeredAsked.value = asked.value;
  report();
}

/** What the browser got, and what became of each field. */
function report() {
  if (!ai) return;
  const failure = ai.error.value;
  const answer = ai.response.value;
  const took = tookSeconds.value.toFixed(1);
  if (isCancelled) {
    say(
      "stopped waiting: the gateway still finishes the call, which costs and counts against your limit",
    );
    return;
  }
  if (failure) {
    say(
      `no answer after ${took} s: ${failure.message} (HTTP ${failure.status})`,
    );
    return;
  }
  if (!answer) return;
  const answeredBy = answer.provider.model;
  if (answeredBy !== asked.value) {
    say(
      `${asked.value} declined the request, so ${answeredBy} answered it, at its own prices: Anthropic's fallback`,
    );
  }
  if (answer.status === "refused") {
    say(`the model refused, after ${took} s: ${answer.refusal}`);
    return;
  }
  const shape = answer.result.readable
    ? ""
    : "an answer without the shape asked, so every field is empty; ";
  say(
    `the gateway answered after ${took} s: ${shape}Mapo's rules v${answer.prompt}`,
  );
  const fields = ai.fields.value;
  const count = (action: MapoAiFillField["action"]) =>
    fields.filter((field) => field.action === action).length;
  say(
    `the plan: ${fields.filter((field) => field.applied).length} values went into the form by themselves, ${count("confirm")} wait for Apply, ${count("manual")} to set by hand, ${count("unchanged")} already held, ${count("discard")} discarded, ${count("empty")} not given`,
  );
}

function cancel() {
  isCancelled = true;
  ai?.cancel();
}

// ─── The call ────────────────────────────────────────────────────────────────

const answer = computed(() => ai?.response.value);
const refusal = computed(() =>
  answer.value?.status === "refused" ? answer.value.refusal : undefined,
);
/**
 * What the last call took: tokens, the cache's share, and an estimate of
 * the cost. Not while a call waits or after one failed: the answer still
 * held is the previous call's.
 */
const call = computed(() => {
  const found = answer.value;
  const isStale = !!ai?.pending.value || !!ai?.error.value;
  if (!found || isStale) return undefined;
  const { usage } = found;
  const cost = estimateAiCost(found.provider.model, usage);
  const isOtherModel = found.provider.model !== answeredAsked.value;
  // The counts of a fallback add up both attempts, priced here at the
  // price of the model that answered.
  const fallbackNote = isOtherModel
    ? ", both attempts at the price of the model that answered"
    : "";
  return {
    provider: found.provider.id,
    model: found.provider.model,
    isOtherModel,
    read: usage.inputTokens,
    cacheRead: usage.cacheReadTokens ?? 0,
    cacheWrite: usage.cacheWriteTokens ?? 0,
    written: usage.outputTokens,
    cost:
      cost === undefined
        ? "no price for this model in the lab's table"
        : `about $${cost.toFixed(4)} (list prices of ${AI_CLOUD_PRICES_DATE}${fallbackNote})`,
  };
});
const waited = computed(() =>
  ai?.pending.value
    ? ((now.value - startedAt.value) / 1000).toFixed(0)
    : undefined,
);
</script>

<template>
  <UCard v-if="detail && ai" :ui="{ body: 'space-y-3' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-cloud" class="text-primary" />
          <span class="font-medium"
            >AI lab: a cloud model, through the gateway</span
          >
          <UBadge v-if="lab" color="neutral" variant="subtle">
            {{ providerId }} · {{ model }}
          </UBadge>
        </div>
        <NuxtLink to="/ai/status" class="text-xs text-muted underline">
          What the gateway gives you
        </NuxtLink>
      </div>
    </template>

    <UAlert
      v-if="status && !providers.length && isAllowed"
      color="warning"
      variant="subtle"
      icon="i-lucide-power-off"
      title="The lab is off"
      description="Give the dev server a key: NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY, NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY or both, in the environment or in apps/example-e2e/.env. Then restart it and reload this page. Every call costs money."
    />
    <UAlert
      v-if="!isAllowed"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-x"
      title="This app keeps you out of the AI"
      description="server/plugins/mapo-ai-rules.ts refuses the viewer account with the mapo-ai:user hook, so run answers 403."
    />

    <div class="flex flex-wrap items-center gap-2">
      <USelect
        v-if="providers.length"
        v-model="providerId"
        :items="providerItems"
        size="sm"
        class="w-52"
        aria-label="Provider"
      />
      <USelect
        v-if="lab"
        v-model="model"
        :items="lab.models"
        size="sm"
        class="w-48"
        aria-label="Model"
      />
      <UButton
        v-for="sample in samples"
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

    <div class="flex flex-wrap items-center gap-2">
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
        @click="cancel"
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
      <span v-if="waited !== undefined" class="text-xs text-muted">
        waiting for the model: {{ waited }} s
      </span>
    </div>

    <UAlert
      v-if="ai.error.value"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="ai.error.value.message"
      :description="`HTTP ${ai.error.value.status}`"
    />
    <UAlert
      v-if="refusal"
      color="warning"
      variant="subtle"
      icon="i-lucide-message-circle-x"
      title="The model refused"
      :description="refusal"
    />

    <div v-if="lines.length" class="space-y-2">
      <p class="text-sm font-medium">What happens</p>
      <ol class="space-y-1 text-xs">
        <li v-for="(line, index) in lines" :key="index" class="flex gap-2">
          <span class="w-14 shrink-0 text-right font-mono text-muted">
            {{ offset(line.time) }}
          </span>
          <span>{{ line.text }}</span>
        </li>
      </ol>
    </div>

    <dl
      v-if="call"
      class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-elevated p-2 text-xs"
    >
      <dt class="text-muted">Answered by</dt>
      <dd>
        {{ call.provider }} · {{ call.model }}
        <UBadge
          v-if="call.isOtherModel"
          size="sm"
          color="warning"
          variant="subtle"
        >
          fallback for {{ answeredAsked }}
        </UBadge>
      </dd>
      <dt class="text-muted">Time</dt>
      <dd>{{ tookSeconds.toFixed(1) }} s</dd>
      <dt class="text-muted">Tokens read</dt>
      <dd>
        {{ call.read }}
        <span v-if="call.cacheRead">
          · {{ call.cacheRead }} of them from the prompt cache</span
        >
        <span v-if="call.cacheWrite">
          · {{ call.cacheWrite }} written to the prompt cache</span
        >
      </dd>
      <dt class="text-muted">Tokens written</dt>
      <dd>{{ call.written }}, the reasoning included</dd>
      <dt class="text-muted">Cost</dt>
      <dd>{{ call.cost }}</dd>
    </dl>

    <AiLabOutcomes :fields="ai.fields.value" />
  </UCard>
</template>
