<script setup lang="ts">
// Tests: all NUI wrapper field types rendered via MapoForm.
// NuiInput (text, email, url, number), NuiTextarea, NuiSlider, NuiCheckbox,
// NuiSelectMenu, NuiSwitch — v-model binding, readonly/disabled states,
// type coercion (number), placeholder, attrs passthrough.
// E2E plan: e2e/form/fields/nui-wrappers.md
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "NUI Wrappers",
  icon: "i-lucide-sliders",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Model {
  name: string;
  email: string;
  website: string;
  age: number | null;
  bio: string;
  volume: number;
  agree: boolean;
  role: string;
  enabled: boolean;
}

const model = ref<Model>({
  name: "",
  email: "",
  website: "",
  age: null,
  bio: "",
  volume: 50,
  agree: false,
  role: "",
  enabled: false,
});

const errors = ref<Record<string, string[]>>({});

// Tests 1.1–1.9: text, email, url, number inputs with attrs
// Tests 2.1–2.4: textarea
// Tests 3.1–3.4: slider with min/max/step
// Tests 4.1–4.4: checkbox
// Tests 5.1–5.6: select menu with items array
// Tests 6.1–6.4: switch
const fields: FieldDescriptor<Model>[] = [
  {
    key: "name",
    type: "text",
    label: "Name (text)",
    cols: 6,
    attrs: { placeholder: "Type something…" },
  },
  {
    key: "email",
    type: "email",
    label: "Email (email validation)",
    cols: 6,
    attrs: { placeholder: "user@example.com" },
  },
  {
    key: "website",
    type: "url",
    label: "Website (url validation)",
    cols: 6,
    attrs: { placeholder: "https://…" },
  },
  {
    key: "age",
    type: "number",
    label: "Age (number — coerced to numeric)",
    cols: 6,
    attrs: { min: 0, max: 150 },
  },
  {
    key: "bio",
    type: "textarea",
    label: "Bio (textarea)",
    attrs: { rows: 4, placeholder: "Multi-line text…" },
  },
  {
    key: "volume",
    type: "slider",
    label: "Volume (slider 0–100 step 5)",
    attrs: { min: 0, max: 100, step: 5 },
  },
  {
    key: "agree",
    type: "boolean",
    label: "I agree to the terms (checkbox)",
    cols: 4,
  },
  {
    key: "role",
    type: "select",
    label: "Role (select menu)",
    cols: 4,
    attrs: {
      items: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
        { label: "Viewer", value: "viewer" },
      ],
      placeholder: "Pick a role…",
    },
  },
  {
    key: "enabled",
    type: "switch",
    label: "Enabled (switch)",
    cols: 4,
  },
];

// Tests 7.3: payload types after submit
function handleSubmit() {
  console.log("Submitted payload:", JSON.parse(JSON.stringify(model.value)));
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">NUI Wrapper Fields</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/fields/nui-wrappers.md</code>
      </p>
    </div>

    <!-- Tests 1–6: all field types rendered -->
    <MapoForm
      v-model="model"
      :fields="fields"
      :errors="errors"
      :registry="$mapoFormRegistry"
      @submit="handleSubmit"
    />

    <!-- Tests 7.3: live model inspection -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Live model (check types)</span
        >
      </template>
      <pre class="text-xs overflow-auto max-h-40">{{
        JSON.stringify(model, null, 2)
      }}</pre>
    </UCard>

    <!-- Tests 1.6–1.7: readonly and disabled -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Readonly form (test 1.6, 3.4, 4.3, 5.5, 6.4)</span
        >
      </template>
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="{}"
        :registry="$mapoFormRegistry"
        :readonly="true"
      />
    </UCard>

    <!-- Tests 1.8: server errors injected -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Server errors (test 1.8)</span
        >
      </template>
      <div class="flex gap-2 mb-4">
        <UButton
          size="sm"
          variant="outline"
          @click="
            errors = {
              name: ['This field is required.'],
              email: ['Enter a valid email address.'],
            }
          "
        >
          Inject errors
        </UButton>
        <UButton
          size="sm"
          variant="outline"
          color="neutral"
          @click="errors = {}"
        >
          Clear errors
        </UButton>
      </div>
      <MapoForm
        v-model="model"
        :fields="fields.slice(0, 2)"
        :errors="errors"
        :registry="$mapoFormRegistry"
      />
    </UCard>
  </div>
</template>
