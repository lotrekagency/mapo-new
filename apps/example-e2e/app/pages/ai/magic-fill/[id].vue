<script setup lang="ts">
// Tests: Magic Fill of @mapomodule/ai, as every detail page of an app gets
// it with mapo.ai. The page registers no extension of its own: the module's
// plugin adds the "Fill with AI" button to the sidebar card and the banner
// above the form. Open the panel, paste a sample from the list below (or
// attach a file of public/ai-files/) and Extract: the mock answers, the
// verified values go into the empty fields, the others wait in the banner's
// summary and on their fields. Try it:
// - /ai/magic-fill/new: a new article;
// - /ai/magic-fill/1 with the sample "Update": the banner's preview lists
//   the values that would replace the article's, before and after and
//   unticked, and counts those it already holds; tick one and Apply
//   selected, or Apply on its field, whose mark says what it replaces;
// - /ai/magic-fill/new with "Council note": the category goes in by itself,
//   picked from the five Magic Fill lists for the AI; the author Rossi, one
//   of three among sixty, waits on its mark with the three to pick from;
// - /ai/magic-fill/1 with "Update": the author Bianchi waits with both
//   names, since the only author found is Marco Bianchi;
// - /ai/magic-fill/new with "Press release": the reviewer goes in, found by
//   her email, which the AI wrote without seeing the six reviewers: the
//   field says `ai: { list: false }`. The excerpt's `ai.hint` reaches the
//   model as the field's description in the answer's schema: the request
//   to `run` carries it, as `x-mapo-ai`, and "What I send to the AI" does
//   not show it;
// - "Next to check", in the banner: each press takes you to the next field
//   that waits, opening its tab, and puts the focus on it;
// - "What I send to the AI": the prompt the gateway composes, with the
//   app's rules (nuxt.config.ts and server/plugins/mapo-ai-rules.ts);
// - the sample "Slow": the phases, the time it takes, and Cancel, which
//   stops the mock on the server too (the audit says `cancelled`);
// - as viewer: the app's mapo-ai:user hook keeps the account out, and the
//   page shows no AI;
// - reload after Extract: the page keeps drafts, so its banner offers
//   Restore, which brings back the values, the marks with their quotes, the
//   summary and Undo all; Discard drops them, and Save clears the draft.
//   Leaving a new article that holds values asks for confirmation.
// `permission-model` names the backend model, so the gateway checks
// add_article (change_article for /1), as Save does.
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
      endpoint="/api/articles"
      model-name="Article"
      permission-model="article"
      :fields="AI_ARTICLE_FIELDS"
      :sidebar-fields="AI_ARTICLE_SIDEBAR_FIELDS"
      :languages="AI_ARTICLE_LANGUAGES"
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
          v-for="sample in AI_ARTICLE_SAMPLES"
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
