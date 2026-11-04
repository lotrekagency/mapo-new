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
import type { AnyFieldDescriptor } from "mapomodule/types";
import AiFillPanel from "~/components/ai/AiFillPanel.vue";

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

const LANGUAGES = ["en", "it"];

const fields: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "subtitle", type: "text", label: "Subtitle", translatable: true },
  { key: "excerpt", type: "textarea", label: "Excerpt" },
  { key: "body", type: "editor", label: "Body", translatable: true },
];

const sidebarFields: AnyFieldDescriptor[] = [
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "In review", value: "review" },
        { label: "Ready", value: "ready" },
        { label: "Published", value: "published" },
      ],
    },
  },
  { key: "featured", type: "switch", label: "Featured" },
  { key: "reading_time", type: "number", label: "Reading time" },
  { key: "published_at", type: "datetime", label: "Published at" },
  {
    key: "category",
    type: "fks",
    label: "Category",
    attrs: {
      endpoint: "/api/categories",
      itemText: "name",
      itemValue: "id",
      returnObject: false,
    },
  },
];
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      :fields="fields"
      :sidebar-fields="sidebarFields"
      :languages="LANGUAGES"
    />
  </div>
</template>
