/**
 * Format a byte count as a human-readable string (ported from Mapo v1).
 *
 * @param bytes Number of bytes.
 * @param si Use metric (powers of 1000, "kB/MB") instead of binary (powers of 1024, "KiB/MiB"). Default `false`.
 * @param dp Decimal places. Default `1`.
 */
export function humanFileSize(bytes: number, si = false, dp = 1): string {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return `${bytes} B`;
  }

  const units = si
    ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
    : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  let u = -1;
  const r = 10 ** dp;

  let value = bytes;
  do {
    value /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(value) * r) / r >= thresh &&
    u < units.length - 1
  );

  return `${value.toFixed(dp)} ${units[u]}`;
}

/**
 * Convert a string into a URL-safe slug: lowercase, accents stripped,
 * non-alphanumerics collapsed into single dashes (ported from Mapo v1).
 * Camomilla folder payloads require a `slug` derived from the title.
 */
export function slugify(str: string | null | undefined): string {
  let s = (str ?? "").trim().toLowerCase();

  const from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
  const to = "aaaaeeeeiiiioooouuuunc------";
  for (let i = 0; i < from.length; i++) {
    s = s.replaceAll(from.charAt(i), to.charAt(i));
  }

  return s
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
