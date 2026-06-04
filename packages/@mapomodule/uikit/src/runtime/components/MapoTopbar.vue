<script setup lang="ts">
import { useSidebarStore } from "@mapomodule/store/runtime/stores/sidebar";

defineSlots<{
  left(): void;
  default(): void;
  right(): void;
}>();

const sidebar = useSidebarStore();
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center gap-3 border-b border-muted bg-elevated/60 px-4 backdrop-blur-sm"
  >
    <UButton
      v-if="!sidebar.drawer"
      variant="ghost"
      color="neutral"
      icon="i-lucide-panel-left-open"
      size="sm"
      @click="sidebar.toggleDrawer()"
    />

    <slot name="left" />

    <div class="flex-1">
      <slot />
    </div>

    <div class="flex items-center gap-1.5">
      <slot name="right" />
    </div>
  </header>
</template>
