<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { parseDate, CalendarDate } from "@internationalized/date";
import type { DateDescriptor } from "../../types/index.js";

/** Date-only field backed by `UCalendar` and serialised as `YYYY-MM-DD`. */
const props = defineProps<{
  modelValue: unknown;
  descriptor: DateDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

const { t } = useI18n();
const open = ref(false);

/** Parsed calendar value derived from the current ISO-like model string. */
const calendarValue = computed<CalendarDate | undefined>(() => {
  const v = props.modelValue as string | null | undefined;
  if (!v) return undefined;
  try {
    // split() always returns at least one element.
    return parseDate(String(v).split("T")[0]!);
  } catch {
    return undefined;
  }
});

const displayLabel = computed(() => {
  const v = calendarValue.value;
  if (!v) return t("mapo.dateField.selectDate");
  return `${String(v.day).padStart(2, "0")}/${String(v.month).padStart(2, "0")}/${v.year}`;
});

const attrs = computed(() => props.descriptor.attrs ?? {});

function onDateSelect(date: unknown) {
  const d = date as CalendarDate | null;
  open.value = false;
  emit("update:modelValue", d ? d.toString() : null);
}

function clear() {
  emit("update:modelValue", null);
  open.value = false;
}
</script>

<template>
  <UPopover v-model:open="open" :disabled="readonly || disabled">
    <UButton
      variant="outline"
      color="neutral"
      icon="i-lucide-calendar"
      trailing
      class="w-full justify-between font-normal"
      :class="{
        'opacity-50 cursor-not-allowed': readonly || disabled,
        'ring-2 ring-red-500': errors?.length,
      }"
      :disabled="readonly || disabled"
    >
      <span
        :class="
          calendarValue ? 'text-gray-900 dark:text-white' : 'text-gray-400'
        "
      >
        {{ displayLabel }}
      </span>
    </UButton>

    <template #content>
      <div class="p-3 space-y-2">
        <UCalendar
          :model-value="calendarValue"
          :min-value="attrs.min ? parseDate(attrs.min) : undefined"
          :max-value="attrs.max ? parseDate(attrs.max) : undefined"
          @update:model-value="onDateSelect"
        />
        <div
          class="flex justify-end border-t border-gray-200 dark:border-gray-700 pt-2"
        >
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-x"
            @click="clear"
          >
            Clear
          </UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>
