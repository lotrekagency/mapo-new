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

// The one focus target of the app. It lives in this module, so on the server
// every request would share it: focus mode opens from a user action, in the
// browser, and the server never sets it.
const state = shallowRef<FocusTarget | null>(null);

/**
 * Exposes the app's focus-mode state: the repeater item open in focus mode.
 * Call `enter()` from a user action: on the server the state is shared by
 * every request.
 */
export function useFocusMode(): FocusModeReturn {
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
