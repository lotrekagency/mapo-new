<script setup lang="ts">
// The AI lab: a detail extension placed in "body-top" that fills the record
// with a local model through the AI gateway, and shows what happens while it
// happens. useMapoAiFill() does the work, as in AiFillPanel.vue, with one of
// the two providers the dev server enables with EXAMPLE_OLLAMA_MODELS:
// Mapo's own `ollama`, or the app's `example-ollama`
// (server/plugins/mapo-ai-ollama.ts). The log puts together the browser's
// steps and the server's, read from /_ai-lab/trace while the call runs: the
// gateway's checks and, from the app's provider, the prompt the gateway
// composed and the model's words as they come. The page passes what the AI should
// know about the record and the sources to offer: the article
// (pages/ai/ollama/[id].vue) and the block page (pages/ai/ollama/blocks/[id].vue).
import type {
  MapoAiFillEntity,
  MapoAiFillField,
  MapoAiSourcePart,
  MapoAiStatus,
} from "mapomodule/types";
import AiLabOutcomes from "~/components/ai/AiLabOutcomes.vue";
import AiSourceFile from "~/components/ai/AiSourceFile.vue";
import type { AiSample } from "#shared/aiArticleSamples";

const props = defineProps<{
  /** What the AI should know about the record. */
  entity: MapoAiFillEntity;
  /** The sources the panel offers, the first in the box. */
  samples: AiSample[];
}>();

/** One step of the server's trace (server/utils/aiLab.ts). */
interface LabEntry {
  at: number;
  who: "gateway" | "provider" | "ollama";
  text: string;
}

/** The server's trace of the last call. */
interface LabTrace {
  id: number;
  startedAt: string;
  entries: LabEntry[];
  prompt?: { version: number; instructions: string; input: string };
  written: string;
  done: boolean;
}

/** A line of the log: when, who, what. */
interface LogLine {
  time: number;
  who: string;
  text: string;
}

/**
 * The lab's providers, Mapo's first: `ollama` reports nothing of its own to
 * the trace, `example-ollama` writes its steps, the prompt and the model's
 * words in it.
 */
const LAB_PROVIDERS = ["ollama", "example-ollama"];
/** How often the page asks the server for its trace while a call runs. */
const TRACE_EVERY_MS = 700;

const detail = useMapoDetail();
const ai = detail ? useMapoAiFill(detail, { entity: props.entity }) : undefined;

// What the gateway gives the signed-in user: the lab's providers, when the
// dev server enabled them.
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
    label: one.id === "ollama" ? "ollama (Mapo's)" : `${one.id} (the app's)`,
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

const browserLines = ref<LogLine[]>([]);
const trace = ref<LabTrace | null>(null);
const traceNote = ref("");
const startedAt = ref(0);
const now = ref(0);
let knownTraceId = 0;
let timer: ReturnType<typeof setInterval> | undefined;
/** The operator stopped waiting: the previous answer stays, and is no news. */
let isCancelled = false;

function say(text: string) {
  browserLines.value = [
    ...browserLines.value,
    { time: Date.now(), who: "browser", text },
  ];
}

/** The browser's lines and the server's, in the order they happened. */
const lines = computed(() => {
  const found = trace.value;
  const base = found ? Date.parse(found.startedAt) : 0;
  const server = (found?.entries ?? []).map((entry) => ({
    time: base + entry.at,
    who: entry.who,
    text: entry.text,
  }));
  return [...browserLines.value, ...server].sort((a, b) => a.time - b.time);
});

const WHO_COLORS: Record<string, "neutral" | "primary" | "info" | "warning"> = {
  browser: "neutral",
  gateway: "primary",
  provider: "info",
  ollama: "warning",
};

function offset(time: number): string {
  return `+${((time - startedAt.value) / 1000).toFixed(1)} s`;
}

function statusCodeOf(error: unknown): number {
  const isObject = typeof error === "object" && error !== null;
  const code = isObject && "statusCode" in error ? error.statusCode : 0;
  return typeof code === "number" ? code : 0;
}

/** The server's trace; a new call's only, told apart by its number. */
async function readTrace(): Promise<void> {
  try {
    const found = await $fetch<LabTrace | null>("/_ai-lab/trace");
    if (found && found.id > knownTraceId) trace.value = found;
  } catch (error) {
    traceNote.value =
      statusCodeOf(error) === 403
        ? "The server's side of the log is for superusers: sign in as admin to see the gateway's steps, the prompt and the model's words."
        : "The server's side of the log cannot be read.";
    stopWatching();
  }
}

function startWatching() {
  stopWatching();
  timer = setInterval(() => {
    now.value = Date.now();
    void readTrace();
  }, TRACE_EVERY_MS);
}

function stopWatching() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

onBeforeUnmount(stopWatching);

