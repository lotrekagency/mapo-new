export interface Article {
  id: number;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  published_at: string | null;
  priority: number;
  translations: Record<string, { title?: string; body?: string }>;
}

let nextId = 11;

export const articles = new Map<number, Article>([
  [
    1,
    {
      id: 1,
      title: "Mapo v2: the admin framework for Nuxt 4",
      slug: "mapo-v2-admin-framework",
      body: "<p>Mapo v2 is built on Nuxt 4, Vue 3, Nuxt UI v3 and Tailwind v4.</p>",
      status: "published",
      is_featured: true,
      published_at: "2025-01-15T10:00:00Z",
      priority: 1,
      translations: {
        it: { title: "Mapo v2: il framework admin per Nuxt 4" },
        en: { title: "Mapo v2: the admin framework for Nuxt 4" },
      },
    },
  ],
  [
    2,
    {
      id: 2,
      title: "Form Engine: declarative field descriptors",
      slug: "form-engine-descriptors",
      body: "<p>No more per-field v-model boilerplate. One descriptor object drives the entire field.</p>",
      status: "published",
      is_featured: true,
      published_at: "2025-02-01T09:00:00Z",
      priority: 2,
      translations: {
        it: { title: "Form Engine: descriptor dichiarativi" },
        en: { title: "Form Engine: declarative field descriptors" },
      },
    },
  ],
  [
    3,
    {
      id: 3,
      title: "MapoDetail: zero-boilerplate CRUD pages",
      slug: "mapo-detail-crud",
      body: "<p>Fetch, dirty tracking, PATCH diff, unsaved-changes guard — all built in.</p>",
      status: "published",
      is_featured: false,
      published_at: "2025-02-20T11:00:00Z",
      priority: 3,
      translations: {
        it: { title: "MapoDetail: pagine CRUD senza boilerplate" },
        en: { title: "MapoDetail: zero-boilerplate CRUD pages" },
      },
    },
  ],
  [
    4,
    {
      id: 4,
      title: "MapoList: server-side table with one component",
      slug: "mapo-list-server-table",
      body: "<p>Pagination, sorting, filtering, bulk actions and quick-edit out of the box.</p>",
      status: "published",
      is_featured: true,
      published_at: "2025-03-10T08:30:00Z",
      priority: 4,
      translations: {
        it: { title: "MapoList: tabella server-side in un componente" },
        en: { title: "MapoList: server-side table with one component" },
      },
    },
  ],
  [
    5,
    {
      id: 5,
      title: "Translatable fields and i18n-aware forms",
      slug: "translatable-fields",
      body: "<p>Mark a field translatable: true and the form automatically reads/writes translations[lang].key.</p>",
      status: "draft",
      is_featured: false,
      published_at: null,
      priority: 5,
      translations: {
        it: { title: "Campi traducibili e form i18n-aware" },
        en: { title: "Translatable fields and i18n-aware forms" },
      },
    },
  ],
  [
    6,
    {
      id: 6,
      title: "Permission-aware sidebar navigation",
      slug: "permission-sidebar",
      body: "<p>Routes with meta.permissions are automatically hidden from users who lack access.</p>",
      status: "draft",
      is_featured: false,
      published_at: null,
      priority: 6,
      translations: {
        it: { title: "Sidebar con filtro permessi" },
        en: { title: "Permission-aware sidebar navigation" },
      },
    },
  ],
  [
    7,
    {
      id: 7,
      title: "Camomilla integration: Nitro reverse proxy",
      slug: "camomilla-integration",
      body: "<p>One module, zero nginx config. The Django API is proxied at /api/ with cookie forwarding.</p>",
      status: "archived",
      is_featured: false,
      published_at: "2024-12-01T00:00:00Z",
      priority: 7,
      translations: {
        it: { title: "Integrazione Camomilla: reverse proxy Nitro" },
        en: { title: "Camomilla integration: Nitro reverse proxy" },
      },
    },
  ],
  [
    8,
    {
      id: 8,
      title: "Repeater fields: nested structured data",
      slug: "repeater-fields",
      body: "<p>Build dynamic lists of sub-objects without a single line of state management code.</p>",
      status: "draft",
      is_featured: false,
      published_at: null,
      priority: 8,
      translations: {
        it: { title: "Repeater: dati strutturati annidati" },
        en: { title: "Repeater fields: nested structured data" },
      },
    },
  ],
  [
    9,
    {
      id: 9,
      title: "SEO preview field: real-time SERP snippet",
      slug: "seo-preview-field",
      body: "<p>The MapoSeoPreview field renders a live Google SERP preview as you type.</p>",
      status: "published",
      is_featured: false,
      published_at: "2025-03-25T14:00:00Z",
      priority: 9,
      translations: {
        it: { title: "SEO preview: snippet SERP in tempo reale" },
        en: { title: "SEO preview field: real-time SERP snippet" },
      },
    },
  ],
  [
    10,
    {
      id: 10,
      title: "FKS field: async foreign-key select",
      slug: "fks-field",
      body: "<p>Type to search. No preloading. Works with any paginated REST endpoint.</p>",
      status: "archived",
      is_featured: false,
      published_at: "2024-11-10T00:00:00Z",
      priority: 10,
      translations: {
        it: { title: "FKS field: select foreign-key asincrona" },
        en: { title: "FKS field: async foreign-key select" },
      },
    },
  ],
]);

export function createArticle(data: Omit<Article, "id">): Article {
  const id = nextId++;
  const article = { ...data, id };
  articles.set(id, article);
  return article;
}

export function updateArticle(
  id: number,
  patch: Partial<Article>,
): Article | null {
  const existing = articles.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id };
  articles.set(id, updated);
  return updated;
}

export function deleteArticle(id: number): boolean {
  return articles.delete(id);
}
