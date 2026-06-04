<script setup lang="ts">
import {
  ref,
  computed,
  provide,
  watchEffect,
  onMounted,
  onUnmounted,
} from "vue";
import type { FieldDescriptor } from "../types/index.js";
import { injectMapoForm } from "../composables/useMapoForm.js";
import MapoFormField from "./MapoFormField.vue";

const props = defineProps<{
  name: string;
  label?: string;
  fields: FieldDescriptor[];
  subtabs?: Map<string, FieldDescriptor[]>;
  initialExpanded?: boolean;
}>();

const globalExpanded: boolean =
  // @ts-expect-error — typed by module augmentation at app build time
  useRuntimeConfig().public.mapoForm?.groups?.expanded ?? true;
const expanded = ref(props.initialExpanded ?? globalExpanded);

// ─── Sub-tabs inside the group ────────────────────────────────────────────────

const activeSubtab = ref<string>("");
// Initialise to first subtab when subtabs are provided.
watchEffect(() => {
  if (props.subtabs && props.subtabs.size > 0 && !activeSubtab.value) {
    activeSubtab.value = [...props.subtabs.keys()][0];
  }
});

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

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && expandedFieldKey.value) collapseField();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});

provide("mapoGroupExpand", { expandField, collapseField, expandedFieldKey });

const form = injectMapoForm();
const model = computed(() => form?.model.value);
const currentLang = computed(() => form?.currentLang.value ?? "");

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
function colClass(cols: FieldDescriptor["cols"]): string {
  if (!cols || typeof cols !== "number") return "col-span-12";
  return COL_SPAN[cols] ?? "col-span-12";
}
</script>

<template>
  <!-- Expanded panel: teleported to body to avoid parent overflow/transform interference. -->
  <Teleport to="body">
    <Transition name="mapo-expand">
      <div
        v-if="expandedFieldKey"
        class="fixed inset-0 z-50 flex flex-col"
        style="padding: 1rem"
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

  <!-- Regular group (kept in the DOM so the provide stays active) -->
  <div
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
      <!-- Flat fields (no subtab) -->
      <div
        v-if="fields.length"
        class="grid grid-cols-12 gap-5 px-5 pb-5 pt-4"
        :class="{ 'pb-0': subtabs && subtabs.size > 0 }"
      >
        <div
          v-for="field in fields"
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
      <div v-if="subtabs && subtabs.size > 0" class="px-5 pb-5 pt-4">
        <!-- Sub-tab bar -->
        <div class="flex gap-1 border-b border-gray-200 mb-4">
          <button
            v-for="[subtabName] of subtabs"
            :key="subtabName"
            type="button"
            class="relative px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none"
            :class="[
              activeSubtab === subtabName
                ? 'text-primary-600 border-b-2 border-primary-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700',
            ]"
            @click="activeSubtab = subtabName"
          >
            {{ subtabName }}
          </button>
        </div>

        <!-- Sub-tab fields -->
        <div
          v-for="[subtabName, subtabFields] of subtabs"
          v-show="activeSubtab === subtabName"
          :key="subtabName"
          class="grid grid-cols-12 gap-5"
        >
          <div
            v-for="field in subtabFields"
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
