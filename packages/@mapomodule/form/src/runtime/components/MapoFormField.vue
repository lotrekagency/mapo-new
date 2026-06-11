<script setup lang="ts">
import { computed, defineAsyncComponent, inject, ref, watch } from "vue";
import type { Ref } from "vue";
import type { AnyFieldDescriptor } from "../types/index.js";
import {
  resolveFieldComponent,
  resolveFieldAttrs,
  resolveFieldAccessor,
} from "../types/index.js";
import { injectMapoForm } from "../composables/useMapoForm.js";
import { getNestedValue, debounce } from "@mapomodule/utils";
import MapoUnknownField from "./MapoUnknownField.vue";

// `any` accepts descriptors typed against any model (e.g. AnyFieldDescriptor<Article>)
// in headless usage; the renderer itself only reads model-agnostic metadata.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = defineProps<{ descriptor: AnyFieldDescriptor<any> }>();

const form = injectMapoForm<Record<string, unknown>>()!;

const registry = form.registry;
const currentLang = form.currentLang;
const model = form.model;

// ─── Visibility ──────────────────────────────────────────────────────────────

const isVisible = computed(() => {
  if (
    props.descriptor.visible &&
    !props.descriptor.visible({ model: model.value })
  )
    return false;
  return true;
});

const showField = computed(() => {
  if (props.descriptor.show && !props.descriptor.show({ model: model.value }))
    return false;
  return true;
});

// ─── Value ───────────────────────────────────────────────────────────────────

const path = computed(() => {
  const lang = currentLang.value;
  if (props.descriptor.translatable && lang) {
    return `translations.${lang}.${props.descriptor.key as string}`;
  }
  return props.descriptor.key as string;
});

const accessor = computed(() =>
  resolveFieldAccessor(props.descriptor, registry),
);

const modelValue = computed(() => {
  const raw = getNestedValue(model.value, path.value);
  return accessor.value.get
    ? accessor.value.get({
        model: model.value,
        val: raw,
        lang: currentLang.value,
      })
    : raw;
});

function doUpdate(val: unknown) {
  // Delegate to the context so that dirtyKeys tracking, clientError clearing,
  // initLang, and onChange are all handled in one place (useMapoForm.setFieldValue).
  form.setFieldValue(props.descriptor.key as string, val);
}

// Per-field debounce: descriptor.debounce → form.debounce → 0 when immediate.
const debounceMs = form.immediate
  ? 0
  : (props.descriptor.debounce ?? form.debounce);
const onUpdate = debounceMs > 0 ? debounce(doUpdate, debounceMs) : doUpdate;

// ─── Validazione asincrona ────────────────────────────────────────────────────

type AsyncState = "idle" | "pending" | "valid" | "invalid";
const asyncState = ref<AsyncState>("idle");
const asyncError = ref<string | null>(null);
const asyncCache = new Map<string, string | null>();

const asyncValidationDebounceMs = props.descriptor.validateAsync
  ? (props.descriptor.validateAsyncDebounce ?? 600)
  : 0;

const runAsyncValidation = props.descriptor.validateAsync
  ? debounce(async (val: unknown) => {
      const cacheKey = JSON.stringify(val);
      if (asyncCache.has(cacheKey)) {
        asyncError.value = asyncCache.get(cacheKey)!;
        asyncState.value = asyncError.value ? "invalid" : "valid";
        return;
      }
      asyncState.value = "pending";
      try {
        const result = await props.descriptor.validateAsync!(val, {
          model: model.value,
        });
        asyncCache.set(cacheKey, result);
        asyncError.value = result;
        asyncState.value = result ? "invalid" : "valid";
      } catch {
        asyncState.value = "idle";
      }
    }, asyncValidationDebounceMs)
  : null;

if (runAsyncValidation) {
  // No `{ immediate: true }`: async validation starts only after the user edits
  // the value, avoiding error icons on first render.
  watch(modelValue, (val, old) => {
    if (val === old) return;
    runAsyncValidation(val);
  });
}

function onBlur() {
  form.markTouched(props.descriptor.key as string);
}

const asyncTrailingIcon = computed(
  () =>
    ({
      idle: undefined,
      pending: "i-lucide-loader-2",
      valid: "i-lucide-check-circle",
      invalid: "i-lucide-x-circle",
    })[asyncState.value],
);

const asyncTrailingIconClass = computed(
  () =>
    ({
      idle: "",
      pending: "text-gray-400 animate-spin",
      valid: "text-green-500",
      invalid: "text-red-500",
    })[asyncState.value],
);

// ─── Component resolution ────────────────────────────────────────────────────

const fieldComponent = computed(() => {
  const entry = resolveFieldComponent(props.descriptor, registry);
  if (!entry) return MapoUnknownField;
  if (typeof entry === "function")
    return defineAsyncComponent(entry as () => Promise<{ default: unknown }>);
  return entry;
});

const fieldAttrs = computed(() =>
  resolveFieldAttrs(props.descriptor, registry),
);

// ─── Errors ──────────────────────────────────────────────────────────────────

