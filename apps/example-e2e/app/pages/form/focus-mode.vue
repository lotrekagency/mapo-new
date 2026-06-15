<script setup lang="ts">
// Tests: MapoFocusPortal + useFocusMode — clicking maximize on a repeater item opens
// a full-screen overlay showing only that item's fields, edits propagate back to the
// repeater in real time, Esc/close restores the view, breadcrumb shows repeater > item label,
// focus trap prevents Tab from escaping the overlay, isActive/focusTarget state.
// E2E plan: e2e/form/focus-mode.md
import type { RepeaterDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Focus Mode",
  icon: "i-lucide-maximize-2",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

interface Article {
  title: string;
  body: string;
  excerpt: string;
}
interface Model {
  articles: Article[];
}

const model = ref<Model>({
  articles: [
    { title: "First article", body: "Body of the first article.", excerpt: "" },
    {
      title: "Second article",
      body: "Body of the second article.",
      excerpt: "",
    },
  ],
});

// Focus mode is triggered by the maximize icon on each repeater item.
// MapoFocusPortal must be mounted somewhere in the layout (included via mapo-default layout).
const repeater: RepeaterDescriptor<Model> = {
  key: "articles",
  type: "repeater",
  label: "Articles (click ↗ maximize icon to enter Focus Mode)",
  fields: [
    { key: "title", type: "text", label: "Title", required: true },
    { key: "body", type: "textarea", label: "Body", attrs: { rows: 4 } },
    { key: "excerpt", type: "text", label: "Excerpt" },
  ],
  attrs: {
    previewLabel: (item: unknown) => (item as Article).title || "Untitled",
    allowDuplicate: false,
    confirmDelete: false,
  },
};

// useFocusMode state for inspector
const focusMode = useFocusMode?.();
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Focus Mode</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/focus-mode.md</code>
      </p>
    </div>

    <!-- Focus mode state inspector -->
    <UCard v-if="focusMode">
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >useFocusMode state</span
        >
      </template>
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">isActive</dt>
        <dd>
          <UBadge
            :color="focusMode.isActive.value ? 'success' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ focusMode.isActive.value }}
          </UBadge>
        </dd>
        <dt class="text-muted">focusTarget</dt>
        <dd class="text-xs text-muted">
          {{ focusMode.isActive.value ? "set" : "null" }}
        </dd>
      </dl>
    </UCard>

    <!-- Repeater with focus mode — tests 1.1: click maximize opens overlay -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted">
          Repeater with Focus Mode (tests 1.1–2.3, 3.1–3.3)
        </span>
      </template>
      <p class="text-xs text-muted mb-3">
        Click the <strong>↗ maximize icon</strong> on any item to open Focus
        Mode overlay. Edit fields inside → verify changes propagate back (test
        2.1). Press Esc or click Close → verify overlay closes and edits are
        kept (test 3.1–3.2).
      </p>

      <MapoForm
        v-model="model"
        :fields="[repeater]"
        :errors="{}"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Live model — verify edits made in focus mode propagate -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Live model (edits in focus mode should appear here)</span
        >
      </template>
      <pre class="text-xs overflow-auto max-h-40">{{
        JSON.stringify(model.articles, null, 2)
      }}</pre>
    </UCard>

    <!-- Checklist -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Manual checklist</span
        >
      </template>
      <ul class="space-y-1.5 text-sm text-muted list-disc list-inside">
        <li>Overlay fills the full screen (test 1.1)</li>
        <li>Only the clicked item's fields are shown (test 1.2)</li>
        <li>Breadcrumb: "Articles &gt; [item title]" (test 1.3)</li>
        <li>Background page is not scrollable (test 1.4 — focus trap)</li>
        <li>Edit a field → live model above updates (test 2.1)</li>
        <li>Press Esc → overlay closes, edits kept (test 3.1)</li>
        <li>Tab key stays inside overlay (test 7.1)</li>
        <li>
          <code>role="dialog"</code> and <code>aria-modal="true"</code> present
          (test 7.3)
        </li>
      </ul>
    </UCard>
  </div>
</template>
