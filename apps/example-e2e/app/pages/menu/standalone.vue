<script setup lang="ts">
/**
 * Menu Manager — the lower-level components used on their own.
 *
 * `MapoMenuManager` is the assembled shell; each piece is also registered
 * globally and works standalone:
 *   - `MapoMenuTreeview`   — the tree, with an entirely local node array
 *   - `MapoMenuNodeEditor` — the node form, here inside a modal
 *
 * Nothing on this page talks to a backend: the tree is plain local state,
 * which is what you'd do to embed a picker in a sidebar or a dialog.
 */
import {
  createMenuNode,
  menuTreeDepth,
  findMenuNode,
  type MenuTreeNode,
} from "@mapomodule/uikit/types";

definePageMeta({
  layout: "mapo-default",
  label: "Menu — Standalone",
  icon: "i-lucide-puzzle",
  parent: "menu",
  middleware: ["auth"],
});

const nodes = ref<MenuTreeNode[]>([
  {
    ...createMenuNode({ id: "a", title: "Chi siamo" }),
    link: { link_type: "ST", static: "/chi-siamo" },
    nodes: [
      {
        ...createMenuNode({ id: "a1", title: "Il team" }),
        link: { link_type: "ST", static: "/chi-siamo/team" },
      },
    ],
  },
  {
    ...createMenuNode({ id: "b", title: "Servizi" }),
    link: { link_type: "ST", static: "/servizi" },
  },
]);

const selected = ref<MenuTreeNode | null>(null);
const editorOpen = ref(false);
const readonly = ref(false);
const maxDepth = ref(2);

const depth = computed(() => menuTreeDepth(nodes.value));

function openEditor(node: MenuTreeNode | null) {
  selected.value = node;
  editorOpen.value = !!node;
}

// The breadcrumb the editor renders comes from looking the node up in the tree.
const selectedParents = computed(() => {
  if (!selected.value) return [];
  return findMenuNode(nodes.value, selected.value.id)?.parents ?? [];
});
</script>

<template>
  <div class="space-y-6 p-6">
    <div>
      <h1 class="text-2xl font-bold">Menu — componenti standalone</h1>
      <p class="mt-1 text-sm text-gray-500">
        Treeview e node editor usati fuori da <code>MapoMenuManager</code>, su
        uno stato locale senza backend.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <UCheckbox v-model="readonly" label="readonly" />
      <UFormField label="maxDepth" size="sm">
        <UInput v-model.number="maxDepth" type="number" :min="1" class="w-20" />
      </UFormField>
      <UBadge variant="subtle" color="neutral">
        profondità attuale: {{ depth }}
      </UBadge>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Treeview alone -->
      <UCard>
        <template #header>
          <p class="font-medium">&lt;MapoMenuTreeview&gt;</p>
        </template>

        <div class="h-96 rounded border border-default">
          <MapoMenuTreeview
            v-model="selected"
            :nodes="nodes"
            title="Menu locale"
            :max-depth="maxDepth"
            :readonly="readonly"
            @update:model-value="openEditor($event)"
          />
        </div>
      </UCard>

      <!-- Live state -->
      <UCard>
        <template #header>
          <p class="font-medium">Stato</p>
        </template>

        <dl class="mb-3 space-y-1 text-sm">
          <div class="flex justify-between">
            <dt class="text-dimmed">nodo selezionato</dt>
            <dd class="font-mono">{{ selected?.title ?? "—" }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-dimmed">percorso</dt>
            <dd class="font-mono">
              {{
                selectedParents.length
                  ? selectedParents.map((n) => n.title).join(" › ")
                  : "root"
              }}
            </dd>
          </div>
        </dl>

        <pre
          class="max-h-64 overflow-auto rounded bg-elevated p-2 text-[10px] leading-tight"
          data-testid="standalone-tree"
          >{{ JSON.stringify(nodes, null, 2) }}</pre
        >
      </UCard>
    </div>

    <!-- Node editor inside a modal -->
    <UModal v-model:open="editorOpen" :ui="{ content: 'max-w-2xl' }">
      <template #content>
        <div class="h-[70vh]">
          <MapoMenuNodeEditor
            v-if="selected"
            v-model="selected"
            :nodes="nodes"
            :readonly="readonly"
            @delete="editorOpen = false"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
