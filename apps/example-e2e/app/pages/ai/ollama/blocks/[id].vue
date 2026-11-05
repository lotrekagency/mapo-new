<script setup lang="ts">
// Tests: the AI gateway with a real model on a complex form, in the AI lab.
// A landing page of the city magazine (app/utils/aiPageForm.ts) with every
// field type of Mapo, the app's two custom ones (`stars` and `country`,
// plugins/form-fields.ts) and repeaters of three kinds: blocks of nine
// templates the backend keeps as JSON, with a repeater or more blocks inside
// some of them; reviews and sites the backend describes too
// (server/utils/pageMetadata.ts), with the opening hours of each site inside.
// The same panel as the article's lab, /ai/ollama/[id], and the same switch:
// off unless the dev server starts with the models to offer.
//   EXAMPLE_OLLAMA_MODELS=gemma4:12b,qwen3.8:27b pnpm dev:example-e2e
// Try it:
// - /ai/ollama/blocks/new: the "Museum" source fills most of the page; the
//   blocks wait for Apply, since no quote proves which kind of block an item is;
// - /ai/ollama/blocks/1: a page with a title and a block already, so the
//   AI's values for them wait for Apply;
// - as editor: the account has no permission on pages, so run answers 403.
import { h } from "vue";
import AiOllamaPanel from "~/components/ai/AiOllamaPanel.vue";
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
  key: "ai-ollama",
  placement: "body-top",
  component: {
    render: () =>
      h(AiOllamaPanel, {
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
