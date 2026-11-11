import type { H3Event } from "h3";
import { requireUser } from "./session";

// The categories of the articles: a related model, which the article's form
// chooses with a search (`?search=`) in its own list, as DRF lists one.
// Magic Fill never writes a relation: the name the AI gives waits, "To set
// by hand", for the operator to choose the category in the field.

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
