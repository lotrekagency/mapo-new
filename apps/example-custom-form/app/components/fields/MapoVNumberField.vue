<script setup lang="ts">
import type { NumberDescriptor } from "@mapomodule/form/types";
defineOptions({ inheritAttrs: false });
defineProps<{
  modelValue?: unknown;
  errors?: string[];
  descriptor?: NumberDescriptor;
  disabled?: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown]; blur: [] }>();
function onInput(v: string | null) {
  if (v === "" || v == null) return emit("update:modelValue", null);
  const n = Number(v);
  emit("update:modelValue", Number.isNaN(n) ? v : n);
}
</script>
<template>
  <v-text-field
    type="number"
    :model-value="modelValue as number | null | undefined"
    :error-messages="errors ?? []"
    :disabled="disabled"
    :readonly="readonly"
    :min="descriptor?.attrs?.min as number | undefined"
    :max="descriptor?.attrs?.max as number | undefined"
    density="comfortable"
    variant="outlined"
    hide-details="auto"
    @update:model-value="onInput"
    @blur="emit('blur')"
  />
</template>
