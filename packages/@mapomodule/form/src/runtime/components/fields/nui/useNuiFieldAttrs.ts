import { computed, useAttrs, type ComputedRef } from "vue";

/**
 * Shared logic for NUI wrappers: strips internal props (`descriptor`, `errors`)
 * from the binding passed to the underlying NUI component and derives visual
 * error flags (`color: 'error'` + `aria-invalid`).
 *
 * Note: NUI v3 form components accept `color="error"` for the red border.
 * We apply it here as a fallback when the caller has not set it already,
 * so consumers that do not go through `MapoFormField` still get the correct
 * color when `errors` is non-empty.
 */
export function useNuiFieldAttrs(): ComputedRef<Record<string, unknown>> {
  const rawAttrs = useAttrs();
  return computed(() => {
    const {
      descriptor: _d,
      errors,
      color,
      ...rest
    } = rawAttrs as Record<string, unknown>;
    const errs = (errors as string[] | undefined) ?? [];
    const hasError = errs.length > 0;
    return {
      ...rest,
      color: color ?? (hasError ? "error" : undefined),
      "aria-invalid": hasError ? "true" : undefined,
    };
  });
}
