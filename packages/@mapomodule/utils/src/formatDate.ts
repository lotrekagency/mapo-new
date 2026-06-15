const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Formats a date using a token-based pattern.
 *
 * Supported tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`.
 *
 * @param date Date value as a `Date` instance or parseable date string.
 * @param format Output format pattern. Defaults to `"YYYY-MM-DD"`.
 * @returns Formatted date string, or an empty string if the input date is invalid.
 */
export function formatDate(date: string | Date, format = "YYYY-MM-DD"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  return format
    .replace("YYYY", String(d.getFullYear()))
    .replace("MM", pad(d.getMonth() + 1))
    .replace("DD", pad(d.getDate()))
    .replace("HH", pad(d.getHours()))
    .replace("mm", pad(d.getMinutes()))
    .replace("ss", pad(d.getSeconds()));
}
