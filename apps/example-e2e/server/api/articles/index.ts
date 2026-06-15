import { getArticles, createArticle } from "../../utils/articleDb";

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);

    // Build options from query parameters
    const options = {
      search: query.search as string | undefined,
      status: query.status as string | undefined,
      featured: query.featured
        ? query.featured === "true"
          ? true
          : false
        : undefined,
      category: query.category ? parseInt(query.category as string) : undefined,
      page: toPositiveInt(query.page as string | undefined, 1),
      page_size: toPositiveInt(query.page_size as string | undefined, 20),
      ordering: query.ordering as string | undefined,
      published_at__gte: query.published_at__gte as string | undefined,
      published_at__lte: query.published_at__lte as string | undefined,
    };

    return getArticles(options);
  }

  if (method === "POST") {
    const body = await readBody(event);
    if (!body?.title) {
      throw createError({
        statusCode: 400,
        data: { title: ["This field is required."] },
      });
    }
    return createArticle({
      title: body.title ?? "",
      slug:
        body.slug ??
        body.title
          ?.toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "") ??
        "",
      excerpt: body.excerpt ?? "",
      body: body.body ?? "",
      cover_color: body.cover_color ?? "#3b82f6",
      seo: body.seo ?? { title: "", description: "" },
      category: body.category ?? null,
      tags: body.tags ?? [],
      status: body.status ?? "draft",
      featured: body.featured ?? false,
      allow_comments: body.allow_comments ?? true,
      reading_time: body.reading_time ?? 5,
      location: body.location ?? null,
      gallery: body.gallery ?? [],
      priority: body.priority ?? 0,
      published_at: body.published_at ?? null,
      translations: body.translations ?? {},
    });
  }

  throw createError({ statusCode: 405, message: "Method not allowed" });
});
