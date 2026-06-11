<script setup lang="ts">
// Tests: custom field registry — defineFormField(), type resolution, default attrs,
// custom accessor (get/set transformation), lazy loading, unknown type fallback,
// override: true for re-registration, MapoUnknownField for missing types.
// E2E plan: e2e/form/custom-fields.md
import type { AnyFieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Custom Fields",
  icon: "i-lucide-puzzle",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Model {
  color: string;
  rating: number;
  unknown_type: string;
}

const model = ref<Model>({ color: "#3b82f6", rating: 3, unknown_type: "" });
const errors = ref<Record<string, string[]>>({});

// Tests 1.2: field with registered type renders custom component
// Tests 1.3: field with unregistered type renders MapoUnknownField with warning
const fields: AnyFieldDescriptor<Model>[] = [
  {
    key: "color",
    type: "color", // registered in apps/example plugin
    label: "Color (custom registered type)",
    attrs: { palette: ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"] },
  },
  {
    key: "rating",
    type: "rating", // registered with custom accessor
    label: "Rating (custom accessor — transforms to number)",
    attrs: { max: 5 },
  },
  {
    key: "unknown_type",
    type: "totally_unknown_field_type", // Tests 1.3: should render MapoUnknownField
    label: "Unknown type (should show fallback)",
  },
];

// Tests 2.1: same type without explicit attrs → should use registered defaults
const fieldsDefaultAttrs: AnyFieldDescriptor<Model>[] = [
  {
    key: "color",
    type: "color",
    label: "Color (no attrs → uses registry defaults)",
    // No attrs.palette — should use the defaults from defineFormField registration
  },
];
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">
        Custom Fields & Registry
      </h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/custom-fields.md</code>
      </p>
    </div>

    <!-- Tests 1.1: registry introspection -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Registry contents (test 1.1)</span
        >
      </template>
      <p class="text-xs text-muted mb-2">
        Types registered in <code>$mapoFormRegistry</code>:
      </p>
      <div class="flex flex-wrap gap-1.5">
        <UBadge
          v-for="type in Object.keys($mapoFormRegistry?.mapping ?? {})"
          :key="type"
          variant="outline"
          color="neutral"
          size="xs"
        >
          {{ type }}
        </UBadge>
      </div>
    </UCard>

    <!-- Tests 1.2–1.3, 3.1–3.2: known + unknown types rendered -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">
          Custom types (tests 1.2, 1.3, 3.1)
        </span>
      </template>
      <p class="text-xs text-muted mb-3">
        "color" and "rating" should render custom components.
        "totally_unknown_field_type" should render
        <code>MapoUnknownField</code> fallback.
      </p>
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="errors"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Tests 2.1: default attrs from registry -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Default attrs from registry (test 2.1)</span
        >
      </template>
      <p class="text-xs text-muted mb-3">
        No <code>attrs.palette</code> passed — should use defaults registered in
        <code>defineFormField</code>.
      </p>
      <MapoForm
        v-model="model"
        :fields="fieldsDefaultAttrs"
        :errors="{}"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Live model — tests 3.1: accessor transforms value to number -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Live model (rating should be numeric — test 3.1)</span
        >
      </template>
      <pre class="text-xs overflow-auto">{{
        JSON.stringify(model, null, 2)
      }}</pre>
    </UCard>
  </div>
</template>
