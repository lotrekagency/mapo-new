<script setup lang="ts">
// Tests: MapoForm general engine — render, v-model, dirty tracking, server errors,
// client validation, submit flow (loading state, handler), readonly toggle,
// runtime field changes, getPatch(), resetDirty(), exposed methods via ref.
// E2E plan: e2e/form/form-engine.md
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Form Engine",
  icon: "i-lucide-layout-list",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Model {
  name: string;
  email: string;
  enabled: boolean;
}

const model = ref<Model>({ name: "", email: "", enabled: false });
const errors = ref<Record<string, string[]>>({});
const readonly = ref(false);
// Template ref kept for e2e inspection; MapoForm is auto-registered so its
// component type is not importable as a value here.
const formRef = ref<unknown>(null);

// Tests 1.1: fields rendered in declared order
// Tests 1.2: cols layout
// Tests 1.3: hidden field not rendered
const fields: FieldDescriptor<Model>[] = [
  { key: "name", type: "text", label: "Name", required: true, cols: 8 },
  { key: "email", type: "email", label: "Email", cols: 4 },
  { key: "enabled", type: "switch", label: "Enabled", cols: 12 },
];

// Tests 2.2–2.3: dirty tracking via useMapoForm
const form = useMapoForm({
  model,
  fields: computed(() => fields),
  errors,
  registry: $mapoFormRegistry,
  immediate: false,
});

// Tests 5.1–5.3: submit with loading simulation
const lastSubmitResult = ref<string | null>(null);

async function handleSubmit() {
  lastSubmitResult.value = null;
  await form.submit(async () => {
    // Simulate async backend call (tests 5.1: isLoading = true during wait)
    await new Promise((r) => setTimeout(r, 800));
    lastSubmitResult.value = "Submitted: " + JSON.stringify(form.getPatch());
  });
}

// Tests 2.4: getPatch() shows only changed fields
const patchResult = ref<string | null>(null);
function showPatch() {
  patchResult.value = JSON.stringify(form.getPatch(), null, 2);
}

// Tests 2.3: resetDirty
function resetDirty() {
  form.resetDirty();
  patchResult.value = null;
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Form Engine</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/form-engine.md</code>
      </p>
    </div>

    <!-- Tests 1.1–1.3, 2.1, 3.1, 8.1–8.2 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold text-sm text-highlighted">MapoForm</span>
          <div class="flex items-center gap-3">
            <!-- Tests 2.2: isDirty reactive -->
            <UBadge
              :color="form.isDirty.value ? 'warning' : 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ form.isDirty.value ? "dirty" : "clean" }}
            </UBadge>
            <!-- Tests 5.1: isLoading reactive -->
            <UBadge
              v-if="form.isLoading.value"
              color="primary"
              variant="subtle"
              size="xs"
            >
              loading…
            </UBadge>
            <!-- Tests 8.1–8.2: readonly toggle -->
            <UToggle v-model="readonly" size="sm" />
            <span class="text-xs text-muted">readonly</span>
          </div>
        </div>
      </template>

      <MapoForm
        ref="formRef"
        v-model="model"
        :fields="fields"
        :errors="errors"
        :registry="$mapoFormRegistry"
        :readonly="readonly"
      />
    </UCard>

    <!-- Controls -->
    <div class="flex flex-wrap gap-3">
      <!-- Tests 5.1: submit triggers loading + handler -->
      <UButton
        leading-icon="i-lucide-send"
        :loading="form.isLoading.value"
        @click="handleSubmit"
      >
        Submit
      </UButton>
      <!-- Tests 2.4: getPatch shows diff only -->
      <UButton
        variant="outline"
        color="neutral"
        leading-icon="i-lucide-diff"
        @click="showPatch"
      >
        getPatch()
      </UButton>
      <!-- Tests 2.3: resetDirty -->
      <UButton
        variant="outline"
        color="neutral"
        leading-icon="i-lucide-rotate-ccw"
        @click="resetDirty"
      >
        resetDirty()
      </UButton>
      <!-- Tests 3.1: inject server errors -->
      <UButton
        variant="outline"
        color="error"
        leading-icon="i-lucide-alert-triangle"
        @click="
          errors = {
            name: ['This field is required.'],
            email: ['Enter a valid email.'],
          }
        "
      >
        Inject errors
      </UButton>
      <UButton variant="outline" color="neutral" @click="errors = {}">
        Clear errors
      </UButton>
    </div>

    <!-- Tests 2.4: patch output -->
    <UCard v-if="patchResult">
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >getPatch() result</span
        >
      </template>
      <pre class="text-xs overflow-auto">{{ patchResult }}</pre>
    </UCard>

    <!-- Tests 5.1: submit result -->
    <UCard v-if="lastSubmitResult">
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Submit result</span
        >
      </template>
      <pre class="text-xs overflow-auto">{{ lastSubmitResult }}</pre>
    </UCard>

    <!-- Tests 5.2: submit with invalid form — client validation -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Client validation (test 4.x — immediate: true)</span
        >
      </template>
      <p class="text-xs text-muted mb-3">
        This form uses <code>immediate: true</code> — errors show as you type.
      </p>
      <MapoForm
        v-model="model"
        :fields="[{ key: 'name', type: 'text', label: 'Name', required: true }]"
        :errors="{}"
        :registry="$mapoFormRegistry"
        :immediate="true"
      />
    </UCard>
  </div>
</template>
