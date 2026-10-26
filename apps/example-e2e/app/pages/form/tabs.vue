<script setup lang="ts">
// Tests: MapoForm tab layout. Fields without `tab` go to the "General" tab
// (mapo.form.defaultTab) once other fields have one, and a tab whose fields are
// all hidden by `visible` stays out of the tab bar. Here every General field
// depends on the template picked in the side form, as on a new page whose
// content depends on its template: General appears only once one is picked.
// `?template=home` opens the page with a template already picked.
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Form Tabs",
  icon: "i-lucide-panels-top-left",
  middleware: ["auth"],
});

interface Page {
  template: string;
  title: string;
  intro: string;
  meta_title: string;
  meta_description: string;
}

const route = useRoute();

const model = ref<Page>({
  template: String(route.query.template ?? ""),
  title: "",
  intro: "",
  meta_title: "",
  meta_description: "",
});

const hasTemplate = ({ model }: { model: Page }) => model.template !== "";

// No `tab` on the first two: they make up the General tab.
const fields: FieldDescriptor<Page>[] = [
  { key: "title", type: "text", label: "Title", visible: hasTemplate },
  { key: "intro", type: "textarea", label: "Intro", visible: hasTemplate },
  { key: "meta_title", type: "text", label: "Meta title", tab: "SEO" },
  {
    key: "meta_description",
    type: "textarea",
    label: "Meta description",
    tab: "SEO",
  },
];

// The side form edits the same model, like the sidebar of MapoDetail.
const sideFields: FieldDescriptor<Page>[] = [
  {
    key: "template",
    type: "select",
    label: "Template",
    attrs: {
      items: [
        { label: "No template", value: "" },
        { label: "Home", value: "home" },
        { label: "Landing", value: "landing" },
      ],
    },
  },
];
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Form Tabs</h1>
      <p class="text-muted text-sm mt-1">
        Fields without a <code>tab</code> go to the General tab. Here they all
        depend on the template, so General stays out of the tab bar until one is
        picked.
      </p>
    </div>

    <div class="grid grid-cols-12 gap-6 items-start">
      <div class="col-span-12 md:col-span-8">
        <MapoForm v-model="model" :fields="fields" />
      </div>
      <UCard class="col-span-12 md:col-span-4">
        <MapoForm v-model="model" :fields="sideFields" />
      </UCard>
    </div>
  </div>
</template>
