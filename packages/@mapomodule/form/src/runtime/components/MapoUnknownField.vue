<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AnyFieldDescriptor } from "../types/index.js";

const props = defineProps<{
  modelValue: unknown;
  descriptor: AnyFieldDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

// Inspect-friendly representation of the value. Never emits type-changing updates:
// if the user edits the JSON, emit only after a successful parse.
const jsonValue = computed(() => {
  try {
    return JSON.stringify(props.modelValue, null, 2);
  } catch {
    return String(props.modelValue);
  }
});

const draft = ref(jsonValue.value);
const parseError = ref<string | null>(null);

watch(jsonValue, (val) => {
  draft.value = val;
  parseError.value = null;
});

function onInput(val: string | number) {
  draft.value = String(val);
  try {
    const parsed = JSON.parse(draft.value);
    parseError.value = null;
    emit("update:modelValue", parsed);
  } catch (e) {
    // Do not emit until the JSON is valid: this avoids silently turning
    // `42` (number) into `"42"` (string) while the user is typing.
    parseError.value = (e as Error).message;
  }
}

if (import.meta.dev) {
  console.warn(
    `[Mapo] Field type "${props.descriptor.type}" (key: "${props.descriptor.key as string}") is not in the registry. Rendered as MapoUnknownField.`,
  );
}
</script>

<template>
  <div class="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm">
    <p class="font-mono font-semibold text-yellow-700">
      Unknown field: <code>{{ descriptor.key }}</code>
      <span class="ml-2 text-yellow-500">(type: {{ descriptor.type }})</span>
    </p>
    <UTextarea
      class="mt-2 font-mono text-xs"
      :model-value="draft"
      :rows="4"
      :readonly="readonly || disabled"
      :disabled="disabled"
      @update:model-value="onInput"
    />
    <p v-if="parseError" class="mt-1 text-xs text-yellow-700">
      Invalid JSON — changes are not applied until the value becomes parseable.
    </p>
    <p v-for="err in errors" :key="err" class="mt-1 text-red-500">
      {{ err }}
    </p>
  </div>
</template>
