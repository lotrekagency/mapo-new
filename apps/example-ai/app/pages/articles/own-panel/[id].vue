<script setup lang="ts">
// The same article, filled by a panel of the app's own instead of Magic
// Fill: a detail extension above the form (components/ArticleAiPanel.vue)
// that calls useMapoAiFill() and useMapoAiRead() of @mapomodule/ai, the
// operations Magic Fill is built on. The `extensions` prop of MapoDetail
// lists the extensions the page shows: only the app's panel, so Magic
// Fill, which the module adds to every detail, stays out. The marks on the
// fields (Apply, Keep, Restore, Ignore) are the composable's: the panel
// only picks the source and shows what became of each field. The page
// keeps no drafts, so it never shares one with /articles/[id].
import ArticleAiPanel from "~/components/ArticleAiPanel.vue";
import { ARTICLE_FIELDS, ARTICLE_SIDEBAR_FIELDS } from "~/utils/articleForm";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
});

const route = useRoute();

const removeExtension = defineDetailExtension({
  key: "article-ai-panel",
  placement: "body-top",
  component: ArticleAiPanel,
});
onUnmounted(removeExtension);
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :id="String(route.params.id)"
      :extensions="['article-ai-panel']"
      endpoint="/api/articles"
      model-name="Article"
      permission-model="article"
      :fields="ARTICLE_FIELDS"
      :sidebar-fields="ARTICLE_SIDEBAR_FIELDS"
    />
  </div>
</template>
