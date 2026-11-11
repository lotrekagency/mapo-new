<script setup lang="ts">
// Tests: Magic Fill on a form with lists, the page of blocks of the AI lab
// (app/utils/aiPageForm.ts), as every detail page of an app gets it with
// mapo.ai: the page registers nothing. Paste the sample below in the panel
// and Extract: the mock answers with blocks and reviews, and the banner's
// preview gives each list's items one by one, each with its tick. Try it:
// - /ai/magic-fill-blocks/1: the page has a hero and a review already. The
//   sample gives them again, so the preview says they are already in the
//   list and never adds them a second time; the other items go after the
//   page's own. Blocks are never ticked from the start (no quote proves a
//   template); the verified review is. The list's mark applies the
//   verified items, or says to choose them;
// - Apply selected with some items unticked: the list's proposal is used,
//   and Restore on the list takes the added items back, with the proposal;
// - /ai/magic-fill-blocks/new: a new page, whose lists start empty.
import { AI_PAGE_MOCK_SAMPLES } from "#shared/aiPageSamples";
import {
  AI_PAGE_FIELDS,
  AI_PAGE_LANGUAGES,
  AI_PAGE_SIDEBAR_FIELDS,
} from "~/utils/aiPageForm";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-list-checks",
  middleware: ["auth"],
});

const route = useRoute();
const copied = ref<string>();

async function copy(label: string, text: string) {
  await navigator.clipboard.writeText(text);
  copied.value = label;
}
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-4">
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/pages"
      model-name="Page"
      :fields="AI_PAGE_FIELDS"
      :sidebar-fields="AI_PAGE_SIDEBAR_FIELDS"
      :languages="AI_PAGE_LANGUAGES"
      :draft="true"
    />
    <UCard>
      <template #header>
        <p class="font-semibold">Samples to paste in the panel</p>
        <p class="text-sm text-muted">
          The mock answers each one as its description says.
        </p>
      </template>
      <ul class="divide-y divide-default text-sm">
        <li
          v-for="sample in AI_PAGE_MOCK_SAMPLES"
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
