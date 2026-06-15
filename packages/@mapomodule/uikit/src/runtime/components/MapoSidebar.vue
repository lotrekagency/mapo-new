<script setup lang="ts">
import { computed } from "vue";
import { useSidebarStore } from "@mapomodule/store/runtime/stores/sidebar";

defineSlots<{
  /** Logo / app name in the sidebar header. */
  logo(): unknown;
  /** Extra content above the main navigation list. */
  "nav-top"(): unknown;
  /** Extra content below the main navigation list. */
  "nav-bottom"(): unknown;
  /** Extra links or content between the footer nav and the user profile row. */
  "footer-extra"(): unknown;
  /** Replaces the user profile row at the very bottom of the sidebar. */
  footer(): unknown;
}>();

const sidebar = useSidebarStore();

const sidebarWidth = computed(() => (sidebar.mini ? "w-[60px]" : "w-60"));
</script>

<template>
  <Transition name="sidebar">
    <aside
      v-if="sidebar.drawer"
      class="relative flex flex-col h-full shrink-0 bg-elevated transition-[width] duration-200 overflow-hidden"
      :class="sidebarWidth"
      style="box-shadow: 1px 0 0 0 var(--ui-border)"
    >
      <!-- Logo header — same height as topbar so they sit flush -->
      <div
        class="flex h-14 shrink-0 items-center p-3 pt-1"
        :class="sidebar.mini ? 'justify-center' : 'justify-between gap-2'"
      >
        <template v-if="sidebar.mini">
          <UTooltip text="Expand" :side="'right'">
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-panel-left-open"
              size="sm"
              @click="sidebar.toggleMini()"
            />
          </UTooltip>
        </template>
        <template v-else>
          <slot name="logo">
            <NuxtLink to="/" class="flex items-center gap-2.5 min-w-0">
              <div
                class="size-7 rounded-lg bg-primary flex items-center justify-center shrink-0"
              >
                <UIcon name="i-lucide-layers" class="size-4 text-white" />
              </div>
              <span class="font-semibold text-sm text-highlighted truncate"
                >Mapo</span
              >
            </NuxtLink>
          </slot>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-panel-left-close"
            size="sm"
            class="shrink-0"
            @click="sidebar.toggleMini()"
          />
        </template>
      </div>

      <!-- Navigation -->
      <div class="flex-1 overflow-y-auto py-2 px-2 space-y-4">
        <slot name="nav-top" />
        <MapoSidebarList :mini="sidebar.mini" />
        <slot name="nav-bottom" />
      </div>

      <!-- Footer nav (sidebarFooter routes) -->
      <div v-if="!sidebar.mini" class="px-2 pb-1">
        <MapoSidebarList footer :mini="sidebar.mini" />
      </div>

      <!-- Extra footer content (above user row) -->
      <slot name="footer-extra" />

      <!-- User row -->
      <div
        class="shrink-0 px-2 pb-3 pt-1"
        style="border-top: 1px solid var(--ui-border)"
      >
        <slot name="footer">
          <MapoSidebarProfile :mini="sidebar.mini" />
        </slot>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition:
    width 0.2s ease,
    opacity 0.15s ease;
  overflow: hidden;
}
.sidebar-enter-from,
.sidebar-leave-to {
  width: 0 !important;
  opacity: 0;
}
</style>
