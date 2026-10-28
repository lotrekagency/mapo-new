<script setup lang="ts">
// A custom text field that reads its own annotation with useFieldAnnotation():
// it lights up in the annotation's color and shows the description and the
// actions under the control. Docs: docs/uikit/form/annotations.md
// ("Read the annotation in a custom field").
import type { InputProps } from "@nuxt/ui";
import type { TextDescriptor } from "@mapomodule/form/types";

const props = defineProps<{
  modelValue: string | null;
  descriptor: TextDescriptor;
  readonly?: boolean;
  /** `"error"` while the field has an error: MapoFormField sets it. */
  color?: InputProps["color"];
}>();
const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

const annotation = useFieldAnnotation(() => props.descriptor);

// An error wins over the annotation's color.
const color = computed(
  () =>
    props.color ??
    (annotation.value?.color as InputProps["color"]) ??
    "primary",
);
</script>

<template>
  <div class="space-y-1">
    <UInput
      :model-value="modelValue ?? undefined"
      :readonly="readonly"
      :color="color"
      :highlight="Boolean(annotation)"
      class="w-full"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div v-if="annotation" class="flex flex-wrap items-center gap-2 text-xs">
      <span class="text-muted">{{ annotation.description }}</span>
      <UButton
        v-for="(action, index) in annotation.actions ?? []"
        :key="index"
        :label="action.label"
        :icon="action.icon"
        size="xs"
        variant="link"
        @click="action.onClick()"
      />
    </div>
  </div>
</template>
