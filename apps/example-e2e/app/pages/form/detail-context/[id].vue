<script setup lang="ts">
// Tests: the detail context (useMapoDetail) and detail extensions
// (defineDetailExtension). The page registers two extensions while it is open;
// a plugin would register them for every MapoDetail of the app:
// - an action above Save that writes the record and marks what it wrote;
// - a summary above the form that reads the context and the shared OPTIONS.
// The switch turns them off with the `extensions` prop; the side-bottom slot
// reads the fields the detail renders.
import type { AnyFieldDescriptor } from "mapomodule/types";
import DemoFillButton from "~/components/detail/DemoFillButton.vue";
import DemoContextSummary from "~/components/detail/DemoContextSummary.vue";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-plug",
  middleware: ["auth"],
});

const route = useRoute();
const showExtensions = ref(true);

const removeExtensions = [
  defineDetailExtension({
    key: "demo-fill",
    placement: "actions",
    component: DemoFillButton,
  }),
  defineDetailExtension({
    key: "demo-summary",
    placement: "body-top",
    component: DemoContextSummary,
  }),
];
onUnmounted(() => removeExtensions.forEach((remove) => remove()));

const fields: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "excerpt", type: "textarea", label: "Excerpt" },
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
    },
  },
];
const sidebarFields: AnyFieldDescriptor[] = [
  { key: "featured", type: "switch", label: "Featured" },
];
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-3">
    <div class="flex items-center justify-end gap-2">
      <span class="text-xs text-muted">Extensions</span>
      <USwitch v-model="showExtensions" size="sm" />
    </div>

    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      :fields="fields"
      :sidebar-fields="sidebarFields"
      :extensions="showExtensions"
    >
      <template
        #side-bottom="{ fields: bodyFields, sidebarFields: sideFields }"
      >
        <p class="text-xs text-muted">
          The side-bottom slot receives {{ bodyFields.length }} body fields and
          {{ sideFields.length }} sidebar field.
        </p>
      </template>
    </MapoDetail>
  </div>
</template>
