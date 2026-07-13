<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  label: "Media",
  icon: "i-lucide-images",
  middleware: ["auth"],
});
</script>

<template>
  <div class="flex h-[calc(100vh-var(--mapo-topbar-height,56px))] flex-col">
    <div class="border-b bg-white px-6 py-4 dark:bg-gray-900">
      <h1 class="text-xl font-semibold">Media Manager</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Gestisci immagini, video e documenti del sito
      </p>
    </div>

    <div class="flex-1 overflow-hidden">
      <MapoMediaManager :languages="['it', 'en']" default-lang="it" />
    </div>
  </div>
</template>
