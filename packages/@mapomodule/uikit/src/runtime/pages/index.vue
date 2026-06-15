<script setup lang="ts">
import { version } from "../../../package.json";

definePageMeta({ layout: "mapo-default" });
</script>

<template>
  <div class="flex h-full items-center justify-center p-8">
    <div class="space-y-4 rounded-lg border bg-white p-8 text-center shadow">
      <h1 class="text-2xl font-bold">Mapo UI Kit</h1>
      <p class="text-gray-600">Version {{ version }}</p>
    </div>
  </div>
</template>
