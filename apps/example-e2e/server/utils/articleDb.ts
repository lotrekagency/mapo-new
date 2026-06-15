// In-memory database for the article stress-test example.
// All data is reset on server restart.

export interface ListResponse<T> {
  results: T[];
  count: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Topic {
  id: number;
  name: string;
  slug: string;
}

export interface Series {
  id: number;
  name: string;
  slug: string;
  total_parts: number;
}

export interface Profile {
  id: number;
  name: string;
  email: string;
  role: string;
}

// ─── Repeater sub-types ───────────────────────────────────────────────────────

export interface GalleryItem {
  url: string;
  alt: string;
  caption: string;
  credit: string;
  type: string;
}

export interface Attachment {
  title: string;
  url: string;
  file_type: string;
  size_label: string;
  restricted: boolean;
}

export interface SocialImage {
  platform: string;
  url: string;
  alt: string;
}

export interface EmbedItem {
  provider: string;
  url: string;
  caption: string;
}

export interface AlternateUrl {
  lang: string;
  url: string;
}

export interface Contributor {
  name: string;
  role: string;
  bio: string;
  avatar: string;
  email: string;
  twitter: string;
  linkedin: string;
  website: string;
  institution: string;
  department: string;
}

export interface Footnote {
  number: number;
  content: string;
  source: string;
  url: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  author: string;
  description: string;
  breaking_change: boolean;
}

export interface Award {
  name: string;
  year: number;
  organization: string;
}

export interface ArticleSeo {
  title: string;
  description: string;
}

export interface ArticleLocation {
  lat: number;
  lng: number;
}

// ─── Main Article interface ───────────────────────────────────────────────────

export interface Article {
  id: number;

  // Content
  title: string;
  slug: string;
  subtitle?: string;
  kicker?: string;
  deck?: string;
  excerpt: string;
  body: string;
  body_secondary?: string;
  body_sidebar_note?: string;
  pull_quote?: string;
  pull_quote_author?: string;
  pull_quote_url?: string;
  cover_color: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  reading_time: number;
  word_count?: number;
  content_type?: string;
  difficulty?: string;
  tutorial_duration?: number;
  tutorial_prereqs?: string;
  rating_overall?: number;
  rating_design?: number;
  rating_value?: number;
  product_url?: string;
  product_price?: number;
  interview_subject?: string;
  interview_date?: string;
  opinion_stance?: string;
  language_override?: string;
  summary_enabled?: boolean;
  summary?: string;
  corrections_note?: string;
  version_label?: string;

  // Media
  cover_image?: string | null;
  cover_image_alt?: string;
  cover_caption?: string;
  cover_credit?: string;
  cover_credit_url?: string;
  hero_video_url?: string;
  hero_video_poster?: string | null;
  video_autoplay?: boolean;
  video_loop?: boolean;
  video_muted?: boolean;
  audio_url?: string;
  audio_title?: string;
  audio_duration?: string;
  audio_transcript?: string;
  audio_chapters?: boolean;
  podcast_episode_n?: number | null;
  gallery: GalleryItem[];
  attachments?: Attachment[];
  social_images?: SocialImage[];
  embeds?: EmbedItem[];

  // SEO
  seo: ArticleSeo;
  focus_keyword?: string;
  meta_robots?: string;
  canonical_url?: string;
  breadcrumb_label?: string;
  hreflang_enabled?: boolean;
  alternate_urls?: AlternateUrl[];
  og_title?: string;
  og_description?: string;
  og_image?: string | null;
  og_type?: string;
  og_article_section?: string;
  twitter_card?: string;
  twitter_title?: string;
  twitter_description?: string;
  twitter_image?: string;
  twitter_site?: string;
  structured_data_type?: string;
  structured_data_custom?: string;
  amp_enabled?: boolean;
  amp_style?: string;
  sitemap_priority?: number;
  sitemap_changefreq?: string;
  sitemap_exclude?: boolean;

