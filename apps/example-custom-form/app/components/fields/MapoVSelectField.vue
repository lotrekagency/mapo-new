<script setup lang="ts">
import { computed } from "vue";
import type { SelectDescriptor } from "@mapomodule/form/types";
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  modelValue?: unknown;
  errors?: string[];
  descriptor?: SelectDescriptor;
  disabled?: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown]; blur: [] }>();

// Mapo descriptors use { label, value } (NUI convention) or { text, value }.
// Vuetify expects item-title/item-value — normalise.
const normalisedItems = computed(() => {
  const raw =
    (props.descriptor?.attrs?.items as
      | Array<Record<string, unknown>>
      | undefined) ?? [];
  return raw.map((it) => ({
    title: (it.label ?? it.text ?? it.title ?? String(it.value)) as string,
    value: it.value,
  }));
});
</script>
<template>
  <v-select
    :items="normalisedItems"
    item-title="title"
    item-value="value"
    :model-value="modelValue"
    :error-messages="errors ?? []"
    :disabled="disabled"
    :readonly="readonly"
    density="comfortable"
    variant="outlined"
    hide-details="auto"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @blur="emit('blur')"
  />
</template>
