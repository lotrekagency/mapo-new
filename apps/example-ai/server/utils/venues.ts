import type { H3Event } from "h3";
import { requireUser } from "./session";

// The venues of the events: a related model with six records, few enough
// for Magic Fill to list them for the AI, which picks one by its id. The
// import page lists them too, in `relationChoices` of its extraction.

/** A venue, as the backend answers it. */
export interface Venue {
  id: number;
  name: string;
  city: string;
}

const venues: Venue[] = [
  { id: 1, name: "Palazzo Marino", city: "Milan" },
  { id: 2, name: "Central Library", city: "Milan" },
  { id: 3, name: "Parco Sempione", city: "Milan" },
  { id: 4, name: "Teatro Verdi", city: "Milan" },
  { id: 5, name: "Museum of Science", city: "Milan" },
  { id: 6, name: "Online", city: "" },
];

/** The venues, as a paginated DRF list, by `search` in the name: for every signed-in user. */
export function listVenues(event: H3Event, search = "") {
  requireUser(event);
  const query = search.toLowerCase();
  const results = venues.filter(
    (one) => !query || one.name.toLowerCase().includes(query),
  );
  return { count: results.length, next: null, previous: null, results };
}

/** A venue with this id exists. */
export function isVenue(id: number): boolean {
  return venues.some((one) => one.id === id);
}
