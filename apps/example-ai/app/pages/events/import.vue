<script setup lang="ts">
// Import with AI: every event a source describes, found with one call of
// the gateway's `run` and its task `extract` (docs/modules/ai.md, "Ask the
// AI"). The source is a programme pasted in the box, or a file read with
// useMapoAiRead() (a CSV or a web page of public/ai-files/). The page sends
// what an event is (its fields, as mapoAiFieldsSchema() writes them, with
// the descriptors' `ai`: the summary's hint), the venues for the AI to pick
// from (`relationChoices`) and the language of the summaries; the gateway
// checks each value of each event against the source, as it does for Magic
// Fill: verified by a quote, to check, or discarded with its reason. The
// gateway never writes to the backend: nothing is created until the
// operator ticks the events and confirms, and each becomes a draft, to
// finish on its own page, where Magic Fill can complete it.
// `model: "event"` asks the user's add_event, as Save would.
import type {
  AiFieldOutcome,
  MapoAiRunRequest,
  MapoAiRunResponse,
  MapoAiSourcePart,
} from "mapomodule/types";
import { EVENT_IMPORT_FIELDS, EVENT_LANGUAGES } from "~/utils/eventForm";

definePageMeta({
  layout: "mapo-default",
  label: "Import events",
  icon: "i-lucide-file-input",
  parent: "/events",
  middleware: ["auth"],
});

/** The programmes of public/ai-files/: a table and a web page. */
const SAMPLES = [
  { file: "programme.csv", label: "Programme (CSV)" },
  { file: "programme.html", label: "Library week (web page)" },
];

/** The columns of the table, in the order of a programme. */
const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "starts_on", label: "Date" },
  { key: "starts_at", label: "Starts" },
  { key: "ends_at", label: "Ends" },
  { key: "venue", label: "Venue" },
  { key: "price", label: "Price" },
  { key: "online", label: "Online" },
  { key: "summary", label: "Summary" },
] as const;

/** A venue, as /api/venues lists it. */
interface Venue {
  id: number;
  name: string;
}

/** An event the answer describes, as the table shows it. */
interface FoundEvent {
  /** Its place in the answer. */
  index: number;
  fields: Record<string, AiFieldOutcome>;
}

const { fetch } = useMapoFetch();
const { status, refresh } = useMapoAiStatus();
const confirm = useConfirmStore();

const venues = ref<Venue[]>([]);
onMounted(async () => {
  void refresh();
  const answer = await fetch<{ results: Venue[] }>("/api/venues").catch(
    () => undefined,
  );
  venues.value = answer?.results ?? [];
});

// ── The source ─────────────────────────────────────────────────────────────

const source = ref("");
const instructions = ref("");
const language = ref(EVENT_LANGUAGES[0] ?? "en");

// A file read into the box: its parts go to the AI, named after the file,
// as long as the box holds the text read; once edited, the box's text goes.
const fromFile = shallowRef<{ text: string; parts: MapoAiSourcePart[] }>();
function useFile(read: { text: string; parts: MapoAiSourcePart[] }) {
  source.value = read.text;
  fromFile.value = read;
}
function partsToSend(): MapoAiSourcePart[] {
  const isFileText = fromFile.value?.text === source.value;
  if (isFileText && fromFile.value) return fromFile.value.parts;
  return [{ kind: "text", text: source.value }];
}

// ── The model ──────────────────────────────────────────────────────────────

/**
 * The models the user may call: those of the providers that have a key,
 * or need none. "provider · model", the app's default first.
 */
