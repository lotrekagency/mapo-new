<script setup lang="ts">
// The same article, on a page whose Magic Fill asks the AI for no quotes:
// the answer comes back without the words of the source that prove each
// value, so no value is verified and none goes into the form by itself.
// Every value waits in the banner's preview, to tick and apply, and the
// prompt is shorter: "What I send to the AI" says so. For a source whose
// facts the operator checks anyway, where the quotes cost more than they
// help. The page keeps no drafts, so it never shares one with
// /articles/[id], the same record's page.
import { ARTICLE_FIELDS, ARTICLE_SIDEBAR_FIELDS } from "~/utils/articleForm";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  magicFill: { evidence: false },
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
