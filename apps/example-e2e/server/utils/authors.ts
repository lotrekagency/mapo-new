// The authors of the magazine: a relation with too many records for the AI
// to pick from a list (more than the 50 Magic Fill lists), so the AI writes
// a name and Mapo searches it, as DRF lists a model: a page of 20 records,
// with `count` and `next`, and `?search=` on the name.
// Three Rossi make a name several records match, Marco Bianchi the only
// record a search for "Bianchi" gives, under a longer name; no Verdi.

/** An author, as the backend answers it. */
export interface Author {
  id: number;
  name: string;
}

const FIRST = [
  "Giulia",
  "Sara",
  "Elena",
  "Chiara",
  "Francesca",
  "Matteo",
  "Davide",
  "Andrea",
];
const LAST = [
  "Ferrari",
  "Esposito",
  "Romano",
  "Colombo",
  "Ricci",
  "Marino",
  "Greco",
];

const authors: Author[] = [
  { id: 1, name: "Anna Rossi" },
  { id: 2, name: "Luca Rossi" },
  { id: 3, name: "Paolo Rossi" },
  { id: 4, name: "Marco Bianchi" },
  ...LAST.flatMap((last, row) =>
    FIRST.map((first, column) => ({
      id: 5 + row * FIRST.length + column,
      name: `${first} ${last}`,
    })),
  ),
];

/** A page of the authors whose name holds `search`, as DRF's list answers. */
export function listAuthors(search: string, page: number, pageSize: number) {
  const query = search.trim().toLowerCase();
  const found = authors.filter(
    (one) => !query || one.name.toLowerCase().includes(query),
  );
  const start = (page - 1) * pageSize;
  const results = found.slice(start, start + pageSize);
  const hasNext = start + pageSize < found.length;
  const link = (to: number) =>
    `/api/authors?page=${to}${query ? `&search=${encodeURIComponent(query)}` : ""}`;
  return {
    count: found.length,
    next: hasNext ? link(page + 1) : null,
    previous: page > 1 ? link(page - 1) : null,
    results,
  };
}
