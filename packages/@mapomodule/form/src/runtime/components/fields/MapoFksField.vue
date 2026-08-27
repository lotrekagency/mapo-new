<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useNuxtApp } from "#app";
import { debounce } from "@mapomodule/utils";
import type { FksDescriptor } from "../../types/index.js";

const props = defineProps<{
  modelValue: unknown;
  descriptor: FksDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const { t } = useI18n();

const attrs = computed(() => props.descriptor.attrs);
const isMultiple = computed(
  () => props.descriptor.type === "m2m" || !!attrs.value.multiple,
);
const itemText = computed(() => attrs.value.itemText ?? "name");
const itemValue = computed(() => attrs.value.itemValue ?? "id");

// ─── Remote search ───────────────────────────────────────────────────────────

const items = ref<Record<string, unknown>[]>([]);
const isLoading = ref(false);
const searchTerm = ref("");

const $mapoFetch = (useNuxtApp() as any).$mapoFetch;

async function fetchItems(query: string) {
  isLoading.value = true;
  try {
    const rawEndpoint = attrs.value.endpoint as string;
    const endpoint =
      rawEndpoint.startsWith("/") || rawEndpoint.startsWith("http")
        ? rawEndpoint
        : `/${rawEndpoint}`;
    const url = query
      ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}search=${encodeURIComponent(query)}`
      : endpoint;
    const data = await ($mapoFetch ?? $fetch)(url);
    // Supports both a plain array and a paginated DRF response { results: [] }.
    const raw = Array.isArray(data)
      ? data
      : ((data as { results?: unknown[] }).results ?? []);
    items.value = raw as Record<string, unknown>[];
  } catch {
    items.value = [];
  } finally {
    isLoading.value = false;
  }
}

const debouncedFetch = debounce(fetchItems, 300);

// onMounted: fetching is client-only (the select is interactive, so SSR fetch does not add value).
onMounted(() => fetchItems(""));
watch(searchTerm, (q) => debouncedFetch(q));

// ─── Value ───────────────────────────────────────────────────────────────────

// returnObject=true (default): modelValue is an object or array of objects.
// returnObject=false: modelValue is an id or array of ids.
const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

// Placeholder
const placeholder = computed(() =>
  isMultiple.value ? t("mapo.fksField.searchSelect") : t("mapo.search"),
);

// Chip text shown in the trigger.
// Handles both returnObject=true (item is a full object) and returnObject=false (item is a raw ID).
function getLabel(item: unknown): string {
  if (item !== null && item !== undefined && typeof item !== "object") {
    // Raw ID — look it up in the loaded items array.
    const found = items.value.find((i) => i[itemValue.value] === item);
    return found ? String(found[itemText.value] ?? item) : String(item);
  }
  if (!item || typeof item !== "object") return "";
  return String((item as Record<string, unknown>)[itemText.value] ?? "");
}

// Extracts the comparable key from an item, regardless of whether it's an object or a raw ID.
function getItemKey(item: unknown): unknown {
  if (item !== null && item !== undefined && typeof item !== "object")
    return item;
  return (item as Record<string, unknown>)?.[itemValue.value];
}
</script>

<template>
  <USelectMenu
    v-model="internalValue"
    v-model:search-term="searchTerm"
    :items="items"
    :label-key="itemText"
    :value-key="attrs.returnObject === false ? itemValue : undefined"
    :by="attrs.returnObject !== false ? (itemValue as string) : undefined"
    :multiple="isMultiple"
    :loading="isLoading"
    :ignore-filter="true"
    :placeholder="placeholder"
    :readonly="readonly"
    :disabled="disabled"
    :highlight="!!errors?.length"
    clear
  >
    <!-- Chips for multi-selection -->
    <template
      v-if="isMultiple && Array.isArray(internalValue) && internalValue.length"
      #default
    >
      <div class="flex flex-wrap gap-1 py-0.5">
        <UBadge
          v-for="item in internalValue as unknown[]"
          :key="String(getItemKey(item))"
          variant="soft"
          color="primary"
          class="cursor-default"
        >
          {{ getLabel(item) }}
          <UButton
            v-if="!readonly && !disabled"
            size="xs"
            variant="ghost"
            color="primary"
            icon="i-lucide-x"
            class="-mr-1 ml-0.5 h-3.5 w-3.5"
            @click.stop="
              internalValue = (internalValue as unknown[]).filter(
                (i) => getItemKey(i) !== getItemKey(item),
              )
            "
          />
        </UBadge>
      </div>
    </template>

    <!-- Empty state -->
    <template #empty>
      <span class="text-sm text-gray-500">
        {{
          searchTerm ? t("mapo.fksField.noResults") : t("mapo.fksField.noItems")
        }}
      </span>
    </template>
  </USelectMenu>
</template>
