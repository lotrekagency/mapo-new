import { defineEventHandler, getQuery } from "h3";
import { requireUser } from "../../../utils/session";
import { newsStore } from "../../../utils/news-store";

export default defineEventHandler((event) => {
  requireUser(event);
  const q = getQuery(event);
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.max(1, Number(q.page_size) || 10);
  const search = (q.search as string | undefined)?.toLowerCase() ?? "";
  const statusFilter = ([] as string[]).concat(
    (q.status as string | string[] | undefined) ?? [],
  );
  const ordering = q.ordering as string | undefined;

  let results = newsStore.list();

  if (search) {
    results = results.filter((n) =>
      [n.title, n.identifier, n.keywords, n.description, n.short_desc]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(search)),
    );
  }
  if (statusFilter.length) {
    results = results.filter((n) => statusFilter.includes(n.status));
  }
  if (ordering) {
    const desc = ordering.startsWith("-");
    const key = (
      desc ? ordering.slice(1) : ordering
    ) as keyof (typeof results)[number];
    results = [...results].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av > bv ? 1 : -1) * (desc ? -1 : 1);
    });
  }

  const count = results.length;
  const start = (page - 1) * pageSize;
  const sliced = results.slice(start, start + pageSize);

  return {
    count,
    next: start + pageSize < count ? `?page=${page + 1}` : null,
    previous: page > 1 ? `?page=${page - 1}` : null,
    results: sliced,
  };
});
