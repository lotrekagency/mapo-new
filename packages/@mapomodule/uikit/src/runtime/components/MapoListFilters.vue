<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type {
  FilterDescriptor,
  ActiveFilter,
  FilterChoice,
} from "../types/list.js";

const props = defineProps<{
  filters: FilterDescriptor[];
  modelValue: ActiveFilter[];
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: ActiveFilter[]] }>();

defineSlots<{
  /**
   * Per-filter override slots. Bindings vary by slot; `filter` is always provided:
   * - `filter.{value}`         — full override (default = title + content)
   * - `filter.{value}.title`   — title override
   * - `filter.{value}.content` — content override (choices / datepicker)
   * - `filter.{value}.icon`    — per-choice icon override (also receives `choice`)
   */
  [K: `filter.${string}`]: (props: {
    filter: FilterDescriptor & { dates?: string[] };
    choice?: FilterChoice;
    toggleChoice?: (filter: FilterDescriptor, choice: FilterChoice) => void;
    removeFilter?: (filter: FilterDescriptor) => void;
    isChoiceActive?: (
      filter: FilterDescriptor,
      choice: FilterChoice,
    ) => boolean;
  }) => any;
}>();

// Local copy of the filter descriptors with reactive date arrays for datepicker fields
const localFilters = ref<FilterDescriptor[]>([]);
const activeFilters = ref<ActiveFilter[]>([]);

