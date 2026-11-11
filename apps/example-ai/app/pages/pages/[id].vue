<script setup lang="ts">
// A page made of blocks, with Magic Fill: the list of blocks is the AI's to
// fill too. In the banner's preview each block is listed with its template
// and its first values, unticked, since no quote proves which template an
// item follows: tick the ones to add, and they go after the page's blocks,
// never one the page has already. The page keeps drafts, as the articles.
// `permission-model` names the backend model: the gateway checks add_page
// (change_page for a page that exists), as Save does, so `viewer`, who
// only reads pages, gets no Magic Fill.
import { PAGE_FIELDS, PAGE_SIDEBAR_FIELDS } from "~/utils/pageForm";

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
      endpoint="/api/pages"
      model-name="Page"
      permission-model="page"
      :fields="PAGE_FIELDS"
      :sidebar-fields="PAGE_SIDEBAR_FIELDS"
      :draft="true"
    />
  </div>
</template>
