<script setup lang="ts">
/**
 * Media Gallery — full media manager in standalone page mode.
 * Demonstrates: gallery navigation, folder tree, search, bulk delete, editor drawer.
 */
definePageMeta({
  layout: "mapo-default",
  label: "Media Gallery",
  icon: "i-lucide-images",
  parent: "media",
  middleware: ["auth"],
});
</script>

<template>
  <div class="flex h-[calc(100vh-var(--mapo-topbar-height,56px))] flex-col">
    <div class="border-b bg-white px-6 py-4 dark:bg-gray-900">
      <h1 class="text-xl font-semibold">Media Gallery</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Gestione completa dei media — cartelle, ricerca, metadati, bulk delete
      </p>
    </div>
    <div class="flex-1 overflow-hidden">
      <MapoMediaManager :languages="['it', 'en']" default-lang="it" />
    </div>
  </div>
</template>