watch(
  () => props.filters,
  (val) => {
    localFilters.value = val.map((f) => ({
      ...f,
      dates: f.datepicker ? [] : undefined,
    }));
    applyDefaults();
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (val) => {
    if (JSON.stringify(val) !== JSON.stringify(activeFilters.value)) {
      activeFilters.value = val;
    }
  },
  { deep: true },
);

watch(activeFilters, (val) => emit("update:modelValue", val), { deep: true });

function applyDefaults() {
  localFilters.value.forEach((filter) => {
    if (!filter.defaultChoice) return;
    const choices = filter.choices ?? [];
    filter.defaultChoice.split(",").forEach((dv) => {
      const choice = choices.find((c) => String(c.value) === dv);
      if (choice) toggleChoice(filter, choice);
    });
  });
}

function isChoiceActive(
  filter: FilterDescriptor,
  choice: FilterChoice,
): boolean {
  const found = activeFilters.value.find((f) => f.value === filter.value);
  return (found?.active ?? []).some((c) => c.value === choice.value);
}

function toggleChoice(filter: FilterDescriptor, choice: FilterChoice) {
  const idx = activeFilters.value.findIndex((f) => f.value === filter.value);
  const current = activeFilters.value[idx];
  if (current) {
    const ci = current.active.findIndex((c) => c.value === choice.value);
    if (ci !== -1) {
      // Deactivate the choice
      const newActive = [...current.active];
      newActive.splice(ci, 1);
      const list = [...activeFilters.value];
      if (!newActive.length) list.splice(idx, 1);
      else list[idx] = { ...current, active: newActive };
      activeFilters.value = list;
    } else if (filter.multiple) {
      const list = [...activeFilters.value];
      list[idx] = { ...current, active: [...current.active, choice] };
      activeFilters.value = list;
    } else {
      const list = [...activeFilters.value];
      list[idx] = { ...current, active: [choice] };
      activeFilters.value = list;
    }
  } else {
    activeFilters.value = [
      ...activeFilters.value,
      { ...filter, active: [choice] },
    ];
  }
}

function removeFilter(filter: FilterDescriptor) {
  activeFilters.value = activeFilters.value.filter(
    (f) => f.value !== filter.value,
  );
  const lf = localFilters.value.find((f) => f.value === filter.value);
  if (lf && lf.datepicker) (lf as any).dates = [];
}

function removeAll() {
  activeFilters.value = [];
  localFilters.value.forEach((f) => {
    if (f.datepicker) (f as any).dates = [];
  });
}

function formatActive(filter: ActiveFilter): string {
  return filter.active.map((c) => c.text).join(", ");
}

function handleDateFilter(filter: FilterDescriptor & { dates?: string[] }) {
  if (!filter.dates || filter.dates.length < 2) {
    removeFilter(filter);
    return;
  }
  const sorted = [...filter.dates].sort();
  const choice: FilterChoice = {
    text: sorted.map((d) => new Date(d).toLocaleDateString()).join(" → "),
    value: sorted.join(","),
  };
  activeFilters.value = activeFilters.value.filter(
    (f) => f.value !== filter.value,
  );
  activeFilters.value = [
    ...activeFilters.value,
    { ...filter, active: [choice] },
  ];
}

const hasFilters = computed(() => localFilters.value.length > 0);
const isOpen = ref(false);
</script>

<template>
  <div
    v-if="hasFilters"
    class="mapo-list-filters flex flex-wrap items-center gap-2"
  >
    <!-- Active filter chips -->
    <UBadge
      v-for="af in activeFilters"
      :key="af.value"
      variant="soft"
      color="primary"
      class="cursor-default"
    >
      <span class="text-xs">
        <strong>{{ af.text.toUpperCase() }}:</strong>
        {{ formatActive(af) }}
      </span>
      <UButton
        v-if="!disabled"
        size="xs"
        variant="ghost"
        color="primary"
        icon="i-lucide-x"
        class="-mr-1 ml-1 h-3.5 w-3.5"
        @click.stop="removeFilter(af)"
      />
    </UBadge>

    <UButton
      v-if="activeFilters.length > 1"
      size="xs"
      variant="ghost"
      color="neutral"
      @click="removeAll"
    >
      Clear all
    </UButton>

    <!-- Filter dropdown button -->
    <UPopover v-model:open="isOpen">
      <UButton
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-sliders-horizontal"
        :disabled="disabled"
        trailing-icon=""
      >
        Filters
      </UButton>

      <template #content>
        <div class="w-64 p-2 space-y-1">
          <div v-for="filter in localFilters" :key="filter.value">
            <!-- Full per-filter override (`filter.{value}`); default = title + content. -->
            <slot
              :name="`filter.${filter.value}`"
              :filter="filter"
              :toggle-choice="toggleChoice"
              :remove-filter="removeFilter"
              :is-choice-active="isChoiceActive"
            >
              <!-- Title override (`filter.{value}.title`). -->
              <slot :name="`filter.${filter.value}.title`" :filter="filter">
                <p
                  class="px-2 py-1 text-xs font-semibold text-muted uppercase tracking-wide"
                >
                  {{ filter.text }}
                </p>
              </slot>

              <!-- Content override (`filter.{value}.content`). -->
              <slot
                :name="`filter.${filter.value}.content`"
                :filter="filter"
                :toggle-choice="toggleChoice"
                :remove-filter="removeFilter"
                :is-choice-active="isChoiceActive"
              >
                <!-- Datepicker filter -->
                <UCalendar
                  v-if="filter.datepicker"
                  v-model="(filter as any).dates"
                  range
                  class="w-full"
                  @update:model-value="handleDateFilter(filter as any)"
                />

                <!-- Choices filter -->
                <template v-else-if="filter.choices?.length">
                  <button
                    v-for="choice in filter.choices"
                    :key="String(choice.value)"
                    class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-elevated"
                    :class="
                      isChoiceActive(filter, choice)
                        ? 'text-primary font-medium'
                        : 'text-default'
                    "
                    @click="toggleChoice(filter, choice)"
                  >
                    <!-- Per-choice icon override (`filter.{value}.icon`). -->
                    <slot
                      :name="`filter.${filter.value}.icon`"
                      :filter="filter"
                      :choice="choice"
                    >
                      <UIcon
                        v-if="choice.icon"
                        :name="choice.icon"
                        class="h-4 w-4 shrink-0"
                      />
                      <UIcon
                        v-else
                        name="i-lucide-circle-small"
                        class="h-4 w-4 shrink-0 opacity-40"
                      />
                    </slot>
                    <span>{{ choice.text }}</span>
                    <UIcon
                      v-if="isChoiceActive(filter, choice)"
                      name="i-lucide-check"
                      class="ml-auto h-3.5 w-3.5"
                    />
                  </button>
                </template>
              </slot>
            </slot>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
