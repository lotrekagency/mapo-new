<script setup lang="ts">
// Tests: MapoRepeater — add/remove/reorder/duplicate items, single template, multi-template,
// miniCard contextual scaling, bulk selection (select all, shift-click, delete/duplicate bulk),
// expand/collapse all, undo stack, minItems/maxItems guards, confirmDelete dialog,
// readonly mode, integration with form isDirty/getPatch.
// E2E plan: e2e/form/fields/repeater.md (sections 1–19)
import type {
  FieldDescriptor,
  RepeaterDescriptor,
} from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Repeater",
  icon: "i-lucide-list",
  middleware: ["auth"],
});

const { $mapoFormRegistry } = useNuxtApp();

// ── Fixture A: single template, basic add/remove/reorder ──────────────────────
interface TagModel {
  tags: Array<{ name: string; value: string }>;
}
const modelA = ref<TagModel>({ tags: [] });
const repeaterA: RepeaterDescriptor<TagModel> = {
  key: "tags",
  type: "repeater",
  label: "Tags (basic — single template)",
  fields: [
    { key: "name", type: "text", label: "Name", cols: 6 },
    { key: "value", type: "text", label: "Value", cols: 6 },
  ],
  // Tests 4.1–4.3: confirmDelete true — delete shows useConfirmStore dialog
  attrs: { confirmDelete: true },
};

// ── Fixture B: multi-template, maxItems, previewLabel, allowDuplicate ─────────
interface BlockModel {
  blocks: Array<{
    _template: string;
    text?: string;
    level?: number;
    body?: string;
    src?: string;
    alt?: string;
  }>;
}
const modelB = ref<BlockModel>({ blocks: [] });
const repeaterB: RepeaterDescriptor<BlockModel> = {
  key: "blocks",
  type: "repeater",
  label: "Content Blocks (multi-template, maxItems: 8)",
  attrs: {
    templates: {
      Heading: [
        { key: "text", type: "text", label: "Text" },
        {
          key: "level",
          type: "number",
          label: "Level (1–6)",
          attrs: { min: 1, max: 6 },
        },
      ],
      Paragraph: [{ key: "body", type: "textarea", label: "Body" }],
      Image: [
        { key: "src", type: "url", label: "Image URL" },
        { key: "alt", type: "text", label: "Alt text" },
      ],
    },
    previewLabel: (item: unknown) => {
      const i = item as Record<string, string | undefined>;
      return i.text || i.body || i.alt || "Untitled";
    },
    allowDuplicate: true,
    maxItems: 8,
    // Tests 4.5 would need minItems: 2 — covered separately below
    confirmDelete: true,
  },
};

// ── Fixture C: miniCard, compressThreshold ────────────────────────────────────
interface GalleryModel {
  gallery: Array<{ src: string; caption: string }>;
}
const modelC = ref<GalleryModel>({
  gallery: [
    { src: "https://picsum.photos/id/1/200", caption: "First image" },
    { src: "https://picsum.photos/id/2/200", caption: "Second image" },
    { src: "https://picsum.photos/id/3/200", caption: "Third image" },
    { src: "https://picsum.photos/id/4/200", caption: "Fourth image" },
  ],
});
const repeaterC: RepeaterDescriptor<GalleryModel> = {
  key: "gallery",
  type: "repeater",
  label: "Gallery (miniCard, compressThreshold: 3)",
  fields: [
    { key: "src", type: "url", label: "Image URL", cols: 8 },
    { key: "caption", type: "text", label: "Caption", cols: 4 },
  ],
  attrs: {
    compressThreshold: 3, // Tests 10.1: >3 items → miniCard mode
    miniCard: (item: unknown, idx: number) => {
      const i = item as { caption?: string; src?: string };
      return {
        title: i.caption || `Image ${idx + 1}`,
        subtitle: i.src,
        thumbnail: i.src,
        statusColor: i.src ? "success" : "warning",
      };
    },
    allowDuplicate: true,
    confirmDelete: false, // Tests 4.4: no dialog
  },
};

