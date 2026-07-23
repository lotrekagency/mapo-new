<script setup lang="ts">
import { computed } from "vue";
import type { MediaItem } from "../types/media.js";

const props = withDefaults(
  defineProps<{
    media: MediaItem;
    size?: "xs" | "sm" | "md" | "lg";
    contain?: boolean;
    showFilename?: boolean;
    videoControls?: boolean;
    videoAutoplay?: boolean;
  }>(),
  {
    size: "md",
    contain: false,
    showFilename: false,
    videoControls: false,
    videoAutoplay: false,
  },
);

const isImage = computed(() => props.media.mime_type?.startsWith("image/"));
const isVideo = computed(() => props.media.mime_type?.startsWith("video/"));
const isAudio = computed(() => props.media.mime_type?.startsWith("audio/"));
const isPdf = computed(() => props.media.mime_type === "application/pdf");

const sizeClass = computed(() => {
  const map: Record<string, string> = {
    xs: "size-10",
    sm: "size-16",
    md: "size-24",
    lg: "size-40",
  };
  return map[props.size];
});

const iconName = computed(() => {
  if (isVideo.value) return "i-lucide-film";
  if (isAudio.value) return "i-lucide-music";
  if (isPdf.value) return "i-lucide-file-text";
  return "i-lucide-file";
});

const displayName = computed(
  () =>
    props.media.title ||
    props.media.name ||
    props.media.file?.split("/").pop() ||
    "",
);
</script>

<template>
  <div class="mapo-media-preview flex flex-col items-center gap-1">
    <div
      class="overflow-hidden rounded bg-elevated flex items-center justify-center"
      :class="sizeClass"
    >
      <!-- Image -->
      <img
        v-if="isImage"
        :src="media.file"
        :alt="media.alt_text || displayName"
        class="size-full"
        :class="contain ? 'object-contain' : 'object-cover'"
        loading="lazy"
        decoding="async"
      />

      <!-- Video -->
      <video
        v-else-if="isVideo"
        :src="media.file"
        class="size-full object-cover"
        :controls="videoControls"
        :autoplay="videoAutoplay"
        muted
        playsinline
      />

      <!-- Audio -->
      <div
        v-else-if="isAudio"
        class="flex flex-col items-center gap-1 p-2 text-center"
      >
        <UIcon :name="iconName" class="size-8 text-dimmed" />
        <audio v-if="videoControls" :src="media.file" controls class="w-full" />
      </div>

      <!-- Generic file icon -->
      <div v-else class="flex flex-col items-center gap-1 p-2 text-center">
        <UIcon :name="iconName" class="size-8 text-dimmed" />
        <span
          v-if="size !== 'xs'"
          class="line-clamp-2 break-all text-[10px] text-muted"
        >
          {{ media.mime_type }}
        </span>
      </div>
    </div>

    <span
      v-if="showFilename"
      class="max-w-full truncate text-center text-xs text-muted"
      :title="displayName"
    >
      {{ displayName }}
    </span>
  </div>
</template>
