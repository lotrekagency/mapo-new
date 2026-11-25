import { ref, watch } from "vue";
import type { Ref } from "vue";

// Mapo's full-screen layers are focus mode (`MapoFocusPortal`) and an expanded
// field (`MapoFormGroup`, `MapoFormFlatSection`). The Nuxt UI overlays opened
// from them (select menus, popovers, modals, drawers, tooltips) have no
// z-index: they stack in the order their portals sit in <body>, and a portal
// takes its place there when its component mounts. A Mapo layer follows the
// same rule, with no z-index of its own. It mounts when it opens, last in
// <body>, so it shows above the app and above the layer it was opened from,
// and the overlays its fields mount afterwards show above it. Mounted ahead of
// time it would sit before them, and a `Teleport` rendered on the server sits
// before the app itself.

/**
 * Keeps a layer's `Teleport` mounted from the moment `isOpen` turns true until
 * its close transition has ended. Bind `mounted` to the `Teleport`'s `v-if`,
 * and `onAfterLeave` to the `after-leave` of a `Transition` with `appear`.
 */
export function useMountedWhileOpen(isOpen: Readonly<Ref<boolean>>): {
  mounted: Ref<boolean>;
  onAfterLeave: () => void;
} {
  const mounted = ref(isOpen.value);

  watch(isOpen, (open) => {
    if (open) mounted.value = true;
  });

  function onAfterLeave() {
    // Opened again while it was closing: it is open again.
    if (isOpen.value) return;
    mounted.value = false;
  }

  return { mounted, onAfterLeave };
}

/**
 * Whether `layer` is the top layer, the one Escape closes: no open Nuxt UI
 * overlay and no other Mapo layer comes after it in the document, its own
 * content included.
 *
 * Nuxt UI overlays are Reka UI dismissable layers, which close on Escape too,
 * after Mapo's listeners have run: without this check one press would close a
 * select menu and the layer it was opened from. One still playing its close
 * animation (`data-state="closed"`) does not count.
 */
export function isTopLayer(layer: Element): boolean {
  const layers = document.querySelectorAll(
    '[data-dismissable-layer]:not([data-state="closed"]), [data-mapo-layer]',
  );
  return !Array.from(layers).some(
    (other) =>
      layer.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}
