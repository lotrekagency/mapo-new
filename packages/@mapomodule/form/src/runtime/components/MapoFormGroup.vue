<script setup lang="ts">
import { ref, computed, provide, onMounted, onUnmounted } from "vue";
import { useRuntimeConfig } from "#app";
import type {
  AnyFieldDescriptor,
  MapoFormRuntimeConfig,
} from "../types/index.js";
import { injectMapoForm } from "../composables/useMapoForm.js";
import { isTopLayer, useMountedWhileOpen } from "../utils/layers.js";
import {
  isFieldRemoved,
  isFieldShown,
  pickActiveTab,
} from "../utils/tabVisibility.js";
import MapoFormField from "./MapoFormField.vue";

// Vue reads an absent Boolean prop as `false` unless the prop declares a
// default. The `undefined` default keeps "not passed" apart from `false`, so the
// module option `groups.expanded` decides when no caller sets `initialExpanded`.
const props = withDefaults(
  defineProps<{
    /** Group identifier; the heading shows it when `label` is not set. */
    name: string;
    /** Heading of the group card. */
    label?: string;
    /** Fields of the group outside any sub-tab, in a 12-column grid. */
    fields: AnyFieldDescriptor[];
    /**
     * Sub-tab name → its fields, shown as a tab bar inside the card. A sub-tab
     * with no field to show leaves the bar.
     */
    subtabs?: Map<string, AnyFieldDescriptor[]>;
    /**
     * Whether the group starts expanded. When omitted, the module option
     * `groups.expanded` decides (`true` unless configured).
     */
    initialExpanded?: boolean;
  }>(),
  { label: undefined, subtabs: undefined, initialExpanded: undefined },
);

const globalExpanded: boolean =
  (useRuntimeConfig().public.mapoForm as MapoFormRuntimeConfig | undefined)
    ?.groups?.expanded ?? true;
const expanded = ref(props.initialExpanded ?? globalExpanded);

// ─── Field expand ────────────────────────────────────────────────────────────

const expandedFieldKey = ref<string | null>(null);

function expandField(key: string) {
  expandedFieldKey.value = key;
  document.body.style.overflow = "hidden";
}

function collapseField() {
  expandedFieldKey.value = null;
  document.body.style.overflow = "";
}

// The expanded panel is a layer with no z-index, mounted when a field expands,
// so that the menus and modals the field opens show above it (see
// utils/layers.ts).
const { mounted: panelMounted, onAfterLeave: onPanelAfterLeave } =
  useMountedWhileOpen(computed(() => expandedFieldKey.value !== null));
const panelEl = ref<HTMLElement | null>(null);

// Collapse on ESC when the panel is the top layer: a menu or modal opened from
// the field, or focus mode opened from it, takes the key first.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !expandedFieldKey.value || !panelEl.value) return;
  if (isTopLayer(panelEl.value)) collapseField();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});

provide("mapoGroupExpand", { expandField, collapseField, expandedFieldKey });

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

function keptOf(fields: AnyFieldDescriptor[]): AnyFieldDescriptor[] {
  return fields.filter((field) => !isFieldRemoved(field, predicateModel.value));
}

function isShown(field: AnyFieldDescriptor): boolean {
  return isFieldShown(field, predicateModel.value);
}

const keptFields = computed(() => keptOf(props.fields));

// A sub-tab whose fields `visible` removes has no panel.
const keptSubtabs = computed(() =>
  [...(props.subtabs?.entries() ?? [])]
    .map(([name, fields]) => ({ name, fields: keptOf(fields) }))
    .filter((subtab) => subtab.fields.length > 0),
);

// Like the form's tabs, a sub-tab with no field to show leaves the sub-tab bar.
const shownSubtabs = computed(() =>
  keptSubtabs.value.filter((subtab) => subtab.fields.some(isShown)),
);

const hasKeptFlatFields = computed(() => keptFields.value.length > 0);
const hasKeptSubtabs = computed(() => keptSubtabs.value.length > 0);
const hasShownFlatFields = computed(() => keptFields.value.some(isShown));
const hasShownSubtabs = computed(() => shownSubtabs.value.length > 0);

