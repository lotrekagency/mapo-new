<script setup lang="ts">
import { computed } from "vue";
import type { SeoDescriptor } from "../../types/index.js";

interface SeoValue {
  title?: string;
  description?: string;
  /** Matches v1 key. `url` is accepted as alias via the registry accessor. */
  permalink?: string;
}

const props = defineProps<{
  modelValue: unknown;
  descriptor: SeoDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: SeoValue] }>();

const value = computed<SeoValue>(() => {
  const v = props.modelValue;
  if (!v || typeof v !== "object")
    return { title: "", description: "", permalink: "" };
  return v as SeoValue;
});

function update(field: keyof SeoValue, val: string) {
  emit("update:modelValue", { ...value.value, [field]: val });
}

// SERP preview: Google mostra ~60 char per title, ~155 per description
const titleLen = computed(() => (value.value.title ?? "").length);
const descLen = computed(() => (value.value.description ?? "").length);

const titleColor = computed(() => {
  if (titleLen.value > 60) return "text-red-500";
  if (titleLen.value > 50) return "text-amber-500";
  return "text-green-600";
});

const descColor = computed(() => {
  if (descLen.value > 155) return "text-red-500";
  if (descLen.value > 130) return "text-amber-500";
  return "text-green-600";
});

// useRequestURL() works both in SSR and client-side environments (unlike window.location).
// @ts-expect-error — Nuxt auto-import, resolved at app build time
const requestUrl = useRequestURL();
const displayUrl = computed(() => value.value.permalink || requestUrl.host);
</script>

<template>
  <div class="mapo-seo-preview space-y-4">
    <!-- Input fields -->
    <div class="space-y-3">
      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-sm font-medium text-gray-700">URL</label>
        </div>
        <UInput
          :model-value="value.permalink"
          :readonly="readonly"
          :disabled="disabled"
          placeholder="https://example.com/slug"
          class="w-full"
          @update:model-value="update('permalink', $event as string)"
        />
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-sm font-medium text-gray-700">SEO title</label>
          <span class="text-xs" :class="titleColor">{{ titleLen }} / 60</span>
        </div>
        <UInput
          :model-value="value.title"
          :readonly="readonly"
          :disabled="disabled"
          placeholder="Page title..."
          class="w-full"
          @update:model-value="update('title', $event as string)"
        />
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-sm font-medium text-gray-700"
            >Meta description</label
          >
          <span class="text-xs" :class="descColor">{{ descLen }} / 155</span>
        </div>
        <UTextarea
          :model-value="value.description"
          :rows="3"
          :readonly="readonly"
          :disabled="disabled"
          placeholder="Page description..."
          class="w-full"
          @update:model-value="update('description', $event as string)"
        />
      </div>
    </div>

    <!-- SERP preview -->
    <div class="rounded border border-gray-200 bg-gray-50 p-4">
      <p class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        Google preview
      </p>
      <div class="max-w-lg">
        <p class="truncate text-sm text-green-700">
          {{ displayUrl }}
        </p>
        <p class="truncate text-lg text-blue-700 underline">
          {{ value.title || "Page title" }}
        </p>
        <p class="mt-1 line-clamp-2 text-sm text-gray-600">
          {{
            value.description ||
            "Page description that will appear in Google search results."
          }}
        </p>
      </div>
    </div>

    <p
      v-for="err in errors"
      :key="err"
      class="text-sm text-red-500"
      role="alert"
    >
      {{ err }}
    </p>
  </div>
</template>
