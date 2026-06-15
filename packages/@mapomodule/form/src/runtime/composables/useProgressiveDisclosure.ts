import { getNestedValue } from "@mapomodule/utils";

type Matcher<T = unknown> = (val: T) => boolean;
type Condition<TModel extends object> = (ctx: { model: TModel }) => boolean;

/**
 * Combines conditions with AND: all conditions must match.
 *
 * @example
 * visible: when(matchesField('seo_enabled', true), matchesField('status', isOneOf(['published'])))
 */
export function when<TModel extends object>(
  ...conditions: Condition<TModel>[]
): Condition<TModel> {
  return (ctx) => conditions.every((c) => c(ctx));
}

/**
 * Combines conditions with OR: at least one condition must match.
 */
export function whenAny<TModel extends object>(
  ...conditions: Condition<TModel>[]
): Condition<TModel> {
  return (ctx) => conditions.some((c) => c(ctx));
}

/**
 * Negates a condition.
 */
export function whenNot<TModel extends object>(
  condition: Condition<TModel>,
): Condition<TModel> {
  return (ctx) => !condition(ctx);
}

/**
 * Checks that a field value satisfies a matcher, or equals a literal value.
 * Supports dotted paths such as `meta.status`.
 *
 * @example
 * matchesField('type', 'article')
 * matchesField('count', greaterThan(0))
 */
export function matchesField<TModel extends object>(
  key: string,
  matcher: unknown | Matcher,
): Condition<TModel> {
  return (ctx) => {
    const val = getNestedValue(ctx.model as Record<string, unknown>, key);
    return typeof matcher === "function"
      ? (matcher as Matcher)(val)
      : val === matcher;
  };
}

// ─── Matcher helpers ─────────────────────────────────────────────────────────

/** The value is included in the options array. */
export const isOneOf =
  <T>(options: T[]) =>
  (val: unknown): boolean =>
    options.includes(val as T);

/** The value is NOT included in the options array. */
export const isNoneOf =
  <T>(options: T[]) =>
  (val: unknown): boolean =>
    !options.includes(val as T);

/** The value is non-empty (not null, not undefined, not '', not false, array with at least one item). */
export const isNotEmpty =
  () =>
  (val: unknown): boolean =>
    val != null &&
    val !== "" &&
    val !== false &&
    (!Array.isArray(val) || val.length > 0);

/** The value is empty. */
export const isEmpty =
  () =>
  (val: unknown): boolean =>
    !isNotEmpty()(val);

/** Returns true when the numeric value is greater than `n`. */
export const greaterThan =
  (n: number) =>
  (val: unknown): boolean =>
    Number(val) > n;

/** Returns true when the numeric value is less than `n`. */
export const lessThan =
  (n: number) =>
  (val: unknown): boolean =>
    Number(val) < n;

/** Returns true when the stringified value matches the given regular expression. */
export const matches =
  (pattern: RegExp) =>
  (val: unknown): boolean =>
    pattern.test(String(val ?? ""));