// The card follows its fields the way a cell does: not rendered while `visible`
// removes them all, hidden while none of the others shows.
const hasKeptFields = computed(
  () => hasKeptFlatFields.value || hasKeptSubtabs.value,
);
const hasShownFields = computed(
  () => hasShownFlatFields.value || hasShownSubtabs.value,
);

// ─── Sub-tabs inside the group ────────────────────────────────────────────────

// The sub-tab the user clicked; until then, or while it is hidden, the first
// shown sub-tab is open.
const pickedSubtab = ref<string | null>(null);
const activeSubtab = computed(() =>
  pickActiveTab(shownSubtabs.value, pickedSubtab.value),
);

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
  <!-- Expanded panel: teleported to body to avoid parent overflow/transform
       interference, mounted on expand (see `panelMounted`). -->
  <Teleport v-if="panelMounted" to="body">
    <Transition name="mapo-expand" appear @after-leave="onPanelAfterLeave">
      <div
        v-if="expandedFieldKey"
        ref="panelEl"
        class="fixed inset-0 flex flex-col"
        style="padding: 1rem"
        data-mapo-layer
      >
        <!-- Clickable backdrop -->
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click="collapseField"
        />

        <!-- Panel -->
        <div
          class="relative z-10 flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
        >
          <!-- Header -->
          <div
            class="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3.5"
          >
            <span class="text-sm font-semibold tracking-wide text-gray-700">{{
              label ?? name
            }}</span>
            <button
              type="button"
              class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              @click="collapseField"
            >
              <UIcon name="i-lucide-minimize-2" class="h-4 w-4" />
            </button>
          </div>

          <!-- Expanded field -->
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

  <!-- Regular group: not rendered while `visible` removes all its fields,
       hidden while none of the others shows. -->
  <div
    v-if="hasKeptFields"
    v-show="hasShownFields"
    class="mapo-form-group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
  >
    <!-- Collapsible heading -->
    <button
      type="button"
      class="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-gray-50"
      @click="expanded = !expanded"
    >
      <span class="text-sm font-semibold tracking-wide text-gray-700">{{
        label ?? name
      }}</span>
      <UIcon
        :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="h-4 w-4 shrink-0 text-gray-400"
      />
    </button>

    <!-- Body -->
    <div v-if="expanded">
      <!-- Flat fields (no subtab); the sub-tab area below brings its own top
           padding. -->
      <div
        v-if="hasKeptFlatFields"
        v-show="hasShownFlatFields"
        class="grid grid-cols-12 gap-5 px-5 pt-4"
        :class="hasShownSubtabs ? 'pb-0' : 'pb-5'"
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

      <!-- Sub-tab bar + content (when subtabs are present) -->
      <div
        v-if="hasKeptSubtabs"
        v-show="hasShownSubtabs"
        class="px-5 pb-5 pt-4"
      >
        <!-- Sub-tab bar -->
        <div
          class="mapo-form-subtab-bar mb-4 flex flex-wrap gap-1 border-b border-gray-200"
        >
          <button
            v-for="subtab in shownSubtabs"
            :key="subtab.name"
            type="button"
            class="relative max-w-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none"
            :class="[
              activeSubtab === subtab.name
                ? 'text-primary-600 border-b-2 border-primary-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700',
            ]"
            @click="pickedSubtab = subtab.name"
          >
            {{ subtab.name }}
          </button>
        </div>

        <!-- Sub-tab fields -->
        <div
          v-for="subtab in keptSubtabs"
          v-show="activeSubtab === subtab.name"
          :key="subtab.name"
          class="grid grid-cols-12 gap-5"
        >
          <div
            v-for="field in subtab.fields"
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
                <template
                  v-for="(_, slotName) in $slots"
                  #[slotName]="slotProps"
                >
                  <slot :name="slotName" v-bind="slotProps ?? {}" />
                </template>
              </MapoFormField>
            </slot>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.mapo-expand-enter-active,
.mapo-expand-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.mapo-expand-enter-from,
.mapo-expand-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
