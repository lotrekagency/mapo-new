/** A debounced function: called like the original, plus `cancel()`. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /**
   * Drops the pending call, if any. Call it when the owner goes away (in a
   * component, `onBeforeUnmount`), so a late call cannot act on the next page.
   */
  cancel(): void;
}

/**
 * Creates a debounced wrapper that delays invocation until calls stop for `ms` milliseconds.
 *
 * Each new call clears the pending timer, so only the last call in a burst is executed.
 *
 * @param fn Function to debounce.
 * @param ms Debounce delay in milliseconds.
 * @returns A debounced function with the same argument signature as `fn`, and a `cancel()` method.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  ms: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = function (this: unknown, ...args: A) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, ms);
  } as Debounced<A>;
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
