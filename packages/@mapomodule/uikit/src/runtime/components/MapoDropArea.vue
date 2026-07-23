<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
  }>(),
  {
    accept: "*/*",
    multiple: true,
    disabled: false,
  },
);

const emit = defineEmits<{
  files: [files: File[]];
}>();

const isDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let dragCounter = 0;

function onDragEnter(e: DragEvent) {
  if (props.disabled) return;
  e.preventDefault();
  dragCounter++;
  isDragging.value = true;
}

function onDragLeave() {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDragging.value = false;
  }
}

function onDrop(e: DragEvent) {
  if (props.disabled) return;
  isDragging.value = false;
  dragCounter = 0;
  const files = filterFiles(Array.from(e.dataTransfer?.files ?? []));
  if (files.length) emit("files", files);
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = filterFiles(Array.from(input.files ?? []));
  if (files.length) emit("files", files);
  input.value = "";
}

function triggerPick() {
  if (!props.disabled) fileInput.value?.click();
}

function filterFiles(files: File[]): File[] {
  if (!props.accept || props.accept === "*/*") return files;
  return files.filter((f) => matchesMime(f.type, props.accept));
}

function matchesMime(mime: string, accept: string): boolean {
  return accept.split(",").some((pattern) => {
    const p = pattern.trim();
    if (p === "*/*") return true;
    if (p.endsWith("/*")) return mime.startsWith(p.replace("/*", "/"));
    return mime === p;
  });
}

defineExpose({ triggerPick });
</script>

<template>
  <div
    class="mapo-drop-area relative"
    :class="{
      'mapo-drop-area--dragging': isDragging,
      'opacity-50 pointer-events-none': disabled,
    }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      :accept="accept"
      :multiple="multiple"
      @change="onFileInput"
    />

    <slot :trigger-pick="triggerPick" :is-dragging="isDragging" />

    <Transition name="drop-overlay">
      <div
        v-if="isDragging"
        class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-default/80"
      >
        <div class="flex flex-col items-center gap-2 text-primary">
          <UIcon name="i-lucide-upload-cloud" class="size-10" />
          <span class="text-sm font-medium">Drop here</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.drop-overlay-enter-active,
.drop-overlay-leave-active {
  transition: opacity 0.15s ease;
}
.drop-overlay-enter-from,
.drop-overlay-leave-to {
  opacity: 0;
}
</style>
