<script setup lang="ts">
defineOptions({ name: "MapoCustomLayout" });
</script>

<template>
  <!-- Extends mapo-default with slot overrides for logo, nav-bottom, topbar:right -->
  <div class="flex h-full overflow-hidden bg-default">
    <MapoSidebar>
      <!-- Custom logo: brand icon + app name -->
      <template #logo>
        <div class="flex items-center gap-2 px-1">
          <UIcon name="i-lucide-box" class="text-primary size-6 shrink-0" />
          <span
            class="font-bold text-highlighted text-sm tracking-wide truncate"
          >
            E2E Admin
          </span>
        </div>
      </template>

      <!-- Extra link injected below the main nav -->
      <template #nav-bottom>
        <div class="px-2 py-1">
          <UButton
            to="https://github.com"
            target="_blank"
            variant="ghost"
            color="neutral"
            size="sm"
            leading-icon="i-lucide-github"
            class="w-full justify-start"
          >
            GitHub
          </UButton>
        </div>
      </template>
    </MapoSidebar>

    <div class="flex flex-1 flex-col min-w-0 overflow-hidden">
      <MapoTopbar>
        <!-- Custom right area: notification bell + user avatar -->
        <template #right>
          <UButton
            icon="i-lucide-bell"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Notifications"
          />
          <UAvatar text="EA" size="sm" class="cursor-pointer" />
        </template>
      </MapoTopbar>

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <MapoRootComponents />
  </div>
</template>
