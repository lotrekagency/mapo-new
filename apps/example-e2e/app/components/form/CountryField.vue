<script setup lang="ts">
// A custom field of the app, registered as `country` in plugins/form-fields.ts:
// a country with its flag, saved as its ISO 3166 code (`IT`). It offers
// `attrs.countries` ({ value, label }), or a short list. The form says nothing
// of its value, so the AI gateway takes the backend's: in /api/pages, a
// choice among the codes the OPTIONS lists (server/utils/pageMetadata.ts).
import type { CustomDescriptor } from "mapomodule/types";

interface Country {
  value: string;
  label: string;
}

const COUNTRIES: Country[] = [
  { value: "IT", label: "Italy" },
  { value: "CH", label: "Switzerland" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "AT", label: "Austria" },
  { value: "ES", label: "Spain" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
];

const props = defineProps<{
  modelValue: string | null;
  descriptor: CustomDescriptor;
  readonly?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

function isCountry(value: unknown): value is Country {
  const isObject = typeof value === "object" && value !== null;
  return (
    isObject &&
    "value" in value &&
    typeof value.value === "string" &&
    "label" in value &&
    typeof value.label === "string"
  );
}

/** The flag of a two-letter code: its two regional indicator letters. */
function flagOf(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const letters = [...code].map(
    (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65,
  );
  return String.fromCodePoint(...letters);
}

const countries = computed(() => {
  const given = props.descriptor.attrs?.countries;
  const listed = Array.isArray(given) ? given.filter(isCountry) : [];
  return (listed.length ? listed : COUNTRIES).map((country) => ({
    ...country,
    flag: flagOf(country.value),
  }));
});

function update(value: unknown) {
  emit("update:modelValue", typeof value === "string" ? value : null);
}
</script>

<template>
  <USelectMenu
    :model-value="modelValue ?? undefined"
    :items="countries"
    value-key="value"
    label-key="label"
    :disabled="readonly || disabled"
    placeholder="Choose a country"
    :aria-label="descriptor.label ?? 'Country'"
    class="w-full"
    @update:model-value="update"
  >
    <template #leading>
      <span v-if="modelValue">{{ flagOf(modelValue) }}</span>
    </template>
    <template #item-leading="{ item }">
      <span>{{ item.flag }}</span>
    </template>
  </USelectMenu>
</template>
