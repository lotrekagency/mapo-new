<script setup lang="ts">
// Tests: MapoForm tab layout. Fields without `tab` go to the "General" tab
// (mapo.form.defaultTab) once other fields have one, and a tab whose fields are
// all hidden by `visible` stays out of the tab bar. Here every General field
// depends on the template picked in the side form, as on a new page whose
// content depends on its template: General appears only once one is picked.
// `?template=home` opens the page with a template already picked.
// Some fields belong to one template only, and a hidden field takes its grid
// cell with it: with "landing", `cta_label` starts its row where the removed
// `hero_title` was, and the "Hero" group leaves no empty card. The "Call to
// action" group uses `show`, so its card is hidden, not removed, and its field
// stays mounted.
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
  hero_title: string;
  cta_label: string;
  hero_subtitle: string;
  cta_url: string;
  meta_title: string;
  meta_description: string;
}

const route = useRoute();

// A value of its own: the select's items cannot use an empty string, which
// Reka UI keeps for "nothing selected".
const NO_TEMPLATE = "none";

const model = ref<Page>({
  template: String(route.query.template ?? NO_TEMPLATE),
  title: "",
  intro: "",
  hero_title: "",
  cta_label: "",
  hero_subtitle: "",
  cta_url: "",
  meta_title: "",
  meta_description: "",
});

const hasTemplate = ({ model }: { model: Page }) =>
  model.template !== NO_TEMPLATE;
const isHome = ({ model }: { model: Page }) => model.template === "home";
const isLanding = ({ model }: { model: Page }) => model.template === "landing";

// No `tab` on the fields before the SEO ones: they make up the General tab.
const fields: FieldDescriptor<Page>[] = [
  { key: "title", type: "text", label: "Title", visible: hasTemplate },
  { key: "intro", type: "textarea", label: "Intro", visible: hasTemplate },
  // Half a row each, for one template each: the one shown starts the row.
  {
    key: "hero_title",
    type: "text",
    label: "Hero title",
    cols: 6,
    visible: isHome,
  },
  {
    key: "cta_label",
    type: "text",
    label: "Call-to-action label",
    cols: 6,
    visible: isLanding,
  },
  {
    key: "hero_subtitle",
    type: "text",
    label: "Hero subtitle",
    group: "Hero",
    visible: isHome,
  },
  {
    key: "cta_url",
    type: "text",
    label: "Call-to-action URL",
    group: "Call to action",
    show: isLanding,
  },
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
        { label: "No template", value: NO_TEMPLATE },
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
        picked. The fields of the other template leave no gap and no empty card.
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
