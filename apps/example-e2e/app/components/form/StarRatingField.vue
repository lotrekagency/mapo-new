<script setup lang="ts">
// A custom field of the app, registered as `stars` in plugins/form-fields.ts:
// a rating from 1 to `attrs.max` stars (default 5), saved as a number;
// clicking the rating it holds clears it. The form says nothing of its value,
// so the AI gateway takes the backend's: in the reviews of /api/pages, an
// integer from 1 to 5 (server/utils/pageMetadata.ts).
import type { CustomDescriptor } from "mapomodule/types";

const props = defineProps<{
  modelValue: number | null;
  descriptor: CustomDescriptor;
  readonly?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();

const max = computed(() => {
  const value = props.descriptor.attrs?.max;
  return typeof value === "number" && value > 0 ? Math.floor(value) : 5;
});
const isLocked = computed(() => props.readonly || props.disabled);

function isLit(stars: number): boolean {
  return typeof props.modelValue === "number" && stars <= props.modelValue;
}

function pick(stars: number) {
  if (isLocked.value) return;
  emit("update:modelValue", stars === props.modelValue ? null : stars);
}
</script>

<template>
  <div
    class="flex items-center gap-0.5"
    role="group"
    :aria-label="descriptor.label ?? 'Rating'"
  >
    <button
      v-for="stars in max"
      :key="stars"
      type="button"
      class="text-xl leading-none disabled:cursor-default"
      :class="isLit(stars) ? 'text-warning' : 'text-dimmed'"
      :disabled="isLocked"
      :aria-pressed="stars === modelValue"
      :aria-label="`${stars} of ${max} stars`"
      @click="pick(stars)"
    >
      {{ isLit(stars) ? "★" : "☆" }}
    </button>
    <span class="ml-2 text-xs text-muted">
      {{ modelValue ? `${modelValue}/${max}` : "No rating" }}
    </span>
  </div>
</template>
