import { articles } from "./_store";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const search = String(query.search ?? "").toLowerCase();
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(query.page_size ?? 20)));
  const ordering = String(query.ordering ?? "-published_at");

  // status can be a single value or a repeated param (multi-select filter sends status=a&status=b)
  const statusRaw = query.status;
  const statusValues = statusRaw
    ? (Array.isArray(statusRaw) ? statusRaw : [statusRaw]).map(String)
    : null;

  // is_featured filter: "true" | "false" | undefined
  const isFeaturedRaw = query.is_featured;
  const isFeatured =
    isFeaturedRaw !== undefined ? isFeaturedRaw === "true" : null;

  let results = [...articles.values()];

  if (search) {
    results = results.filter(
      (a) =>
        a.title.toLowerCase().includes(search) ||
        a.slug.toLowerCase().includes(search),
    );
  }

  if (statusValues?.length) {
    results = results.filter((a) => statusValues.includes(a.status));
  }

  if (isFeatured !== null) {
    results = results.filter((a) => a.is_featured === isFeatured);
  }

  const desc = ordering.startsWith("-");
  const field = ordering.replace(/^-/, "") as keyof (typeof results)[0];
  results.sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    return desc ? (av < bv ? 1 : -1) : av > bv ? 1 : -1;
  });

  const count = results.length;
  const start = (page - 1) * pageSize;
  results = results.slice(start, start + pageSize);

  return { count, results };
});
