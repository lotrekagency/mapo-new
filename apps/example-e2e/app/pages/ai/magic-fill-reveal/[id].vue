<script setup lang="ts">
// Tests: a field the answer itself reveals. The excerpt shows only once the
// article has a status other than draft, so on a new article it is hidden
// when the answer comes, and a value never goes by itself into a field the
// operator does not see. Paste "Lines" and Extract: the status goes in, the
// excerpt shows, and its verified value goes in too, after the status. Set
// the status back to draft: the excerpt hides again, with the AI's value.
// The form differs from the other AI pages only in the excerpt's `show`,
// written here, so the shared article form stays as it is.
import type { AnyFieldDescriptor } from "mapomodule/types";
import { AI_ARTICLE_SAMPLES } from "#shared/aiArticleSamples";
import {
  AI_ARTICLE_FIELDS,
  AI_ARTICLE_LANGUAGES,
  AI_ARTICLE_SIDEBAR_FIELDS,
} from "~/utils/aiArticleForm";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-sparkles",
  middleware: ["auth"],
});

const fields: AnyFieldDescriptor[] = AI_ARTICLE_FIELDS.map((field) =>
  field.key === "excerpt"
    ? {
        ...field,
        show: ({ model }) => Boolean(model.status) && model.status !== "draft",
      }
    : field,
);

const route = useRoute();
const lines = AI_ARTICLE_SAMPLES.find((sample) => sample.label === "Lines");
const copied = ref(false);

async function copyLines() {
  if (!lines) return;
  await navigator.clipboard.writeText(lines.text);
  copied.value = true;
}
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="The excerpt shows once the article has a status"
      description="Paste Lines and Extract: the status goes in, the excerpt shows, and its verified value goes in too."
      :actions="[
        {
          label: copied ? 'Copied' : 'Copy Lines',
          icon: 'i-lucide-copy',
          color: 'neutral',
          variant: 'outline',
          onClick: copyLines,
        },
      ]"
    />
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      permission-model="article"
      :fields="fields"
      :sidebar-fields="AI_ARTICLE_SIDEBAR_FIELDS"
      :languages="AI_ARTICLE_LANGUAGES"
    />
  </div>
</template>
