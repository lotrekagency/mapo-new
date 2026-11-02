/** Numbers as the backend checks them. */

/** The decimals a number writes, `1e-8` included. */
function decimalsOf(value: number): number {
  const [mantissa = "", exponent] = String(value).toLowerCase().split("e");
  const written = mantissa.includes(".")
    ? (mantissa.split(".")[1]?.length ?? 0)
    : 0;
  return Math.max(0, written - Number(exponent ?? 0));
}

/**
 * The number is a multiple of the step (`multipleOf`), exactly on the
 * decimals both write: `12345678.123` is not a multiple of `0.01`, `0.3` is
 * one of `0.1`. Past the precision of a double, within its rounding.
 */
export function isMultipleOf(value: number, step: number): boolean {
  const decimals = Math.max(decimalsOf(value), decimalsOf(step));
  const scale = 10 ** decimals;
  const scaledValue = Math.round(value * scale);
  const scaledStep = Math.round(step * scale);
  const isExact =
    decimals <= 15 &&
    scaledStep !== 0 &&
    Number.isSafeInteger(scaledValue) &&
    Number.isSafeInteger(scaledStep);
  if (isExact) return scaledValue % scaledStep === 0;
  const quotient = value / step;
  return (
    Math.abs(quotient - Math.round(quotient)) <=
    1e-12 * Math.max(1, Math.abs(quotient))
  );
}