// ── Fixture D: minItems guard ────────────────────────────────────────────────
interface MinModel {
  items: Array<{ label: string }>;
}
const modelD = ref<MinModel>({
  items: [{ label: "First" }, { label: "Second" }],
});
const repeaterD: RepeaterDescriptor<MinModel> = {
  key: "items",
  type: "repeater",
  label: "Min 2 items (delete button disabled at minimum)",
  fields: [{ key: "label", type: "text", label: "Label" }],
  attrs: { minItems: 2, confirmDelete: false },
};

// ── Dirty tracking integration ────────────────────────────────────────────────
const formA = useMapoForm({
  model: modelA,
  fields: computed(() => [repeaterA as FieldDescriptor<TagModel>]),
  errors: ref({}),
  registry: $mapoFormRegistry,
});
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">MapoRepeater</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/fields/repeater.md</code> — sections 1–19.
      </p>
    </div>

    <!-- Fixture A: basic — tests 1–8, 13 (undo), 17 (dirty tracking) -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold text-sm text-highlighted"
            >A — Basic repeater (tests 1–8, 13)</span
          >
          <UBadge
            :color="formA.isDirty.value ? 'warning' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ formA.isDirty.value ? "dirty" : "clean" }}
          </UBadge>
        </div>
      </template>
      <p class="text-xs text-muted mb-3">
        Tests: empty state (1.1) · add (2.1–2.2) · edit (3.1–3.2) · delete with
        confirm dialog (4.1–4.3) · reorder buttons (6.1–6.4) · collapse/expand
        (7.1–7.6) · bulk selection (8.1–8.10) · undo (13.1–13.7).
      </p>
      <MapoForm
        v-model="modelA"
        :fields="[repeaterA]"
        :errors="{}"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Fixture B: multi-template — tests 1.3–1.5, 2.3–2.6, 3.3–3.4, 5.1–5.4, 9.1–9.6 -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >B — Multi-template (tests 1.3, 2.3–2.6, 5, 9)</span
        >
      </template>
      <p class="text-xs text-muted mb-3">
        Tests: template selector visible (1.3) · select Paragraph/Image then Add
        (2.3–2.4) · maxItems 8 disables Add at limit (2.5) · duplicate (5.1–5.4)
        · bulk delete/move-to-top (9.3–9.4).
      </p>
      <MapoForm
        v-model="modelB"
        :fields="[repeaterB]"
        :errors="{}"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Fixture C: miniCard — tests 10.1–10.9 -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >C — MiniCard (tests 10, compressThreshold: 3)</span
        >
      </template>
      <p class="text-xs text-muted mb-3">
        Pre-loaded with 4 items → all show as mini-cards (10.1). Click a card to
        expand (10.2). Delete items until ≤3 remain → remaining switch to full
        view (10.4). confirmDelete: false → no dialog on delete (4.4).
      </p>
      <MapoForm
        v-model="modelC"
        :fields="[repeaterC]"
        :errors="{}"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Fixture D: minItems guard — tests 4.5, 15.1 -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >D — minItems: 2 guard (tests 4.5, 15.1)</span
        >
      </template>
      <p class="text-xs text-muted mb-3">
        Two items pre-loaded. Delete buttons should be disabled — cannot go
        below minItems.
      </p>
      <MapoForm
        v-model="modelD"
        :fields="[repeaterD]"
        :errors="{}"
        :registry="$mapoFormRegistry"
      />
    </UCard>

    <!-- Tests 14: readonly mode -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Readonly mode (test 14)</span
        >
      </template>
      <p class="text-xs text-muted mb-3">
        All controls (Add, Delete, Duplicate, drag) should be disabled.
        Expand/collapse still works.
      </p>
      <MapoForm
        v-model="modelA"
        :fields="[repeaterA]"
        :errors="{}"
        :registry="$mapoFormRegistry"
        :readonly="true"
      />
    </UCard>
  </div>
</template>
