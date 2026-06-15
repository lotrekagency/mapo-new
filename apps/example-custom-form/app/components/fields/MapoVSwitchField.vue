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
  <v-switch
    :model-value="!!modelValue"
    :error-messages="errors ?? []"
    :disabled="disabled"
    :readonly="readonly"
    color="primary"
    density="compact"
    hide-details="auto"
    inset
    @update:model-value="(v) => emit('update:modelValue', v)"
    @blur="emit('blur')"
  />
</template>
