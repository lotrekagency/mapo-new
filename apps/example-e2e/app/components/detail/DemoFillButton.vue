<script setup lang="ts">
// A detail extension placed in "actions", above Save. Through the context the
// detail shares (useMapoDetail), it writes the record and marks what it wrote,
// as an assistant would: Confirm on a mark removes it.
import type { FieldAnnotation } from "mapomodule/types";

const detail = useMapoDetail<{ title?: string; excerpt?: string }>();

function mark(path: string): FieldAnnotation {
  return {
    label: "Filled by the demo extension",
    icon: "i-lucide-sparkles",
    color: "info",
    actions: [
      {
        label: "Confirm",
        icon: "i-lucide-check",
        onClick: () => dismiss(path),
      },
    ],
  };
}

function dismiss(path: string) {
  if (!detail) return;
  const { [path]: _, ...rest } = detail.annotations.value;
  detail.annotations.value = rest;
}

function fill() {
  if (!detail) return;
  detail.model.value.title = "Filled by an extension";
  detail.model.value.excerpt = "Written through useMapoDetail().";
  detail.annotations.value = { title: mark("title"), excerpt: mark("excerpt") };
}
</script>

<template>
  <UButton
    v-if="detail"
    block
    color="info"
    variant="soft"
    icon="i-lucide-sparkles"
    :disabled="detail.readonly.value || detail.isBusy.value"
    @click="fill"
  >
    Fill with demo values
  </UButton>
</template>
