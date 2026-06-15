import { useSnackStore } from "@mapomodule/store/runtime/stores/snack";
import { useConfirmStore } from "@mapomodule/store/runtime/stores/confirm";
import { useMapoAuth } from "../auth/useMapoAuth";
import { useCrud } from "../api/crud";
import type { MapoOptions } from "../../types";
import type { CrudRepository } from "../types";

/**
 * API layer exposed by {@link useMapo}.
 */
export interface MapoApiLayer {
  /**
   * Creates a CRUD repository bound to the provided endpoint.
   *
   * @param endpoint API endpoint for the resource collection.
   * @returns A typed repository with list/detail/create/update/delete helpers.
   */
  crud<T>(endpoint: string): CrudRepository<T>;
}

/**
 * High-level facade that groups the most common Mapo runtime capabilities.
 *
 * This keeps feature access ergonomic in components by exposing API, auth,
 * feedback stores, and resolved options from a single composable call.
 */
export interface MapoFacade {
  /** Resource-oriented API helpers. */
  $api: MapoApiLayer;
  /** Authentication helpers (`login`, `logout`, `fetchUser`). */
  $auth: ReturnType<typeof useMapoAuth>;
  /** Global snackbar store for user feedback messages. */
  $snack: ReturnType<typeof useSnackStore>;
  /** Global confirm dialog store for destructive/critical actions. */
  $confirm: ReturnType<typeof useConfirmStore>;
  /** Effective options passed to the facade factory. */
  $options: MapoOptions;
}

/**
 * Creates the Mapo facade used across admin pages and composables.
 *
 * The facade is a convenience aggregator over lower-level composables/stores:
 * - `$api.crud<T>(endpoint)` delegates to `useCrud<T>(endpoint)`.
 * - `$auth` delegates to `useMapoAuth(options)` (same overrides).
 * - `$snack` and `$confirm` expose the shared UI feedback stores.
 *
 * @param options Optional runtime overrides forwarded to the auth layer.
 * @returns A `MapoFacade` with grouped API/auth/feedback capabilities.
 */
export function useMapo(options: MapoOptions = {}): MapoFacade {
  return {
    $api: {
      crud: <T>(endpoint: string): CrudRepository<T> => useCrud<T>(endpoint),
    },
    $auth: useMapoAuth(options),
    $snack: useSnackStore(),
    $confirm: useConfirmStore(),
    $options: options,
  };
}
