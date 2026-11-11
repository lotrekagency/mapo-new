/**
 * The backend the evaluation's relations look their records up in, with
 * the operator's session in an app: the records of the reference app's mock
 * API (`apps/example-e2e/server/`). Five categories, which Magic Fill lists
 * for the AI; sixty authors, a page of twenty at a time, searched by name
 * (three Rossi, one Bianchi, no Verdi); six reviewers by email, which the
 * article keeps from the AI with `ai: { list: false }`.
 */

const CATEGORIES = [
  { id: 1, name: "Technology", slug: "technology" },
  { id: 2, name: "Design", slug: "design" },
  { id: 3, name: "Business", slug: "business" },
  { id: 4, name: "Culture", slug: "culture" },
  { id: 5, name: "Science", slug: "science" },
];

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

const AUTHORS = [
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

const REVIEWERS = [
  { id: 1, email: "anna.ferri@example.org", name: "Anna Ferri" },
  { id: 2, email: "luca.moretti@example.org", name: "Luca Moretti" },
  { id: 3, email: "sara.conti@example.org", name: "Sara Conti" },
  { id: 4, email: "marco.gallo@example.org", name: "Marco Gallo" },
  { id: 5, email: "elena.villa@example.org", name: "Elena Villa" },
  { id: 6, email: "paolo.fontana@example.org", name: "Paolo Fontana" },
];

const PAGE_SIZE = 20;

/** Whether one of the texts holds what is searched, letter case aside. */
function holds(search: string, ...texts: string[]): boolean {
  const query = search.trim().toLowerCase();
  return !query || texts.some((text) => text.toLowerCase().includes(query));
}

/**
 * `get` of the browser, as `runMapoAiFill()` takes it: the records of a
 * relation, by the path its field asks.
 * @throws Error for a path the backend does not serve, as a 404 would.
 */
export async function evalBackendGet(path: string): Promise<unknown> {
  const url = new URL(path, "http://backend");
  const search = url.searchParams.get("search") ?? "";
  if (url.pathname === "/api/categories") {
    return CATEGORIES.filter((one) => holds(search, one.name));
  }
  if (url.pathname === "/api/reviewers") {
    return REVIEWERS.filter((one) => holds(search, one.email, one.name));
  }
  if (url.pathname === "/api/authors") {
    const page = Number(url.searchParams.get("page") ?? "1") || 1;
    const found = AUTHORS.filter((one) => holds(search, one.name));
    const start = (page - 1) * PAGE_SIZE;
    const hasNext = start + PAGE_SIZE < found.length;
    return {
      count: found.length,
      next: hasNext ? `/api/authors?page=${page + 1}` : null,
      previous: page > 1 ? `/api/authors?page=${page - 1}` : null,
      results: found.slice(start, start + PAGE_SIZE),
    };
  }
  throw new Error(`404 ${path}`);
}
