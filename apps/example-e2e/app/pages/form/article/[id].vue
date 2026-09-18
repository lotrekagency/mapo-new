<script setup lang="ts">
/**
 * Article Editor — STRESS TEST form.
 *
 * ~136 top-level fields across 5 tabs + sidebar:
 *   Tab 1  Content    — 35 fields (text, editor, color, number, select, switch, slider)
 *   Tab 2  Media      — 15 fields + 4 repeaters (gallery pre-filled ×10, attachments, social_images, embeds)
 *   Tab 3  SEO        — nested tabs (Meta / Open Graph / Twitter / Technical) — C2
 *   Tab 4  Publishing — 28 fields; Scheduling group uses subtabs (Dates / Unpublish) — C2
 *   Tab 5  Advanced   — 24 fields + 4 repeaters (contributors pre-filled ×10, footnotes, changelog, awards)
 *   Sidebar           — flattenFieldGroups (flat + Assignment group + Quality group) — C3
 *
 * Features exercised:
 *   ✅ nested tabs      tab: ['SEO','Meta'] and tab: 'SEO/Twitter' (C2)
 *   ✅ subtabs in group Scheduling group → subtab: 'Dates' / 'Unpublish' (C2)
 *   ✅ flattenFieldGroups sidebar with FieldGroupDescriptor (C3)
 *   ✅ field.*.before/after  field.title.before, field.excerpt.after (C1)
 *   ✅ group.*.before/after  group.Taxonomy.before, group.Assignment.after (C1)
 *   ✅ 18 visible/show predicates (progressive disclosure)
 *   ✅ 9 repeaters (2 pre-filled via seed)
 *   ✅ 1 map (expandable)
 *   ✅ 6 translatable fields, 1 synci18n field
 *   ✅ 10 sync validators + 1 async validator (slug)
 *   ✅ 2 onChange callbacks
 *   ✅ draft auto-save to localStorage + banner restore/discard
 *   ✅ custom slot: field.slug (URL preview + copy)
 *   ✅ custom slots: title, side-top, body-bottom, side-bottom
 *   ✅ usePatch (PATCH diff on update), readonly toggle
 */
import { navigateTo } from "#app";
import { flattenFieldGroups } from "@mapomodule/form/types";
import type {
  FieldDescriptor,
  MediaItem,
  EnhancedMediaValue,
} from "@mapomodule/form/types";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-newspaper",
  middleware: ["auth"],
});

const route = useRoute();
const snack = useSnackStore();

// ─── Types ────────────────────────────────────────────────────────────────────

interface GalleryItem {
  url: string;
  alt: string;
  caption: string;
  credit: string;
  type: string;
}

interface Attachment {
  title: string;
  url: string;
  file_type: string;
  size_label: string;
  restricted: boolean;
}

interface SocialImage {
  platform: string;
  url: string;
  alt: string;
}

interface EmbedItem {
  provider: string;
  url: string;
  caption: string;
}

interface AlternateUrl {
  lang: string;
  url: string;
}