const models = computed(() => {
  const providers = status.value?.providers ?? [];
  const callable = providers.filter((provider) => {
    const hasNoKey = provider.key?.level === "none";
    return !(hasNoKey && provider.key?.required === true);
  });
  return callable.flatMap((provider) =>
    provider.models.map((model) => ({
      label: `${provider.label ?? provider.id} · ${model}`,
      value: `${provider.id}\u0000${model}`,
    })),
  );
});
const chosen = ref<string>();
watchEffect(() => {
  const isListed = models.value.some((one) => one.value === chosen.value);
  if (isListed) return;
  const preferred = status.value?.default;
  const fallback = models.value[0]?.value;
  chosen.value = preferred
    ? `${preferred.provider}\u0000${preferred.models.extract}`
    : fallback;
});

// ── The call ───────────────────────────────────────────────────────────────

const pending = ref(false);
const failure = ref<string>();
const refusal = ref<string>();
const answer = shallowRef<MapoAiRunResponse>();
const found = ref<FoundEvent[]>([]);
const ticked = ref<number[]>([]);
const creating = ref(false);
const created = ref<{ title: string; id?: number; error?: string }[]>([]);
let controller: AbortController | undefined;

const canFind = computed(
  () =>
    status.value?.allowed === true &&
    models.value.length > 0 &&
    source.value.trim() !== "" &&
    !pending.value,
);

async function find() {
  const [id, model] = (chosen.value ?? "").split("\u0000");
  const body: MapoAiRunRequest = {
    task: "extract",
    entities: [
      {
        type: "event",
        label: "Event",
        description:
          "An event of the city's culture office: a talk, a concert, a show, a visit.",
        fields: mapoAiFieldsSchema(EVENT_IMPORT_FIELDS),
        endpoint: "/api/events/",
        model: "event",
        // Six venues: the AI picks one by its id, as Magic Fill lets it.
        relationChoices: {
          venue: venues.value.map((venue) => ({
            value: venue.id,
            label: venue.name,
          })),
        },
      },
    ],
    language: language.value,
    parts: partsToSend(),
    ...(instructions.value.trim()
      ? { instructions: instructions.value.trim() }
      : {}),
    ...(id && model ? { provider: { id, model } } : {}),
  };
  controller = new AbortController();
  pending.value = true;
  failure.value = undefined;
  refusal.value = undefined;
  answer.value = undefined;
  found.value = [];
  ticked.value = [];
  created.value = [];
  try {
    const response = await fetch<MapoAiRunResponse>("/_mapo/ai/run", {
      method: "POST",
      body,
      signal: controller.signal,
    });
    answer.value = response;
    if (response.status === "refused") {
      refusal.value = response.refusal;
      return;
    }
    if (response.task !== "extract") return;
    found.value = response.result.items
      .filter((item) => item.type === "event")
      .map((item, index) => ({ index, fields: item.fields }));
  } catch (error) {
    if (controller.signal.aborted) return;
    failure.value = failureText(error);
    // A key or a model taken away while the page was open: ask again.
    void refresh();
  } finally {
    pending.value = false;
    controller = undefined;
  }
}

function cancel() {
  controller?.abort();
}

/** The reasons `run` gives a refusal before it calls a provider. */
const REASONS: Record<string, string> = {
  "no-key":
    "No key reaches this provider for you: an admin assigns one on the AI settings page.",
  "no-provider": "The app enables no provider you may call.",
  "provider-off": "This provider is not given to you any more.",
  "model-off": "This model is not given to you any more.",
};