  // Publishing
  category: number | null;
  subcategory?: number | null;
  tags: number[];
  topics?: number[];
  series?: number | null;
  series_part?: number | null;
  series_total?: number | null;
  related_articles?: number[];
  status: "draft" | "review" | "ready" | "published" | "archived";
  visibility?: string;
  allow_comments: boolean;
  allow_reactions?: boolean;
  allow_sharing?: boolean;
  comment_moderation?: string;
  featured: boolean;
  pinned?: boolean;
  sponsored?: boolean;
  sponsor_label?: string;
  sponsor_url?: string;
  sponsor_disclosure?: string;
  published_at: string | null;
  embargo_until?: string | null;
  expires_at?: string | null;
  scheduled_unpublish?: boolean;
  unpublish_at?: string | null;
  notify_subscribers?: boolean;
  push_notification?: boolean;
  push_notification_title?: string;

  // Advanced
  location: ArticleLocation | null;
  location_name?: string;
  location_address?: string;
  location_city?: string;
  location_country?: string;
  location_zoom?: number;
  priority: number;
  weight?: number;
  sort_order?: number;
  boost_score?: number;
  template?: string;
  layout_variant?: string;
  custom_css?: string;
  custom_js?: string;
  data_attributes?: string;
  ab_test_enabled?: boolean;
  ab_variant_name?: string;
  ab_traffic_split?: number;
  ab_goal?: string;
  paywall_enabled?: boolean;
  paywall_type?: string;
  paywall_preview_chars?: number | null;
  paywall_cta_text?: string;
  contributors?: Contributor[];
  footnotes?: Footnote[];
  changelog?: ChangelogEntry[];
  awards?: Award[];

  // Sidebar extras
  review_assigned_to?: number | null;
  internal_notes?: string;
  editorial_score?: number;
  content_warning?: boolean;
  content_warning_text?: string;

  // Metadata
  created_at: string;
  updated_at: string;

