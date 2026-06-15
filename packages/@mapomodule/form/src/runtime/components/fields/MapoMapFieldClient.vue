<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";

/** Geographic coordinates emitted by the interactive Leaflet client. */
interface LatLng {
  lat: number;
  lng: number;
}

const props = defineProps<{
  value: LatLng | null;
  defaultLat: number;
  defaultLng: number;
  zoom: number;
  readonly: boolean;
}>();

const emit = defineEmits<{ click: [coords: LatLng] }>();

const mapEl = ref<HTMLElement | null>(null);
let L: typeof import("leaflet") | null = null;
let map: import("leaflet").Map | null = null;
let marker: import("leaflet").Marker | null = null;

onMounted(async () => {
  // Dynamic import: Leaflet is not SSR-safe.
  L = (await import("leaflet")).default;
  await import("leaflet/dist/leaflet.css");

  // Bundle marker icons directly from the npm package (no external CDN):
  // this avoids exposing the user's IP, CSP issues, and extra runtime dependencies.
  // Vite resolves `?url` to bundled asset URLs at build time.
  const [iconRetinaUrl, iconUrl, shadowUrl] = await Promise.all([
    import("leaflet/dist/images/marker-icon-2x.png?url").then((m) => m.default),
    import("leaflet/dist/images/marker-icon.png?url").then((m) => m.default),
    import("leaflet/dist/images/marker-shadow.png?url").then((m) => m.default),
  ]);

  // @ts-expect-error — _getIconUrl is not part of the public typings
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

  if (!mapEl.value) return;

  map = L.map(mapEl.value).setView(
    [
      props.value?.lat ?? props.defaultLat,
      props.value?.lng ?? props.defaultLng,
    ],
    props.zoom,
  );

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  if (props.value) {
    marker = L.marker([props.value.lat, props.value.lng]).addTo(map);
  }

  if (!props.readonly) {
    map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (marker) marker.setLatLng([lat, lng]);
      else if (L && map) marker = L.marker([lat, lng]).addTo(map);
      emit("click", { lat, lng });
    });
  }
});

watch(
  () => props.value,
  (val) => {
    if (!map || !L) return;
    if (val) {
      if (marker) marker.setLatLng([val.lat, val.lng]);
      else marker = L.marker([val.lat, val.lng]).addTo(map);
      map.panTo([val.lat, val.lng]);
    } else {
      marker?.remove();
      marker = null;
    }
  },
);

onBeforeUnmount(() => map?.remove());
</script>

<template>
  <div ref="mapEl" class="h-64 w-full rounded border border-gray-200" />
</template>
