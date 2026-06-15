import { onBeforeUnmount, type Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

/** Optional configuration for the unsaved-changes navigation guard. */
export interface UnsavedChangesGuardOptions {
  message?: string;
  enabled?: Ref<boolean> | (() => boolean);
}

/**
 * Registers two guards that warn the user before abandoning a dirty form:
 * - A Vue Router `onBeforeRouteLeave` guard (in-app navigation).
 * - A native `beforeunload` event listener (tab close / hard refresh).
 *
 * Both guards are no-ops when `isDirty` is `false` or when `options.enabled`
 * returns `false`. The browser guard is skipped in SSR environments.
 *
 * @param isDirty - Reactive flag indicating whether the form has unsaved changes.
 * @param options - Optional message override and an `enabled` predicate.
 *
 * @example
 * useUnsavedChangesGuard(form.isDirty, {
 *   message: 'Leave without saving your article?',
 * })
 */
export function useUnsavedChangesGuard(
  isDirty: Ref<boolean>,
  options: UnsavedChangesGuardOptions = {},
) {
  const message =
    options.message ?? "You have unsaved changes. Do you really want to leave?";
  const canUseWindow = typeof window !== "undefined";

  const isEnabled = (): boolean => {
    if (typeof options.enabled === "function") return options.enabled();
    if (options.enabled) return options.enabled.value;
    return true;
  };

  onBeforeRouteLeave(() => {
    if (!isEnabled() || !isDirty.value) return true;
    if (!canUseWindow) return true;
    return window.confirm(message);
  });

  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (!isEnabled() || !isDirty.value) return;
    e.preventDefault();
    e.returnValue = "";
  };

  if (canUseWindow) {
    window.addEventListener("beforeunload", beforeUnload);
    onBeforeUnmount(() =>
      window.removeEventListener("beforeunload", beforeUnload),
    );
  }
}
