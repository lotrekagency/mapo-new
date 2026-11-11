// The reviewers of the editorial office, listed by their email: six, few
// enough for Magic Fill to list them for the AI, but an email is personal
// data that must not reach the provider. The AI article form keeps them
// away with `ai: { list: false }`: the AI writes the email it reads, and
// Magic Fill searches it with `?search=`, on the email or the name.

/** A reviewer, as the backend answers it. */
export interface Reviewer {
  id: number;
  email: string;
  name: string;
}

const reviewers: Reviewer[] = [
  { id: 1, email: "anna.ferri@example.org", name: "Anna Ferri" },
  { id: 2, email: "luca.moretti@example.org", name: "Luca Moretti" },
  { id: 3, email: "sara.conti@example.org", name: "Sara Conti" },
  { id: 4, email: "marco.gallo@example.org", name: "Marco Gallo" },
  { id: 5, email: "elena.villa@example.org", name: "Elena Villa" },
  { id: 6, email: "paolo.fontana@example.org", name: "Paolo Fontana" },
];

/** The reviewers whose email or name holds `search`, as one plain list. */
export function listReviewers(search: string): Reviewer[] {
  const query = search.trim().toLowerCase();
  return reviewers.filter(
    (one) =>
      !query ||
      one.email.toLowerCase().includes(query) ||
      one.name.toLowerCase().includes(query),
  );
}
