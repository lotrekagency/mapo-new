<script setup lang="ts">
/**
 * Menu Manager — full editor.
 *
 * Covers, in one page:
 *   ✅ load by id, save the whole structure
 *   ✅ drag & drop reorder + re-parent (drop a node ONTO another one)
 *   ✅ maxDepth: a drop deeper than 3 levels is reverted with a toast
 *   ✅ per-language trees (it / en) with the language switcher
 *   ✅ relational link picker fed by /api/menus/page_types
 *   ✅ custom node fields via `additional-fields`
 *   ✅ node styles via `available-classes`
 *   ✅ backend 400 → per-node error mapping (clear a title and save)
 *   ✅ live model inspector, to verify what actually gets sent
 */
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import type { MapoMenu } from "@mapomodule/uikit/types";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
});

const route = useRoute();
const id = computed(() => String(route.params.id));

// Non-translatable menu: the tree lives in a flat `nodes` array instead of
// `translations.<lang>.nodes`. Seeded that way in the E2E menu db.
const isTranslatable = computed(() => id.value !== "3");

const model = ref<MapoMenu | null>(null);
const currentLang = ref("it");
const savedAt = ref<string | null>(null);

// Appended after the node editor's built-in fields.
const additionalFields: AnyFieldDescriptor[] = [
  { key: "meta.icon", label: "Icon", type: "text", cols: { md: 6 } },
  {
    key: "meta.highlight",
    label: "Highlight",
    type: "switch",
    cols: { md: 6 },
  },
  {
    key: "meta.badge",
    label: "Badge",
    type: "select",
    cols: { md: 6 },
    attrs: {
      items: [
        { label: "—", value: "" },
        { label: "New", value: "new" },
        { label: "Promo", value: "promo" },
      ],
    },
  },
];

// Offered by the node "Style" select as { label: cssClass }.
const availableClasses = {
  Default: "",
  "Call to action": "menu-cta",
  Muted: "menu-muted",
};

function onSaved() {
  savedAt.value = new Date().toLocaleTimeString();
}

const activeTree = computed(() => {
  if (!model.value) return [];
  return isTranslatable.value
    ? (model.value.translations?.[currentLang.value]?.nodes ?? [])
    : (model.value.nodes ?? []);
});
</script>

<template>
  <div class="flex h-[calc(100vh-var(--mapo-topbar-height,56px))] flex-col">
    <div class="border-b border-default bg-default px-6 py-3">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-lg font-semibold">
            Menu Manager
            <span class="text-sm font-normal text-gray-500">
              — {{ model?.key ?? id }}
            </span>
          </h1>
          <p class="mt-0.5 text-xs text-gray-500">
            Trascina un nodo <b>sopra</b> un altro per annidarlo (max 3
            livelli). Doppio click sul titolo per rinominarlo. Svuota un titolo
            e salva per vedere la mappatura degli errori.
          </p>
        </div>
        <UBadge v-if="savedAt" color="success" variant="subtle" size="sm">
          Salvato alle {{ savedAt }}
        </UBadge>
      </div>
    </div>

    <div class="flex min-h-0 flex-1">
      <div class="min-w-0 flex-1">
        <MapoMenuManager
          v-model="model"
          v-model:lang="currentLang"
          endpoint="/api/menus"
          :identifier="id"
          :translatable="isTranslatable"
          :languages="isTranslatable ? ['it', 'en'] : []"
          :max-depth="3"
          :additional-fields="additionalFields"
          :available-classes="availableClasses"
          @saved="onSaved"
        />
      </div>

      <!-- Live inspector: what the component holds, and would send on save -->
      <aside
        class="hidden w-80 shrink-0 overflow-y-auto border-l border-default bg-elevated p-3 xl:block"
      >
        <p
          class="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed"
        >
          Model inspector
        </p>
        <dl class="mb-3 space-y-1 text-xs">
          <div class="flex justify-between gap-2">
            <dt class="text-dimmed">translatable</dt>
            <dd class="font-mono">{{ isTranslatable }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-dimmed">lang</dt>
            <dd class="font-mono">{{ currentLang || "—" }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-dimmed">root nodes</dt>
            <dd class="font-mono">{{ activeTree.length }}</dd>
          </div>
        </dl>
        <pre
          class="overflow-x-auto rounded bg-default p-2 text-[10px] leading-tight"
          data-testid="menu-model"
          >{{ JSON.stringify(model, null, 2) }}</pre
        >
      </aside>
    </div>
  </div>
</template>
