<script setup lang="ts">
// Tests: the AI gateway with a cloud model, in the AI lab. The same article
// as /ai/fill and /ai/ollama, filled through POST /_mapo/ai/run by Mapo's
// `openai` or `anthropic` provider. Every call costs money: the lab is on
// only when the dev server has a key, from its environment or
// apps/example-e2e/.env:
//   NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY=…    enables `openai`
//   NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY=… enables `anthropic`
// Mapo's options of each provider change from the same environment, with
// no new build: NUXT_MAPO_AI_PROVIDERS_OPENAI_EFFORT=medium,
// NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_PROMPT_CACHE=true. The panel above the
// form (components/ai/AiCloudPanel.vue) says what each call took: the time,
// the tokens, the prompt cache's share, the model that answered and an
// estimate of the cost. The same lab fills a form with blocks:
// pages/ai/cloud/blocks/[id].vue.
import { h } from "vue";
import AiCloudPanel from "~/components/ai/AiCloudPanel.vue";
import { AI_REAL_SAMPLES } from "#shared/aiArticleSamples";
import {
  AI_ARTICLE_FIELDS,
  AI_ARTICLE_LANGUAGES,
  AI_ARTICLE_SIDEBAR_FIELDS,
} from "~/utils/aiArticleForm";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-cloud",
  middleware: ["auth"],
});

const route = useRoute();

// The panel, with what the AI should know about an article and the sources
// to offer.
const removeExtension = defineDetailExtension({
  key: "ai-cloud",
  placement: "body-top",
  component: {
    render: () =>
      h(AiCloudPanel, {
        entity: {
          label: "Article",
          description: "An article of the city magazine.",
          model: "article",
        },
        samples: AI_REAL_SAMPLES,
      }),
  },
});
onUnmounted(removeExtension);
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      :fields="AI_ARTICLE_FIELDS"
      :sidebar-fields="AI_ARTICLE_SIDEBAR_FIELDS"
      :languages="AI_ARTICLE_LANGUAGES"
    />
  </div>
</template>
