<script setup lang="ts">
import { ref, computed } from "vue";
import type { FileDescriptor } from "../../types/index.js";

const props = defineProps<{
  modelValue: unknown;
  descriptor: FileDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: File | null] }>();

const inputRef = ref<HTMLInputElement | null>(null);

const currentFileName = computed<string | null>(() => {
  if (props.modelValue instanceof File) return props.modelValue.name;
  if (typeof props.modelValue === "string" && props.modelValue)
    return props.modelValue.split("/").pop() ?? props.modelValue;
  return null;
});

const previewUrl = computed<string | null>(() => {
  if (props.modelValue instanceof File) {
    if (props.modelValue.type.startsWith("image/"))
      return URL.createObjectURL(props.modelValue);
  }
  if (typeof props.modelValue === "string" && props.modelValue) {
    const ext = props.modelValue.split(".").pop()?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext))
      return props.modelValue;
  }
  return null;
});

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null;
  emit("update:modelValue", file);
}

function clear() {
  emit("update:modelValue", null);
  if (inputRef.value) inputRef.value.value = "";
}

const hasError = computed(() => (props.errors?.length ?? 0) > 0);
const accept = computed(
  () => (props.descriptor.attrs?.accept as string) ?? undefined,
);
</script>

<template>
  <div class="mapo-file-field space-y-2">
    <!-- Current file preview -->
    <div
      v-if="currentFileName"
      class="flex items-center gap-2 rounded border px-3 py-2 text-sm"
      :class="
        hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
      "
    >
      <img
        v-if="previewUrl"
        :src="previewUrl"
        class="h-8 w-8 rounded object-cover shrink-0"
        alt=""
      />
      <UIcon
        v-else
        name="i-lucide-file"
        class="size-4 shrink-0 text-gray-400"
      />
      <span class="flex-1 truncate text-gray-700">{{ currentFileName }}</span>
      <UButton
        v-if="!readonly && !disabled"
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        aria-label="Remove file"
        @click="clear"
      />
    </div>

    <!-- File input -->
    <UInput
      v-if="!readonly && !disabled"
      ref="inputRef"
      type="file"
      :accept="accept"
      :color="hasError ? 'error' : undefined"
      :aria-invalid="hasError ? 'true' : undefined"
      @change="onFileChange"
    />

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
