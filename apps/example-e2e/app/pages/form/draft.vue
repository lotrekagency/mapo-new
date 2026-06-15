<script setup lang="ts">
// Tests: useFormDraft — save to localStorage on dirty change (debounce), restore on reload,
// TTL expiry, clearDraft after save, multi-tab consistency, corrupted/full localStorage.
// E2E plan: e2e/form/draft.md
import type { FieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  label: "Draft Autosave",
  icon: "i-lucide-save",
  middleware: ["auth"],
});

const snack = useSnackStore();

interface Model {
  title: string;
  body: string;
  status: string;
}

const model = ref<Model>({ title: "", body: "", status: "draft" });
const errors = ref<Record<string, string[]>>({});

const fields: FieldDescriptor<Model>[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "body", type: "textarea", label: "Body", attrs: { rows: 4 } },
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: { items: ["draft", "published", "archived"] },
  },
];

// Track dirtiness locally by watching model changes directly.
const isDirty = ref(false);
watch(
  model,
  () => {
    isDirty.value = true;
  },
  { deep: true },
);

// Tests 1.1–1.3: saves after debounce when isDirty; tests 2.1–2.3: restore from localStorage
const { clearDraft, getDraft } = useFormDraft({
  model,
  isDirty,
  key: "e2e-draft-article",
  debounce: 1000, // Tests 1.3: rapid edits → single write
  ttl: 24 * 60 * 60 * 1000,
  onRestore: (draft) => {
    model.value = draft;
    draftInfo.value = getDraft();
  },
  onSave: (savedAt) => {
    snack.show(`Draft saved at ${savedAt.toLocaleTimeString()}`, "info");
  },
});

// Reactive ref instead of computed: localStorage reads are not reactive.
const draftInfo = ref(getDraft());

// Raw localStorage value for inspection
const rawDraft = ref<string | null>(null);
function refreshRaw() {
  rawDraft.value = localStorage.getItem("mapo:draft:e2e-draft-article");
}

// Tests 6.1: simulate corrupted JSON
function corruptDraft() {
  localStorage.setItem("mapo:draft:e2e-draft-article", "NOT_VALID_JSON{{{");
  refreshRaw();
}

// Tests 4.1: clear draft after successful save
function simulateSave() {
  clearDraft();
  refreshRaw();
}
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Draft Autosave</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/form/draft.md</code>
      </p>
    </div>

    <!-- Draft restore banner — tests 2.1: onRestore called on reload with valid draft -->
    <UAlert
      v-if="draftInfo"
      icon="i-lucide-rotate-ccw"
      color="info"
      title="Draft detected"
      :description="`Saved at: ${new Date(draftInfo.savedAt).toLocaleTimeString()}`"
    >
      <template #actions>
        <UButton
          size="xs"
          variant="outline"
          @click="
            clearDraft();
            draftInfo = null;
            refreshRaw();
          "
        >
          Discard draft
        </UButton>
      </template>
    </UAlert>

    <!-- Tests 1.1–1.3: edit fields → localStorage written after debounce -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold text-sm text-highlighted"
            >Edit form (auto-saves after 1s debounce)</span
          >
          <UBadge
            :color="isDirty ? 'warning' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ isDirty ? "dirty" : "clean" }}
          </UBadge>
        </div>
      </template>
      <MapoForm v-model="model" :fields="fields" :errors="errors" />
    </UCard>

    <!-- Controls -->
    <div class="flex flex-wrap gap-3">
      <!-- Tests 2.1: reload page to trigger restore -->
      <UButton
        variant="outline"
        color="neutral"
        leading-icon="i-lucide-refresh-cw"
        @click="$router.go(0)"
      >
        Hard reload (test restore)
      </UButton>
      <!-- Tests 4.1: clearDraft after save -->
      <UButton
        variant="outline"
        color="neutral"
        leading-icon="i-lucide-check"
        @click="simulateSave"
      >
        Simulate save → clearDraft()
      </UButton>
      <!-- Inspect raw localStorage -->
      <UButton
        variant="outline"
        color="neutral"
        leading-icon="i-lucide-search"
        @click="refreshRaw"
      >
        Inspect localStorage
      </UButton>
      <!-- Tests 6.1: inject corrupted JSON to test graceful handling -->
      <UButton
        variant="outline"
        color="error"
        leading-icon="i-lucide-bug"
        @click="corruptDraft"
      >
        Corrupt draft (test 6.1)
      </UButton>
    </div>

    <!-- Raw localStorage inspection -->
    <UCard v-if="rawDraft !== null">
      <template #header>
        <span class="font-semibold text-sm text-highlighted">
          localStorage["mapo:draft:e2e-draft-article"]
        </span>
      </template>
      <pre class="text-xs overflow-auto max-h-40 text-muted">{{
        rawDraft || "(empty)"
      }}</pre>
    </UCard>

    <!-- Tests 5.1–5.2: multi-tab note -->
    <UCard>
      <template #header>
        <span class="font-semibold text-sm text-highlighted"
          >Multi-tab test (tests 5.1–5.2)</span
        >
      </template>
      <p class="text-xs text-muted">
        Open this URL in a second tab. Edit in tab A, wait 1s for debounce, then
        reload tab B. Both tabs should see the same draft in localStorage.
      </p>
    </UCard>
  </div>
</template>
