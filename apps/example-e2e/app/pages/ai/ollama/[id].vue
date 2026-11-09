<script setup lang="ts">
// Tests: the AI gateway with a real model, the AI lab. The same article as
// /ai/fill, filled through POST /_mapo/ai/run by a local Ollama, through
// one of two providers: Mapo's own `ollama`, or the app's `example-ollama`
// (server/plugins/mapo-ai-ollama.ts), which shows how an app registers a
// provider of its own. Off unless the dev server starts with the models to
// offer, the first the default:
//   EXAMPLE_OLLAMA_MODELS=gemma4:12b,qwen3.8:27b pnpm dev:example-e2e
// The panel above the form (components/ai/AiOllamaPanel.vue) shows what
// happens while it happens: the browser's steps, and the server's from
// /_ai-lab/trace (for superusers: sign in as admin). With `example-ollama`
// the trace also has the prompt the gateway composed and the model's words
// as they come, since the app's provider writes them. The terminal of the
// dev server prints the same steps, as `[ai-lab]` lines.
// The same lab fills a form with blocks: pages/ai/ollama/blocks/[id].vue.
import { h } from "vue";
import AiOllamaPanel from "~/components/ai/AiOllamaPanel.vue";
import { AI_REAL_SAMPLES } from "#shared/aiArticleSamples";
import {
  AI_ARTICLE_FIELDS,
  AI_ARTICLE_LANGUAGES,
  AI_ARTICLE_SIDEBAR_FIELDS,
} from "~/utils/aiArticleForm";

// The detail shows only this page's panel (`extensions`): Magic Fill, which
// the module adds to every MapoDetail, has a page of its own, /ai/magic-fill.
definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-flask-conical",
  middleware: ["auth"],
});

const route = useRoute();

// The panel, with what the AI should know about an article and the sources
// to offer.
const removeExtension = defineDetailExtension({
  key: "ai-ollama",
  placement: "body-top",
  component: {
    render: () =>
      h(AiOllamaPanel, {
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
      :extensions="['ai-ollama']"
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      :fields="AI_ARTICLE_FIELDS"
      :sidebar-fields="AI_ARTICLE_SIDEBAR_FIELDS"
      :languages="AI_ARTICLE_LANGUAGES"
    />
  </div>
</template>
