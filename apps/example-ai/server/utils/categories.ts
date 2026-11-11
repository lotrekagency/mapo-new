import type { H3Event } from "h3";
import { requireUser } from "./session";

// The categories of the articles: a related model, which the article's form
// chooses with a search (`?search=`) in its own list, as DRF lists one.
// They are five, so Magic Fill lists them for the AI, which picks one by its
// id: a category the source names goes in by itself, as a verified value.

/** A category, as the backend answers it. */
export interface Category {
  id: number;
  name: string;
  slug: string;
}

const categories: Category[] = [
  { id: 1, name: "Technology", slug: "technology" },
  { id: 2, name: "Culture", slug: "culture" },
  { id: 3, name: "City", slug: "city" },
  { id: 4, name: "Environment", slug: "environment" },
  { id: 5, name: "Sport", slug: "sport" },
];

/** The categories, as a paginated DRF list, by `search` in the name: for every signed-in user. */
export function listCategories(event: H3Event, search = "") {
  requireUser(event);
  const query = search.toLowerCase();
  const results = categories.filter(
    (one) => !query || one.name.toLowerCase().includes(query),
  );
  return { count: results.length, next: null, previous: null, results };
}

/** A category with this id exists. */
export function isCategory(id: number): boolean {
  return categories.some((one) => one.id === id);
}
