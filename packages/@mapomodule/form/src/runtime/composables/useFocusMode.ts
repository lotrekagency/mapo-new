import {
  computed,
  readonly,
  shallowRef,
  type Ref,
  type DeepReadonly,
  type ShallowRef,
} from "vue";
import type { AnyFieldDescriptor, FieldRegistry } from "../types/index.js";

/** Describes the currently focused repeater item in focus mode. */
export interface FocusTarget {
  /** Descriptor of the repeater field that contains the focused item. */
  descriptor: AnyFieldDescriptor;
  /** Fields for the focused item, resolved from the template when needed. */
  fields: AnyFieldDescriptor[];
  /**
   * Initial snapshot of the item model at the time the portal was opened.
   * Stored as a plain object (not a Ref) to avoid Vue's auto-unwrap behaviour
   * when placed inside Nuxt's useState reactive container.
   */
  model: Record<string, unknown>;
  /** Errors for this item (already filtered). */
  errors: Ref<Record<string, string[]>>;
  /** Callback invoked when the item model is updated. */
  onUpdate: (val: Record<string, unknown>) => void;
  /** Field component registry passed to the sub-form. */
  registry: FieldRegistry;
  /** Available language codes. */
  languages: string[];
  /** Currently active language code. */
  currentLang: string;
  /** Visual breadcrumb trail: ['Article', 'Blocks', 'Block 3'] */
  breadcrumb: string[];
}

/** Shared focus-mode API used by nested repeater editors. */
export interface FocusModeReturn {
  focusTarget: DeepReadonly<ShallowRef<FocusTarget | null>>;
  isActive: Ref<boolean>;
  enter: (target: FocusTarget) => void;
  exit: () => void;
}

// Fallback for non-Nuxt environments (tests, Storybook): a client-only singleton is
// acceptable. In Nuxt we use `useState` to guarantee per-request isolation in SSR
// and avoid cross-tenant state leaks.
const _clientFallback = shallowRef<FocusTarget | null>(null);

function getStateRef(): Ref<FocusTarget | null> {
  // `useState` is auto-imported by Nuxt; in vanilla environments we fall back to the singleton.
  const nuxtUseState = (
    globalThis as { useState?: <X>(key: string, init: () => X) => Ref<X> }
  ).useState;
  if (typeof nuxtUseState === "function") {
    return nuxtUseState<FocusTarget | null>(
      "mapo:form:focusTarget",
      () => null,
    );
  }
  return _clientFallback;
}

/**
 * Exposes a shared focus-mode state for nested repeater items.
 * In Nuxt it uses `useState()` for SSR-safe request isolation.
 */
export function useFocusMode(): FocusModeReturn {
  const state = getStateRef();

  function enter(target: FocusTarget): void {
    state.value = target;
  }
  function exit(): void {
    state.value = null;
  }

  return {
    focusTarget: readonly(state) as DeepReadonly<
      ShallowRef<FocusTarget | null>
    >,
    isActive: computed(() => state.value !== null),
    enter,
    exit,
  };
}
