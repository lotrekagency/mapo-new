<script setup lang="ts">
// The same article, on a page that turns Magic Fill off: no "Fill with AI"
// in the sidebar card, no banner above the form. One line of the page's
// meta does it; `mapo.ai.magicFill: false` in nuxt.config.ts would turn it
// off on every page of the app. The AI gateway stays on: the AI settings
// page, the status and the other pages still use it.
import { ARTICLE_FIELDS, ARTICLE_SIDEBAR_FIELDS } from "~/utils/articleForm";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  magicFill: false,
});

const route = useRoute();
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      permission-model="article"
      :fields="ARTICLE_FIELDS"
      :sidebar-fields="ARTICLE_SIDEBAR_FIELDS"
    />
  </div>
</template>
