// The block page of the AI lab, /ai/ollama/blocks, with a local model: a
// landing page of the city magazine with every field type of Mapo, the app's
// two custom ones (`stars` and `country`, plugins/form-fields.ts) and
// repeaters of three kinds:
// - `blocks`, nine templates, two with a repeater inside (`faq`, `stats`)
//   and one with blocks inside (`columns`); the backend keeps them as JSON,
//   so only these templates describe them to the AI;
// - `reviews` and `locations`, described by the backend too (the OPTIONS of
//   /api/pages/), which gives the custom fields inside them their type;
//   `locations` has a repeater inside, `opening_hours`.
// What the AI leaves alone, and why, shows in the panel: media and files
// (`media`), the relations it only names (`category`, `tags`), the secret
// (`webhook_secret`), the read-only date (`created_at`).
import type { AnyFieldDescriptor } from "mapomodule/types";

/** The detail's languages: Title, Summary and Intro are translatable. */
export const AI_PAGE_LANGUAGES = ["en", "it"];

const DAYS = [
  { label: "Monday", value: "mon" },
  { label: "Tuesday", value: "tue" },
  { label: "Wednesday", value: "wed" },
  { label: "Thursday", value: "thu" },
  { label: "Friday", value: "fri" },
  { label: "Saturday", value: "sat" },
  { label: "Sunday", value: "sun" },
];