/** A failed call, for the operator: the gateway's status and words. */
function failureText(error: unknown): string {
  if (!isRecord(error)) return "The gateway did not answer.";
  const body = isRecord(error.data) ? error.data : {};
  const data = isRecord(body.data) ? body.data : {};
  const reason = typeof data.reason === "string" ? REASONS[data.reason] : "";
  const words =
    typeof body.statusMessage === "string" ? body.statusMessage : "";
  const code = typeof error.statusCode === "number" ? error.statusCode : "?";
  return `${String(code)}: ${reason || words || "the call failed."}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── The table ──────────────────────────────────────────────────────────────

/** What a cell shows: the value, and what the gateway says of it. */
function cellOf(outcome: AiFieldOutcome | undefined, key: string) {
  if (!outcome || outcome.status === "empty") {
    return { text: "—", badge: undefined, quotes: "" };
  }
  if (outcome.status === "discarded") {
    return {
      text: String(outcome.proposed ?? ""),
      badge: { label: outcome.reason, color: "error" as const },
      quotes: quotesOf(outcome.quotes),
    };
  }
  return {
    text: textOf(key, writableOf(key, outcome.value)),
    badge: outcome.verified
      ? { label: "verified", color: "success" as const }
      : { label: "to check", color: "warning" as const },
    quotes: quotesOf(outcome.quotes),
  };
}

function quotesOf(quotes: { quote: string; found: boolean }[]): string {
  return quotes
    .map((one) => `“${one.quote}”${one.found ? "" : " (not in the source)"}`)
    .join("\n");
}

/** A value as the backend takes it: a venue by its id. */
function writableOf(key: string, value: unknown): unknown {
  if (key === "venue" && isRecord(value) && "id" in value) return value.id;
  return value;
}

function textOf(key: string, value: unknown): string {
  if (key === "venue") {
    const venue = venues.value.find((one) => one.id === Number(value));
    return venue?.name ?? String(value);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value ?? "");
}

/** An event the backend takes: one with a title. */
function canCreate(event: FoundEvent): boolean {
  return event.fields.title?.status === "filled";
}

/** The table's rows: each event, and a cell for each column. */
const rows = computed(() =>
  found.value.map((event) => ({
    event,
    cells: COLUMNS.map((column) => ({
      key: column.key,
      ...cellOf(event.fields[column.key], column.key),
    })),
  })),
);

function tick(index: number, on: boolean | "indeterminate") {
  const others = ticked.value.filter((one) => one !== index);
  ticked.value = on === true ? [...others, index] : others;
}

/** An event's title, as the answer gives it. */
function titleOf(event: FoundEvent): string {
  const outcome = event.fields.title;
  return outcome?.status === "filled" ? String(outcome.value) : "";
}

// ── Creating the events ────────────────────────────────────────────────────

/** The body of a new event: the values found, the summary in its language, a draft. */
function bodyOf(event: FoundEvent): Record<string, unknown> {
  const body: Record<string, unknown> = { status: "draft" };
  for (const [key, outcome] of Object.entries(event.fields)) {
    if (outcome.status !== "filled") continue;
    const value = writableOf(key, outcome.value);
    if (key === "summary") {
      body.translations = { [language.value]: { summary: value } };
    } else body[key] = value;
  }
  return body;
}

async function createTicked() {
  const events = found.value.filter((one) => ticked.value.includes(one.index));
  const toCheck = events
    .flatMap((one) => Object.values(one.fields))
    .filter((outcome) => outcome.status === "filled" && !outcome.verified);
  const ok = await confirm.ask({
    title: "Create the events",
    message: `${events.length} events will be created as drafts, with the values shown: ${toCheck.length} of them have no quote that proves them. Check each event on its page.`,
    confirmText: "Create",
  });
  if (!ok) return;
  creating.value = true;
  created.value = [];
  for (const event of events) {
    const title = titleOf(event);
    try {
      const saved = await fetch<{ id: number }>("/api/events/", {
        method: "POST",
        body: bodyOf(event),
      });
      created.value.push({ title, id: saved.id });
    } catch (error) {
      const data =
        isRecord(error) && isRecord(error.data) ? error.data : undefined;
      created.value.push({
        title,
        error: data ? JSON.stringify(data) : "The backend refused it.",
      });
    }
  }
  ticked.value = [];
  creating.value = false;
}
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-file-input"
      title="Import events with AI"
      description="Paste a programme, or read a file, and the AI finds every event it describes: one call of run, with the task extract. Each value says whether a quote of the source proves it. Tick the events to create: they become drafts, to finish on their own page."
    />

    <UAlert
      v-if="status && !status.allowed"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-x"
      title="The app keeps this account out of the AI"
    />
    <UAlert
      v-else-if="status && !models.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-key-round"
      title="No model can be called for you"
      description="Every provider needs a key that no level gives you: an admin assigns one on the AI settings page."
    />

    <UCard :ui="{ body: 'space-y-3' }">
      <AiSourceFile
        :readers="status?.readers"
        :samples="SAMPLES"
        @read="useFile"
      />
      <UTextarea
        v-model="source"
        :rows="8"
        class="w-full"
        :ui="{ base: 'font-mono text-xs' }"
        placeholder="A programme: the events, their dates, times, venues and prices."
        aria-label="The source of the events"
      />
      <div class="grid gap-2 md:grid-cols-3">
        <UInput
          v-model="instructions"
          placeholder="Your instructions, such as: only the events in November"
          aria-label="Your instructions for the AI"
        />
        <USelect
          v-model="language"
          :items="EVENT_LANGUAGES"
          aria-label="The language of the summaries"
        />
        <USelect
          v-model="chosen"
          :items="models"
          :disabled="!models.length"
          aria-label="The model"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-sparkles"
          :loading="pending"
          :disabled="!canFind"
          @click="find"
        >
          Find the events
        </UButton>
        <UButton
          v-if="pending"
          color="neutral"
          variant="soft"
          icon="i-lucide-square"
          @click="cancel"
        >
          Cancel
        </UButton>
      </div>
    </UCard>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="failure"
    />
    <UAlert
      v-if="refusal"
      color="warning"
      variant="subtle"
      icon="i-lucide-message-circle-x"
      title="The AI refused"
      :description="refusal"
    />

    <UCard v-if="answer?.status === 'answered'" :ui="{ body: 'space-y-3' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">Events found: {{ found.length }}</span>
          <span class="text-xs text-muted">
            {{ answer.provider.id }} · {{ answer.provider.model }} ·
            {{ answer.usage.inputTokens }} tokens read,
            {{ answer.usage.outputTokens }} written
          </span>
        </div>
      </template>

      <p v-if="!found.length" class="text-sm text-muted">
        The answer describes no event.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-muted">
              <th class="p-1">Create</th>
              <th v-for="column in COLUMNS" :key="column.key" class="p-1">
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="row in rows" :key="row.event.index">
              <td class="p-1">
                <UCheckbox
                  :model-value="ticked.includes(row.event.index)"
                  :disabled="!canCreate(row.event)"
                  :aria-label="`Create the event ${row.event.index + 1}`"
                  @update:model-value="tick(row.event.index, $event)"
                />
              </td>
              <td
                v-for="cell in row.cells"
                :key="cell.key"
                class="p-1 align-top"
                :title="cell.quotes"
              >
                <div>{{ cell.text }}</div>
                <UBadge
                  v-if="cell.badge"
                  size="sm"
                  variant="subtle"
                  :color="cell.badge.color"
                >
                  {{ cell.badge.label }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted">
        A value's quotes show when the pointer rests on it. An event without a
        title cannot be created.
      </p>
      <UButton
        icon="i-lucide-plus"
        :loading="creating"
        :disabled="!ticked.length"
        @click="createTicked"
      >
        Create selected ({{ ticked.length }})
      </UButton>
    </UCard>

    <UCard v-if="created.length" :ui="{ body: 'space-y-1' }">
      <template #header>
        <span class="font-medium">Created as drafts</span>
      </template>
      <p v-for="(one, index) in created" :key="index" class="text-sm">
        <NuxtLink
          v-if="one.id"
          :to="`/events/${one.id}`"
          class="text-primary underline"
        >
          {{ one.title }}
        </NuxtLink>
        <span v-else class="text-error">{{ one.title }}: {{ one.error }}</span>
      </p>
    </UCard>
  </div>
</template>
