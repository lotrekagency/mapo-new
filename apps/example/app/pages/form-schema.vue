<script setup lang="ts">
import { ref } from "vue";

definePageMeta({
  label: "Form da Schema",
  icon: "i-lucide-braces",
  layout: "mapo-default",
});

// Schema stile DRF-spectacular / Pydantic — normalmente arriva dal backend
const schema = {
  type: "object" as const,
  required: ["title", "slug"],
  properties: {
    title: { type: "string" as const, title: "Titolo", maxLength: 255 },
    slug: { type: "string" as const, title: "Slug", maxLength: 100 },
    body: { type: "string" as const, title: "Corpo", maxLength: 5000 },
    published_at: {
      anyOf: [
        { type: "string" as const, format: "date-time" },
        { type: "null" as const },
      ],
      title: "Data pubblicazione",
    },
    is_draft: { type: "boolean" as const, title: "Bozza" },
    status: {
      type: "string" as const,
      title: "Stato",
      enum: ["draft", "published", "archived"],
    },
    priority: {
      type: "integer" as const,
      title: "Priorità",
      minimum: 1,
      maximum: 10,
    },
    // Condizionale: show_teaser solo quando is_draft = false
    show_teaser: { type: "boolean" as const, title: "Mostra anteprima" },
  },
  if: { properties: { is_draft: { const: false } } },
  then: { properties: { show_teaser: { type: "boolean" as const } } },
};

// Genera i descriptor automaticamente dallo schema
// + override manuali per i campi che vogliamo personalizzare
const fields = useFormFromSchema(schema, {
  exclude: ["id", "created_at", "updated_at"],
  overrides: {
    body: { type: "editor", label: "Contenuto (editor)" },
    status: { label: "Stato pubblicazione" },
  },
});

const model = ref<Record<string, unknown>>({
  title: "",
  slug: "",
  body: "",
  published_at: null,
  is_draft: true,
  status: "draft",
  priority: 5,
  show_teaser: false,
});

const { $mapoFormRegistry } = useNuxtApp();

const form = useMapoForm({
  model,
  fields: computed(() => fields),
  errors: ref({}),
  registry: $mapoFormRegistry,
  immediate: true,
});
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Form da JSON Schema</h1>
      <p class="mt-1 text-sm text-gray-500">
        I descriptor vengono generati automaticamente dallo schema con
        <code class="rounded bg-gray-100 px-1">useFormFromSchema()</code>. Il
        campo <code class="rounded bg-gray-100 px-1">show_teaser</code> appare
        solo quando <em>Bozza</em> è disattivata (condizionale if/then).
      </p>
    </div>

    <!-- Schema sorgente -->
    <UCollapsible>
      <UButton variant="ghost" color="neutral" icon="i-lucide-code-2" size="sm">
        Vedi schema sorgente
      </UButton>
      <template #content>
        <pre class="mt-2 overflow-auto rounded bg-gray-50 p-4 text-xs">{{
          JSON.stringify(schema, null, 2)
        }}</pre>
      </template>
    </UCollapsible>

    <!-- Descriptor generati -->
    <UCollapsible>
      <UButton variant="ghost" color="neutral" icon="i-lucide-list" size="sm">
        Vedi descriptor generati ({{ fields.length }} campi)
      </UButton>
      <template #content>
        <pre class="mt-2 overflow-auto rounded bg-gray-50 p-4 text-xs">{{
          JSON.stringify(
            fields.map((f) => ({
              key: f.key,
              type: f.type,
              label: f.label,
              required: f.required,
              hasVisible: !!f.visible,
            })),
            null,
            2,
          )
        }}</pre>
      </template>
    </UCollapsible>

    <MapoForm v-model="model" :fields="fields" :errors="{}" />

    <UCard>
      <template #header>
        <span class="text-sm font-medium">Model corrente</span>
      </template>
      <pre class="text-xs">{{ JSON.stringify(model, null, 2) }}</pre>
    </UCard>
  </div>
</template>
