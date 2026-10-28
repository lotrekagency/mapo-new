import { inject } from "vue";
import type { InjectionKey } from "vue";
import type { MapoDetailContext } from "../types/detail.js";

/** The key `MapoDetail` provides its context under. @internal */
export const DETAIL_KEY: InjectionKey<MapoDetailContext> = Symbol("MapoDetail");

/**
 * The context of the `MapoDetail` around the calling component: record, fields,
 * languages, state, `save()`, the annotations channel and the shared `OPTIONS`
 * response. Use it in a slot, a field or an extension, instead of passing the
 * same values down again.
 *
 * @returns The context, or `undefined` outside a `MapoDetail`.
 *
 * @example
 * const detail = useMapoDetail<Article>();
 * if (detail) detail.model.value.title = "Chi siamo";
 */
export function useMapoDetail<T extends object = Record<string, unknown>>():
  | MapoDetailContext<T>
  | undefined {
  return inject(DETAIL_KEY, undefined) as MapoDetailContext<T> | undefined;
}
