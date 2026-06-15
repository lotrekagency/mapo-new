<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import type { MapDescriptor } from "../../types/index.js";

// Leaflet is loaded only on the client because it is not SSR-safe.
const LeafletMap = defineAsyncComponent(
  () => import("./MapoMapFieldClient.vue"),
);

/** Geographic coordinates stored by the map field. */
interface LatLng {
  lat: number;
  lng: number;
}

/** Map field with manual lat/lng inputs plus a client-only Leaflet picker. */
const props = defineProps<{
  modelValue: unknown;
  descriptor: MapDescriptor;
  errors?: string[];
  readonly?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: LatLng | null] }>();

const attrs = computed(() => props.descriptor.attrs ?? {});

const value = computed<LatLng | null>(() => {
  const v = props.modelValue;
  if (!v || typeof v !== "object") return null;
  const { lat, lng } = v as LatLng;
  return typeof lat === "number" && typeof lng === "number"
    ? { lat, lng }
    : null;
});

const latInput = ref(value.value?.lat?.toString() ?? "");
const lngInput = ref(value.value?.lng?.toString() ?? "");

function onMapClick(coords: LatLng) {
  latInput.value = coords.lat.toFixed(6);
  lngInput.value = coords.lng.toFixed(6);
  emit("update:modelValue", coords);
}

function onManualInput() {
  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);
  if (!isNaN(lat) && !isNaN(lng)) emit("update:modelValue", { lat, lng });
}

function clear() {
  latInput.value = "";
  lngInput.value = "";
  emit("update:modelValue", null);
}
</script>

<template>
  <div class="mapo-map-field space-y-2">
    <!-- Manual coordinate inputs -->
    <div class="flex gap-2">
      <UInput
        v-model="latInput"
        placeholder="Latitude"
        class="flex-1"
        :readonly="readonly"
        :disabled="disabled"
        @blur="onManualInput"
      />
      <UInput
        v-model="lngInput"
        placeholder="Longitude"
        class="flex-1"
        :readonly="readonly"
        :disabled="disabled"
        @blur="onManualInput"
      />
      <UButton
        v-if="value && !readonly && !disabled"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        @click="clear"
      />
    </div>

    <!-- Leaflet map (client only) -->
    <ClientOnly>
      <LeafletMap
        :value="value"
        :default-lat="attrs.defaultLat ?? 41.9"
        :default-lng="attrs.defaultLng ?? 12.5"
        :zoom="attrs.zoom ?? 6"
        :readonly="readonly ?? false"
        @click="onMapClick"
      />
      <template #fallback>
        <div
          class="flex h-48 items-center justify-center rounded border border-gray-200 bg-gray-50 text-sm text-gray-400"
        >
          Loading map...
        </div>
      </template>
    </ClientOnly>

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
