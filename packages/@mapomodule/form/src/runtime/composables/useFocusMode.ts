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
   * The item's model when focus mode opens. Focus mode edits a shallow copy
   * of it: the objects nested in it stay the item's own, and what a field
   * writes inside them (a translation) is written there.
   */
  model: Record<string, unknown>;
  /** Errors for this item (already filtered). */
  errors: Ref<Record<string, string[]>>;
  /**
   * Called with focus mode's copy each time a field changes one of its keys,
   * also when a field's debounced write lands just after focus mode closed.
   * Apply only the keys that changed since the previous call (since `model`,
   * on the first): the copy does not follow what the item gets after focus
   * mode opened. Copy `val` to keep it.
   */
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
