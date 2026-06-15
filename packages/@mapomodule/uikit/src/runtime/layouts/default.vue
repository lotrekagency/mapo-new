<script setup lang="ts">
defineOptions({ name: "MapoDefaultLayout" });

defineSlots<{
  default(): void;
  "sidebar:logo"(): void;
  "sidebar:nav-top"(): void;
  "sidebar:nav-bottom"(): void;
  "sidebar:footer"(): void;
  "topbar:left"(): void;
  topbar(): void;
  "topbar:right"(): void;
}>();
</script>

<template>
  <div class="flex h-full overflow-hidden bg-default">
    <MapoSidebar>
      <template v-if="$slots['sidebar:logo']" #logo>
        <slot name="sidebar:logo" />
      </template>
      <template v-if="$slots['sidebar:nav-top']" #nav-top>
        <slot name="sidebar:nav-top" />
      </template>
      <template v-if="$slots['sidebar:nav-bottom']" #nav-bottom>
        <slot name="sidebar:nav-bottom" />
      </template>
      <template v-if="$slots['sidebar:footer']" #footer>
        <slot name="sidebar:footer" />
      </template>
    </MapoSidebar>

    <div class="flex flex-1 flex-col min-w-0 overflow-hidden">
      <MapoTopbar>
        <template v-if="$slots['topbar:left']" #left>
          <slot name="topbar:left" />
        </template>
        <template v-if="$slots['topbar']" #default>
          <slot name="topbar" />
        </template>
        <template v-if="$slots['topbar:right']" #right>
          <slot name="topbar:right" />
        </template>
      </MapoTopbar>

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <MapoRootComponents />
  </div>
</template>
