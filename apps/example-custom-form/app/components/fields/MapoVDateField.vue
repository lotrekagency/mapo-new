<script setup lang="ts">
import { computed } from "vue";
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  modelValue?: unknown;
  errors?: string[];
  disabled?: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown]; blur: [] }>();

const display = computed(() => {
  const v = props.modelValue;
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  return "";
});
function onInput(v: string | null) {
  emit("update:modelValue", v || null);
}
</script>
<template>
  <v-text-field
    type="date"
    :model-value="display"
    :error-messages="errors ?? []"
    :disabled="disabled"
    :readonly="readonly"
    density="comfortable"
    variant="outlined"
    hide-details="auto"
    @update:model-value="onInput"
    @blur="emit('blur')"
  />
</template>
