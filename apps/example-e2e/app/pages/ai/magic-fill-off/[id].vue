<script setup lang="ts">
// Tests: a page that turns Magic Fill off. With mapo.ai the module adds Magic
// Fill to every MapoDetail; `magicFill: false` in this page's meta leaves the
// page out, so the same article as /ai/magic-fill has no "Fill with AI" in
// the sidebar card and no banner above the form. The other ways to turn it
// off: `magicFill: false` in mapo.ai, for the whole app, and the `extensions`
// prop of MapoDetail, as the AI lab pages do.
import {
  AI_ARTICLE_FIELDS,
  AI_ARTICLE_LANGUAGES,
  AI_ARTICLE_SIDEBAR_FIELDS,
} from "~/utils/aiArticleForm";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-sparkles",
  middleware: ["auth"],
  magicFill: false,
});

const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Magic Fill is off on this page"
      description="definePageMeta({ magicFill: false }) leaves this page out: no Fill with AI in the sidebar card, no banner above the form."
      :actions="[
        {
          label: 'The same article with Magic Fill',
          to: `/ai/magic-fill/${id}`,
          color: 'neutral',
          variant: 'outline',
        },
      ]"
    />
    <MapoDetail
      :id="id"
      endpoint="/api/articles"
      model-name="Article"
      permission-model="article"
      :fields="AI_ARTICLE_FIELDS"
      :sidebar-fields="AI_ARTICLE_SIDEBAR_FIELDS"
      :languages="AI_ARTICLE_LANGUAGES"
    />
  </div>
</template>
