/**
 * How the AI's composables and components translate: the app's `t()` of
 * `@nuxtjs/i18n`, with the key itself when the app has none. Not public.
 */

import { isRecord } from "../shared/guards";

/** Translates a key of the `mapo.*` messages with its named values. */
export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

/** The `t()` of the Nuxt app `app`; the key itself without one. */
export function translatorOf(app: object): Translate {
  const i18n: unknown = Reflect.get(app, "$i18n");
  const translate: unknown = isRecord(i18n) ? i18n.t : undefined;
  if (typeof translate !== "function") return (key) => key;
  return (key, params = {}) => {
    const text: unknown = Reflect.apply(translate, i18n, [key, params]);
    return typeof text === "string" ? text : key;
  };
}
