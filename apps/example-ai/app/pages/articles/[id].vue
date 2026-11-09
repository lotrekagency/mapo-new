<script setup lang="ts">
// An article, with Magic Fill: "Fill with AI" in the sidebar card opens the
// panel, where a text or files go to the provider and model the signed-in
// user may call (the keys of the AI settings page). The verified values go
// into the empty fields; the others wait in the banner above the form and
// on their fields. Nothing is saved until Save.
// `permission-model` names the backend model: the gateway checks
// add_article (change_article for an article that exists), as Save does,
// so `viewer`, who only reads articles, gets no Magic Fill.
import type { AnyFieldDescriptor } from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
});

const route = useRoute();

const fields: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "subtitle", type: "text", label: "Subtitle" },
  { key: "excerpt", type: "textarea", label: "Excerpt" },
  { key: "body", type: "editor", label: "Body" },
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
        { label: "Published", value: "published" },
      ],
    },
  },
  { key: "featured", type: "switch", label: "Featured" },
  { key: "reading_time", type: "number", label: "Reading time (minutes)" },
  { key: "published_on", type: "date", label: "Published on" },
];
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      permission-model="article"
      :fields="fields"
      :sidebar-fields="sidebarFields"
    />
  </div>
</template>
