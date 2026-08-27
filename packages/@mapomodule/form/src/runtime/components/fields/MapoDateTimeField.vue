<script setup lang="ts">
import { computed, ref } from "vue";
import {
  parseDateTime,
  CalendarDateTime,
  today,
  getLocalTimeZone,
} from "@internationalized/date";
import { useI18n } from "vue-i18n";
import type { DateDescriptor } from "../../types/index.js";

/** Datetime field with configurable naive/UTC serialisation semantics. */
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

// Timezone strategy configurable through `descriptor.attrs.tz`:
//   - `naive` (default): the input represents a wall-time with no timezone.
//     The backend preserves the string as-is. Round-trip safe.
//   - `utc`: the input is interpreted/emitted as ISO with a `Z` suffix.
//     Explicit local ↔ UTC conversion; the backend stores UTC.
type TzMode = "naive" | "utc";
const tzMode = computed<TzMode>(() => props.descriptor.attrs?.tz ?? "naive");

// ISO string → CalendarDateTime
const calendarValue = computed<CalendarDateTime | undefined>(() => {
  const v = props.modelValue as string | null | undefined;
  if (!v) return undefined;
  try {
    if (tzMode.value === "utc") {
      // Interpret the input as UTC and convert it to local wall-time for the UI.
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return undefined;
      return new CalendarDateTime(
        d.getFullYear(),
        d.getMonth() + 1,
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
      );
    }
    // `naive`: strip any stray Z/offset suffix and parse as wall-time.
    // split() always returns at least one element.
    const clean = v
      .replace(/Z$/, "")
      .replace(/[+-]\d{2}:\d{2}$/, "")
      .split(".")[0]!;
    return parseDateTime(clean);
  } catch {
    return undefined;
  }
});

function emitFromCalendar(v: CalendarDateTime) {
  if (tzMode.value === "utc") {
    // Local wall-time → UTC ISO instant.
    const d = new Date(v.year, v.month - 1, v.day, v.hour, v.minute, 0, 0);
    emit("update:modelValue", d.toISOString());
    return;
  }
  emit("update:modelValue", v.toString());
}

// Displayed label in the trigger button
const displayLabel = computed(() => {
  const v = calendarValue.value;
  if (!v) return t("mapo.dateField.selectDateTime");
  const date = `${String(v.day).padStart(2, "0")}/${String(v.month).padStart(2, "0")}/${v.year}`;
  const time = `${String(v.hour).padStart(2, "0")}:${String(v.minute).padStart(2, "0")}`;
  return `${date} ${time}`;
});

// Separate refs for the time picker
const timeHour = computed(() => calendarValue.value?.hour ?? 0);
const timeMinute = computed(() => calendarValue.value?.minute ?? 0);

function onDateSelect(date: unknown) {
  const d = date as CalendarDateTime | null;
  if (!d) {
    emit("update:modelValue", null);
    return;
  }
  // Preserve existing time when changing date
  const h = calendarValue.value?.hour ?? 0;
  const m = calendarValue.value?.minute ?? 0;
  const merged = new CalendarDateTime(d.year, d.month, d.day, h, m);
  emitFromCalendar(merged);
}

function onTimeChange(part: "hour" | "minute", val: string) {
  const n = Math.max(
    0,
    Math.min(part === "hour" ? 23 : 59, parseInt(val) || 0),
  );
  const base =
    calendarValue.value ??
    (() => {
      const t = today(getLocalTimeZone());
      return new CalendarDateTime(t.year, t.month, t.day, 0, 0);
    })();
  const merged =
    part === "hour"
      ? new CalendarDateTime(base.year, base.month, base.day, n, base.minute)
      : new CalendarDateTime(base.year, base.month, base.day, base.hour, n);
  emitFromCalendar(merged);
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
      <div class="p-3 space-y-3">
        <UCalendar
          :model-value="calendarValue"
          @update:model-value="onDateSelect"
        />

        <!-- Time picker -->
        <div
          class="flex items-center gap-2 border-t border-gray-200 dark:border-gray-700 pt-3"
        >
          <UIcon name="i-lucide-clock" class="text-gray-400 shrink-0" />
          <div class="flex items-center gap-1">
            <UInput
              type="number"
              :model-value="timeHour"
              min="0"
              max="23"
              class="w-14 text-center"
              @update:model-value="
                (v: unknown) => onTimeChange('hour', String(v))
              "
            />
            <span class="text-gray-500 font-medium">:</span>
            <UInput
              type="number"
              :model-value="timeMinute"
              min="0"
              max="59"
              class="w-14 text-center"
              @update:model-value="
                (v: unknown) => onTimeChange('minute', String(v))
              "
            />
          </div>
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-x"
            class="ml-auto"
            @click="clear"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
