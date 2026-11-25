<script setup lang="ts">
import { ref, computed, provide, onMounted, onUnmounted } from "vue";
import type { AnyFieldDescriptor } from "../types/index.js";
import { injectMapoForm } from "../composables/useMapoForm.js";
import {
  isTopLayer,
  usePageScrollLock,
  useMountedWhileOpen,
} from "../utils/layers.js";
import { isFieldRemoved, isFieldShown } from "../utils/tabVisibility.js";
import MapoFormField from "./MapoFormField.vue";

const props = defineProps<{
  /** Fields to lay out in the 12-column grid. */
  fields: AnyFieldDescriptor[];
}>();

defineSlots<Record<string, unknown>>();

const form = injectMapoForm<Record<string, unknown>>();
const model = computed(() => form?.model.value);
const currentLang = computed(() => form?.currentLang.value ?? "");

// ─── Visibility ──────────────────────────────────────────────────────────────

// Each field sits in a grid cell, and the cell follows the field: `visible`
// removes it with the field, so it leaves no gap in its row; `show` hides it
// and keeps the field mounted, with its state. This holds for a cell filled by
// the `field.<key>` slot too.
const predicateModel = computed<Record<string, unknown>>(
  () => model.value ?? {},
);

const keptFields = computed(() =>
  props.fields.filter((field) => !isFieldRemoved(field, predicateModel.value)),
);

function isShown(field: AnyFieldDescriptor): boolean {
  return isFieldShown(field, predicateModel.value);
}

// With no field to show, the grid goes as well: empty, it would still add its
// spacing to the form.
const hasKeptFields = computed(() => keptFields.value.length > 0);
const hasShownFields = computed(() => keptFields.value.some(isShown));

// ─── Field expand ────────────────────────────────────────────────────────────

const expandedFieldKey = ref<string | null>(null);

const expandedFieldLabel = computed(() => {
  if (!expandedFieldKey.value) return "";
  const field = props.fields.find(
    (f) => (f.key as string) === expandedFieldKey.value,
  );
  return field?.label ?? expandedFieldKey.value;
});

function expandField(key: string) {
  expandedFieldKey.value = key;
}

function collapseField() {
  expandedFieldKey.value = null;
}

// The expanded panel is a layer with no z-index, mounted when a field expands,
// so that the menus and modals the field opens show above it, and the page
// does not scroll under it (see utils/layers.ts).
const isExpanded = computed(() => expandedFieldKey.value !== null);
const { mounted: panelMounted, onAfterLeave: onPanelAfterLeave } =
  useMountedWhileOpen(isExpanded);
usePageScrollLock(isExpanded);
const panelEl = ref<HTMLElement | null>(null);

// Collapse on ESC when the panel is the top layer: a menu or modal opened from
// the field, or focus mode opened from it, takes the key first.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !expandedFieldKey.value || !panelEl.value) return;
  if (isTopLayer(panelEl.value)) collapseField();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

provide("mapoGroupExpand", { expandField, collapseField, expandedFieldKey });

// ─── Col-span lookup ─────────────────────────────────────────────────────────

const COL_SPAN: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
};
function colClass(cols: AnyFieldDescriptor["cols"]): string {
  if (!cols || typeof cols !== "number") return "col-span-12";
  return COL_SPAN[cols] ?? "col-span-12";
}
</script>

<template>
  <!-- Expanded panel: teleported to body, mounted on expand (see `panelMounted`). -->
  <Teleport v-if="panelMounted" to="body">
    <Transition name="mapo-expand" appear @after-leave="onPanelAfterLeave">
      <div
        v-if="expandedFieldKey"
        ref="panelEl"
        class="fixed inset-0 flex flex-col"
        style="padding: 1rem"
        data-mapo-layer
      >
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click="collapseField"
        />
        <div
          class="relative z-10 flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
        >
          <div
            class="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3.5"
          >
            <span class="text-sm font-semibold tracking-wide text-gray-700">{{
              expandedFieldLabel
            }}</span>
            <button
              type="button"
              class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              @click="collapseField"
            >
              <UIcon name="i-lucide-minimize-2" class="h-4 w-4" />
            </button>
          </div>
          <div
            class="mapo-group-expand-body flex min-h-0 flex-1 flex-col p-5"
            style="overflow: hidden"
          >
            <template v-for="field in fields" :key="field.key as string">
              <div
                v-if="expandedFieldKey === (field.key as string)"
                style="
                  display: flex;
                  flex-direction: column;
                  flex: 1;
                  min-height: 0;
                  height: 100%;
                "
              >
                <slot
                  :name="`field.${field.key as string}`"
                  :field="field"
                  :model="model"
                  :current-lang="currentLang"
                >
                  <MapoFormField
                    :descriptor="field"
                    style="flex: 1; min-height: 0; height: 100%"
                  >
                    <template
                      v-for="(_, slotName) in $slots"
                      #[slotName]="slotProps"
                    >
                      <slot :name="slotName" v-bind="slotProps ?? {}" />
                    </template>
                  </MapoFormField>
                </slot>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Flat grid: not rendered while `visible` removes every field, hidden while
       none of the others shows. -->
  <div
    v-if="hasKeptFields"
    v-show="hasShownFields"
    class="grid grid-cols-12 gap-5"
  >
    <div
      v-for="field in keptFields"
      v-show="isShown(field)"
      :key="field.key as string"
      :class="colClass(field.cols)"
    >
      <slot
        :name="`field.${field.key as string}`"
        :field="field"
        :model="model"
        :current-lang="currentLang"
      >
        <MapoFormField :descriptor="field">
          <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
            <slot :name="slotName" v-bind="slotProps ?? {}" />
          </template>
        </MapoFormField>
      </slot>
    </div>
  </div>
</template>
