<script setup lang="ts">
// Tests: field expand toggle — expandable: true shows an expand icon on the field,
// clicking it opens the field in a larger modal/full-width view, edits in both compact
// and expanded views are preserved in the model, validation errors visible in both states,
// Esc to collapse, aria-expanded attribute present.
// E2E plan: e2e/form/field-expand.md
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Field Expand",
  icon: "i-lucide-expand",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Model {
  description: string;
  notes: string;
}

const model = ref<Model>({ description: "", notes: "" });
const errors = ref<Record<string, string[]>>({});

// Tests 1.1: expandable: true shows the expand icon
// Tests 2.1–2.2: value preserved between compact and expanded views
const fields: FieldDescriptor<Model>[] = [
  {
    key: "description",
    type: "textarea",
    label: "Description (expandable textarea)",
    expandable: true,
    attrs: { rows: 3, placeholder: "Type here, then expand…" },
  },
  {
    key: "notes",
    type: "textarea",
    label: "Notes (expandable — also tests error visibility in both views)",
    expandable: true,
    required: true,
    attrs: {
      rows: 3,
      placeholder:
        "Required field — leave empty then submit to see error in both views",
    },
    validate: (v) => (!v ? "Notes are required." : null),
  },
];
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Field Expand</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/field-expand.md</code>
      </p>
    </div>

    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Expandable fields (tests 1–4)</span
        >
      </template>
      <p class="text-xs text-muted mb-3">
        Each field has an expand icon (↗). Click it to open in a larger view.
        Edit in compact → expand: value preserved (test 2.1). Edit in expanded →
        collapse: value preserved (test 2.2). Leave "Notes" empty and submit →
        error should appear in both views (test 3.1).
      </p>

      <!-- Tests 1.1: expand icons visible; 2.1–2.2: value persistence; 3.1: errors in both views -->
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="errors"
        :registry="$mapoFormRegistry"
        :immediate="true"
      />
    </UCard>

    <!-- Tests 3.1: inject server error to verify it shows in both compact and expanded -->
    <div class="flex gap-2">
      <UButton
        variant="outline"
        color="error"
        size="sm"
        leading-icon="i-lucide-alert-triangle"
        @click="errors = { description: ['Too short (server error).'] }"
      >
        Inject server error on description
      </UButton>
      <UButton variant="outline" color="neutral" size="sm" @click="errors = {}">
        Clear
      </UButton>
    </div>

    <!-- Live model -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">Live model</span>
      </template>
      <pre class="text-xs overflow-auto">{{
        JSON.stringify(model, null, 2)
      }}</pre>
    </UCard>

    <!-- Manual checklist -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Manual checklist</span
        >
      </template>
      <ul class="space-y-1.5 text-sm text-muted list-disc list-inside">
        <li>Expand icon visible on both fields (test 1.1)</li>
        <li>Click expand → field opens in larger view (test 1.2)</li>
        <li>Click collapse → returns to compact view (test 1.3)</li>
        <li>Edit in compact, expand: value preserved (test 2.1)</li>
        <li>Edit in expanded, collapse: value preserved (test 2.2)</li>
        <li>
          Server/client errors visible in both compact and expanded views (test
          3.1)
        </li>
        <li>
          Expand button has <code>aria-expanded</code> attribute (test 4.1)
        </li>
        <li>Esc key collapses the expanded field (test 4.2)</li>
      </ul>
    </UCard>
  </div>
</template>
