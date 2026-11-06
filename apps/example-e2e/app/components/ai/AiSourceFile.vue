<script setup lang="ts">
// A file as the AI's source: useMapoAiRead() of @mapomodule/ai sends it to
// POST /_mapo/ai/read, which reads it with the reader of its format and
// answers its text, without calling any AI. Mapo reads text, Markdown, JSON,
// HTML, CSV and XLSX; this app adds calendar events, and takes the lines
// "Internal: …" out of every file (server/plugins/mapo-ai-readers.ts). The
// text goes into the panel's box, where the operator reads it, and edits
// it, before sending it. The sample files are in public/ai-files/.
import type { MapoAiReaderStatus, MapoAiSourcePart } from "mapomodule/types";

defineProps<{
  /** The formats the gateway reads, from `status`. */
  readers?: MapoAiReaderStatus[];
}>();

const emit = defineEmits<{
  /** A file was read: its text for the box, and its parts as `run` takes them. */
  read: [source: { text: string; parts: MapoAiSourcePart[] }];
}>();

/** The files of public/ai-files/, one for each format. */
const SAMPLES = [
  { file: "open-data.md", label: "Markdown" },
  { file: "open-data.html", label: "Web page" },
  { file: "articles.csv", label: "CSV" },
  { file: "articles.xlsx", label: "Excel" },
  { file: "launch.ics", label: "Calendar (the app's reader)" },
];

const { read } = useMapoAiRead();
const input = ref<HTMLInputElement>();
const pending = ref(false);
const outcome = ref<{
  color: "success" | "warning" | "error";
  text: string;
}>();

async function readFile(file: File) {
  pending.value = true;
  outcome.value = undefined;
  try {
    const answer = await read(file);
    if (answer.status === "read") {
      const text = answer.parts.map((part) => part.text).join("\n\n");
      emit("read", { text, parts: answer.parts });
      outcome.value = {
        color: "success",
        text: `${file.name}: read by the reader "${answer.reader}", ${text.length} characters in the box.`,
      };
      return;
    }
    const why = {
      unsupported: "no reader takes this format.",
      empty: "the file holds no text.",
      "too-long":
        "its text is longer than run takes (mapo.ai.limits.maxSourceChars).",
      failed: "its reader could not read it: the server's log says why.",
    };
    outcome.value = {
      color: answer.status === "failed" ? "error" : "warning",
      text: `${file.name}: ${why[answer.status]}`,
    };
  } catch (error) {
    const status = isRecord(error) ? error.statusCode : undefined;
    outcome.value = {
      color: "error",
      text: `${file.name}: the gateway refused it (HTTP ${status ?? "?"}).`,
    };
  } finally {
    pending.value = false;
    if (input.value) input.value.value = "";
  }
}

async function readSample(name: string) {
  const blob = await $fetch<Blob>(`/ai-files/${name}`, {
    responseType: "blob",
  });
  await readFile(new File([blob], name, { type: blob.type }));
}

function onPick(event: Event) {
  const target = event.target;
  const file =
    target instanceof HTMLInputElement ? target.files?.[0] : undefined;
  if (file) void readFile(file);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-1">
      <UButton
        size="xs"
        icon="i-lucide-file-up"
        :loading="pending"
        @click="input?.click()"
      >
        Read a file
      </UButton>
      <input
        ref="input"
        type="file"
        class="hidden"
        :accept="
          (readers ?? [])
            .flatMap((reader) => reader.extensions.map((ext) => `.${ext}`))
            .join(',')
        "
        aria-label="A file for the AI"
        @change="onPick"
      />
      <span class="text-xs text-muted">or a sample:</span>
      <UButton
        v-for="sample in SAMPLES"
        :key="sample.file"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="pending"
        :title="sample.file"
        @click="readSample(sample.file)"
      >
        {{ sample.label }}
      </UButton>
    </div>
    <p v-if="readers?.length" class="text-xs text-muted">
      The gateway reads:
      {{ readers.map((reader) => reader.label ?? reader.id).join(", ") }}.
    </p>
    <UAlert
      v-if="outcome"
      :color="outcome.color"
      variant="subtle"
      :description="outcome.text"
    />
  </div>
</template>
