<script setup lang="ts">
import { ref, computed, provide, onMounted, onUnmounted } from "vue";
import type { AnyFieldDescriptor } from "../types/index.js";
import { injectMapoForm } from "../composables/useMapoForm.js";
import MapoFormField from "./MapoFormField.vue";

const props = defineProps<{ fields: AnyFieldDescriptor[] }>();

defineSlots<Record<string, unknown>>();

const form = injectMapoForm();
const model = computed(() => form?.model.value);
const currentLang = computed(() => form?.currentLang.value ?? "");

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
  <!-- Expanded panel: teleported to body -->
  <Teleport to="body">
    <Transition name="mapo-expand">
      <div
        v-if="expandedFieldKey"
        class="fixed inset-0 z-50 flex flex-col"
        style="padding: 1rem"
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

  <!-- Flat grid -->
  <div class="grid grid-cols-12 gap-5">
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
</template>
