// The pages of the AI lab's block page (app/pages/ai/ollama/blocks/[id].vue):
// a landing page of the city magazine, made mostly of blocks. In memory,
// reset when the server restarts. `blocks` is a JSON field, as in a CMS:
// the backend does not describe it, the form's templates do. `reviews` and
// `locations` are nested serializers, which the OPTIONS describes
// (pageMetadata.ts).

/** One block of the page: `_template` says which, the rest are its fields. */
export interface PageBlock {
  _template: string;
  [field: string]: unknown;
}

export interface PageReview {
  author: string;
  quote: string;
  /** From 1 to 5. */
  stars: number | null;
  date: string | null;
}

export interface PageOpeningHours {
  day: string;
  opens: string | null;
  closes: string | null;
  closed: boolean;
}

export interface PageLocation {
  name: string;
  address: string;
  /** An ISO 3166 code, such as `IT`. */
  country: string | null;
  phone: string;
  email: string;
  opening_hours: PageOpeningHours[];
}

export interface Page {
  id: number;
  title: string;
  slug: string;
  summary: string;
  intro: string;
  blocks: PageBlock[];
  reviews: PageReview[];
  locations: PageLocation[];
  seo: { title: string; description: string; permalink: string };
  status: "draft" | "review" | "published";
  published_at: string | null;
  show_until: string | null;
  show_in_menu: boolean;
  featured: boolean;
  priority: number;
  accent_color: string;
  contact_email: string;
  website: string;
  country: string | null;
  audiences: string[];
  category: number | null;
  tags: number[];
  cover: Record<string, unknown> | null;
  gallery: Record<string, unknown>[];
  video: Record<string, unknown> | null;
  brochure: string | null;
  position: { lat: number; lng: number } | null;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
  translations?: Record<
    string,
    { title?: string; summary?: string; intro?: string }
  >;
}

/** A page with nothing in it: what a new page starts from. */
export function emptyPage(): Omit<Page, "id" | "created_at" | "updated_at"> {
  return {
    title: "",
    slug: "",
    summary: "",
    intro: "",
    blocks: [],
    reviews: [],
    locations: [],
    seo: { title: "", description: "", permalink: "" },
    status: "draft",
    published_at: null,
    show_until: null,
    show_in_menu: false,
    featured: false,
    priority: 0,
    accent_color: "",
    contact_email: "",
    website: "",
    country: null,
    audiences: [],
    category: null,
    tags: [],
    cover: null,
    gallery: [],
    video: null,
    brochure: null,
    position: null,
    webhook_secret: "",
    translations: {},
  };
}

const CREATED = "2026-10-01T09:00:00Z";

// Page 1 holds some values already: a fill proposes to replace them, and
// waits for Apply. Its hero and its review are those the mock's fixture
// `page-update` gives again: Magic Fill does not add them a second time.
const pages: Page[] = [
  {
    ...emptyPage(),
    id: 1,
    title: "The city library",
    slug: "city-library",
    summary: "Opening hours, services and events of the city library.",
    blocks: [
      {
        _template: "hero",
        title: "A library for everyone",
        subtitle: "",
        cta_label: "",
        cta_url: "",
        background: "",
        image: null,
      },
    ],
    reviews: [
      {
        author: "Luca Bassi",
        quote: "Quiet rooms and kind staff.",
        stars: 4,
        date: "2026-09-12",
      },
    ],
    status: "draft",
    accent_color: "#0ea5e9",
    created_at: CREATED,
    updated_at: CREATED,
  },
];

let nextId = pages.length + 1;

export function getPages(search?: string) {
  const term = search?.toLowerCase().trim();
  const results = term
    ? pages.filter((page) => page.title.toLowerCase().includes(term))
    : pages;
  return { count: results.length, next: null, previous: null, results };
}

export function getPage(id: number): Page | undefined {
  return pages.find((page) => page.id === id);
}

export function createPage(data: Partial<Page>): Page {
  const now = new Date().toISOString();
  const page: Page = {
    ...emptyPage(),
    ...data,
    id: nextId++,
    created_at: now,
    updated_at: now,
  };
  pages.push(page);
  return page;
}

export function updatePage(id: number, patch: Partial<Page>): Page | null {
  const index = pages.findIndex((page) => page.id === id);
  const current = pages[index];
  if (!current) return null;
  const updated: Page = {
    ...current,
    ...patch,
    id,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  };
  pages[index] = updated;
  return updated;
}

export function deletePage(id: number): boolean {
  const index = pages.findIndex((page) => page.id === id);
  if (index === -1) return false;
  pages.splice(index, 1);
  return true;
}
