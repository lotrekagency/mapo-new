<script setup lang="ts">
import { computed } from "vue";
import type { ListTabItem } from "../types/list.js";

const props = defineProps<{
  tabs: ListTabItem[];
  modelValue?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const active = computed(() => props.modelValue ?? props.tabs[0]?.value ?? "");

defineSlots<{
  /** Override for a single tab button. Receives `{ tab: ListTabItem, active: boolean }`. */
  tab(props: { tab: ListTabItem; active: boolean }): any;
}>();
</script>

<template>
  <div
    v-if="tabs.length"
    class="mapo-list-tabs flex gap-4 border-b border-default mb-4"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      class="pb-2 text-sm font-medium transition-colors relative"
      :class="
        active === tab.value
          ? 'text-primary border-b-2 border-primary -mb-px'
          : 'text-muted hover:text-default'
      "
      @click="emit('update:modelValue', tab.value)"
    >
      <slot name="tab" :tab="tab" :active="active === tab.value">
        {{ tab.text }}
        <UBadge
          v-if="tab.count !== undefined"
          :label="String(tab.count)"
          size="xs"
          variant="soft"
          class="ml-1"
        />
      </slot>
    </button>
  </div>
</template>
