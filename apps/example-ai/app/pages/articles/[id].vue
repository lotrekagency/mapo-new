<script setup lang="ts">
// An article, with Magic Fill: "Fill with AI" in the sidebar card opens the
// panel, where a text or files go to the provider and model the signed-in
// user may call (the keys of the AI settings page). The verified values go
// into the empty fields; the others wait in the banner above the form and
// on their fields. The sources are a list: the AI's go after the article's
// own, chosen one by one in the banner. The category is a relation, which
// the operator chooses; the date of publication shows once the article is
// published. Nothing is saved until Save. The page keeps drafts: after a
// reload, Restore brings back the values and Magic Fill's session, the
// marks with their quotes and Undo all, without calling the provider again.
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
  {
    key: "sources",
    type: "repeater",
    label: "Sources",
    fields: [
      { key: "title", type: "text", label: "Title", cols: 6 },
      { key: "url", type: "url", label: "Link", cols: 6 },
    ],
  },
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
  // Shown only for a published article: a status of "published" in Magic
  // Fill's answer reveals it, and its verified date then goes in too.
  {
    key: "published_on",
    type: "date",
    label: "Published on",
    show: ({ model }) => model.status === "published",
  },
  // A relation, chosen with a search: Magic Fill never writes it, and the
  // name the AI gives waits on the field, "To set by hand".
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
      permission-model="article"
      :fields="fields"
      :sidebar-fields="sidebarFields"
      :draft="true"
    />
  </div>
</template>
