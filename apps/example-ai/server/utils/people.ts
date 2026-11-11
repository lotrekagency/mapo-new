import type { H3Event } from "h3";
import { requireUser } from "./session";

// The people an event's speakers point to: a relation inside the items of a
// list (`speakers.*.person`), with more records than Magic Fill lists for
// the AI (50). So the AI writes each speaker's name, and Magic Fill searches
// it with `?search=` inside the item, in a page of results as DRF lists a
// model. Three people are called Rossi: a search for "Rossi" gives three,
// to pick from on the item's mark; "Laura Bianchi" gives one, with that very
// name, which goes in; nobody is called Verdi.

/** A person, as the backend answers it. */
export interface Person {
  id: number;
  name: string;
}

const NAMES = [
  "Laura Bianchi",
  "Marco Rossi",
  "Giulia Rossi",
  "Paolo Rossi",
  "Sara Conti",
  "Luca Ferrari",
  "Anna Romano",
  "Davide Colombo",
  "Francesca Ricci",
  "Matteo Marino",
  "Elena Greco",
  "Andrea Bruno",
  "Chiara Gallo",
  "Simone Costa",
  "Valentina Fontana",
  "Alessandro Rinaldi",
  "Martina Caruso",
  "Federico Leone",
  "Silvia Longo",
  "Giorgio Gentile",
  "Alice Martin",
  "Tom Baker",
  "Nina Schulz",
  "Omar Haddad",
  "Yuki Tanaka",
  "Priya Shah",
  "Lucas Moreau",
  "Ines Garcia",
  "Jonas Berg",
  "Maya Cohen",
  "Ruth Okafor",
  "Leo Novak",
  "Emma Wilson",
  "Hugo Lambert",
  "Clara Weiss",
  "Ivan Petrov",
  "Sofia Esposito",
  "Pietro Moretti",
  "Irene Barbieri",
  "Diego Santoro",
];

const people: Person[] = NAMES.map((name, index) => ({ id: index + 1, name }));

/** People in a page of a DRF list. */
const PAGE_SIZE = 20;

/**
 * A page of the people whose name holds `search`, as DRF's paginated list
 * answers: for every signed-in user.
 */
export function listPeople(event: H3Event, search = "", page = 1) {
  requireUser(event);
  const query = search.trim().toLowerCase();
  const found = people.filter(
    (one) => !query || one.name.toLowerCase().includes(query),
  );
  const start = (page - 1) * PAGE_SIZE;
  const hasNext = start + PAGE_SIZE < found.length;
  const link = (to: number) => {
    const searched = query ? `&search=${encodeURIComponent(query)}` : "";
    return `/api/people/?page=${to}${searched}`;
  };
  return {
    count: found.length,
    next: hasNext ? link(page + 1) : null,
    previous: page > 1 ? link(page - 1) : null,
    results: found.slice(start, start + PAGE_SIZE),
  };
}

/** A person with this id exists. */
export function isPerson(id: number): boolean {
  return people.some((one) => one.id === id);
}
