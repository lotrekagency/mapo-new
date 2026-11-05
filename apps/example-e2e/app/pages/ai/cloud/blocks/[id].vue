<script setup lang="ts">
// Tests: the AI gateway with a cloud model on a complex form, in the AI lab.
// The landing page of /ai/ollama/blocks (app/utils/aiPageForm.ts): every
// field type of Mapo, the app's custom `stars` and `country`, blocks of nine
// templates, reviews and sites with their opening hours. Its answer's schema
// is the largest of the app, so it shows what a large form costs, and
// whether a provider's structured outputs take it: Anthropic refuses a
// schema too complex to compile, and the gateway says so. The same panel as
// the article's, /ai/cloud/[id], on when the dev server has a key:
//   NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY=…
//   NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY=…
// Try it:
// - /ai/cloud/blocks/new: the "Museum" source fills most of the page; the
//   blocks wait for Apply, since no quote proves which kind of block an item is;
// - /ai/cloud/blocks/1: a page with a title and a block already, so the
//   AI's values for them wait for Apply.
import { h } from "vue";
import AiCloudPanel from "~/components/ai/AiCloudPanel.vue";
import { AI_PAGE_SAMPLES } from "#shared/aiPageSamples";
import {
  AI_PAGE_FIELDS,
  AI_PAGE_LANGUAGES,
  AI_PAGE_SIDEBAR_FIELDS,
} from "~/utils/aiPageForm";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-blocks",
  middleware: ["auth"],
});

const route = useRoute();

const removeExtension = defineDetailExtension({
  key: "ai-cloud",
  placement: "body-top",
  component: {
    render: () =>
      h(AiCloudPanel, {
        entity: {
          label: "Page",
          description:
            "A landing page of the city magazine, about a place of the city: blocks of content, reviews of visitors, the sites and their opening hours.",
          model: "page",
        },
        samples: AI_PAGE_SAMPLES,
      }),
  },
});
onUnmounted(removeExtension);
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/pages"
      model-name="Page"
      :fields="AI_PAGE_FIELDS"
      :sidebar-fields="AI_PAGE_SIDEBAR_FIELDS"
      :languages="AI_PAGE_LANGUAGES"
    />
  </div>
</template>
