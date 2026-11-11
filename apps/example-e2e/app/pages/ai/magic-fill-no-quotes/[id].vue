<script setup lang="ts">
// Tests: a page that asks the AI for no quotes of the source, with
// `definePageMeta({ magicFill: { evidence: false } })`: the same article as
// /ai/magic-fill, Magic Fill on. With no quote, no value is verified, so
// none goes in by itself: each waits on its field, whose mark says that the
// page asks for no quotes, and in the banner's preview, to fill or to
// replace. For a record whose values a source does not write word for word.
// The mock's own rules answer any text: paste the Lines sample below.
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
  magicFill: { evidence: false },
});

const route = useRoute();
const id = computed(() => String(route.params.id));
const lines = AI_ARTICLE_SAMPLES.filter((sample) => sample.label === "Lines");
const copied = ref<string>();

async function copy(label: string, text: string) {
  await navigator.clipboard.writeText(text);
  copied.value = label;
}
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Magic Fill asks for no quotes on this page"
      description="definePageMeta({ magicFill: { evidence: false } }): no value is verified, so none goes in by itself; each one waits on its field and in the banner's preview."
      :actions="[
        {
          label: 'The same article with quotes',
          to: `/ai/magic-fill/${id}`,
          color: 'neutral',
          variant: 'outline',
        },
      ]"
    />
    <MapoDetail
      :id="id"
      endpoint="/api/articles"
      model-name="Article"
      permission-model="article"
      :fields="AI_ARTICLE_FIELDS"
      :sidebar-fields="AI_ARTICLE_SIDEBAR_FIELDS"
      :languages="AI_ARTICLE_LANGUAGES"
    />
    <UCard>
      <template #header>
        <p class="font-semibold">A sample to paste in the panel</p>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="sample in lines"
          :key="sample.label"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
        >
          <span class="font-medium">{{ sample.label }}</span>
          <span class="min-w-0 flex-1 text-muted">
            {{ sample.description }}
          </span>
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-copy"
            :label="copied === sample.label ? 'Copied' : 'Copy'"
            @click="copy(sample.label, sample.text)"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