interface Contributor {
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

interface Footnote {
  number: number;
  content: string;
  source: string;
  url: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  author: string;
  description: string;
  breaking_change: boolean;
}

interface Award {
  name: string;
  year: number;
  organization: string;
}

interface Article {
  id?: number;
  // Media picker fields (v2 Media Manager)
  cover_media: EnhancedMediaValue | null;
  hero_image: MediaItem | null;
  gallery_media: MediaItem[];
  // Content
  title: string;
  slug: string;
  subtitle: string;
  kicker: string;
  deck: string;
  excerpt: string;
  body: string;
  body_secondary: string;
  body_sidebar_note: string;
  pull_quote: string;
  pull_quote_author: string;
  pull_quote_url: string;
  cover_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  reading_time: number;
  word_count: number;
  content_type: string;
  difficulty: string;
  tutorial_duration: number;
  tutorial_prereqs: string;
  rating_overall: number;
  rating_design: number;
  rating_value: number;
  product_url: string;
  product_price: number;
  interview_subject: string;
  interview_date: string;
  opinion_stance: string;
  language_override: string;
  summary_enabled: boolean;
  summary: string;
  corrections_note: string;
  version_label: string;
  // Media
  cover_image: string;
  cover_image_alt: string;
  cover_caption: string;
  cover_credit: string;
  cover_credit_url: string;
  hero_video_url: string;
  video_autoplay: boolean;
  video_loop: boolean;
  video_muted: boolean;
  audio_url: string;
  audio_title: string;
  audio_duration: string;
  audio_transcript: string;
  audio_chapters: boolean;
  podcast_episode_n: number | null;
  gallery: GalleryItem[];
  attachments: Attachment[];
  social_images: SocialImage[];
  embeds: EmbedItem[];
  // SEO
  seo: { title: string; description: string };
  focus_keyword: string;
  meta_robots: string;
  canonical_url: string;
  breadcrumb_label: string;
  hreflang_enabled: boolean;
  alternate_urls: AlternateUrl[];
  og_title: string;
  og_description: string;
  og_image: string;
  og_type: string;
  og_article_section: string;
  twitter_card: string;
  twitter_title: string;
  twitter_description: string;
  twitter_image: string;
  twitter_site: string;
  structured_data_type: string;
  structured_data_custom: string;
  amp_enabled: boolean;
  amp_style: string;
  sitemap_priority: number;
  sitemap_changefreq: string;
  sitemap_exclude: boolean;
  // Publishing
  category: number | null;
  subcategory: number | null;
  tags: number[];
  topics: number[];
  series: number | null;
  series_part: number | null;
  series_total: number | null;
  related_articles: number[];
  status: "draft" | "review" | "ready" | "published" | "archived";
  visibility: string;
  allow_comments: boolean;
  allow_reactions: boolean;
  allow_sharing: boolean;
  comment_moderation: string;
  featured: boolean;
  pinned: boolean;
  sponsored: boolean;
  sponsor_label: string;
  sponsor_url: string;
  sponsor_disclosure: string;
  published_at: string | null;
  embargo_until: string | null;
  expires_at: string | null;
  scheduled_unpublish: boolean;
  unpublish_at: string | null;
  notify_subscribers: boolean;
  push_notification: boolean;
  push_notification_title: string;
  // Advanced
  location: { lat: number; lng: number } | null;
  location_name: string;
  location_address: string;
  location_city: string;
  location_country: string;
  location_zoom: number;
  priority: number;
  weight: number;
  sort_order: number;
  boost_score: number;
  template: string;
  layout_variant: string;
  custom_css: string;
  custom_js: string;
  data_attributes: string;
  ab_test_enabled: boolean;
  ab_variant_name: string;
  ab_traffic_split: number;
  ab_goal: string;
  paywall_enabled: boolean;
  paywall_type: string;
  paywall_preview_chars: number | null;
  paywall_cta_text: string;
  contributors: Contributor[];
  footnotes: Footnote[];
  changelog: ChangelogEntry[];
  awards: Award[];
  // Sidebar extras
  review_assigned_to: number | null;
  internal_notes: string;
  editorial_score: number;
  content_warning: boolean;
  content_warning_text: string;
  // Metadata
  created_at?: string;
  updated_at?: string;
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
  template_data: {
    hero: {
      title: string;
      subtitle: string;
    };
  };
  // Nested repeater demo
  quiz?: {
    question: string;
    explanation?: string;
    answers?: { text: string; is_correct: boolean; feedback?: string }[];
  }[];
  // Repeater template variants
  timeline?: {
    date: string;
    title: string;
    description: string;
    event_type: string;
  }[];
  external_links?: {
    label: string;
    url: string;
    nofollow: boolean;
    icon?: string;
  }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  "en",
  "it",
  // "fr",
  // "de",
  // "es",
  // "pt",
  // "nl",
  // "pl",
  // "ru",
  // "ja",
  // "zh",
  // "ko",
  // "ar",
  // "tr",
  // "sv",
  // "da",
  // "fi",
  // "no",
  // "cs",
  // "hu",
];

const isReadonly = ref(false);
const slotSlug = "field.slug";
const slotFieldTitleBefore = "field.title.before";
const slotFieldExcerptAfter = "field.excerpt.after";
const slotGroupTaxonomyBefore = "group.Taxonomy.before";
const slotGroupAssignmentAfter = "group.Assignment.after";

// ─── Tab 1: Content (35 fields) ───────────────────────────────────────────────

const contentFields: FieldDescriptor<Article>[] = [
  // ── Headline ──
  {
    key: "title",
    type: "text",
    label: "Title",
    tab: "Content",
    cols: 8,
    required: true,
    translatable: true,
    validate: (v) =>
      !v
        ? "Title is required."
        : String(v).length > 255
          ? "Max 255 characters."
          : null,
    attrs: { placeholder: "Article title…" },
  },
  {
    key: "slug",
    type: "text",
    label: "Slug",
    tab: "Content",
    cols: 4,
    required: true,
    validate: (v) => {
      if (!v) return "Slug is required.";
      if (!/^[a-z0-9-]+$/.test(String(v)))
        return "Only lowercase letters, numbers, and hyphens.";
      return null;
    },
    validateAsync: async (v) => {
      if (!v) return null;
      await new Promise((r) => setTimeout(r, 400));
      return String(v) === "taken-slug" ? "This slug is already in use." : null;
    },
    validateAsyncDebounce: 700,
    attrs: { placeholder: "my-article-slug" },
  },
  {
    key: "subtitle",
    type: "text",
    label: "Subtitle",
    tab: "Content",
    cols: 12,
    translatable: true,
    attrs: { placeholder: "Supporting headline…" },
  },
  {
    key: "kicker",
    type: "text",
    label: "Kicker",
    tab: "Content",
    cols: 6,
    attrs: { placeholder: "DEEP DIVE" },
  },
  {
    key: "deck",
    type: "text",
    label: "Deck",
    tab: "Content",
    cols: 6,
    attrs: { placeholder: "One sentence that stands below the title…" },
  },

  // ── Body ──
  {
    key: "excerpt",
    type: "textarea",
    label: "Excerpt",
    tab: "Content",
    cols: 12,
    translatable: true,
    validate: (v) =>
      v && String(v).length > 1000 ? "Max 1000 characters." : null,
    attrs: { placeholder: "Brief summary of the article…", rows: 3 },
  },
  {
    key: "template_data.hero.title",
    type: "text",
    label: "Hero Title (nested field)",
    tab: "Content",
    cols: 12,
    translatable: true,
    attrs: { placeholder: "Title for the hero section…" },
  },
  {
    key: "body",
    type: "editor",
    label: "Body",
    tab: "Content",
    cols: 12,
    required: true,
    translatable: true,
    expandable: true,
    validate: (v) => (!v ? "Body is required." : null),
  },
  {
    key: "body_secondary",
    type: "editor",
    label: "Approfondimento / Scheda tecnica",
    tab: "Content",
    cols: 12,
    translatable: true,
    expandable: true,
  },
  {
    key: "body_sidebar_note",
    type: "textarea",
    label: "Sidebar Note",
    tab: "Content",
    cols: 12,
    attrs: { placeholder: "Short note shown in the article sidebar…", rows: 2 },
  },

  // ── Pull Quote ──
  {
    key: "pull_quote",
    type: "text",
    label: "Pull Quote",
    tab: "Content",
    cols: 8,
    debounce: 0,
    attrs: { placeholder: "Memorable quote to highlight…" },
  },
  {
    key: "pull_quote_author",
    type: "text",
    label: "Quote Author",
    tab: "Content",
    cols: 4,
    attrs: { placeholder: "Name or source" },
  },
  {
    key: "pull_quote_url",
    type: "text",
    label: "Quote Source URL",
    tab: "Content",
    cols: 12,
    show: ({ model }) => !!model.pull_quote,
    attrs: { placeholder: "https://…" },
  },

  // ── Colors ──
  {
    key: "cover_color",
    type: "color",
    label: "Cover Accent Color",
    tab: "Content",
    cols: 3,
    group: "Cover & Colors",
    synci18n: true,
  },
  {
    key: "accent_color",
    type: "color",
    label: "Accent Color",
    tab: "Content",
    cols: 3,
    group: "Cover & Colors",
  },
  {
    key: "background_color",
    type: "color",
    label: "Background Color",
    tab: "Content",
    cols: 3,
    group: "Cover & Colors",
  },
  {
    key: "text_color",
    type: "color",
    label: "Text Color",
    tab: "Content",
    cols: 3,
    group: "Cover & Colors",
    show: ({ model }) => !!model.background_color,
  },

  // ── Metrics ──
  {
    key: "reading_time",
    type: "number",
    label: "Reading Time (min)",
    tab: "Content",
    cols: 4,
    group: "Cover & Colors",
    validate: (v) => {
      const n = Number(v);
      if (v !== null && v !== undefined && v !== "" && (isNaN(n) || n < 1))
        return "Must be at least 1.";
      return null;
    },
    attrs: { min: 1, max: 120 },
  },
  {
    key: "word_count",
    type: "number",
    label: "Word Count",
    tab: "Content",
    cols: 4,
    group: "Cover & Colors",
    readonly: true,
  },

  // ── Content Type & conditional blocks ──
  {
    key: "content_type",
    type: "select",
    label: "Content Type",
    tab: "Content",
    cols: 6,
    attrs: {
      options: [
        { text: "Article", value: "article" },
        { text: "Tutorial", value: "tutorial" },
        { text: "Review", value: "review" },
        { text: "Guide", value: "guide" },
        { text: "Opinion", value: "opinion" },
        { text: "Interview", value: "interview" },
        { text: "Newsletter", value: "newsletter" },
        { text: "Press Release", value: "press-release" },
      ],
    },
  },
  {
    key: "difficulty",
    type: "select",
    label: "Difficulty",
    tab: "Content",
    cols: 6,
    show: ({ model }) =>
      ["tutorial", "guide"].includes(model.content_type ?? ""),
    attrs: {
      options: [
        { text: "Beginner", value: "beginner" },
        { text: "Intermediate", value: "intermediate" },
        { text: "Advanced", value: "advanced" },
        { text: "Expert", value: "expert" },
      ],
    },
  },
  {
    key: "tutorial_duration",
    type: "number",
    label: "Duration (min)",
    tab: "Content",
    cols: 4,
    show: ({ model }) => model.content_type === "tutorial",
    attrs: { min: 5, max: 480, step: 5, placeholder: "45" },
  },
  {
    key: "tutorial_prereqs",
    type: "textarea",
    label: "Prerequisites",
    tab: "Content",
    cols: 8,
    show: ({ model }) => model.content_type === "tutorial",
    attrs: { placeholder: "Vue 3 basics, TypeScript…", rows: 2 },
  },
  {
    key: "rating_overall",
    type: "slider",
    label: "Rating — Overall",
    tab: "Content",
    cols: 4,
    show: ({ model }) => model.content_type === "review",
    attrs: { min: 1, max: 10, step: 1 },
  },
  {
    key: "rating_design",
    type: "slider",
    label: "Rating — Design",
    tab: "Content",
    cols: 4,
    show: ({ model }) => model.content_type === "review",
    attrs: { min: 1, max: 10, step: 1 },
  },
  {
    key: "rating_value",
    type: "slider",
    label: "Rating — Value for Money",
    tab: "Content",
    cols: 4,
    show: ({ model }) => model.content_type === "review",
    attrs: { min: 1, max: 10, step: 1 },
  },
  {
    key: "product_url",
    type: "text",
    label: "Product URL",
    tab: "Content",
    cols: 8,
    show: ({ model }) => model.content_type === "review",
    attrs: { placeholder: "https://…" },
  },
  {
    key: "product_price",
    type: "number",
    label: "Price (€)",
    tab: "Content",
    cols: 4,
    show: ({ model }) => model.content_type === "review",
    attrs: { min: 0, step: 0.01 },
  },
  {
    key: "interview_subject",
    type: "text",
    label: "Interview Subject",
    tab: "Content",
    cols: 6,
    show: ({ model }) => model.content_type === "interview",
    attrs: { placeholder: "Name of the person being interviewed" },
  },
  {
    key: "interview_date",
    type: "date",
    label: "Interview Date",
    tab: "Content",
    cols: 6,
    show: ({ model }) => model.content_type === "interview",
  },
  {
    key: "opinion_stance",
    type: "select",
    label: "Stance",
    tab: "Content",
    cols: 12,
    show: ({ model }) => model.content_type === "opinion",
    attrs: {
      options: [
        { text: "In favour", value: "pro" },
        { text: "Against", value: "con" },
        { text: "Neutral / balanced", value: "neutral" },
      ],
    },
  },

  // ── Misc ──
  {
    key: "language_override",
    type: "select",
    label: "Language Override",
    tab: "Content",
    cols: 4,
    attrs: {
      options: [
        { text: "English", value: "en" },
        { text: "Italiano", value: "it" },
        { text: "Français", value: "fr" },
        { text: "Español", value: "es" },
        { text: "Deutsch", value: "de" },
        { text: "Português", value: "pt" },
        { text: "日本語", value: "ja" },
        { text: "中文", value: "zh" },
      ],
    },
  },
  {
    key: "summary_enabled",
    type: "switch",
    label: "Show Summary Box",
    tab: "Content",
    cols: 4,
    onChange: ({ model }) => {
      if (!model.summary_enabled) {
        (model as unknown as Record<string, unknown>).summary = "";
      }
    },
  },
  {
    key: "summary",
    type: "textarea",
    label: "Summary",
    tab: "Content",
    cols: 12,
    show: ({ model }) => !!model.summary_enabled,
    translatable: true,
    attrs: { placeholder: "TL;DR — 2–3 sentences…", rows: 3 },
  },
  {
    key: "corrections_note",
    type: "textarea",
    label: "Corrections Note",
    tab: "Content",
    cols: 12,
    attrs: {
      placeholder: "Document any post-publication corrections here…",
      rows: 2,
    },
  },
  {
    key: "version_label",
    type: "text",
    label: "Version Label",
    tab: "Content",
    cols: 4,
    attrs: { placeholder: "v2.0.0" },
  },
];

// ─── Tab 2: Media (15 fields + 4 repeaters + 3 media picker fields) ─────────

const mediaFields: FieldDescriptor<Article>[] = [
  // ── Media Picker fields (v2 Media Manager integration) ──────────────────────
  {
    key: "cover_media",
    type: "enhanced-media",
    label: "Cover Image (Media Picker)",
    tab: "Media",
    cols: 12,
    attrs: { mime: "image/*" },
  },
  {
    key: "hero_image",
    type: "media",
    label: "Hero Image (single picker)",
    tab: "Media",
    cols: 12,
    attrs: { mime: "image/*" },
  },
  {
    key: "gallery_media",
    type: "media-m2m",
    label: "Gallery (multi media picker)",
    tab: "Media",
    cols: 12,
  },

  // ── Cover (legacy URL text fields) ──────────────────────────────────────────
  {
    key: "cover_image",
    type: "text",
    label: "Cover Image URL (legacy)",
    tab: "Media",
    cols: 8,
    attrs: { placeholder: "https://cdn.example.com/cover.jpg" },
  },
  {
    key: "cover_image_alt",
    type: "text",
    label: "Cover Alt Text",
    tab: "Media",
    cols: 4,
  },
  {
    key: "cover_caption",
    type: "text",
    label: "Cover Caption",
    tab: "Media",
    cols: 6,
  },
  {
    key: "cover_credit",
    type: "text",
    label: "Cover Credit",
    tab: "Media",
    cols: 4,
  },
  {
    key: "cover_credit_url",
    type: "text",
    label: "Credit URL",
    tab: "Media",
    cols: 2,
    attrs: { placeholder: "https://…" },
  },

  // ── Video ──
  {
    key: "hero_video_url",
    type: "text",
    label: "Hero Video URL",
    tab: "Media",
    cols: 8,
    group: "Video",
    attrs: { placeholder: "https://youtube.com/watch?v=…" },
  },
  {
    key: "video_autoplay",
    type: "switch",
    label: "Autoplay",
    tab: "Media",
    cols: 2,
    group: "Video",
  },
  {
    key: "video_loop",
    type: "switch",
    label: "Loop",
    tab: "Media",
    cols: 2,
    group: "Video",
  },
  {
    key: "video_muted",
    type: "switch",
    label: "Muted",
    tab: "Media",
    cols: 2,
    group: "Video",
    show: ({ model }) => !!model.video_autoplay,
  },

  // ── Audio ──
  {
    key: "audio_url",
    type: "text",
    label: "Audio / Podcast URL",
    tab: "Media",
    cols: 8,
    group: "Audio",
    attrs: { placeholder: "https://…/episode.mp3" },
  },
  {
    key: "audio_title",
    type: "text",
    label: "Episode Title",
    tab: "Media",
    cols: 4,
    group: "Audio",
  },
  {
    key: "audio_duration",
    type: "text",
    label: "Duration",
    tab: "Media",
    cols: 3,
    group: "Audio",
    attrs: { placeholder: "42:07" },
  },
  {
    key: "audio_transcript",
    type: "textarea",
    label: "Transcript",
    tab: "Media",
    cols: 9,
    group: "Audio",
    attrs: { rows: 3 },
  },
  {
    key: "audio_chapters",
    type: "switch",
    label: "Has Chapter Markers",
    tab: "Media",
    cols: 4,
    group: "Audio",
  },
  {
    key: "podcast_episode_n",
    type: "number",
    label: "Episode #",
    tab: "Media",
    cols: 4,
    group: "Audio",
    show: ({ model }) => !!model.audio_chapters,
    attrs: { min: 1 },
  },

  // ── Repeater 1: Gallery (10 items pre-filled) ──
  {
    key: "gallery",
    type: "repeater",
    label: "Photo Gallery",
    tab: "Media",
    cols: 12,
    group: "Gallery",
    fields: [
      {
        key: "url",
        type: "text",
        label: "Image URL",
        cols: 12,
        required: true,
        attrs: { placeholder: "https://…" },
      },
      { key: "alt", type: "text", label: "Alt Text", cols: 6 },
      { key: "caption", type: "text", label: "Caption", cols: 6 },
      { key: "credit", type: "text", label: "Credit", cols: 6 },
      {
        key: "type",
        type: "select",
        label: "Type",
        cols: 6,
        attrs: {
          options: [
            { text: "Photo", value: "photo" },
            { text: "Screenshot", value: "screenshot" },
            { text: "Illustration", value: "illustration" },
            { text: "Infographic", value: "infographic" },
          ],
        },
      },
    ],
    attrs: {
      confirmDelete: true,
      allowDuplicate: true,
      showPositionField: true,
      compressThreshold: 4,
      miniCard: (item: unknown) => {
        const i = item as GalleryItem;
        return {
          title: i.caption || i.alt || "Untitled",
          subtitle: i.credit || i.type || "",
          thumbnail: i.url || undefined,
          statusColor:
            i.type === "photo"
              ? "success"
              : i.type === "infographic"
                ? "warning"
                : "neutral",
        };
      },
      previewLabel: (item: unknown) => {
        const i = item as GalleryItem;
        return i.caption || i.alt || i.url || "Image";
      },
    },
  },

  // ── Repeater 2: Attachments ──
  {
    key: "attachments",
    type: "repeater",
    label: "Attachments",
    tab: "Media",
    cols: 12,
    group: "Attachments",
    fields: [
      { key: "title", type: "text", label: "Title", cols: 6, required: true },
      {
        key: "url",
        type: "text",
        label: "URL",
        cols: 6,
        required: true,
        attrs: { placeholder: "https://…" },
      },
      {
        key: "file_type",
        type: "select",
        label: "File Type",
        cols: 4,
        attrs: {
          options: [
            { text: "PDF", value: "pdf" },
            { text: "ZIP", value: "zip" },
            { text: "Excel", value: "xlsx" },
            { text: "PowerPoint", value: "pptx" },
            { text: "Other", value: "other" },
          ],
        },
      },
      {
        key: "size_label",
        type: "text",
        label: "File Size",
        cols: 4,
        attrs: { placeholder: "1.2 MB" },
      },
      { key: "restricted", type: "switch", label: "Members Only", cols: 4 },
    ],
    attrs: {
      previewLabel: (item: unknown) =>
        (item as Attachment).title || "Attachment",
    },
  },

  // ── Repeater 3: Social Images ──
  {
    key: "social_images",
    type: "repeater",
    label: "Social Images",
    tab: "Media",
    cols: 12,
    group: "Social Images",
    fields: [
      {
        key: "platform",
        type: "select",
        label: "Platform",
        cols: 4,
        attrs: {
          options: [
            { text: "Open Graph", value: "og" },
            { text: "Twitter / X", value: "twitter" },
            { text: "LinkedIn", value: "linkedin" },
            { text: "WhatsApp", value: "whatsapp" },
          ],
        },
      },
      {
        key: "url",
        type: "text",
        label: "Image URL",
        cols: 5,
        attrs: { placeholder: "https://…" },
      },
      { key: "alt", type: "text", label: "Alt Text", cols: 3 },
    ],
    attrs: {
      previewLabel: (item: unknown) =>
        (item as SocialImage).platform || "Image",
    },
  },

  // ── Repeater 4: Embeds ──
  {
    key: "embeds",
    type: "repeater",
    label: "Embedded Content",
    tab: "Media",
    cols: 12,
    group: "Embeds",
    fields: [
      {
        key: "provider",
        type: "select",
        label: "Provider",
        cols: 4,
        attrs: {
          options: [
            { text: "YouTube", value: "youtube" },
            { text: "Vimeo", value: "vimeo" },
            { text: "Twitter / X", value: "twitter" },
            { text: "CodePen", value: "codepen" },
            { text: "Figma", value: "figma" },
            { text: "Other", value: "other" },
          ],
        },
      },
      {
        key: "url",
        type: "text",
        label: "Embed URL",
        cols: 5,
        required: true,
        attrs: { placeholder: "https://…" },
      },
      { key: "caption", type: "text", label: "Caption", cols: 3 },
    ],
    attrs: {
      previewLabel: (item: unknown) => {
        const i = item as EmbedItem;
        return `${i.provider || "embed"}: ${i.caption || i.url || "—"}`;
      },
    },
  },
];

// ─── Tab 3: SEO — nested tabs (C2) ───────────────────────────────────────────
//
//   tab: ['SEO', 'Meta']         → basic SEO meta fields (array notation — C2)
//   tab: ['SEO', 'Open Graph']   → OG fields
//   tab: 'SEO/Twitter'           → Twitter/X fields (slash notation — C2)
//   tab: ['SEO', 'Technical']    → JSON-LD, AMP, Sitemap

const seoFields: FieldDescriptor<Article>[] = [
  // ── Sub-tab: Meta ────────────────────────────────────────────────────────────
  {
    key: "seo",
    type: "seo",
    label: "Search Engine Preview",
    tab: ["SEO", "Meta"],
    cols: 12,
  },
  {
    key: "focus_keyword",
    type: "text",
    label: "Focus Keyword",
    tab: ["SEO", "Meta"],
    cols: 6,
    attrs: { placeholder: "mapo v2 form engine" },
  },
  {
    key: "meta_robots",
    type: "select",
    label: "Meta Robots",
    tab: ["SEO", "Meta"],
    cols: 6,
    attrs: {
      options: [
        { text: "index, follow", value: "index" },
        { text: "noindex, follow", value: "noindex" },
        { text: "index, nofollow", value: "nofollow" },
        { text: "noindex, nofollow", value: "noindex nofollow" },
        { text: "noarchive", value: "noarchive" },
      ],
    },
  },
  {
    key: "canonical_url",
    type: "text",
    label: "Canonical URL",
    tab: ["SEO", "Meta"],
    cols: 8,
    validate: (v) => {
      if (!v) return null;
      try {
        new URL(String(v));
        return null;
      } catch {
        return "Must be a valid URL.";
      }
    },
    attrs: { placeholder: "https://…" },
  },
  {
    key: "breadcrumb_label",
    type: "text",
    label: "Breadcrumb Label",
    tab: ["SEO", "Meta"],
    cols: 4,
    attrs: { placeholder: "Building Admin UIs…" },
  },
  {
    key: "hreflang_enabled",
    type: "switch",
    label: "Hreflang / Alternate URLs",
    tab: ["SEO", "Meta"],
    cols: 12,
  },
  // ── Repeater 5: Alternate URLs (visible when hreflang enabled) ──
  {
    key: "alternate_urls",
    type: "repeater",
    label: "Alternate Language URLs",
    tab: ["SEO", "Meta"],
    cols: 12,
    show: ({ model }) => !!model.hreflang_enabled,
    fields: [
      {
        key: "lang",
        type: "select",
        label: "Language",
        cols: 4,
        attrs: {
          options: [
            { text: "English", value: "en" },
            { text: "Italiano", value: "it" },
            { text: "Français", value: "fr" },
            { text: "Español", value: "es" },
            { text: "Deutsch", value: "de" },
            { text: "Português", value: "pt" },
            { text: "日本語", value: "ja" },
            { text: "中文", value: "zh" },
            { text: "العربية", value: "ar" },
            { text: "한국어", value: "ko" },
          ],
        },
      },
      {
        key: "url",
        type: "text",
        label: "URL",
        cols: 8,
        required: true,
        attrs: { placeholder: "https://…/it/articolo" },
      },
    ],
    attrs: {
      previewLabel: (item: unknown) => {
        const i = item as AlternateUrl;
        return `${i.lang || "—"}: ${i.url || "—"}`;
      },
    },
  },

  // ── Sub-tab: Open Graph (array notation — C2) ────────────────────────────────
  {
    key: "og_title",
    type: "text",
    label: "OG Title",
    tab: ["SEO", "Open Graph"],
    cols: 12,
    group: "Open Graph",
    validate: (v) => (v && String(v).length > 95 ? "Max 95 characters." : null),
    attrs: { placeholder: "Custom title for social sharing…" },
  },
  {
    key: "og_description",
    type: "textarea",
    label: "OG Description",
    tab: ["SEO", "Open Graph"],
    cols: 12,
    group: "Open Graph",
    validate: (v) =>
      v && String(v).length > 300 ? "Max 300 characters." : null,
    attrs: { rows: 2 },
  },
  {
    key: "og_image",
    type: "text",
    label: "OG Image URL",
    tab: ["SEO", "Open Graph"],
    cols: 8,
    group: "Open Graph",
    attrs: { placeholder: "https://… (1200×630 recommended)" },
  },
  {
    key: "og_type",
    type: "select",
    label: "OG Type",
    tab: ["SEO", "Open Graph"],
    cols: 4,
    group: "Open Graph",
    attrs: {
      options: [
        { text: "Article", value: "article" },
        { text: "Website", value: "website" },
        { text: "Product", value: "product" },
        { text: "Video", value: "video" },
      ],
    },
  },
  {
    key: "og_article_section",
    type: "text",
    label: "Article Section",
    tab: ["SEO", "Open Graph"],
    cols: 12,
    group: "Open Graph",
    show: ({ model }) => model.og_type === "article",
    attrs: { placeholder: "Tutorials" },
  },

  // ── Sub-tab: Twitter (slash notation — C2) ────────────────────────────────
  {
    key: "twitter_card",
    type: "select",
    label: "Card Type",
    tab: "SEO/Twitter",
    cols: 4,
    group: "Twitter / X",
    attrs: {
      options: [
        { text: "Summary", value: "summary" },
        { text: "Summary Large Image", value: "summary_large_image" },
        { text: "Player", value: "player" },
      ],
    },
  },
  {
    key: "twitter_title",
    type: "text",
    label: "Twitter Title",
    tab: "SEO/Twitter",
    cols: 8,
    group: "Twitter / X",
    validate: (v) => (v && String(v).length > 70 ? "Max 70 characters." : null),
  },
  {
    key: "twitter_description",
    type: "textarea",
    label: "Twitter Description",
    tab: "SEO/Twitter",
    cols: 8,
    group: "Twitter / X",
    validate: (v) =>
      v && String(v).length > 200 ? "Max 200 characters." : null,
    attrs: { rows: 2 },
  },
  {
    key: "twitter_image",
    type: "text",
    label: "Twitter Image URL",
    tab: "SEO/Twitter",
    cols: 4,
    group: "Twitter / X",
    attrs: { placeholder: "https://…" },
  },
  {
    key: "twitter_site",
    type: "text",
    label: "Twitter @handle",
    tab: "SEO/Twitter",
    cols: 4,
    group: "Twitter / X",
    attrs: { placeholder: "@yourhandle" },
  },

  // ── Sub-tab: Technical (array notation — C2) ─────────────────────────────────
  {
    key: "structured_data_type",
    type: "select",
    label: "Schema.org Type",
    tab: ["SEO", "Technical"],
    cols: 6,
    group: "JSON-LD",
    attrs: {
      options: [
        { text: "Article", value: "Article" },
        { text: "NewsArticle", value: "NewsArticle" },
        { text: "BlogPosting", value: "BlogPosting" },
        { text: "TechArticle", value: "TechArticle" },
        { text: "HowTo", value: "HowTo" },
      ],
    },
  },
  {
    key: "structured_data_custom",
    type: "textarea",
    label: "Custom JSON-LD Override",
    tab: ["SEO", "Technical"],
    cols: 12,
    group: "JSON-LD",
    debounce: 1000,
    attrs: {
      placeholder:
        '{\n  "@context": "https://schema.org",\n  "@type": "Article"\n}',
      rows: 5,
    },
  },

  // ── AMP ──
  {
    key: "amp_enabled",
    type: "switch",
    label: "Generate AMP Version",
    tab: ["SEO", "Technical"],
    cols: 12,
    group: "AMP",
  },
  {
    key: "amp_style",
    type: "textarea",
    label: "AMP Custom CSS",
    tab: ["SEO", "Technical"],
    cols: 12,
    group: "AMP",
    show: ({ model }) => !!model.amp_enabled,
    attrs: { placeholder: "/* Max 75KB of custom CSS for AMP… */", rows: 4 },
  },

  {
    key: "sitemap_priority",
    type: "slider",
    label: "Sitemap Priority",
    tab: ["SEO", "Technical"],
    cols: 4,
    group: "Sitemap",
    attrs: { min: 0.1, max: 1.0, step: 0.1 },
  },
  {
    key: "sitemap_changefreq",
    type: "select",
    label: "Change Frequency",
    tab: ["SEO", "Technical"],
    cols: 4,
    group: "Sitemap",
    attrs: {
      options: [
        { text: "Always", value: "always" },
        { text: "Hourly", value: "hourly" },
        { text: "Daily", value: "daily" },
        { text: "Weekly", value: "weekly" },
        { text: "Monthly", value: "monthly" },
        { text: "Yearly", value: "yearly" },
        { text: "Never", value: "never" },
      ],
    },
  },
  {
    key: "sitemap_exclude",
    type: "switch",
    label: "Exclude from Sitemap",
    tab: ["SEO", "Technical"],
    cols: 4,
    group: "Sitemap",
  },
];

// ─── Tab 4: Publishing (28 fields) ────────────────────────────────────────────

const publishingFields: FieldDescriptor<Article>[] = [
  // ── Taxonomy ──
  {
    key: "category",
    type: "fks",
    label: "Category",
    tab: "Publishing",
    cols: 6,
    group: "Taxonomy",
    attrs: {
      endpoint: "/api/categories",
      itemText: "name",
      itemValue: "id",
      returnObject: false,
    },
  },
  {
    key: "subcategory",
    type: "fks",
    label: "Subcategory",
    tab: "Publishing",
    cols: 6,
    group: "Taxonomy",
    show: ({ model }) => !!model.category,
    attrs: {
      endpoint: "/api/categories",
      itemText: "name",
      itemValue: "id",
      returnObject: false,
    },
  },
  {
    key: "tags",
    type: "m2m",
    label: "Tags",
    tab: "Publishing",
    cols: 6,
    group: "Taxonomy",
    attrs: {
      endpoint: "/api/tags",
      itemText: "name",
      itemValue: "id",
      multiple: true,
      returnObject: false,
    },
  },
  {
    key: "topics",
    type: "m2m",
    label: "Topics",
    tab: "Publishing",
    cols: 6,
    group: "Taxonomy",
    attrs: {
      endpoint: "/api/topics",
      itemText: "name",
      itemValue: "id",
      multiple: true,
      returnObject: false,
    },
  },

  // ── Series ──
  {
    key: "series",
    type: "fks",
    label: "Series",
    tab: "Publishing",
    cols: 6,
    group: "Series",
    attrs: {
      endpoint: "/api/series",
      itemText: "name",
      itemValue: "id",
      returnObject: false,
    },
  },
  {
    key: "series_part",
    type: "number",
    label: "Part #",
    tab: "Publishing",
    cols: 3,
    group: "Series",
    show: ({ model }) => !!model.series,
    attrs: { min: 1 },
  },
  {
    key: "series_total",
    type: "number",
    label: "Total Parts",
    tab: "Publishing",
    cols: 3,
    group: "Series",
    show: ({ model }) => !!model.series,
    validate: (v, { model }) => {
      const part = model.series_part;
      if (v && part && Number(v) < Number(part))
        return "Total must be ≥ Part #.";
      return null;
    },
    attrs: { min: 1 },
  },

  // ── Relations ──
  {
    key: "related_articles",
    type: "m2m",
    label: "Related Articles",
    tab: "Publishing",
    cols: 12,
    group: "Relations",
    attrs: {
      endpoint: "/api/articles",
      itemText: "title",
      itemValue: "id",
      multiple: true,
      returnObject: false,
    },
  },

  // ── Engagement ──
  {
    key: "allow_comments",
    type: "switch",
    label: "Allow Comments",
    tab: "Publishing",
    cols: 4,
    group: "Engagement",
  },
  {
    key: "allow_reactions",
    type: "switch",
    label: "Allow Reactions",
    tab: "Publishing",
    cols: 4,
    group: "Engagement",
  },
  {
    key: "allow_sharing",
    type: "switch",
    label: "Allow Sharing",
    tab: "Publishing",
    cols: 4,
    group: "Engagement",
  },
  {
    key: "comment_moderation",
    type: "select",
    label: "Comment Moderation",
    tab: "Publishing",
    cols: 6,
    group: "Engagement",
    show: ({ model }) => !!model.allow_comments,
    attrs: {
      options: [
        { text: "Open (no moderation)", value: "open" },
        { text: "Pre-moderated", value: "pre-moderated" },
        { text: "Closed", value: "closed" },
      ],
    },
  },

  // ── Promotion ──
  {
    key: "featured",
    type: "switch",
    label: "Featured",
    tab: "Publishing",
    cols: 3,
    group: "Promotion",
  },
  {
    key: "pinned",
    type: "switch",
    label: "Pinned",
    tab: "Publishing",
    cols: 3,
    group: "Promotion",
  },
  {
    key: "sponsored",
    type: "switch",
    label: "Sponsored",
    tab: "Publishing",
    cols: 3,
    group: "Promotion",
    onChange: ({ model }) => {
      if (!model.sponsored) {
        (model as unknown as Record<string, unknown>).sponsor_label = "";
        (model as unknown as Record<string, unknown>).sponsor_url = "";
        (model as unknown as Record<string, unknown>).sponsor_disclosure = "";
      }
    },
  },
  {
    key: "sponsor_label",
    type: "text",
    label: "Sponsor Name",
    tab: "Publishing",
    cols: 4,
    group: "Promotion",
    show: ({ model }) => !!model.sponsored,
    validate: (v, { model }) =>
      model.sponsored && !v ? "Sponsor name is required when sponsored." : null,
    attrs: { placeholder: "Acme Corp" },
  },
  {
    key: "sponsor_url",
    type: "text",
    label: "Sponsor URL",
    tab: "Publishing",
    cols: 4,
    group: "Promotion",
    show: ({ model }) => !!model.sponsored,
    attrs: { placeholder: "https://…" },
  },
  {
    key: "sponsor_disclosure",
    type: "textarea",
    label: "Sponsor Disclosure",
    tab: "Publishing",
    cols: 12,
    group: "Promotion",
    show: ({ model }) => !!model.sponsored,
    attrs: { placeholder: "This article is sponsored by Acme Corp…", rows: 2 },
  },

  // ── Scheduling ──
  {
    key: "status",
    type: "select",
    label: "Status",
    tab: "Publishing",
    cols: 6,
    group: "Scheduling",
    required: true,
    validate: (v) => (!v ? "Status is required." : null),
    attrs: {
      options: [
        { text: "Draft", value: "draft" },
        { text: "In Review", value: "review" },
        { text: "Ready to Publish", value: "ready" },
        { text: "Published", value: "published" },
        { text: "Archived", value: "archived" },
      ],
    },
  },
  {
    key: "visibility",
    type: "select",
    label: "Visibility",
    tab: "Publishing",
    cols: 6,
    group: "Scheduling",
    attrs: {
      options: [
        { text: "Public", value: "public" },
        { text: "Members", value: "members" },
        { text: "Premium", value: "premium" },
        { text: "Internal", value: "internal" },
      ],
    },
  },
  // subtab: 'Dates' / 'Unpublish' inside group "Scheduling" — C2
  {
    key: "published_at",
    type: "datetime",
    label: "Publication Date",
    tab: "Publishing",
    cols: 6,
    group: "Scheduling",
    subtab: "Dates",
    show: ({ model }) => model.status === "published",
  },
  {
    key: "embargo_until",
    type: "datetime",
    label: "Embargoed Until",
    tab: "Publishing",
    cols: 6,
    group: "Scheduling",
    subtab: "Dates",
  },
  {
    key: "expires_at",
    type: "datetime",
    label: "Expires At",
    tab: "Publishing",
    cols: 6,
    group: "Scheduling",
    subtab: "Dates",
  },
  {
    key: "scheduled_unpublish",
    type: "switch",
    label: "Schedule Unpublish",
    tab: "Publishing",
    cols: 6,
    group: "Scheduling",
    subtab: "Unpublish",
  },
  {
    key: "unpublish_at",
    type: "datetime",
    label: "Unpublish At",
    tab: "Publishing",
    cols: 6,
    group: "Scheduling",
    subtab: "Unpublish",
    show: ({ model }) => !!model.scheduled_unpublish,
  },

  // ── Notifications ──
  {
    key: "notify_subscribers",
    type: "switch",
    label: "Notify Subscribers",
    tab: "Publishing",
    cols: 4,
    group: "Notifications",
  },
  {
    key: "push_notification",
    type: "switch",
    label: "Send Push Notification",
    tab: "Publishing",
    cols: 4,
    group: "Notifications",
    show: ({ model }) => !!model.notify_subscribers,
  },
  {
    key: "push_notification_title",
    type: "text",
    label: "Push Title",
    tab: "Publishing",
    cols: 8,
    group: "Notifications",
    show: ({ model }) => !!model.push_notification,
    validate: (v, { model }) =>
      model.push_notification && !v ? "Push title is required." : null,
    attrs: { placeholder: "New article: …" },
  },
];

// ─── Tab 5: Advanced (24 fields + 4 repeaters) ────────────────────────────────

const advancedFields: FieldDescriptor<Article>[] = [
  // ── Location + Map ──
  {
    key: "location",
    type: "map",
    label: "Article Location",
    tab: "Advanced",
    cols: 12,
    group: "Location",
    expandable: true,
    attrs: { defaultLat: 45.4654, defaultLng: 9.1866, zoom: 10 },
  },
  {
    key: "location_name",
    type: "text",
    label: "Place Name",
    tab: "Advanced",
    cols: 6,
    group: "Location",
    attrs: { placeholder: "Lotrek HQ" },
  },
  {
    key: "location_address",
    type: "text",
    label: "Address",
    tab: "Advanced",
    cols: 6,
    group: "Location",
  },
  {
    key: "location_city",
    type: "text",
    label: "City",
    tab: "Advanced",
    cols: 4,
    group: "Location",
  },
  {
    key: "location_country",
    type: "select",
    label: "Country",
    tab: "Advanced",
    cols: 4,
    group: "Location",
    attrs: {
      options: [
        { text: "Italy", value: "IT" },
        { text: "Germany", value: "DE" },
        { text: "France", value: "FR" },
        { text: "Spain", value: "ES" },
        { text: "United Kingdom", value: "GB" },
        { text: "United States", value: "US" },
        { text: "Netherlands", value: "NL" },
        { text: "Portugal", value: "PT" },
        { text: "Switzerland", value: "CH" },
        { text: "Austria", value: "AT" },
        { text: "Belgium", value: "BE" },
        { text: "Sweden", value: "SE" },
        { text: "Norway", value: "NO" },
        { text: "Denmark", value: "DK" },
        { text: "Poland", value: "PL" },
      ],
    },
  },
  {
    key: "location_zoom",
    type: "number",
    label: "Map Zoom",
    tab: "Advanced",
    cols: 4,
    group: "Location",
    attrs: { min: 1, max: 20 },
  },

  // ── Ranking ──
  {
    key: "priority",
    type: "slider",
    label: "Priority (1–10)",
    tab: "Advanced",
    cols: 6,
    group: "Ranking",
    attrs: { min: 1, max: 10, step: 1 },
  },
  {
    key: "boost_score",
    type: "slider",
    label: "Boost Score (0–100)",
    tab: "Advanced",
    cols: 6,
    group: "Ranking",
    attrs: { min: 0, max: 100, step: 5 },
  },
  {
    key: "weight",
    type: "number",
    label: "Weight",
    tab: "Advanced",
    cols: 3,
    group: "Ranking",
    attrs: { min: 0 },
  },
  {
    key: "sort_order",
    type: "number",
    label: "Sort Order",
    tab: "Advanced",
    cols: 3,
    group: "Ranking",
    attrs: { min: 0 },
  },

  // ── Display ──
  {
    key: "template",
    type: "select",
    label: "Page Template",
    tab: "Advanced",
    cols: 6,
    group: "Display",
    attrs: {
      options: [
        { text: "Default", value: "default" },
        { text: "Full Width", value: "full-width" },
        { text: "Landing Page", value: "landing" },
        { text: "Minimal", value: "minimal" },
        { text: "Magazine", value: "magazine" },
      ],
    },
  },
  {
    key: "layout_variant",
    type: "select",
    label: "Layout Variant",
    tab: "Advanced",
    cols: 6,
    group: "Display",
    show: ({ model }) => !!model.template && model.template !== "default",
    attrs: {
      options: [
        { text: "Standard", value: "standard" },
        { text: "Wide", value: "wide" },
        { text: "Compact", value: "compact" },
        { text: "Grid", value: "grid" },
      ],
    },
  },

  // ── Developer ──
  {
    key: "custom_css",
    type: "textarea",
    label: "Custom CSS",
    tab: "Advanced",
    cols: 12,
    group: "Developer",
    debounce: 1000,
    attrs: {
      placeholder: "/* Scoped CSS injected into this page's <head> */",
      rows: 5,
    },
  },
  {
    key: "custom_js",
    type: "textarea",
    label: "Custom JS",
    tab: "Advanced",
    cols: 12,
    group: "Developer",
    debounce: 1000,
    attrs: { placeholder: "// Script injected before </body>", rows: 4 },
  },
  {
    key: "data_attributes",
    type: "textarea",
    label: "Data Attributes (JSON)",
    tab: "Advanced",
    cols: 12,
    group: "Developer",
    validate: (v) => {
      if (!v) return null;
      try {
        JSON.parse(String(v));
        return null;
      } catch {
        return "Must be valid JSON.";
      }
    },
    attrs: { placeholder: '{ "theme": "dark", "layout": "grid" }', rows: 3 },
  },

  // ── A/B Testing ──
  {
    key: "ab_test_enabled",
    type: "switch",
    label: "Enable A/B Test",
    tab: "Advanced",
    cols: 4,
    group: "A/B Testing",
  },
  {
    key: "ab_variant_name",
    type: "text",
    label: "Variant Name",
    tab: "Advanced",
    cols: 4,
    group: "A/B Testing",
    show: ({ model }) => !!model.ab_test_enabled,
    attrs: { placeholder: "variant-b" },
  },
  {
    key: "ab_traffic_split",
    type: "slider",
    label: "Traffic Split (%)",
    tab: "Advanced",
    cols: 4,
    group: "A/B Testing",
    show: ({ model }) => !!model.ab_test_enabled,
    attrs: { min: 1, max: 99, step: 1 },
  },
  {
    key: "ab_goal",
    type: "select",
    label: "Conversion Goal",
    tab: "Advanced",
    cols: 12,
    group: "A/B Testing",
    show: ({ model }) => !!model.ab_test_enabled,
    attrs: {
      options: [
        { text: "Clicks on CTA", value: "clicks" },
        { text: "Scroll depth ≥ 80%", value: "scroll_depth" },
        { text: "Time on page ≥ 3 min", value: "time_on_page" },
        { text: "Conversion / sign-up", value: "conversion" },
      ],
    },
  },

  // ── Monetization ──
  {
    key: "paywall_enabled",
    type: "switch",
    label: "Enable Paywall",
    tab: "Advanced",
    cols: 4,
    group: "Monetization",
  },
  {
    key: "paywall_type",
    type: "select",
    label: "Paywall Type",
    tab: "Advanced",
    cols: 4,
    group: "Monetization",
    show: ({ model }) => !!model.paywall_enabled,
    attrs: {
      options: [
        { text: "Hard (full block)", value: "hard" },
        { text: "Soft (preview + blur)", value: "soft" },
        { text: "Metered (N free/month)", value: "metered" },
      ],
    },
  },
  {
    key: "paywall_preview_chars",
    type: "number",
    label: "Free Preview (chars)",
    tab: "Advanced",
    cols: 4,
    group: "Monetization",
    show: ({ model }) => !!model.paywall_enabled,
    attrs: { min: 100, max: 5000, step: 100 },
  },
  {
    key: "paywall_cta_text",
    type: "text",
    label: "Paywall CTA Text",
    tab: "Advanced",
    cols: 12,
    group: "Monetization",
    show: ({ model }) => !!model.paywall_enabled,
    attrs: { placeholder: "Subscribe to keep reading…" },
  },

  // ── Repeater 6: Contributors (10 fields/item, 10 items pre-filled) ──
  {
    key: "contributors",
    type: "repeater",
    label: "Contributors",
    tab: "Advanced",
    cols: 12,
    fields: [
      { key: "name", type: "text", label: "Name", cols: 6, required: true },
      {
        key: "role",
        type: "select",
        label: "Role",
        cols: 6,
        attrs: {
          options: [
            { text: "Author", value: "author" },
            { text: "Co-Author", value: "co-author" },
            { text: "Editor", value: "editor" },
            { text: "Reviewer", value: "reviewer" },
            { text: "Illustrator", value: "illustrator" },
            { text: "Photographer", value: "photographer" },
            { text: "Translator", value: "translator" },
          ],
        },
      },
      {
        key: "bio",
        type: "textarea",
        label: "Bio",
        cols: 12,
        attrs: { rows: 2 },
      },
      {
        key: "avatar",
        type: "text",
        label: "Avatar URL",
        cols: 12,
        attrs: { placeholder: "https://…" },
      },
      {
        key: "email",
        type: "text",
        label: "Email",
        cols: 6,
        attrs: { placeholder: "name@example.com" },
      },
      {
        key: "twitter",
        type: "text",
        label: "Twitter",
        cols: 6,
        attrs: { placeholder: "@handle" },
      },
      {
        key: "linkedin",
        type: "text",
        label: "LinkedIn",
        cols: 6,
        attrs: { placeholder: "in/username" },
      },
      {
        key: "website",
        type: "text",
        label: "Website",
        cols: 6,
        attrs: { placeholder: "https://…" },
      },
      { key: "institution", type: "text", label: "Institution", cols: 6 },
      { key: "department", type: "text", label: "Department", cols: 6 },
    ],
    attrs: {
      confirmDelete: true,
      allowDuplicate: true,
      compressThreshold: 3,
      miniCard: (item: unknown) => {
        const c = item as Contributor;
        return {
          title: c.name || "Unnamed contributor",
          subtitle: c.role
            ? `${c.role}${c.institution ? ` · ${c.institution}` : ""}`
            : c.institution || "",
          thumbnail: c.avatar || undefined,
          statusColor:
            c.role === "author" || c.role === "co-author"
              ? "success"
              : c.role === "reviewer"
                ? "warning"
                : "neutral",
        };
      },
      previewLabel: (item: unknown) => {
        const c = item as Contributor;
        return c.name ? `${c.name} (${c.role || "—"})` : "Contributor";
      },
    },
  },

  // ── Repeater 7: Footnotes ──
  {
    key: "footnotes",
    type: "repeater",
    label: "Footnotes",
    tab: "Advanced",
    cols: 12,
    fields: [
      {
        key: "number",
        type: "number",
        label: "#",
        cols: 2,
        required: true,
        attrs: { min: 1 },
      },
      {
        key: "content",
        type: "textarea",
        label: "Content",
        cols: 10,
        required: true,
        attrs: { rows: 2 },
      },
      { key: "source", type: "text", label: "Source", cols: 6 },
      {
        key: "url",
        type: "text",
        label: "Source URL",
        cols: 6,
        attrs: { placeholder: "https://…" },
      },
    ],
    attrs: {
      previewLabel: (item: unknown) => {
        const f = item as Footnote;
        return `[${f.number || "?"}] ${f.source || f.content?.substring(0, 40) || "Footnote"}`;
      },
    },
  },

  // ── Repeater 8: Changelog ──
  {
    key: "changelog",
    type: "repeater",
    label: "Changelog",
    tab: "Advanced",
    cols: 12,
    fields: [
      {
        key: "version",
        type: "text",
        label: "Version",
        cols: 3,
        required: true,
        attrs: { placeholder: "2.1.0" },
      },
      { key: "date", type: "date", label: "Date", cols: 3 },
      { key: "author", type: "text", label: "Author", cols: 4 },
      { key: "breaking_change", type: "switch", label: "Breaking", cols: 2 },
      {
        key: "description",
        type: "textarea",
        label: "Description",
        cols: 12,
        required: true,
        attrs: { rows: 2 },
      },
    ],
    attrs: {
      allowDuplicate: false,
      previewLabel: (item: unknown) => {
        const c = item as ChangelogEntry;
        return c.version
          ? `${c.version} — ${c.description?.substring(0, 50) || "…"}`
          : "Entry";
      },
    },
  },

  // ── Repeater 9: Awards ──
  {
    key: "awards",
    type: "repeater",
    label: "Awards & Recognition",
    tab: "Advanced",
    cols: 12,
    fields: [
      {
        key: "name",
        type: "text",
        label: "Award Name",
        cols: 6,
        required: true,
      },
      {
        key: "year",
        type: "number",
        label: "Year",
        cols: 2,
        attrs: { min: 2000, max: 2100 },
      },
      { key: "organization", type: "text", label: "Organization", cols: 4 },
    ],
    attrs: {
      previewLabel: (item: unknown) => {
        const a = item as Award;
        return a.name ? `${a.name} (${a.year || "—"})` : "Award";
      },
    },
  },

  // ── Repeater 10: Quiz — NESTED REPEATER (answers inside each question) ──────
  {
    key: "quiz",
    type: "repeater",
    label: "Quiz / Q&A",
    tab: "Advanced",
    cols: 12,
    group: "Quiz",
    fields: [
      {
        key: "question",
        type: "text",
        label: "Question",
        cols: 12,
        required: true,
        attrs: { placeholder: "What is the main benefit of MapoDetail?" },
      },
      {
        key: "explanation",
        type: "textarea",
        label: "Explanation",
        cols: 12,
        attrs: { rows: 2, placeholder: "Context shown after answering…" },
      },
      // ── nested repeater ───────────────────────────────────────────────────
      {
        key: "answers",
        type: "repeater",
        label: "Answer Options",
        cols: 12,
        fields: [
          {
            key: "text",
            type: "text",
            label: "Answer text",
            cols: 8,
            required: true,
          },
          { key: "is_correct", type: "switch", label: "Correct", cols: 2 },
          {
            key: "feedback",
            type: "text",
            label: "Feedback",
            cols: 12,
            attrs: { placeholder: "Shown after selecting this option…" },
          },
        ],
        attrs: {
          previewLabel: (item: unknown) => {
            const a = item as { text?: string; is_correct?: boolean };
            return `${a.is_correct ? "✓" : "✗"} ${a.text || "—"}`;
          },
        },
      },
    ],
    attrs: {
      confirmDelete: true,
      previewLabel: (item: unknown) => {
        const q = item as { question?: string };
        return q.question?.substring(0, 60) || "Question";
      },
    },
  },

  // ── Repeater 11: Timeline — icon+color miniCard, no thumbnail (template B) ─
  {
    key: "timeline",
    type: "repeater",
    label: "Timeline",
    tab: "Advanced",
    cols: 12,
    group: "Timeline",
    fields: [
      { key: "date", type: "date", label: "Date", cols: 3 },
      {
        key: "title",
        type: "text",
        label: "Event",
        cols: 9,
        required: true,
        attrs: { placeholder: "Milestone title…" },
      },
      {
        key: "event_type",
        type: "select",
        label: "Type",
        cols: 4,
        attrs: {
          options: [
            { text: "Launch", value: "launch" },
            { text: "Update", value: "update" },
            { text: "Fix", value: "fix" },
            { text: "Breaking", value: "breaking" },
            { text: "Deprecation", value: "deprecation" },
          ],
        },
      },
      {
        key: "description",
        type: "textarea",
        label: "Details",
        cols: 8,
        attrs: { rows: 2 },
      },
    ],
    attrs: {
      // miniCard with icon/color but NO thumbnail — different from gallery
      miniCard: (item: unknown) => {
        const t = item as {
          title?: string;
          event_type?: string;
          date?: string;
        };
        const colorMap: Record<
          string,
          "success" | "info" | "warning" | "error" | "neutral"
        > = {
          launch: "success",
          update: "info",
          fix: "warning",
          breaking: "error",
          deprecation: "neutral",
        };
        return {
          title: t.title || "Event",
          subtitle: t.date || "",
          statusColor: colorMap[t.event_type ?? ""] ?? "neutral",
        };
      },
      previewLabel: (item: unknown) => {
        const t = item as { title?: string };
        return t.title || "Event";
      },
      allowDuplicate: false,
      confirmDelete: true,
    },
  },

  // ── Repeater 12: External Links — minimal template (only previewLabel) ─────
  {
    key: "external_links",
    type: "repeater",
    label: "External Links",
    tab: "Advanced",
    cols: 12,
    group: "External Links",
    fields: [
      {
        key: "label",
        type: "text",
        label: "Label",
        cols: 4,
        required: true,
        attrs: { placeholder: "Docs, Demo, Source…" },
      },
      {
        key: "url",
        type: "text",
        label: "URL",
        cols: 6,
        required: true,
        attrs: { placeholder: "https://…" },
      },
      { key: "nofollow", type: "switch", label: "nofollow", cols: 2 },
      {
        key: "icon",
        type: "text",
        label: "Icon (lucide name)",
        cols: 6,
        attrs: { placeholder: "i-lucide-external-link" },
      },
    ],
    attrs: {
      // Minimal template — no miniCard, just a simple string label
      previewLabel: (item: unknown) => {
        const l = item as { label?: string; url?: string };
        return l.label ? `${l.label} → ${l.url || "…"}` : l.url || "Link";
      },
      showPositionField: true,
    },
  },
];

// ─── All body fields ───────────────────────────────────────────────────────────

const fields: FieldDescriptor<Article>[] = [
  ...contentFields,
  ...mediaFields,
  ...seoFields,
  ...publishingFields,
  ...advancedFields,
];

// ─── Sidebar fields — flattenFieldGroups demo (C3) ────────────────────────────
//
//   Flat items (status, category) sit at the top level with no group.
//   "Assignment" and "Quality" are FieldGroupDescriptor objects whose `group`
//   is automatically propagated to every child — no need to repeat `group` on
//   each field descriptor.

const sidebarFields = flattenFieldGroups<Article>([
  // ── flat (no group) ──
  {
    key: "status",
    type: "select",
    label: "Status",
    required: true,
    validate: (v) => (!v ? "Status is required." : null),
    attrs: {
      options: [
        { text: "Draft", value: "draft" },
        { text: "In Review", value: "review" },
        { text: "Ready to Publish", value: "ready" },
        { text: "Published", value: "published" },
        { text: "Archived", value: "archived" },
      ],
    },
  },
  {
    key: "category",
    type: "fks",
    label: "Category",
    attrs: {
      endpoint: "/api/categories",
      itemText: "name",
      itemValue: "id",
      returnObject: false,
    },
  },

  // ── group: "Assignment" (FieldGroupDescriptor — C3) ──
  {
    group: "Assignment",
    fields: [
      {
        key: "review_assigned_to",
        type: "fks",
        label: "Assigned To",
        attrs: {
          endpoint: "/api/profiles",
          itemText: "name",
          itemValue: "id",
          returnObject: false,
        },
      },
      {
        key: "internal_notes",
        type: "textarea",
        label: "Internal Notes",
        attrs: { placeholder: "Notes visible only to editors…", rows: 3 },
      },
    ],
  },

  // ── group: "Quality" (FieldGroupDescriptor — C3) ──
  {
    group: "Quality",
    fields: [
      {
        key: "editorial_score",
        type: "slider",
        label: "Editorial Score",
        attrs: { min: 1, max: 10, step: 1 },
      },
      {
        key: "content_warning",
        type: "switch",
        label: "Content Warning",
      },
      {
        key: "content_warning_text",
        type: "text",
        label: "Warning Text",
        show: ({ model }: { model: Article }) => !!model.content_warning,
        validate: (v: unknown, { model }: { model: Article }) =>
          model.content_warning && !v ? "Warning text is required." : null,
        attrs: { placeholder: "This article contains…" },
      },
    ],
  },
]);
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <!-- Readonly demo toggle -->
    <div class="flex items-center justify-end mb-3 gap-2">
      <span class="text-xs text-muted">Read-only demo</span>
      <USwitch v-model="isReadonly" size="sm" color="warning" />
    </div>

    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      :fields="fields"
      :sidebar-fields="sidebarFields"
      :languages="LANGUAGES"
      :sidebar-cols="3"
      :use-patch="true"
      :readonly="isReadonly"
      :draft="true"
      @saved="snack.show('Article saved!', 'success')"
      @deleted="navigateTo('/form')"
    >
      <!-- ─── Title: icon + breadcrumb + status badge ────────────────────────── -->
      <template #title="{ model, isNew }">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon
            name="i-lucide-newspaper"
            class="text-primary size-5 shrink-0"
          />
          <span v-if="isNew" class="text-highlighted font-semibold"
            >New Article</span
          >
          <span v-else class="text-highlighted font-semibold truncate max-w-xs">
            {{ model.title || "Untitled Article" }}
          </span>
          <UBadge
            v-if="model.status"
            :color="
              model.status === 'published'
                ? 'success'
                : model.status === 'archived'
                  ? 'neutral'
                  : model.status === 'review'
                    ? 'info'
                    : model.status === 'ready'
                      ? 'primary'
                      : 'warning'
            "
            variant="subtle"
            size="xs"
            class="ml-1 shrink-0"
          >
            {{ model.status }}
          </UBadge>
          <UBadge
            v-if="model.content_type"
            variant="outline"
            size="xs"
            color="neutral"
            class="shrink-0"
          >
            {{ model.content_type }}
          </UBadge>
        </div>
      </template>

