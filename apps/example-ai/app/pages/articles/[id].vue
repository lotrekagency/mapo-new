<script setup lang="ts">
// An article, with Magic Fill: "Fill with AI" in the sidebar card opens the
// panel, where a text or files go to the provider and model the signed-in
// user may call (the keys of the AI settings page). The verified values go
// into the empty fields; the others wait in the banner above the form and
// on their fields. The form is in app/utils/articleForm.ts, shared by the
// pages that show the other ways (app/pages/articles/*/[id].vue): a list
// of sources, a category and tags Magic Fill finds on the backend, a date
// shown once the article is published. Nothing is saved until Save. The
// page keeps drafts: after a reload, Restore brings back the values and
// Magic Fill's session, the marks with their quotes and Undo all, without
// calling the provider again. `permission-model` names the backend model:
// the gateway checks add_article (change_article for an article that
// exists), as Save does, so `viewer`, who only reads articles, gets no
// Magic Fill.
import { ARTICLE_FIELDS, ARTICLE_SIDEBAR_FIELDS } from "~/utils/articleForm";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
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
      :draft="true"
    />
  </div>
</template>
