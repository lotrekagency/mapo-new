<script setup lang="ts">
/**
 * MapoFormAnnotation — the mark of an annotated field: a small button with the
 * annotation's icon and color, named by its label, that opens a popover with
 * the title, the description (or the `body` slot) and the actions.
 *
 * `MapoFormField` renders it next to the label; a custom label slot can render
 * it too, from the `annotation` it receives.
 *
 * @example
 * <MapoFormAnnotation :annotation="{ label: 'Imported', icon: 'i-lucide-download' }" />
 */
import { computed } from "vue";
import type { FieldAnnotation } from "../types/index.js";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_ICON,
} from "../utils/annotations.js";

const props = defineProps<{
  /** The mark to show: icon and color on the button, texts and actions in the popover. */
  annotation: FieldAnnotation;
}>();

defineSlots<{
  /** Replaces the description, between the popover title and its actions. */
  body?: (props: { annotation: FieldAnnotation }) => unknown;
}>();

const icon = computed(() => props.annotation.icon ?? DEFAULT_ANNOTATION_ICON);
const color = computed(
  () => props.annotation.color ?? DEFAULT_ANNOTATION_COLOR,
);

// The popover is portalled to <body> with no z-index of its own, so the field
// expand panel (z-50) and the focus portal (z-[9999]) would paint over it. The
// popper wrapper copies the z-index of its content; the dialog takes its name
// from the label.
const popoverUi = { content: "z-[10000]" };
const popoverContent = computed(() => ({
  side: "bottom" as const,
  align: "start" as const,
  "aria-label": props.annotation.label,
}));
</script>

<template>
  <UPopover :content="popoverContent" :ui="popoverUi">
    <!-- The label text is the accessible name; the dot only repeats it visually. -->
    <UButton
      :icon="icon"
      :color="color"
      :aria-label="annotation.label"
      variant="ghost"
      size="xs"
      square
      class="mapo-form-annotation relative p-0.5"
    >
      <span
        v-if="annotation.dot"
        class="absolute right-0 top-0 size-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
    </UButton>

    <template #content>
      <div class="max-w-xs space-y-2 p-3 text-sm">
        <p class="font-medium text-highlighted">
          {{ annotation.label }}
        </p>
        <slot name="body" :annotation="annotation">
          <p v-if="annotation.description" class="text-muted">
            {{ annotation.description }}
          </p>
        </slot>
        <div v-if="annotation.actions?.length" class="flex flex-wrap gap-2">
          <UButton
            v-for="(action, index) in annotation.actions"
            :key="index"
            :label="action.label"
            :icon="action.icon"
            :color="action.color ?? 'neutral'"
            variant="soft"
            size="xs"
            @click="action.onClick()"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
