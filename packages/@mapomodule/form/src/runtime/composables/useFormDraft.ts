import { watch, onMounted, onUnmounted, type Ref } from "vue";
import { debounce } from "@mapomodule/utils";

interface DraftEntry<T> {
  model: T;
  savedAt: number;
}

/** Options for draft persistence and restoration. */
export interface UseFormDraftOptions<T> {
  model: Ref<T>;
  isDirty: Ref<boolean>;
  /**
   * Unique draft key. It is prefixed with `mapo:draft:{userId}:` when `userId` is provided,
   * otherwise `mapo:draft:`. Example: `article:42` → `mapo:draft:1:article:42`.
   */
  key: string;
  /**
   * User identifier used to scope the draft so it is never shared across accounts.
   * Without this, a draft survives logout and may be seen by the next user on the same browser.
   * Pass `useAuthStore().user?.id` (or equivalent) from the calling composable.
   */
  userId?: string | number;
  /** Milliseconds between debounced writes to localStorage. Default: `2000`. */
  debounce?: number;
  /** TTL in milliseconds before the draft is discarded. Default: `86_400_000` (24h). */
  ttl?: number;
  /**
   * Called on mount when a valid, non-expired draft exists.
   * Show a notification here and decide whether to restore it.
   */
  onRestore?: (draft: T, savedAt: Date) => void;
  /** Called after each successful write to localStorage. */
  onSave?: (savedAt: Date) => void;
}

/**
 * Persists form drafts to `localStorage` and restores them on mount when available.
 *
 * The draft is written debounced while `isDirty` is `true`. On mount, if a valid
 * non-expired draft is found, `onRestore` is called so the caller can decide
 * whether to apply it (e.g. show a snack notification first).
 *
 * @param options - Configuration for key, TTL, debounce interval and lifecycle callbacks.
 * @returns An object with `{ clearDraft, getDraft, hasDraft }` for manual control.
 *
 * @example
 * useFormDraft({
 *   model,
 *   isDirty,
 *   key: `article:${route.params.id}`,
 *   onRestore: (draft, savedAt) => {
 *     snack.show(`Draft from ${savedAt.toLocaleString()} restored`)
 *     Object.assign(model.value, draft)
 *   },
 * })
 */
export function useFormDraft<T>(options: UseFormDraftOptions<T>) {
  const storageKey =
    options.userId != null
      ? `mapo:draft:${options.userId}:${options.key}`
      : `mapo:draft:${options.key}`;
  const ttl = options.ttl ?? 86_400_000;
  const canUseStorage = typeof localStorage !== "undefined";

  const debouncedSave = debounce(() => {
    if (!canUseStorage) return;
    if (!options.isDirty.value) return;
    const entry: DraftEntry<T> = {
      model: options.model.value,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(entry));
      options.onSave?.(new Date(entry.savedAt));
    } catch {
      // quota exceeded — silently ignore
    }
  }, options.debounce ?? 2000);

  const stopWatch = watch(options.model, debouncedSave, { deep: true });

  onMounted(() => {
    const draft = getDraft();
    if (!draft) return;
    options.onRestore?.(draft.model, new Date(draft.savedAt));
  });

  onUnmounted(() => {
    stopWatch();
  });

  function getDraft(): DraftEntry<T> | null {
    if (!canUseStorage) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const entry = JSON.parse(raw) as DraftEntry<T>;
      if (Date.now() - entry.savedAt > ttl) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    if (!canUseStorage) return;
    localStorage.removeItem(storageKey);
  }

  function hasDraft(): boolean {
    return getDraft() !== null;
  }

  return { clearDraft, getDraft, hasDraft };
}
