<script setup lang="ts">
import { ref, computed } from "vue";
import type { TabEntry } from "../types/layout.js";
import { injectMapoForm } from "../composables/useMapoForm.js";
import MapoFormGroup from "./MapoFormGroup.vue";
import MapoFormFlatSection from "./MapoFormFlatSection.vue";

const props = defineProps<{ tabs: TabEntry[] }>();

defineSlots<Record<string, unknown>>();

const activeTab = ref(props.tabs[0]?.name ?? "");

// Recursively check if a tab (or any of its descendants) contains errors.
function tabHasErrors(tab: TabEntry, errorKeys: Set<string>): boolean {
  const directError = [...tab.groups.values()].some((g) =>
    g.fields.some((f) => errorKeys.has(f.key as string)),
  );
  if (directError) return true;
  return [...tab.children.values()].some((child) =>
    tabHasErrors(child, errorKeys),
  );
}

// Highlight tabs containing errors.
const form = injectMapoForm()!;
const tabsWithErrors = computed(() => {
  const errorKeys = new Set(Object.keys(form.errors.value));
  return new Set(
    props.tabs.filter((tab) => tabHasErrors(tab, errorKeys)).map((t) => t.name),
  );
});
</script>

<template>
  <div class="mapo-form-tabs">
    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-gray-200 pb-px">
      <button
        v-for="tab in tabs"
        :key="tab.name"
        type="button"
        class="relative flex items-center gap-1.5 rounded-t px-4 py-2 text-sm font-medium transition-colors"
        :class="[
          activeTab === tab.name
            ? 'border-b-2 border-primary-500 text-primary-600'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
        ]"
        @click="activeTab = tab.name"
      >
        <slot :name="`tab.${tab.name}.label`" :tab="tab">
          {{ tab.label ?? tab.name }}
        </slot>
        <span
          v-if="tabsWithErrors.has(tab.name)"
          class="inline-block h-1.5 w-1.5 rounded-full bg-red-500"
          aria-label="This tab contains errors"
        />
      </button>
      <!-- Extra content appended to the tab bar (actions, badges, …). -->
      <slot name="tab-bar-end" />
    </div>

    <!-- Tab content -->
    <div
      v-for="tab in tabs"
      v-show="activeTab === tab.name"
      :key="tab.name"
      class="space-y-5 pt-5"
    >
      <!-- Full panel override: `tab.{name}` replaces this tab's content entirely. -->
      <slot
        v-if="$slots[`tab.${tab.name}`]"
        :name="`tab.${tab.name}`"
        :tab="tab"
      />
      <template v-else>
        <slot :name="`tab.${tab.name}.before`" :tab="tab" />
        <!-- Direct groups at this level -->
        <template v-for="[groupName, group] of tab.groups" :key="groupName">
          <template v-if="groupName !== '__flat__'">
            <slot :name="`group.${groupName}.before`" />
            <MapoFormGroup
              :name="groupName"
              :label="group.label"
              :fields="group.fields"
              :subtabs="group.subtabs"
            >
              <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
                <slot :name="slotName" v-bind="slotProps ?? {}" />
              </template>
            </MapoFormGroup>
            <slot :name="`group.${groupName}.after`" />
          </template>

          <MapoFormFlatSection v-else :fields="group.fields">
            <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
              <slot :name="slotName" v-bind="slotProps ?? {}" />
            </template>
          </MapoFormFlatSection>
        </template>

        <!-- Nested sub-tabs (recursive) -->
        <MapoFormTabs
          v-if="tab.children.size > 0"
          :tabs="[...tab.children.values()]"
        >
          <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
            <slot :name="slotName" v-bind="slotProps ?? {}" />
          </template>
        </MapoFormTabs>
        <slot :name="`tab.${tab.name}.after`" :tab="tab" />
      </template>
    </div>
  </div>
</template>
