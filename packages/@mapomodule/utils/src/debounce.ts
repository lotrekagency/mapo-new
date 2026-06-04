/**
 * Creates a debounced wrapper that delays invocation until calls stop for `ms` milliseconds.
 *
 * Each new call clears the pending timer, so only the last call in a burst is executed.
 *
 * @param fn Function to debounce.
 * @param ms Debounce delay in milliseconds.
 * @returns A debounced function with the same argument signature as `fn`.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return function (this: unknown, ...args: A) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, ms);
  };
}
