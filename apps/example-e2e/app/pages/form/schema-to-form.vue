<script setup lang="ts">
// Tests: useFormFromSchema — maps JSON Schema types to FieldDescriptor[], required/nullable,
// type format mapping (email/url/date/datetime/textarea), enum→select, boolean→switch,
// constraints (minLength, minimum, maximum), anyOf nullable pattern, $ref resolution,
// if/then conditionals, options (exclude, overrides), default values.
// E2E plan: e2e/form/schema-to-form.md
definePageMeta({
  layout: "mapo-default",
  label: "Schema → Form",
  icon: "i-lucide-braces",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

// Tests 1.1–1.10: type + format mapping; tests 2.1–2.3: required/nullable;
// tests 3.1–3.3: constraints; tests 5.1–5.4: conditionals (if/then);
// tests 6.1–6.3: options (exclude, overrides)
const schema = {
  type: "object" as const,
  required: ["title", "slug"],
  properties: {
    title: { type: "string" as const, title: "Title", maxLength: 255 },
    slug: { type: "string" as const, title: "Slug", maxLength: 100 },
    email: { type: "string" as const, title: "Email", format: "email" },
    website: { type: "string" as const, title: "Website", format: "uri" },
    published_at: {
      anyOf: [
        { type: "string" as const, format: "date-time" },
        { type: "null" as const },
      ],
      title: "Published at",
    },
    is_draft: { type: "boolean" as const, title: "Is draft" },
    priority: {
      type: "integer" as const,
      title: "Priority",
      minimum: 1,
      maximum: 10,
    },
    body: { type: "string" as const, title: "Body" },
    status: {
      type: "string" as const,
      title: "Status",
      enum: ["draft", "published", "archived"],
    },
    show_teaser: { type: "boolean" as const, title: "Show teaser" },
    id: { type: "integer" as const, title: "ID" }, // should be excluded
  },
  // Tests 5.1: if/then conditional — show_teaser only when is_draft = false
  if: { properties: { is_draft: { const: false } } },
  then: { properties: { show_teaser: { type: "boolean" as const } } },
};

// Tests 6.1: exclude id; tests 6.2: override body to editor type
const fields = useFormFromSchema(schema, {
  exclude: ["id"],
  overrides: {
    body: { type: "editor", label: "Body (editor override)" },
    status: { label: "Publication Status" },
  },
});

const model = ref<Record<string, unknown>>({
  title: "",
  slug: "",
  email: "",
  website: "",
  published_at: null,
  is_draft: true,
  priority: 5,
  body: "",
  status: "draft",
  show_teaser: false,
});
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Schema → Form</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/schema-to-form.md</code>
      </p>
    </div>

    <!-- Generated fields inspection -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Generated FieldDescriptors ({{ fields.length }} fields)</span
        >
      </template>
      <p class="text-xs text-muted mb-2">
        Verify: <code>id</code> is excluded · <code>body</code> type = "editor"
        · <code>title</code>/<code>slug</code> required ·
        <code>published_at</code> nullable · <code>status</code> = select ·
        <code>is_draft</code> = switch.
      </p>
      <div class="flex flex-wrap gap-1.5">
        <UBadge
          v-for="f in fields"
          :key="f.key"
          variant="outline"
          :color="f.required ? 'error' : 'neutral'"
          size="xs"
        >
          {{ f.key }}: {{ f.type }}{{ f.required ? " *" : "" }}
        </UBadge>
      </div>
    </UCard>

    <!-- Rendered form — tests 5.1: show_teaser appears only when is_draft = false -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold text-sm text-highlighted"
            >Rendered form</span
          >
          <p class="text-xs text-muted">
            Toggle "Is draft" OFF to see "Show teaser" appear (if/then test 5.1)
          </p>
        </div>
      </template>
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="{}"
        :registry="$mapoFormRegistry"
        :immediate="true"
      />
    </UCard>

    <!-- Live model -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">Live model</span>
      </template>
      <pre class="text-xs overflow-auto max-h-40">{{
        JSON.stringify(model, null, 2)
      }}</pre>
    </UCard>
  </div>
</template>
