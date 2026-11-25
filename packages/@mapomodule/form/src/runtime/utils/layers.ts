import { onScopeDispose, ref, watch } from "vue";
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

// Open layers, and the `overflow` of <html> before the first one locked it.
let scrollLocks = 0;
let overflowBefore = "";

/**
 * Locks the page's scroll while `isOpen` is true, and releases it when the
 * caller's scope ends. Layers open over one another (focus mode from an
 * expanded field), so the locks are counted: the page scrolls again once the
 * last layer has closed.
 *
 * The lock is `overflow: hidden` on <html>. Nuxt UI modals (Reka UI) lock
 * <body>, saving its `overflow` and writing it back when they close: two such
 * locks on one element undo each other when they are released out of order,
 * as when a page with both open goes away.
 */
export function usePageScrollLock(isOpen: Readonly<Ref<boolean>>): void {
  let locked = false;

  function release() {
    if (!locked) return;
    locked = false;
    if (--scrollLocks === 0)
      document.documentElement.style.overflow = overflowBefore;
  }

  watch(
    isOpen,
    (open) => {
      if (!open) return release();
      if (locked || typeof document === "undefined") return;
      locked = true;
      if (scrollLocks++ === 0) {
        overflowBefore = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
      }
    },
    { immediate: true },
  );
  onScopeDispose(release);
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
