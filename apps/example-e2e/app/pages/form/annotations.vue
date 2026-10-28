<script setup lang="ts">
// Tests: field annotations — marks next to the labels (icon, color, dot,
// popover with description and actions), badges on the tabs, a custom popover
// body, a mark inside a repeater item, a translatable field marked in every
// language or in one, and marks that go away while you type without
// remounting the field; a custom field (SEO title) that reads its own
// annotation with useFieldAnnotation().
// Docs: docs/uikit/form/annotations.md
import type {
  FieldAnnotation,
  FieldAnnotationAction,
  FieldAnnotations,
  FieldDescriptor,
} from "@mapomodule/form/types";
import { getNestedValue } from "@mapomodule/utils";
import ReviewedTextField from "~/components/form/ReviewedTextField.vue";

definePageMeta({
  layout: "mapo-default",
  label: "Field Annotations",
  icon: "i-lucide-sparkles",
  middleware: ["auth"],
});

interface Block {
  title: string;
  text: string;
}

interface Page {
  title: string;
  slug: string;
  subtitle?: string;
  summary: string;
  seo_title: string;
  blocks: Block[];
  translations: Record<string, { subtitle?: string }>;
}

const LANGUAGES = ["it", "en"];
const currentLang = ref("it");

const page = ref<Page>({
  title: "Chi siamo",
  slug: "chi-siamo",
  summary: "Dal 1998 progettiamo spazi pubblici e privati.",
  seo_title: "Chi siamo · Studio Aurora",
  blocks: [
    { title: "La storia", text: "Lo studio nasce a Bologna." },
    { title: "Il metodo", text: "Ascolto, progetto, cantiere." },
  ],
  translations: {
    it: { subtitle: "Lo studio" },
    en: { subtitle: "The studio" },
  },
});

const fields: FieldDescriptor<Page>[] = [
  { key: "title", type: "text", label: "Title", tab: "Content" },
  { key: "slug", type: "text", label: "Slug", tab: "Content" },
  {
    key: "subtitle",
    type: "text",
    label: "Subtitle",
    tab: "Content",
    translatable: true,
  },
  { key: "summary", type: "textarea", label: "Summary", tab: "Content" },
  {
    key: "blocks",
    type: "repeater",
    label: "Blocks",
    tab: "Content",
    fields: [
      { key: "title", type: "text", label: "Title" },
      { key: "text", type: "textarea", label: "Text" },
    ],
  },
  // A custom field that reads its own annotation with useFieldAnnotation().
  {
    key: "seo_title",
    type: "text",
    label: "SEO title",
    tab: "SEO",
    is: ReviewedTextField,
  },
];

// ─── Marks ───────────────────────────────────────────────────────────────────

const annotations = ref<FieldAnnotations>({});

function dismiss(path: string) {
  const { [path]: _dismissed, ...rest } = annotations.value;
  annotations.value = rest;
}

const confirm = (path: string): FieldAnnotationAction => ({
  label: "Confirm",
  icon: "i-lucide-check",
  color: "success",
  onClick: () => dismiss(path),
});

const suggested: FieldAnnotation = {
  label: "Suggested by AI",
  icon: "i-lucide-sparkles",
  color: "info",
};

const toCheck: FieldAnnotation = {
  label: "To check",
  icon: "i-lucide-sparkles",
  color: "warning",
  dot: true,
  description: "No passage of the source supports this value.",
};

function sampleAnnotations(): FieldAnnotations {
  return {
    title: {
      ...suggested,
      description: "From «Chi siamo», page 1.",
      actions: [confirm("title")],
    },
    slug: { ...toCheck, actions: [confirm("slug")] },
    // Every language, unless the current one has a mark of its own.
    subtitle: { ...suggested, description: "Marked in every language." },
    "translations.en.subtitle": { ...toCheck, label: "To check (English)" },
    summary: { ...suggested, actions: [confirm("summary")] },
    "blocks.1.title": { ...suggested, description: "From page 2." },
    seo_title: { ...toCheck, actions: [confirm("seo_title")] },
  };
}

annotations.value = sampleAnnotations();

// A value edited by hand is no longer a suggestion: its mark goes away, and
// the field keeps the focus because the descriptors do not change.
const translatableKeys = new Set(
  fields
    .filter((field) => field.translatable)
    .map((field) => field.key as string),
);

/** The value a mark stands for; a bare translatable key, in the current language. */
function markedValue(model: Page, path: string) {
  const isBareTranslatable = translatableKeys.has(path);
  const valuePath = isBareTranslatable
    ? `translations.${currentLang.value}.${path}`
    : path;
  return getNestedValue(model, valuePath);
}

const snapshot = () => structuredClone(toRaw(page.value));
let marked = snapshot();

function resetMarks() {
  annotations.value = sampleAnnotations();
  marked = snapshot();
}

watch(
  page,
  (current) => {
    for (const path of Object.keys(annotations.value)) {
      const edited = markedValue(marked, path) !== markedValue(current, path);
      if (edited) dismiss(path);
    }
  },
  { deep: true },
);
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Field Annotations</h1>
      <p class="text-muted text-sm mt-1">
        Docs: <code>docs/uikit/form/annotations.md</code>. The article detail
        page has the same marks in a <code>MapoDetail</code> (Annotations demo
        switch).
      </p>
    </div>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="font-semibold text-sm text-highlighted"
            >MapoForm with marks</span
          >
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="lang in LANGUAGES"
              :key="lang"
              :label="lang.toUpperCase()"
              :variant="currentLang === lang ? 'solid' : 'outline'"
              color="neutral"
              size="xs"
              @click="currentLang = lang"
            />
            <UButton
              label="Reset marks"
              icon="i-lucide-rotate-ccw"
              variant="outline"
              color="neutral"
              size="xs"
              @click="resetMarks"
            />
            <UButton
              label="Clear marks"
              icon="i-lucide-eraser"
              variant="outline"
              color="neutral"
              size="xs"
              @click="annotations = {}"
            />
          </div>
        </div>
      </template>

      <p class="text-xs text-muted mb-3">
        Editing a marked value removes its mark, and the field keeps the focus.
        "Confirm" in a popover removes the mark too. Repeater items start
        collapsed: their headers show the marks they hold.
      </p>

      <MapoForm
        v-model="page"
        :fields="fields"
        :languages="LANGUAGES"
        :current-lang="currentLang"
        :annotations="annotations"
      >
        <!-- Custom popover body: the passage the value comes from -->
        <template #field.summary.annotation>
          <blockquote class="border-l-2 border-default pl-2 text-muted">
            «Dal 1998 progettiamo spazi pubblici e privati…» — chi-siamo.pdf,
            page 1
          </blockquote>
        </template>
      </MapoForm>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Marks in the map</span
        >
      </template>
      <pre class="text-xs overflow-auto">{{ Object.keys(annotations) }}</pre>
    </UCard>
  </div>
</template>
