<script setup lang="ts">
// Tests: useMapoAiFill() of @mapomodule/ai, the walking skeleton of AI data
// entry. The page registers a detail extension above the form
// (components/ai/AiFillPanel.vue) that fills the article through the AI
// gateway, POST /_mapo/ai/run, with the mock provider nuxt.config.ts
// enables: no network, no key, no cost. The gateway builds what the AI may
// fill from the form's fields and the backend's OPTIONS of /api/articles/:
// the form decides which fields exist, the stricter limit wins (the
// backend's reading time stops at 120, the form's status has no
// "Archived"). Try it:
// - /ai/fill/new: the verified values go into the empty fields;
// - /ai/fill/1: a value that would replace one waits for Apply;
// - the Italian tab: Subtitle and Body are translatable, filled in the
//   language of the tab;
// - as viewer: the app's mapo-ai:user hook keeps the account out.
import AiFillPanel from "~/components/ai/AiFillPanel.vue";
import {
  AI_ARTICLE_FIELDS,
  AI_ARTICLE_LANGUAGES,
  AI_ARTICLE_SIDEBAR_FIELDS,
} from "~/utils/aiArticleForm";

// The detail shows only this page's panel (`extensions`): Magic Fill, which
// the module adds to every MapoDetail, has a page of its own, /ai/magic-fill.
definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-sparkles",
  middleware: ["auth"],
});

const route = useRoute();

const removeExtension = defineDetailExtension({
  key: "ai-fill",
  placement: "body-top",
  component: AiFillPanel,
});
onUnmounted(removeExtension);
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :extensions="['ai-fill']"
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      :fields="AI_ARTICLE_FIELDS"
      :sidebar-fields="AI_ARTICLE_SIDEBAR_FIELDS"
      :languages="AI_ARTICLE_LANGUAGES"
    />
  </div>
</template>
