<script setup lang="ts">
// Tests: required fields, type-based validation (email/url/number), custom sync validators,
// async validators with debounce and loading indicator, touched/submitted gating,
// server errors coexistence with client validators, cross-field validators.
// E2E plan: e2e/form/validation.md
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Validation",
  icon: "i-lucide-shield-check",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Model {
  name: string;
  email: string;
  age: number | null;
  website: string;
  password: string;
  password_confirm: string;
}

const model = ref<Model>({
  name: "",
  email: "",
  age: null,
  website: "",
  password: "",
  password_confirm: "",
});

const serverErrors = ref<Record<string, string[]>>({});

// Tests 1.1–1.2: required
// Tests 2.1–2.3: type-based (email, url, number)
// Tests 3.1–3.4: custom sync validators
// Tests 4.1–4.3: async validator with debounce + loading
// Tests 7.1–7.2: cross-field (password == password_confirm)
const fields: FieldDescriptor<Model>[] = [
  {
    key: "name",
    type: "text",
    label: "Name (required)",
    required: true,
    cols: 6,
    validate: (v) => (!v ? "Name is required." : null),
  },
  {
    key: "email",
    type: "email",
    label: "Email (type-based validation)",
    cols: 6,
  },
  {
    key: "age",
    type: "number",
    label: "Age (must be ≥ 18)",
    cols: 4,
    validate: (v) => {
      if (v === null || v === undefined || v === "") return null;
      return Number(v) >= 18 ? null : "Must be 18 or older.";
    },
  },
  {
    key: "website",
    type: "url",
    label: "Website (url validation)",
    cols: 8,
  },
  {
    key: "password",
    type: "text",
    label: "Password (min 8 chars, async uniqueness check)",
    validate: (v) => {
      if (!v) return "Password is required.";
      return String(v).length >= 8 ? null : "Minimum 8 characters.";
    },
    // Tests 4.1–4.3: async validator — simulates a uniqueness check
    validateAsync: async (v) => {
      if (!v || String(v).length < 8) return null;
      await new Promise((r) => setTimeout(r, 600)); // simulate network
      const reserved = ["password", "12345678", "qwertyui"];
      return reserved.includes(String(v).toLowerCase())
        ? `"${v}" is too common — choose a different password.`
        : null;
    },
    validateAsyncDebounce: 700,
  },
  {
    key: "password_confirm",
    type: "text",
    label: "Confirm Password (cross-field — must match password)",
    // Tests 7.1–7.2: cross-field validation, gets model as second arg
    validate: (v, { model: mdl }) => {
      if (!v) return null;
      return v === mdl.password ? null : "Passwords do not match.";
    },
  },
];

const form = useMapoForm<Model>({
  model,
  fields,
  errors: serverErrors,
  registry: $mapoFormRegistry,
  immediate: false, // Tests 5.1: errors hidden until touched or submitted
});

const submitResult = ref<string | null>(null);

async function handleSubmit() {
  submitResult.value = null;
  await form.submit(async () => {
    submitResult.value = "Valid! Payload: " + JSON.stringify(form.getPatch());
  });
}

function handleReset() {
  form.resetDirty();
  serverErrors.value = {};
  submitResult.value = null;
}
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Form Validation</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/validation.md</code>
      </p>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold text-sm text-highlighted"
            >Validation test form</span
          >
          <!-- Tests 4.1: isLoading during async check -->
          <UBadge
            v-if="form.isLoading.value"
            color="primary"
            variant="subtle"
            size="xs"
          >
            validating…
          </UBadge>
        </div>
      </template>

      <!-- Tests 1–4, 7: all validators active -->
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="serverErrors"
        :registry="$mapoFormRegistry"
        :immediate="false"
      />
    </UCard>

    <div class="flex flex-wrap gap-3">
      <!-- Tests 5.3: submit makes all errors visible -->
      <UButton
        leading-icon="i-lucide-send"
        :loading="form.isLoading.value"
        @click="handleSubmit"
      >
        Submit (validate all)
      </UButton>
      <!-- Tests 8.3: reset clears errors and touched state -->
      <UButton
        variant="outline"
        color="neutral"
        leading-icon="i-lucide-rotate-ccw"
        @click="handleReset"
      >
        Reset
      </UButton>
      <!-- Tests 6.1: server error alongside passing client validator -->
      <UButton
        variant="outline"
        color="error"
        leading-icon="i-lucide-server"
        @click="serverErrors = { name: ['Already taken (server error).'] }"
      >
        Inject server error on name
      </UButton>
    </div>

    <UCard v-if="submitResult">
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Submit result</span
        >
      </template>
      <pre class="text-xs overflow-auto text-green-600">{{ submitResult }}</pre>
    </UCard>

    <!-- Tests 5.4: immediate mode — errors visible from first keystroke -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Immediate mode (test 5.4) — errors show instantly</span
        >
      </template>
      <MapoForm
        v-model="model"
        :fields="[
          {
            key: 'name',
            type: 'text',
            label: 'Name (required)',
            required: true,
            validate: (v) => (!v ? 'Required.' : null),
          },
        ]"
        :errors="{}"
        :registry="$mapoFormRegistry"
        :immediate="true"
      />
    </UCard>
  </div>
</template>