      <!-- ─── side-top: article metadata card ──────────────────────────────── -->
      <template #side-top="{ model, isNew, isDirty }">
        <UCard v-if="!isNew" class="mb-3">
          <div class="space-y-2 text-xs text-muted">
            <div class="flex items-center justify-between">
              <span>ID</span>
              <span class="font-mono text-highlighted">#{{ model.id }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Created</span>
              <span>{{
                model.created_at
                  ? new Date(model.created_at as string).toLocaleDateString()
                  : "—"
              }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Updated</span>
              <span>{{
                model.updated_at
                  ? new Date(model.updated_at as string).toLocaleDateString()
                  : "—"
              }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Words</span>
              <span>{{ model.word_count || "—" }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Read</span>
              <span>{{
                model.reading_time ? `${model.reading_time} min` : "—"
              }}</span>
            </div>
            <div
              v-if="model.series_part && model.series_total"
              class="flex items-center justify-between"
            >
              <span>Series</span>
              <span>{{ model.series_part }} / {{ model.series_total }}</span>
            </div>
            <div
              v-if="isDirty"
              class="flex items-center gap-1 text-warning pt-1 border-t border-default"
            >
              <UIcon name="i-lucide-circle-dot" class="size-3" />
              <span>Unsaved changes</span>
            </div>
          </div>
        </UCard>
      </template>

      <!-- ─── field.title.before — C1: inject content above the title widget ── -->
      <template #[slotFieldTitleBefore]>
        <div class="flex items-center gap-1.5 text-xs text-muted mb-1">
          <UIcon name="i-lucide-type" class="size-3 shrink-0" />
          <span>Headline — keep under 70 characters for optimal SEO.</span>
        </div>
      </template>

      <!-- ─── field.excerpt.after — C1: char counter below the excerpt widget ─ -->
      <template #[slotFieldExcerptAfter]="{ model }">
        <p
          class="text-xs text-right mt-0.5"
          :class="
            (model.excerpt?.length ?? 0) > 900 ? 'text-warning' : 'text-muted'
          "
        >
          {{ model.excerpt?.length ?? 0 }} / 1000
        </p>
      </template>

      <!-- ─── group.Taxonomy.before — C1: alert above the Taxonomy group card ─ -->
      <template #[slotGroupTaxonomyBefore]>
        <UAlert
          icon="i-lucide-info"
          color="info"
          variant="soft"
          title="Taxonomy tip"
          description="Selecting a Category unlocks the Subcategory field. Tags help readers discover related content."
          class="mb-2"
        />
      </template>

      <!-- ─── group.Assignment.after — C1: note below the Assignment group card -->
      <template #[slotGroupAssignmentAfter]>
        <p class="text-xs text-muted mt-1 flex items-center gap-1">
          <UIcon name="i-lucide-lock" class="size-3 shrink-0" />
          Internal notes are never visible to readers.
        </p>
      </template>

      <!-- ─── field.slug: URL preview + copy ───────────────────────────────── -->
      <template #[slotSlug]="{ field }">
        <div class="space-y-1">
          <label class="text-sm font-medium text-highlighted">
            {{ field.label }}
            <span class="text-error ml-0.5">*</span>
          </label>
          <div class="flex gap-2 items-center">
            <span
              class="text-xs text-muted font-mono bg-elevated px-2 py-1 rounded shrink-0"
            >
              /articles/
            </span>
            <UInput
              :model-value="
                (field as unknown as { _formValue: string })._formValue
              "
              class="flex-1 font-mono text-sm"
              placeholder="my-article-slug"
            />
          </div>
          <p class="text-xs text-muted">
            URL:
            <code class="text-highlighted"
              >/articles/{{
                (field as unknown as { _formValue: string })._formValue || "…"
              }}</code
            >
          </p>
        </div>
      </template>

      <!-- ─── body-bottom: rich stats bar ──────────────────────────────────── -->
      <template #body-bottom="{ model }">
        <div
          class="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted border-t border-default pt-4 mt-2"
        >
          <div v-if="model.reading_time" class="flex items-center gap-1">
            <UIcon name="i-lucide-clock" class="size-3" />
            <span>{{ model.reading_time }} min read</span>
          </div>
          <div v-if="model.word_count" class="flex items-center gap-1">
            <UIcon name="i-lucide-file-text" class="size-3" />
            <span>{{ model.word_count }} words</span>
          </div>
          <div
            v-if="(model.tags as number[])?.length"
            class="flex items-center gap-1"
          >
            <UIcon name="i-lucide-tag" class="size-3" />
            <span
              >{{ (model.tags as number[]).length }} tag{{
                (model.tags as number[]).length !== 1 ? "s" : ""
              }}</span
            >
          </div>
          <div
            v-if="(model.gallery as unknown[])?.length"
            class="flex items-center gap-1"
          >
            <UIcon name="i-lucide-image" class="size-3" />
            <span
              >{{ (model.gallery as unknown[]).length }} image{{
                (model.gallery as unknown[]).length !== 1 ? "s" : ""
              }}</span
            >
          </div>
          <div
            v-if="(model.contributors as unknown[])?.length"
            class="flex items-center gap-1"
          >
            <UIcon name="i-lucide-users" class="size-3" />
            <span
              >{{ (model.contributors as unknown[]).length }} contributor{{
                (model.contributors as unknown[]).length !== 1 ? "s" : ""
              }}</span
            >
          </div>
          <div
            v-if="(model.attachments as unknown[])?.length"
            class="flex items-center gap-1"
          >
            <UIcon name="i-lucide-paperclip" class="size-3" />
            <span
              >{{ (model.attachments as unknown[]).length }} attachment{{
                (model.attachments as unknown[]).length !== 1 ? "s" : ""
              }}</span
            >
          </div>
          <div v-if="model.location" class="flex items-center gap-1">
            <UIcon name="i-lucide-map-pin" class="size-3" />
            <span>{{ model.location_name || "Location set" }}</span>
          </div>
          <div v-if="model.cover_color" class="flex items-center gap-1">
            <span
              class="size-3 rounded-full inline-block border border-default"
              :style="{ background: model.cover_color as string }"
            />
            <span>{{ model.cover_color }}</span>
          </div>
          <div
            v-if="model.paywall_enabled"
            class="flex items-center gap-1 text-warning"
          >
            <UIcon name="i-lucide-lock" class="size-3" />
            <span>Paywall: {{ model.paywall_type || "enabled" }}</span>
          </div>
          <div v-if="model.sponsored" class="flex items-center gap-1 text-info">
            <UIcon name="i-lucide-badge-dollar-sign" class="size-3" />
            <span
              >Sponsored{{
                model.sponsor_label ? ` · ${model.sponsor_label}` : ""
              }}</span
            >
          </div>
          <div
            v-if="model.ab_test_enabled"
            class="flex items-center gap-1 text-primary"
          >
            <UIcon name="i-lucide-split" class="size-3" />
            <span
              >A/B: {{ model.ab_variant_name || "active" }} ({{
                model.ab_traffic_split || 50
              }}%)</span
            >
          </div>
        </div>
      </template>

      <!-- ─── side-bottom: quick actions ───────────────────────────────────── -->
      <template #side-bottom="{ model, isNew }">
        <div v-if="!isNew" class="mt-3 space-y-1">
          <UButton
            v-if="model.status === 'published'"
            variant="ghost"
            color="neutral"
            size="xs"
            leading-icon="i-lucide-external-link"
            class="w-full justify-start text-xs"
            :to="`/articles/${model.slug}`"
            target="_blank"
          >
            View live article
          </UButton>
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            leading-icon="i-lucide-copy"
            class="w-full justify-start text-xs"
          >
            Duplicate article
          </UButton>
          <UButton
            v-if="model.featured"
            variant="ghost"
            color="warning"
            size="xs"
            leading-icon="i-lucide-star"
            class="w-full justify-start text-xs"
          >
            Featured ★
          </UButton>
        </div>
      </template>
    </MapoDetail>
  </div>
</template>
