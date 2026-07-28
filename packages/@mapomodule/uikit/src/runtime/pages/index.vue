<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { version } from "../../../package.json";

definePageMeta({ layout: "mapo-default" });

const { t } = useI18n();
</script>

<template>
  <div class="flex h-full items-center justify-center p-8">
    <div class="space-y-4 rounded-lg border bg-white p-8 text-center shadow">
      <h1 class="text-2xl font-bold">{{ t("mapo.index.welcomeMessage") }}</h1>
      <p class="text-gray-600">Mapo UI Kit — {{ version }}</p>
    </div>
  </div>
</template>
