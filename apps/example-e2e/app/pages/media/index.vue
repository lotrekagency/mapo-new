<script setup lang="ts">
import { navigateTo } from "#app";

definePageMeta({
  layout: "mapo-default",
  label: "Media",
  icon: "i-lucide-images",
  middleware: ["auth"],
});

// Wrapped in a function: `navigateTo` is auto-imported for the script block but
// template expressions resolve against the component instance, where it is absent.
function go(path: string) {
  return navigateTo(path);
}
</script>

<template>
  <div class="mx-auto max-w-2xl p-8 space-y-6">
    <h1 class="text-2xl font-bold">Media Manager — Demo Suite</h1>
    <p class="text-gray-500">
      Seleziona una delle demo disponibili per testare le funzionalità del Media
      Manager v2.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <UCard
        class="cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all"
        @click="go('/media/gallery')"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-images" class="size-8 text-primary-500" />
          <div>
            <p class="font-semibold">Gallery completa</p>
            <p class="text-sm text-gray-500">
              Cartelle, ricerca, editor drawer, bulk delete, paginazione
            </p>
          </div>
        </div>
      </UCard>
      <UCard
        class="cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all"
        @click="go('/media/picker')"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-image-plus" class="size-8 text-primary-500" />
          <div>
            <p class="font-semibold">Picker dialog</p>
            <p class="text-sm text-gray-500">
              Single, multi, filtro MIME — MapoMediaManagerDialog
            </p>
          </div>
        </div>
      </UCard>
      <UCard
        class="cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all"
        @click="go('/form/article/new')"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-newspaper" class="size-8 text-primary-500" />
          <div>
            <p class="font-semibold">Form con media fields</p>
            <p class="text-sm text-gray-500">
              MapoMediaField, MapoMediaM2mField, MapoEnhancedMediaField in
              MapoDetail
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