function resolveErrors(
  errorsMap: Record<string, string[]>,
  dotPath: string,
): string[] {
  const segments = dotPath.split(".");
  const result: string[] = [];
  let current = "";
  for (const seg of segments) {
    current = current ? `${current}.${seg}` : seg;
    const errs = errorsMap[current];
    if (errs) result.push(...errs);
  }
  return result;
}

const errors = computed(() => resolveErrors(form.errors.value, path.value));

const clientError = computed(() =>
  form.getClientError(props.descriptor.key as string),
);

const allErrors = computed(() => {
  const errs = [...errors.value];
  if (clientError.value) errs.unshift(clientError.value);
  if (asyncError.value && asyncState.value === "invalid")
    errs.push(asyncError.value);
  return errs;
});

const hasError = computed(() => allErrors.value.length > 0);

// Pass the error color into Nuxt UI components (UInput, UTextarea, USelectMenu, ...)
// so they display their built-in red border without relying on external CSS.
const errorColor = computed(() => (hasError.value ? "error" : undefined));

// ─── Label ───────────────────────────────────────────────────────────────────

function autoLabel(key: string): string {
  const stripped = key.replace(/^translations\.[^.]+\./, "");
  return stripped
    .replace(/[_.-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const label = computed(
  () => props.descriptor.label ?? autoLabel(props.descriptor.key as string),
);
const fieldId = computed(() => `field-${props.descriptor.key as string}`);

// ─── Group expand ────────────────────────────────────────────────────────────

const groupExpand = inject<{
  expandField: (key: string) => void;
  collapseField: () => void;
  expandedFieldKey: Ref<string | null>;
} | null>("mapoGroupExpand", null);

const isExpanded = computed(() =>
  groupExpand
    ? groupExpand.expandedFieldKey.value === (props.descriptor.key as string)
    : false,
);

function toggleExpand() {
  if (!groupExpand) return;
  if (isExpanded.value) groupExpand.collapseField();
  else groupExpand.expandField(props.descriptor.key as string);
}
</script>

<template>
  <div
    v-if="isVisible"
    v-show="showField"
    class="mapo-form-field group flex flex-col gap-1"
    :class="[
      descriptor.class,
      hasError && 'mapo-form-field--error',
      isExpanded && 'flex-1 min-h-0',
    ]"
  >
    <!-- Label -->
    <slot
      :name="`field.${descriptor.key as string}.label`"
      :descriptor="descriptor"
      :label="label"
    >
      <label
        :for="fieldId"
        class="flex shrink-0 items-center gap-1 text-sm font-medium text-gray-700"
      >
        <span>{{ label }}</span>
        <span v-if="descriptor.required" class="text-red-500" aria-hidden="true"
          >*</span
        >
        <UIcon
          v-if="asyncTrailingIcon"
          :name="asyncTrailingIcon"
          class="ml-auto h-3.5 w-3.5"
          :class="asyncTrailingIconClass"
        />
        <!-- Expand button — visible on hover or while expanded -->
        <button
          v-if="descriptor.expandable && groupExpand"
          type="button"
          :class="
            isExpanded
              ? 'ml-auto text-primary-500'
              : 'ml-auto text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100'
          "
          class="rounded p-0.5 transition-all hover:bg-gray-100 hover:text-gray-600"
          :title="isExpanded ? 'Collapse field' : 'Expand field'"
          @click.prevent="toggleExpand"
        >
          <UIcon
            :name="isExpanded ? 'i-lucide-minimize-2' : 'i-lucide-expand'"
            class="h-3.5 w-3.5"
          />
        </button>
      </label>
    </slot>

    <!-- Slot before -->
    <slot
      :name="`field.${descriptor.key as string}.before`"
      :descriptor="descriptor"
      :model="model"
    />

    <div
      class="flex items-start gap-2"
      :class="isExpanded && 'flex-1 min-h-0'"
      :style="isExpanded ? 'height: 100%; overflow: hidden;' : ''"
    >
      <!-- Slot prepend -->
      <slot
        :name="`field.${descriptor.key as string}.prepend`"
        :descriptor="descriptor"
        :model="model"
      />

      <component
        :is="fieldComponent"
        :id="fieldId"
        v-bind="fieldAttrs"
        :class="isExpanded ? 'flex-1 min-h-0' : 'flex-1'"
        :style="isExpanded ? 'height: 100%;' : ''"
        :model-value="modelValue"
        :readonly="descriptor.readonly || form.readonly.value"
        :disabled="descriptor.readonly || form.readonly.value"
        :descriptor="descriptor"
        :errors="allErrors"
        :color="errorColor"
        @update:model-value="onUpdate"
        @blur="onBlur"
      />

      <!-- Slot append -->
      <slot
        :name="`field.${descriptor.key as string}.append`"
        :descriptor="descriptor"
        :model="model"
      />
    </div>

    <!-- Slot hint -->
    <slot
      :name="`field.${descriptor.key as string}.hint`"
      :descriptor="descriptor"
      :model="model"
    />

    <!-- Errori -->
    <p
      v-for="err in allErrors"
      :key="err"
      class="text-xs text-red-500"
      role="alert"
    >
      {{ err }}
    </p>

    <!-- Slot after -->
    <slot
      :name="`field.${descriptor.key as string}.after`"
      :descriptor="descriptor"
      :model="model"
    />
  </div>
</template>