  // Translations
  translations?: Record<
    string,
    {
      title: string;
      subtitle?: string;
      excerpt: string;
      body: string;
      body_secondary?: string;
      summary?: string;
    }
  >;
}

// ─── Lookup data ──────────────────────────────────────────────────────────────

const categories: Category[] = [
  { id: 1, name: "Technology", slug: "technology" },
  { id: 2, name: "Design", slug: "design" },
  { id: 3, name: "Business", slug: "business" },
  { id: 4, name: "Culture", slug: "culture" },
  { id: 5, name: "Science", slug: "science" },
];

const tags: Tag[] = [
  { id: 1, name: "Vue.js", color: "#42b883" },
  { id: 2, name: "Nuxt", color: "#00dc82" },
  { id: 3, name: "TypeScript", color: "#3178c6" },
  { id: 4, name: "Open Source", color: "#f97316" },
  { id: 5, name: "Tutorial", color: "#8b5cf6" },
  { id: 6, name: "Performance", color: "#ec4899" },
  { id: 7, name: "UX", color: "#14b8a6" },
  { id: 8, name: "AI", color: "#f59e0b" },
];

const topics: Topic[] = [
  { id: 1, name: "Frontend Development", slug: "frontend-development" },
  { id: 2, name: "Admin Frameworks", slug: "admin-frameworks" },
  { id: 3, name: "Component Architecture", slug: "component-architecture" },
  { id: 4, name: "DX & Tooling", slug: "dx-tooling" },
  { id: 5, name: "Accessibility", slug: "accessibility" },
];

const seriesList: Series[] = [
  {
    id: 1,
    name: "Mapo v2 Deep Dive",
    slug: "mapo-v2-deep-dive",
    total_parts: 6,
  },
  { id: 2, name: "Vue 3 Patterns", slug: "vue-3-patterns", total_parts: 4 },
  { id: 3, name: "Nuxt 4 from Zero", slug: "nuxt-4-from-zero", total_parts: 8 },
];

const profiles: Profile[] = [
  {
    id: 1,
    name: "Marco Rossi",
    email: "marco@example.com",
    role: "Editor in Chief",
  },
  {
    id: 2,
    name: "Sara Bianchi",
    email: "sara@example.com",
    role: "Senior Editor",
  },
  {
    id: 3,
    name: "Luca Ferrari",
    email: "luca@example.com",
    role: "Technical Editor",
  },
  { id: 4, name: "Anna Conti", email: "anna@example.com", role: "Copy Editor" },
];

// ─── Articles seed ────────────────────────────────────────────────────────────

const articles: Article[] = [
  {
    id: 1,
    // ── Content ─────────────────────────────────────────────────────────────
    title: "Building Admin UIs with Mapo v2",
    slug: "building-admin-uis-mapo-v2",
    subtitle: "A complete guide to the declarative form engine",
    kicker: "DEEP DIVE",
    deck: "Everything you need to know about MapoForm — from field descriptors to repeaters and progressive disclosure.",
    excerpt:
      "A deep dive into the new Mapo v2 form engine and how it simplifies complex admin interfaces.",
    body: "<h2>Introduction</h2><p>Mapo v2 is a complete rewrite of the popular Mapo admin framework, built on Vue 3, Nuxt 4, Tailwind v4 and Nuxt UI v3. The new declarative form engine lets you describe a complex multi-tab form in a single <code>fields[]</code> array.</p><h2>Key Concepts</h2><p>Every field is described by a <em>FieldDescriptor</em> — a plain TypeScript object that says what type the field is, where it appears in the model, and how it should be validated.</p><h2>Progressive Disclosure</h2><p>Fields can be conditionally shown or hidden using <code>visible</code> and <code>show</code> predicates, both accepting a callback that receives the current model state.</p>",
    body_secondary:
      "<p>For advanced use cases, the form engine supports custom field components via the <code>is:</code> override, custom accessors for computed/transformed values, and both synchronous and asynchronous validation.</p>",
    body_sidebar_note:
      "Note: This article assumes familiarity with Vue 3 Composition API and TypeScript generics.",
    pull_quote:
      "A single fields[] array can describe an entire multi-tab admin form with nested repeaters, i18n, and conditional logic.",
    pull_quote_author: "Mapo Team",
    pull_quote_url: "https://mapo.dev/blog/declarative-forms",
    cover_color: "#3b82f6",
    accent_color: "#10b981",
    background_color: "",
    reading_time: 8,
    word_count: 2340,
    content_type: "tutorial",
    difficulty: "intermediate",
    tutorial_duration: 45,
    tutorial_prereqs:
      "Vue 3 Composition API, TypeScript basics, familiarity with Nuxt 4 routing and server routes.",
    language_override: "en",
    summary_enabled: true,
    summary:
      "Mapo v2 introduces a declarative form engine that replaces manual template authoring with a fields[] descriptor array. This tutorial walks through every feature: tabs, groups, repeaters, i18n, progressive disclosure, and custom slots.",
    version_label: "v2.0.0",

    // ── Media ────────────────────────────────────────────────────────────────
    cover_image: "https://placehold.co/1200x630/3b82f6/white?text=Mapo+v2",
    cover_image_alt: "Mapo v2 admin framework hero image",
    cover_caption: "The new Mapo v2 form engine in action",
    cover_credit: "Mapo Team",
    gallery: [
      {
        url: "https://placehold.co/1200x675/3b82f6/white?text=Overview",
        alt: "Form engine overview",
        caption: "Mapo v2 form engine — full view",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/1200x675/10b981/white?text=Dashboard",
        alt: "Dashboard",
        caption: "Admin dashboard with sidebar navigation",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/800x600/8b5cf6/white?text=Form+Tabs",
        alt: "Form tabs",
        caption: "Multi-tab form with collapsible groups",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/800x600/f97316/white?text=List+View",
        alt: "List view",
        caption: "Filterable data table with bulk actions",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/1200x675/ec4899/white?text=Media+Manager",
        alt: "Media manager",
        caption: "Drag-and-drop media manager with folder support",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/800x450/14b8a6/white?text=Mobile",
        alt: "Mobile responsive",
        caption: "Responsive layout on mobile devices",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/1200x675/f59e0b/white?text=Dark+Mode",
        alt: "Dark mode",
        caption: "Full dark mode support via Nuxt UI v3",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/800x600/6366f1/white?text=Repeater",
        alt: "Repeater component",
        caption: "Nested repeater with miniCard preview",
        credit: "Mapo Team",
        type: "screenshot",
      },
      {
        url: "https://placehold.co/1200x675/ef4444/white?text=Map+Field",
        alt: "Map field",
        caption: "Leaflet map field with expandable overlay",
        credit: "Mapo Team",
        type: "photo",
      },
      {
        url: "https://placehold.co/800x600/0ea5e9/white?text=Architecture",
        alt: "Architecture diagram",
        caption: "Mapo v2 monorepo architecture — packages overview",
        credit: "Mapo Team",
        type: "infographic",
      },
    ],
    social_images: [
      {
        platform: "og",
        url: "https://placehold.co/1200x630/3b82f6/white?text=OG+Image",
        alt: "Open Graph image",
      },
      {
        platform: "twitter",
        url: "https://placehold.co/1200x600/3b82f6/white?text=Twitter+Card",
        alt: "Twitter card image",
      },
    ],
    attachments: [
      {
        title: "Mapo v2 Cheatsheet",
        url: "https://example.com/mapo-v2-cheatsheet.pdf",
        file_type: "pdf",
        size_label: "248 KB",
        restricted: false,
      },
      {
        title: "Starter Template",
        url: "https://example.com/mapo-v2-starter.zip",
        file_type: "zip",
        size_label: "1.2 MB",
        restricted: true,
      },
    ],

    // ── SEO ──────────────────────────────────────────────────────────────────
    seo: {
      title: "Building Admin UIs with Mapo v2 | Mapo Blog",
      description:
        "Learn how to build complex admin interfaces using Mapo v2's declarative form engine. Step-by-step guide with code examples.",
    },
    focus_keyword: "mapo v2 form engine",
    meta_robots: "index",
    canonical_url: "https://mapo.dev/blog/building-admin-uis-mapo-v2",
    breadcrumb_label: "Building Admin UIs with Mapo v2",
    og_title: "Building Admin UIs with Mapo v2",
    og_description:
      "Learn how to build complex admin interfaces using Mapo v2's declarative form engine. 45-minute tutorial with live code examples.",
    og_type: "article",
    og_article_section: "Tutorials",
    twitter_card: "summary_large_image",
    twitter_title: "Building Admin UIs with Mapo v2",
    twitter_description:
      "A complete guide to the Mapo v2 declarative form engine — 45 min tutorial.",
    twitter_site: "@mapoframework",
    structured_data_type: "TechArticle",
    sitemap_priority: 0.8,
    sitemap_changefreq: "monthly",

    // ── Publishing ───────────────────────────────────────────────────────────
    category: 1,
    topics: [1, 2],
    tags: [1, 2, 3, 5],
    series: 1,
    series_part: 2,
    series_total: 6,
    status: "published",
    visibility: "public",
    featured: true,
    allow_comments: true,
    allow_reactions: true,
    allow_sharing: true,
    comment_moderation: "pre-moderated",
    published_at: "2025-03-15T10:00:00Z",
    review_assigned_to: 1,
    editorial_score: 9,

    // ── Advanced ─────────────────────────────────────────────────────────────
    location: { lat: 45.4654, lng: 9.1866 },
    location_name: "Lotrek HQ",
    location_address: "Via Giuseppe Candiani 10",
    location_city: "Milan",
    location_country: "IT",
    location_zoom: 14,
    priority: 8,
    weight: 100,
    boost_score: 85,
    template: "full-width",
    paywall_enabled: false,
    contributors: [
      {
        name: "Marco Rossi",
        role: "author",
        bio: "Senior full-stack engineer with 10+ years in the Vue.js ecosystem. Core contributor to several OSS projects.",
        avatar: "https://placehold.co/100x100/3b82f6/white?text=MR",
        email: "marco@example.com",
        twitter: "@marcorossi",
        linkedin: "in/marcorossi",
        website: "https://marcorossi.dev",
        institution: "Lotrek",
        department: "Engineering",
      },
      {
        name: "Sara Bianchi",
        role: "editor",
        bio: "Technical writer and UX researcher specializing in developer documentation and information architecture.",
        avatar: "https://placehold.co/100x100/10b981/white?text=SB",
        email: "sara@example.com",
        twitter: "@sarabianchi",
        linkedin: "in/sarabianchi",
        website: "",
        institution: "Lotrek",
        department: "Content",
      },
      {
        name: "Luca Ferrari",
        role: "co-author",
        bio: "Vue.js core contributor and open source enthusiast. Author of several Nuxt modules.",
        avatar: "https://placehold.co/100x100/8b5cf6/white?text=LF",
        email: "luca@example.com",
        twitter: "@lucaferrari",
        linkedin: "in/lucaferrari",
        website: "https://lucaferrari.io",
        institution: "Independent",
        department: "",
      },
      {
        name: "Anna Conti",
        role: "reviewer",
        bio: "Frontend architect specializing in design systems and component libraries. Tailwind CSS evangelist.",
        avatar: "https://placehold.co/100x100/f97316/white?text=AC",
        email: "anna@example.com",
        twitter: "@annaconti",
        linkedin: "in/annaconti",
        website: "",
        institution: "Lotrek",
        department: "Design",
      },
      {
        name: "Paolo Gallo",
        role: "illustrator",
        bio: "UI/UX designer and illustrator with a passion for data visualization and technical diagrams.",
        avatar: "https://placehold.co/100x100/ec4899/white?text=PG",
        email: "paolo@example.com",
        twitter: "@paologallo",
        linkedin: "in/paologallo",
        website: "https://paologallo.design",
        institution: "Independent",
        department: "",
      },
      {
        name: "Giulia Russo",
        role: "photographer",
        bio: "Product photographer and visual storyteller focused on tech brands and editorial work.",
        avatar: "https://placehold.co/100x100/14b8a6/white?text=GR",
        email: "giulia@example.com",
        twitter: "@giuliarusso",
        linkedin: "in/giuliarusso",
        website: "",
        institution: "Lotrek",
        department: "Marketing",
      },
      {
        name: "Davide Marino",
        role: "translator",
        bio: "Technical translator with deep expertise in EN/IT/FR software documentation and localization.",
        avatar: "https://placehold.co/100x100/f59e0b/white?text=DM",
        email: "davide@example.com",
        twitter: "@davidemarino",
        linkedin: "in/davidemarino",
        website: "",
        institution: "Independent",
        department: "",
      },
      {
        name: "Elena Vitale",
        role: "author",
        bio: "Backend engineer turned technical writer. Specializes in API documentation and developer experience.",
        avatar: "https://placehold.co/100x100/6366f1/white?text=EV",
        email: "elena@example.com",
        twitter: "@elenavitale",
        linkedin: "in/elenavitale",
        website: "https://elenavitale.dev",
        institution: "Lotrek",
        department: "Engineering",
      },
      {
        name: "Roberto Esposito",
        role: "co-author",
        bio: "DevOps engineer and Nuxt module author. 8 years of open source contributions to the JS ecosystem.",
        avatar: "https://placehold.co/100x100/ef4444/white?text=RE",
        email: "roberto@example.com",
        twitter: "@robertoesposito",
        linkedin: "in/robertoesposito",
        website: "",
        institution: "Lotrek",
        department: "Infrastructure",
      },
      {
        name: "Chiara Lombardi",
        role: "reviewer",
        bio: "Accessibility specialist and inclusive design advocate. WCAG 2.2 expert and screen reader tester.",
        avatar: "https://placehold.co/100x100/0ea5e9/white?text=CL",
        email: "chiara@example.com",
        twitter: "@chiaralombardi",
        linkedin: "in/chiaralombardi",
        website: "https://a11y.it",
        institution: "Independent",
        department: "",
      },
    ],
    changelog: [
      {
        version: "2.0.0",
        date: "2025-03-15",
        author: "Marco Rossi",
        description:
          "Initial publication of the Mapo v2 form engine deep dive.",
        breaking_change: false,
      },
      {
        version: "2.0.1",
        date: "2025-03-20",
        author: "Sara Bianchi",
        description:
          "Fixed typos in the repeater section. Added missing code examples for miniCard.",
        breaking_change: false,
      },
      {
        version: "2.1.0",
        date: "2025-04-01",
        author: "Luca Ferrari",
        description:
          "Added section on custom field components and is: override. Updated progressive disclosure examples.",
        breaking_change: false,
      },
    ],
    awards: [
      {
        name: "Best Tutorial of the Month",
        year: 2025,
        organization: "Vue.js News",
      },
    ],

    // ── Metadata ─────────────────────────────────────────────────────────────
    created_at: "2025-03-10T09:00:00Z",
    updated_at: "2025-04-01T12:00:00Z",

    // ── Translations ─────────────────────────────────────────────────────────
    translations: {
      it: {
        title: "Creare UI Admin con Mapo v2",
        subtitle: "Una guida completa al motore form dichiarativo",
        excerpt:
          "Un'analisi approfondita del nuovo motore form di Mapo v2 e come semplifica le interfacce admin complesse.",
        body: "<h2>Introduzione</h2><p>Mapo v2 è una riscrittura completa del popolare framework admin Mapo, costruito su Vue 3, Nuxt 4, Tailwind v4 e Nuxt UI v3. Il nuovo motore form dichiarativo permette di descrivere un form multi-tab complesso in un singolo array <code>fields[]</code>.</p><h2>Concetti Chiave</h2><p>Ogni campo è descritto da un <em>FieldDescriptor</em> — un oggetto TypeScript che specifica il tipo del campo, il suo percorso nel modello e come validarlo.</p>",
        body_secondary:
          "<p>Per casi d'uso avanzati, il motore form supporta componenti field personalizzati tramite l'override <code>is:</code>, accessori custom per valori calcolati/trasformati, e validazione sia sincrona che asincrona.</p>",
        summary:
          "Mapo v2 introduce un motore form dichiarativo che sostituisce la scrittura manuale di template con un array di descrittori fields[]. Questo tutorial percorre ogni funzionalità: tab, gruppi, repeater, i18n, progressive disclosure e slot personalizzati.",
      },
      en: {
        title: "Building Admin UIs with Mapo v2",
        subtitle: "A complete guide to the declarative form engine",
        excerpt:
          "A deep dive into the new Mapo v2 form engine and how it simplifies complex admin interfaces.",
        body: "<h2>Introduction</h2><p>Mapo v2 is a complete rewrite of the popular Mapo admin framework, built on Vue 3, Nuxt 4, Tailwind v4 and Nuxt UI v3. The new declarative form engine lets you describe a complex multi-tab form in a single <code>fields[]</code> array.</p><h2>Key Concepts</h2><p>Every field is described by a <em>FieldDescriptor</em> — a plain TypeScript object that says what type the field is, where it appears in the model, and how it should be validated.</p>",
        body_secondary:
          "<p>For advanced use cases, the form engine supports custom field components via the <code>is:</code> override, custom accessors for computed/transformed values, and both synchronous and asynchronous validation.</p>",
        summary:
          "Mapo v2 introduces a declarative form engine that replaces manual template authoring with a fields[] descriptor array. This tutorial walks through every feature: tabs, groups, repeaters, i18n, progressive disclosure, and custom slots.",
      },
    },
  },
  {
    id: 2,
    title: "Performance Patterns in Vue 3",
    slug: "performance-patterns-vue3",
    excerpt: "Practical patterns for building fast Vue 3 applications.",
    body: "<p>Vue 3's Composition API opens up new optimization paths...</p>",
    cover_color: "#10b981",
    seo: {
      title: "Performance Patterns in Vue 3",
      description:
        "Practical patterns for building fast Vue 3 applications with the Composition API.",
    },
    category: 1,
    tags: [1, 6],
    status: "draft",
    featured: false,
    allow_comments: true,
    reading_time: 12,
    location: null,
    gallery: [],
    priority: 5,
    published_at: null,
    created_at: "2025-04-01T08:00:00Z",
    updated_at: "2025-04-01T08:00:00Z",
  },
];

// Generate 30+ more articles for stress testing
const baseArticles = [...articles];
for (let i = 0; i < 35; i++) {
  const statuses: Article["status"][] = [
    "draft",
    "review",
    "ready",
    "published",
    "archived",
  ];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  const randomFeatured = Math.random() > 0.8;
  const randomReadingTime = Math.floor(Math.random() * 20) + 3;
  // Non-empty literal arrays: indexed picks are always defined.
  const randomCategory =
    categories[Math.floor(Math.random() * categories.length)]!;
  const randomPublishedAt =
    randomStatus === "published"
      ? new Date(
          Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

  baseArticles.push({
    id: 100 + i,
    title: `Article ${100 + i}: ${["Vue 3", "Nuxt 4", "TypeScript", "Performance", "Design", "API", "Testing", "DevOps"][Math.floor(Math.random() * 8)]} Tips & Tricks`,
    slug: `article-${100 + i}-tips-tricks`,
    excerpt: `Learn advanced ${randomCategory.name.toLowerCase()} patterns and best practices for production applications.`,
    body: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>",
    cover_color: [
      "#3b82f6",
      "#10b981",
      "#f97316",
      "#8b5cf6",
      "#ef4444",
      "#ec4899",
    ][Math.floor(Math.random() * 6)],
    seo: {
      title: `Article ${100 + i} | Blog`,
      description: `Learn advanced tips for ${randomCategory.name.toLowerCase()}.`,
    },
    category: randomCategory.id,
    tags: [
      tags[Math.floor(Math.random() * tags.length)]!.id,
      tags[Math.floor(Math.random() * tags.length)]!.id,
    ],
    status: randomStatus,
    featured: randomFeatured,
    allow_comments: true,
    reading_time: randomReadingTime,
    location: null,
    gallery: [],
    priority: Math.floor(Math.random() * 10),
    published_at: randomPublishedAt,
    created_at: new Date(
      Date.now() - Math.random() * 120 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    updated_at: new Date().toISOString(),
  } as Article);
}

articles.push(...baseArticles.slice(3));

let nextId = 200;

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

export interface GetArticlesOptions {
  search?: string;
  status?: string;
  featured?: boolean;
  category?: number;
  page?: number;
  page_size?: number;
  ordering?: string;
  published_at__gte?: string;
  published_at__lte?: string;
}

export function getArticles(
  options: GetArticlesOptions = {},
): ListResponse<Article> {
  let results = [...articles];

  // Filter by search
  if (options.search) {
    const q = options.search.toLowerCase();
    results = results.filter(
      (a) =>
        a.title.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q),
    );
  }

  // Filter by status
  if (options.status) {
    const statuses = options.status.split(",");
    results = results.filter((a) => statuses.includes(a.status));
  }

  // Filter by featured
  if (options.featured !== undefined) {
    results = results.filter((a) => a.featured === options.featured);
  }

  // Filter by category
  if (options.category) {
    results = results.filter((a) => a.category === options.category);
  }

  // Filter by date range
  if (options.published_at__gte) {
    const gte = new Date(options.published_at__gte).getTime();
    results = results.filter(
      (a) => a.published_at && new Date(a.published_at).getTime() >= gte,
    );
  }
  if (options.published_at__lte) {
    const lte = new Date(options.published_at__lte).getTime();
    results = results.filter(
      (a) => a.published_at && new Date(a.published_at).getTime() <= lte,
    );
  }

  // Sort by ordering
  if (options.ordering) {
    const [field, desc] = options.ordering.startsWith("-")
      ? [options.ordering.slice(1), true]
      : [options.ordering, false];

    results.sort((a, b) => {
      const aVal = (a as Record<string, any>)[field];
      const bVal = (b as Record<string, any>)[field];

      if (aVal < bVal) return desc ? 1 : -1;
      if (aVal > bVal) return desc ? -1 : 1;
      return 0;
    });
  }

  // Pagination
  const page = options.page ?? 1;
  const page_size = options.page_size ?? 20;
  const start = (page - 1) * page_size;
  const end = start + page_size;

  return {
    results: results.slice(start, end),
    count: results.length,
  };
}

export function getArticle(id: number): Article | undefined {
  return articles.find((a) => a.id === id);
}

export function createArticle(
  data: Omit<Article, "id" | "created_at" | "updated_at">,
): Article {
  const now = new Date().toISOString();
  const article: Article = {
    ...data,
    id: nextId++,
    created_at: now,
    updated_at: now,
  } as Article;
  articles.push(article);
  return article;
}

export function updateArticle(
  id: number,
  patch: Partial<Article>,
): Article | null {
  const idx = articles.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const updated = {
    ...articles[idx],
    ...patch,
    id,
    updated_at: new Date().toISOString(),
  } as Article;
  articles[idx] = updated;
  return updated;
}

export function deleteArticle(id: number): boolean {
  const idx = articles.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  articles.splice(idx, 1);
  return true;
}

export function getCategories(search?: string): Category[] {
  if (!search) return categories;
  const q = search.toLowerCase();
  return categories.filter((c) => c.name.toLowerCase().includes(q));
}

export function getTags(search?: string): Tag[] {
  if (!search) return tags;
  const q = search.toLowerCase();
  return tags.filter((t) => t.name.toLowerCase().includes(q));
}

export function getTopics(search?: string): Topic[] {
  if (!search) return topics;
  const q = search.toLowerCase();
  return topics.filter((t) => t.name.toLowerCase().includes(q));
}

export function getSeries(search?: string): Series[] {
  if (!search) return seriesList;
  const q = search.toLowerCase();
  return seriesList.filter((s) => s.name.toLowerCase().includes(q));
}

export function getProfiles(search?: string): Profile[] {
  if (!search) return profiles;
  const q = search.toLowerCase();
  return profiles.filter(
    (p) =>
      p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
  );
}