/** What an item shows when it is closed: the first text it has. */
function previewOf(item: unknown): string {
  const values = typeof item === "object" && item !== null ? item : {};
  const keys = ["title", "heading", "name", "author", "question", "label"];
  for (const key of keys) {
    const value = (values as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Untitled";
}

/** The blocks of a page: nine templates, three of them with items inside. */
const BLOCK_TEMPLATES = {
  hero: {
    label: "Hero",
    description: "A headline with an image and a call to action.",
    icon: "i-lucide-panels-top-left",
    fields: [
      { key: "title", type: "text", label: "Title", required: true },
      { key: "subtitle", type: "textarea", label: "Subtitle" },
      { key: "cta_label", type: "text", label: "Button label", cols: 6 },
      { key: "cta_url", type: "url", label: "Button link", cols: 6 },
      { key: "background", type: "color", label: "Background", cols: 6 },
      { key: "image", type: "media", label: "Image", cols: 6 },
    ],
  },
  text: {
    label: "Text",
    description: "A heading and a rich text.",
    icon: "i-lucide-text",
    fields: [
      { key: "heading", type: "text", label: "Heading" },
      { key: "body", type: "editor", label: "Body" },
    ],
  },
  quote: {
    label: "Quote",
    description: "Words of someone, with their name.",
    icon: "i-lucide-quote",
    fields: [
      { key: "text", type: "textarea", label: "Quote" },
      { key: "author", type: "text", label: "Author", cols: 6 },
      { key: "role", type: "text", label: "Role", cols: 6 },
    ],
  },
  faq: {
    label: "FAQ",
    description: "Questions and their answers.",
    icon: "i-lucide-circle-help",
    fields: [
      { key: "heading", type: "text", label: "Heading" },
      {
        key: "questions",
        type: "repeater",
        label: "Questions",
        fields: [
          { key: "question", type: "text", label: "Question" },
          { key: "answer", type: "textarea", label: "Answer" },
        ],
        attrs: { previewLabel: previewOf },
      },
    ],
  },
  stats: {
    label: "Numbers",
    description: "A few figures, each with its label.",
    icon: "i-lucide-chart-column",
    fields: [
      { key: "heading", type: "text", label: "Heading" },
      {
        key: "items",
        type: "repeater",
        label: "Figures",
        fields: [
          { key: "value", type: "number", label: "Value", cols: 4 },
          { key: "unit", type: "text", label: "Unit", cols: 3 },
          { key: "label", type: "text", label: "Label", cols: 5 },
        ],
        attrs: { previewLabel: previewOf, maxItems: 6 },
      },
    ],
  },
  event: {
    label: "Event",
    description: "A date, its times and where to book.",
    icon: "i-lucide-calendar",
    fields: [
      { key: "name", type: "text", label: "Name" },
      { key: "date", type: "date", label: "Date", cols: 4 },
      { key: "starts_at", type: "time", label: "Starts at", cols: 4 },
      { key: "ends_at", type: "time", label: "Ends at", cols: 4 },
      { key: "online", type: "switch", label: "Online", cols: 4 },
      { key: "booking_url", type: "url", label: "Booking link", cols: 8 },
    ],
  },
  columns: {
    label: "Columns",
    description: "Blocks side by side: cards and images.",
    icon: "i-lucide-columns-3",
    fields: [
      {
        key: "columns",
        type: "repeater",
        label: "Columns",
        attrs: {
          maxItems: 4,
          previewLabel: previewOf,
          templates: {
            card: {
              label: "Card",
              icon: "i-lucide-square",
              fields: [
                { key: "title", type: "text", label: "Title" },
                { key: "text", type: "textarea", label: "Text" },
                { key: "link", type: "url", label: "Link" },
              ],
            },
            image: {
              label: "Image",
              icon: "i-lucide-image",
              fields: [
                { key: "image", type: "media", label: "Image" },
                { key: "caption", type: "text", label: "Caption" },
              ],
            },
          },
        },
      },
    ],
  },
  gallery: {
    label: "Gallery",
    description: "Images in a grid.",
    icon: "i-lucide-images",
    fields: [
      { key: "title", type: "text", label: "Title" },
      { key: "images", type: "media-m2m", label: "Images" },
    ],
  },
  contact: {
    label: "Contact",
    description: "How to reach the people behind the page.",
    icon: "i-lucide-mail",
    fields: [
      { key: "heading", type: "text", label: "Heading" },
      { key: "email", type: "email", label: "Email", cols: 6 },
      { key: "phone", type: "text", label: "Phone", cols: 6 },
      { key: "newsletter", type: "boolean", label: "Newsletter sign-up" },
    ],
  },
} satisfies Record<
  string,
  {
    label: string;
    description?: string;
    icon: string;
    fields: AnyFieldDescriptor[];
  }
>;

export const AI_PAGE_FIELDS: AnyFieldDescriptor[] = [
  // ── Content ────────────────────────────────────────────────────────────────
  {
    key: "title",
    type: "text",
    label: "Title",
    required: true,
    translatable: true,
    tab: "Content",
    cols: 8,
  },
  { key: "slug", type: "text", label: "Slug", tab: "Content", cols: 4 },
  {
    key: "summary",
    type: "textarea",
    label: "Summary",
    translatable: true,
    tab: "Content",
  },
  {
    key: "intro",
    type: "editor",
    label: "Intro",
    translatable: true,
    tab: "Content",
  },

  // ── Blocks: the backend keeps them as JSON ─────────────────────────────────
  {
    key: "blocks",
    type: "repeater",
    label: "Blocks",
    tab: "Blocks",
    attrs: {
      picker: "modal",
      templates: BLOCK_TEMPLATES,
      previewLabel: previewOf,
      allowDuplicate: true,
    },
  },

  // ── Reviews and sites: described by the backend too ────────────────────────
  {
    key: "reviews",
    type: "repeater",
    label: "Reviews",
    tab: "Reviews and sites",
    fields: [
      { key: "author", type: "text", label: "Author", cols: 6 },
      { key: "date", type: "date", label: "Date", cols: 6 },
      { key: "quote", type: "textarea", label: "Quote" },
      { key: "stars", type: "stars", label: "Stars" },
    ],
    attrs: { previewLabel: previewOf },
  },
  {
    key: "locations",
    type: "repeater",
    label: "Sites",
    tab: "Reviews and sites",
    fields: [
      { key: "name", type: "text", label: "Name", cols: 6 },
      { key: "country", type: "country", label: "Country", cols: 6 },
      { key: "address", type: "textarea", label: "Address" },
      { key: "phone", type: "text", label: "Phone", cols: 6 },
      { key: "email", type: "email", label: "Email", cols: 6 },
      {
        key: "opening_hours",
        type: "repeater",
        label: "Opening hours",
        fields: [
          {
            key: "day",
            type: "select",
            label: "Day",
            cols: 3,
            attrs: { items: DAYS },
          },
          { key: "opens", type: "time", label: "Opens", cols: 3 },
          { key: "closes", type: "time", label: "Closes", cols: 3 },
          { key: "closed", type: "switch", label: "Closed", cols: 3 },
        ],
        attrs: {
          previewLabel: (item: unknown) => {
            const day = (item as { day?: string }).day;
            return DAYS.find((one) => one.value === day)?.label ?? "A day";
          },
        },
      },
    ],
    attrs: { previewLabel: previewOf },
  },

  // ── Media: the AI leaves them alone ────────────────────────────────────────
  { key: "cover", type: "media", label: "Cover", tab: "Media" },
  { key: "gallery", type: "media-m2m", label: "Gallery", tab: "Media" },
  { key: "video", type: "enhanced-media", label: "Video", tab: "Media" },
  {
    key: "brochure",
    type: "file",
    label: "Brochure",
    tab: "Media",
    attrs: { accept: "application/pdf" },
  },

  // ── Place and SEO ──────────────────────────────────────────────────────────
  { key: "position", type: "map", label: "Position", tab: "Place and SEO" },
  { key: "seo", type: "seo", label: "SEO", tab: "Place and SEO" },
];

export const AI_PAGE_SIDEBAR_FIELDS: AnyFieldDescriptor[] = [
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "In review", value: "review" },
        { label: "Published", value: "published" },
      ],
    },
  },
  { key: "published_at", type: "datetime", label: "Published at" },
  // Shown only for a published page: while it is hidden, a value the AI
  // gives waits for the operator.
  {
    key: "show_until",
    type: "date",
    label: "Show until",
    show: ({ model }) => model.status === "published",
  },
  { key: "show_in_menu", type: "switch", label: "Show in the menu" },
  { key: "featured", type: "boolean", label: "Featured" },
  {
    key: "priority",
    type: "slider",
    label: "Priority",
    attrs: { min: 0, max: 10, step: 1 },
  },
  { key: "accent_color", type: "color", label: "Accent color" },
  { key: "contact_email", type: "email", label: "Contact email" },
  { key: "website", type: "url", label: "Website" },
  { key: "country", type: "country", label: "Country" },
  {
    key: "audiences",
    type: "select",
    label: "Audiences",
    attrs: {
      multiple: true,
      items: [
        { label: "Families", value: "families" },
        { label: "Students", value: "students" },
        { label: "Tourists", value: "tourists" },
        { label: "Residents", value: "residents" },
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
  {
    key: "tags",
    type: "m2m",
    label: "Tags",
    attrs: {
      endpoint: "/api/tags",
      itemText: "name",
      itemValue: "id",
      returnObject: false,
    },
  },
  // A secret: kept out of drafts, and out of the AI's reach.
  {
    key: "webhook_secret",
    type: "text",
    label: "Webhook secret",
    noDraft: true,
    passthrough: { type: "password" },
  },
  {
    key: "created_at",
    type: "datetime",
    label: "Created at",
    readonly: true,
  },
];
