export interface News {
  id: number;
  title: string | null;
  indexable: boolean;
  autopermalink: boolean;
  keywords: string | null;
  description: string | null;
  status: string;
  publication_date: string | null;
  identifier: string | null;
  ordering: number;
  short_desc: string | null;
  content: string | null;
  template_data: {
    titles?: { title?: string; sub_title?: string };
  } | null;
}

let nextId = 1;
const items = new Map<number, News>();

function seed() {
  if (items.size) return;
  const sample: Omit<News, "id">[] = [
    {
      title: "Welcome to the headless test bench",
      indexable: true,
      autopermalink: true,
      keywords: "mapo, vuetify, headless",
      description: "First seeded article",
      status: "PUB",
      publication_date: new Date().toISOString(),
      identifier: "welcome",
      ordering: 1,
      short_desc: "An intro article",
      content: "Lorem ipsum dolor sit amet.",
      template_data: { titles: { title: "Welcome", sub_title: "Intro" } },
    },
    {
      title: "Draft article",
      indexable: false,
      autopermalink: true,
      keywords: null,
      description: null,
      status: "DRF",
      publication_date: null,
      identifier: "draft-article",
      ordering: 2,
      short_desc: null,
      content: null,
      template_data: null,
    },
    {
      title: "Scheduled news",
      indexable: true,
      autopermalink: true,
      keywords: "scheduled",
      description: "Will go live tomorrow",
      status: "PLA",
      publication_date: new Date(Date.now() + 86400000).toISOString(),
      identifier: "scheduled-news",
      ordering: 3,
      short_desc: "Scheduled item",
      content: "Body content",
      template_data: null,
    },
  ];
  for (const it of sample) {
    const id = nextId++;
    items.set(id, { id, ...it });
  }
}
seed();

export const newsStore = {
  list(): News[] {
    return Array.from(items.values());
  },
  get(id: number): News | undefined {
    return items.get(id);
  },
  create(data: Partial<News>): News {
    const id = nextId++;
    const created: News = {
      id,
      title: null,
      indexable: true,
      autopermalink: true,
      keywords: null,
      description: null,
      status: "DRF",
      publication_date: null,
      identifier: null,
      ordering: 0,
      short_desc: null,
      content: null,
      template_data: null,
      ...data,
    };
    items.set(id, created);
    return created;
  },
  update(id: number, patch: Partial<News>): News | undefined {
    const existing = items.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id };
    items.set(id, updated);
    return updated;
  },
  remove(id: number): boolean {
    return items.delete(id);
  },
};
