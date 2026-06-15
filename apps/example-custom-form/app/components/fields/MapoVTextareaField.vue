<script setup lang="ts">
defineOptions({ inheritAttrs: false });
defineProps<{
  modelValue?: unknown;
  errors?: string[];
  disabled?: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown]; blur: [] }>();
</script>
<template>
  <v-textarea
    :model-value="modelValue as string | null | undefined"
    :error-messages="errors ?? []"
    :disabled="disabled"
    :readonly="readonly"
    density="comfortable"
    variant="outlined"
    rows="3"
    auto-grow
    hide-details="auto"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @blur="emit('blur')"
  />
</template>
