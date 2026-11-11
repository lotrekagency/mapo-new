import type { H3Event } from "h3";
import { requireUser } from "./session";

// The tags of the articles: a relation with more records than Magic Fill
// lists for the AI (50), so the AI writes each tag's name and Magic Fill
// searches it with `?search=`, in a page of results as DRF lists a model.
// Some names share words: a search for "Open" gives three tags, to pick
// from on the field's mark; "Data" gives "Open data" alone, a record found
// under another name, which waits; "Transport" gives two, one of them with
// that very name, which goes in.

/** A tag, as the backend answers it. */
export interface Tag {
  id: number;
  name: string;
  slug: string;
}

const NAMES = [
  "Open data",
  "Open source",
  "Open government",
  "Transport",
  "Public transport",
  "Bike lanes",
  "Cycling",
  "Air quality",
  "Climate",
  "Energy",
  "Housing",
  "Parks",
  "Libraries",
  "Schools",
  "Universities",
  "Museums",
  "Theatre",
  "Cinema",
  "Music",
  "Festivals",
  "Food",
  "Markets",
  "Restaurants",
  "Tourism",
  "Sport",
  "Football",
  "Running",
  "Health",
  "Hospitals",
  "Elderly",
  "Children",
  "Families",
  "Jobs",
  "Startups",
  "Innovation",
  "Technology",
  "Artificial intelligence",
  "Digital services",
  "Smart city",
  "Urban planning",
  "Architecture",
  "Heritage",
  "History",
  "Events",
  "Volunteering",
  "Safety",
  "Police",
  "Water",
  "Waste",
  "Recycling",
  "Noise",
  "Night life",
  "Shopping",
  "Budget",
  "Elections",
  "City council",
  "Mayor",
  "Neighbourhoods",
  "Suburbs",
  "Rivers",
];

const tags: Tag[] = NAMES.map((name, index) => ({
  id: index + 1,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
}));

/** Tags in a page of a DRF list. */
const PAGE_SIZE = 20;

/**
 * A page of the tags whose name holds `search`, as DRF's paginated list
 * answers: for every signed-in user.
 */
export function listTags(event: H3Event, search = "", page = 1) {
  requireUser(event);
  const query = search.trim().toLowerCase();
  const found = tags.filter(
    (one) => !query || one.name.toLowerCase().includes(query),
  );
  const start = (page - 1) * PAGE_SIZE;
  const hasNext = start + PAGE_SIZE < found.length;
  const link = (to: number) => {
    const searched = query ? `&search=${encodeURIComponent(query)}` : "";
    return `/api/tags/?page=${to}${searched}`;
  };
  return {
    count: found.length,
    next: hasNext ? link(page + 1) : null,
    previous: page > 1 ? link(page - 1) : null,
    results: found.slice(start, start + PAGE_SIZE),
  };
}

/** A tag with this id exists. */
export function isTag(id: number): boolean {
  return tags.some((one) => one.id === id);
}
