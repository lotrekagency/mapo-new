import { normalizeEndpoint } from "@mapomodule/utils";
import { applyMultipartPolicy } from "./multipart";
import { useMapoFetch } from "../utils/useMapoFetch";
import { MultipartPolicyEnum } from "../types";
import type {
  PaginatedResponse,
  ResourceMetadata,
  CrudConfig,
  CrudOptions,
  CrudRepository,
} from "../types";

/**
 * Creates a typed CRUD repository bound to a resource endpoint.
 *
 * The returned repository exposes common operations (`list`, `detail`, `create`,
 * `update`, `partialUpdate`, `delete`) plus utility actions (`updateOrCreate`,
 * `updateOrder`). Requests are executed through the shared Mapo fetch client.
 *
 * Configuration precedence:
 * - `higherConf` defines repository-level default request options.
 * - Per-call config arguments override repository-level defaults.
 *
 * Multipart handling:
 * - Write methods pass payloads through `applyMultipartPolicy`, using
 *   `MultipartPolicyEnum.Auto` unless overridden in `CrudOptions`.
 *
 * @typeParam T Entity type handled by the repository.
 * @param endpoint Resource endpoint (normalized to a trailing-slash base path).
 * @param higherConf Optional repository-level fetch configuration defaults.
 * @returns A typed `CrudRepository<T>` for the specified endpoint.
 */
export function useCrud<T>(
  endpoint: string,
  higherConf?: CrudConfig,
): CrudRepository<T> {
  const base = normalizeEndpoint(endpoint);

  /**
   * Merges higher-level CRUD config with per-call config.
   *
   * Per-call options take precedence over defaults provided at repository
   * creation time.
   */
  function merged(local?: CrudConfig): Record<string, unknown> {
    return { ...higherConf, ...local };
  }

  /**
   * Executes a typed request through the shared Mapo fetch client.
   *
   * @param path Target URL path.
   * @param options Request options passed to `$mapoFetch`.
   * @returns A promise resolving to the typed response payload.
   */
  function fetch<R>(
    path: string,
    options: Record<string, unknown>,
  ): Promise<R> {
    return useMapoFetch().fetch(path, options as never) as Promise<R>;
  }

  return {
    list(params, config) {
      return fetch<PaginatedResponse<T>>(base, {
        method: "GET",
        params,
        ...merged(config),
      });
    },

    detail(id, config) {
      return fetch<T>(`${base}${id}/`, { method: "GET", ...merged(config) });
    },

    create(data, config, opts: CrudOptions = {}) {
      const body = applyMultipartPolicy(
        data as Record<string, unknown>,
        opts.multipart ?? MultipartPolicyEnum.Auto,
      );
      return fetch<T>(base, { method: "POST", body, ...merged(config) });
    },

    update(id, data, config, opts: CrudOptions = {}) {
      const body = applyMultipartPolicy(
        data as Record<string, unknown>,
        opts.multipart ?? MultipartPolicyEnum.Auto,
      );
      return fetch<T>(`${base}${id}/`, {
        method: "PUT",
        body,
        ...merged(config),
      });
    },

    partialUpdate(id, diff, config, opts: CrudOptions = {}) {
      const body = applyMultipartPolicy(
        diff as Record<string, unknown>,
        opts.multipart ?? MultipartPolicyEnum.Auto,
      );
      return fetch<T>(`${base}${id}/`, {
        method: "PATCH",
        body,
        ...merged(config),
      });
    },

    delete(id, config) {
      return fetch<void>(`${base}${id}/`, {
        method: "DELETE",
        ...merged(config),
      });
    },

    options(config) {
      return fetch<ResourceMetadata>(base, {
        method: "OPTIONS",
        ...merged(config),
      });
    },

    updateOrCreate(data, config, opts) {
      if (data.id) {
        const { id, ...rest } = data;
        return this.update(id, rest as Partial<T>, config, opts);
      }
      return this.create(data as Partial<T>, config, opts);
    },

    updateOrder(startId, endId, config) {
      return fetch<void>(`${base}update_order/`, {
        method: "POST",
        body: { startId, endId },
        ...merged(config),
      });
    },
  };
}
