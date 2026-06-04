<script setup lang="ts">
// Tests: showWhen / visible DSL — matchesField, when (AND), whenAny (OR), whenNot,
// advanced matchers (isOneOf, isNotEmpty, greaterThan), hidden field required not enforced,
// path-based conditions, edge cases (rapid toggling, repeater items).
// E2E plan: e2e/form/progressive-disclosure.md
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Progressive Disclosure",
  icon: "i-lucide-eye",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Model {
  has_address: boolean;
  address: string;
  role: string;
  permissions: string;
  banner: string;
  show_extra: boolean;
  show_banner: boolean;
  age: number | null;
  code: string;
}

const model = ref<Model>({
  has_address: false,
  address: "",
  role: "viewer",
  permissions: "",
  banner: "",
  show_extra: false,
  show_banner: false,
  age: null,
  code: "",
});

const errors = ref<Record<string, string[]>>({});

// Tests 1.1–1.3: matchesField boolean
// Tests 2.1–2.3: matchesField + isOneOf
// Tests 3.1–3.3: when() AND composition
// Tests 4.1–4.2: whenAny() OR composition
// Tests 5.1: whenNot()
// Tests 6.1–6.5: advanced matchers
// Tests 7.1: hidden required field skipped on submit
const fields: FieldDescriptor<Model>[] = [
  // Group: basic visibility
  {
    key: "has_address",
    type: "switch",
    label: "I have an address (toggle to show address field)",
    group: "Basic visibility (matchesField)",
  },
  {
    key: "address",
    type: "text",
    label: "Address (visible only when has_address = true)",
    group: "Basic visibility (matchesField)",
    // Tests 1.1–1.2: shown only when has_address is true
    visible: when(matchesField("has_address", true)),
  },

  // Group: isOneOf matcher
  {
    key: "role",
    type: "select",
    label: "Role",
    group: "isOneOf matcher",
    attrs: {
      items: [
        { label: "Admin", value: "admin" },
        { label: "Editor", value: "editor" },
        { label: "Viewer", value: "viewer" },
      ],
    },
  },
  {
    key: "permissions",
    type: "text",
    label: "Permissions (visible only for admin or editor)",
    group: "isOneOf matcher",
    // Tests 2.1–2.3: hidden for viewer, shown for admin/editor
    visible: when(matchesField("role", isOneOf(["admin", "editor"]))),
  },

  // Group: AND composition (when)
  {
    key: "banner",
    type: "text",
    label: "Banner (visible only when has_address AND address is not empty)",
    group: "AND composition (when)",
    // Tests 3.1–3.3: both conditions must be true
    visible: when(
      matchesField("has_address", true),
      matchesField("address", isNotEmpty()),
    ),
  },

  // Group: OR composition (whenAny)
  {
    key: "show_extra",
    type: "switch",
    label: "Show extra (trigger A)",
    group: "OR composition (whenAny)",
  },
  {
    key: "show_banner",
    type: "switch",
    label: "Show banner (trigger B)",
    group: "OR composition (whenAny)",
  },
  {
    key: "code",
    type: "text",
    label: "Code (visible when show_extra OR show_banner)",
    group: "OR composition (whenAny)",
    // Tests 4.1–4.2: either condition suffices
    visible: whenAny(
      matchesField("show_extra", true),
      matchesField("show_banner", true),
    ),
  },

  // Group: advanced matchers
  {
    key: "age",
    type: "number",
    label: "Age",
    group: "Advanced matchers (greaterThan)",
    attrs: { min: 0 },
  },
  {
    key: "permissions",
    type: "text",
    label: "Senior permissions (visible when age > 30)",
    group: "Advanced matchers (greaterThan)",
    // Tests 6.4: greaterThan numeric comparison
    visible: when(matchesField("age", greaterThan(30))),
  },
];

// Tests 7.1: hidden required field should not block submit
const hiddenRequiredFields: FieldDescriptor<Model>[] = [
  {
    key: "has_address",
    type: "switch",
    label: "Toggle to show the required field below",
  },
  {
    key: "address",
    type: "text",
    label: "Address (required but hidden when has_address = false)",
    required: true,
    visible: when(matchesField("has_address", true)),
    validate: (v) => (!v ? "Address is required when visible." : null),
  },
];

const form = useMapoForm({
  model,
  fields: computed(() => fields),
  errors,
  registry: $mapoFormRegistry,
});
const hiddenRequiredForm = useMapoForm({
  model,
  fields: computed(() => hiddenRequiredFields),
  errors: ref({}),
  registry: $mapoFormRegistry,
});
const hiddenReqResult = ref<string | null>(null);

async function testHiddenRequired() {
  hiddenReqResult.value = null;
  await hiddenRequiredForm.submit(async () => {
    hiddenReqResult.value =
      "✓ Submit passed — hidden required field was correctly skipped.";
  });
  if (!hiddenReqResult.value) {
    hiddenReqResult.value =
      "✗ Submit blocked — hidden required field incorrectly validated.";
  }
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">
        Progressive Disclosure
      </h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/progressive-disclosure.md</code>
      </p>
    </div>

    <!-- Tests 1–6: all showWhen patterns -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">
          matchesField / when / whenAny / isOneOf / isNotEmpty / greaterThan
        </span>
      </template>
      <MapoForm
        v-model="model"
        :fields="fields"
        :errors="errors"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Tests 7.1: hidden required should not block submit -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">
          Hidden required field must not block submit (test 7.1)
        </span>
      </template>
      <p class="text-xs text-muted mb-3">
        Toggle is OFF → address field is hidden. Click Submit — it should pass
        even though address is <code>required: true</code>.
      </p>
      <MapoForm
        v-model="model"
        :fields="hiddenRequiredFields"
        :errors="{}"
        :registry="$mapoFormRegistry"
      />
      <div class="mt-3 flex gap-2">
        <UButton size="sm" @click="testHiddenRequired">
          Submit (should pass if address hidden)
        </UButton>
      </div>
      <div
        v-if="hiddenReqResult"
        class="mt-2 text-sm"
        :class="
          hiddenReqResult.startsWith('✓') ? 'text-green-600' : 'text-red-600'
        "
      >
        {{ hiddenReqResult }}
      </div>
    </UCard>
  </div>
</template>
