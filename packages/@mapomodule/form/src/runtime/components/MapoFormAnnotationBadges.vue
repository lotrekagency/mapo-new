<script setup lang="ts">
/**
 * The annotation badges of a tab or of a repeater item: one per icon and color,
 * with the count of the marks it stands for. Internal: `MapoFormTabs` and
 * `MapoRepeaterItem` render it, and it is not registered for apps.
 */
import { useI18n } from "vue-i18n";
import type { AnnotationGroup } from "../utils/annotations.js";

withDefaults(
  defineProps<{
    /** The groups to show, as `annotationGroups()` returns them. */
    groups: AnnotationGroup[];
    /** Badge size: `sm` on tabs, `xs` on repeater items. */
    size?: "xs" | "sm";
  }>(),
  { size: "sm" },
);

const { t } = useI18n();
</script>

<template>
  <UBadge
    v-for="group in groups"
    :key="`${group.icon}|${group.color}`"
    :icon="group.icon"
    :color="group.color"
    :label="group.count"
    :size="size"
    variant="subtle"
    role="img"
    :aria-label="
      t(
        'mapo.form.annotationCount',
        { n: group.count, labels: group.labels.join(', ') },
        group.count,
      )
    "
  />
</template>