async function fill() {
  if (!ai || !canFill.value) return;
  browserLines.value = [];
  trace.value = null;
  traceNote.value = "";
  isCancelled = false;
  // The trace's number before this call, to tell the new one apart.
  const before = await $fetch<LabTrace | null>("/_ai-lab/trace").catch(
    () => null,
  );
  knownTraceId = before?.id ?? 0;
  startedAt.value = Date.now();
  now.value = startedAt.value;
  say(
    `useMapoAiFill() reads the backend's schema (OPTIONS of ${detail?.endpoint.value}/) and the form's fields, and posts them with the source (${source.value.length} characters) to /_mapo/ai/run: provider ${providerId.value}, model ${model.value}`,
  );
  startWatching();
  await ai.fill(sourceToSend(), {
    instructions: instructions.value,
    provider: { id: providerId.value, model: model.value },
  });
  await readTrace();
  stopWatching();
  report();
}

/** What the browser got, and what became of each field. */
function report() {
  if (!ai) return;
  const failure = ai.error.value;
  const answer = ai.response.value;
  if (isCancelled) {
    say(
      "stopped waiting: the gateway still finishes the call, which counts against your limit",
    );
    return;
  }
  if (failure) {
    say(`no answer: ${failure.message} (HTTP ${failure.status})`);
    return;
  }
  if (!answer) return;
  const took = ((Date.now() - startedAt.value) / 1000).toFixed(1);
  const usage = `${answer.usage.inputTokens} tokens read, ${answer.usage.outputTokens} written`;
  if (answer.status === "refused") {
    say(`the model refused, after ${took} s (${usage}): ${answer.refusal}`);
    return;
  }
  const shape = answer.result.readable
    ? ""
    : "an answer without the shape asked, so every field is empty; ";
  say(
    `the gateway answered after ${took} s: ${shape}Mapo's rules v${answer.prompt}, ${usage}`,
  );
  const fields = ai.fields.value;
  const count = (action: MapoAiFillField["action"]) =>
    fields.filter((field) => field.action === action).length;
  say(
    `the plan: ${fields.filter((field) => field.applied).length} values went into the form by themselves, ${count("confirm")} wait for Apply, ${count("manual")} to set by hand, ${count("discard")} discarded, ${count("empty")} not given`,
  );
}

function cancel() {
  isCancelled = true;
  ai?.cancel();
}

// ─── What came back ──────────────────────────────────────────────────────────

const answer = computed(() => ai?.response.value);
const refusal = computed(() =>
  answer.value?.status === "refused" ? answer.value.refusal : undefined,
);
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
          <UIcon name="i-lucide-flask-conical" class="text-primary" />
          <span class="font-medium"
            >AI lab: a local model, through the gateway</span
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
      description="Start Ollama (ollama serve), then the dev server with the models to offer, the first the default: EXAMPLE_OLLAMA_MODELS=gemma4:12b,qwen3.8:27b pnpm dev:example-e2e. Then reload this page."
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
    <p v-if="providerId === 'ollama'" class="text-xs text-muted">
      Mapo's own provider writes nothing to the lab's trace: the log shows the
      browser and the gateway. Choose example-ollama, the app's provider, to
      also see the prompt and the model's words as they come.
    </p>
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

    <div v-if="lines.length || traceNote" class="space-y-2">
      <p class="text-sm font-medium">What happens</p>
      <ol class="space-y-1 text-xs">
        <li v-for="(line, index) in lines" :key="index" class="flex gap-2">
          <span class="w-14 shrink-0 text-right font-mono text-muted">
            {{ offset(line.time) }}
          </span>
          <UBadge
            size="sm"
            variant="subtle"
            class="shrink-0"
            :color="WHO_COLORS[line.who] ?? 'neutral'"
          >
            {{ line.who }}
          </UBadge>
          <span>{{ line.text }}</span>
        </li>
      </ol>
      <p v-if="traceNote" class="text-xs text-muted">{{ traceNote }}</p>
    </div>

    <details v-if="trace?.written" open class="text-xs">
      <summary class="cursor-pointer font-medium">
        What the model writes{{ trace.done ? "" : " (live)" }}
      </summary>
      <pre
        class="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-elevated p-2 font-mono"
        >{{ trace.written }}</pre
      >
    </details>

    <details v-if="trace?.prompt" class="text-xs">
      <summary class="cursor-pointer font-medium">
        The prompt the gateway composed (Mapo's rules v{{
          trace.prompt.version
        }})
      </summary>
      <p class="mt-1 text-muted">
        First part, the same for every request of this app: the rules and the
        record.
      </p>
      <pre
        class="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-elevated p-2 font-mono"
        >{{ trace.prompt.instructions }}</pre
      >
      <p class="mt-1 text-muted">
        Second part: your instructions and the source.
      </p>
      <pre
        class="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-elevated p-2 font-mono"
        >{{ trace.prompt.input }}</pre
      >
    </details>

    <AiLabOutcomes :fields="ai.fields.value" />
    <p v-if="answer" class="text-xs text-muted">
      {{ answer.provider.id }} · {{ answer.provider.model }} ·
      {{ answer.usage.inputTokens }} tokens read,
      {{ answer.usage.outputTokens }} written
    </p>
  </UCard>
</template>
