<script setup lang="ts">
/**
 * Menu detail — full `MapoMenuManager` demo.
 *
 * Features exercised here:
 *  ✅ Drag & drop tree with nesting (drop a node onto another to re-parent)
 *  ✅ maxDepth enforcement (the drop is reverted past 3 levels)
 *  ✅ Multilingual node trees (it / en) via `translations`
 *  ✅ Relational link picker fed by `<endpoint>/page_types`
 *  ✅ Custom node fields appended to the built-in ones (`additional-fields`)
 *  ✅ Backend 400 mapping — save a node with an empty title to see the errors
 *     land on the right node, in the right language
 */
import type { AnyFieldDescriptor } from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
});

const route = useRoute();
const id = computed(() => route.params.id as string);

// Appended after the default core fields of the node editor.
const additionalFields: AnyFieldDescriptor[] = [
  {
    key: "meta.icon",
    label: "Icon",
    type: "text",
    cols: { md: 6 },
  },
  {
    key: "meta.highlight",
    label: "Highlight",
    type: "switch",
    cols: { md: 6 },
  },
];

// Offered by the node editor's `style` select as { label: cssClass }.
const availableClasses = {
  Default: "",
  "Call to action": "menu-cta",
  Muted: "menu-muted",
};
</script>

<template>
  <div class="flex h-[calc(100vh-var(--mapo-topbar-height,56px))] flex-col">
    <div class="border-b border-default bg-default px-6 py-4">
      <h1 class="text-xl font-semibold">Menu Manager</h1>
      <p class="mt-0.5 text-sm text-muted">
        Trascina i nodi per riordinarli o annidarli (max 3 livelli). Salva con
        un titolo vuoto per vedere la mappatura degli errori dal backend.
      </p>
    </div>

    <div class="min-h-0 flex-1">
      <MapoMenuManager
        endpoint="/api/mock/menus"
        :identifier="id"
        :languages="['it', 'en']"
        :max-depth="3"
        :additional-fields="additionalFields"
        :available-classes="availableClasses"
      />
    </div>
  </div>
</template>
