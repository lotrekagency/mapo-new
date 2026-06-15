import { useNuxtApp } from "nuxt/app";
import type { $Fetch } from "ofetch";
import type { ComputedRef } from "vue";

export interface UseMapoFetchReturn {
  /** The auth-aware `$mapoFetch` instance (same one provided by the plugin). */
  fetch: $Fetch;
  /**
   * `true` while at least one `$mapoFetch` request is in flight — globally,
   * across the entire app. Incremented by the plugin-level `onRequest` hook
   * and decremented by `onResponse` / `onResponseError`, so it stays accurate
   * even for raw `useNuxtApp().$mapoFetch` calls outside this composable.
   */
  loading: ComputedRef<boolean>;
}

/**
 * Returns the global `$mapoFetch` instance together with a centralized
 * `loading` indicator that tracks **all** in-flight `$mapoFetch` requests,
 * not just the ones made through this composable.
 *
 * @example
 * ```ts
 * const { fetch, loading } = useMapoFetch()
 * await fetch('/api/articles/', { method: 'POST', body: payload })
 * ```
 *
 * ```vue
 * <UButton :loading="loading" @click="submit">Save</UButton>
 * ```
 */
export function useMapoFetch(): UseMapoFetchReturn {
  const nuxt = useNuxtApp() as unknown as {
    $mapoFetch: $Fetch;
    $mapoFetchLoading: ComputedRef<boolean>;
  };
  return {
    fetch: nuxt.$mapoFetch,
    loading: nuxt.$mapoFetchLoading,
  };
}
