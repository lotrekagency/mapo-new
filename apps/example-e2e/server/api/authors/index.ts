import { listAuthors } from "../../utils/authors";

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// The magazine's authors, a page at a time, with `?search=` on the name.
export default defineEventHandler((event) => {
  const query = getQuery(event);
  const search = typeof query.search === "string" ? query.search : "";
  return listAuthors(
    search,
    toPositiveInt(query.page, 1),
    toPositiveInt(query.page_size, 20),
  );
});
