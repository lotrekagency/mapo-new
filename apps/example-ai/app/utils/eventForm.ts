// The form of an event (app/pages/events/[id].vue), the largest of the app:
// what Magic Fill does on a form with tabs, groups that start closed
// (`mapo.form.groups.expanded: false` in nuxt.config.ts), translations,
// a nested object, relations inside the items of a list, and fields the AI
// never gets. "Next to check", in Magic Fill's banner, opens the tab, the
// group and the subtab of each value that waits. The import page
// (app/pages/events/import.vue) extracts events with a part of it.
import type { AnyFieldDescriptor } from "mapomodule/types";

/** The detail's languages: the summary, the description and the booking link are written per language. */
export const EVENT_LANGUAGES = ["en", "it"];

/** A title as a slug: lowercase words joined by hyphens. */
function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const EVENT_FIELDS: AnyFieldDescriptor[] = [
  // ── Content ──────────────────────────────────────────────────────────────
  {
    key: "title",
    type: "text",
    label: "Title",
    required: true,
    tab: "Content",
    // On a new event the slug follows the title: when Magic Fill writes
    // the title, it writes it as the form does, so this runs too.
    onChange: ({ model, val }) => {
      const isNew = model.id === undefined || model.id === null;
      if (isNew && typeof val === "string") model.slug = slugOf(val);
    },
  },
  {
    key: "slug",
    type: "text",
    label: "Slug",
    tab: "Content",
    // The title's own: the AI is never asked for it ("What I send to the
    // AI" lists it among the fields left out).
    ai: { exclude: true },
  },
  {
    key: "summary",
    type: "textarea",
    label: "Summary",
    tab: "Content",
    translatable: true,
    // What the AI reads beside the label: the field's description in the
    // schema of the answer, which the model gets with the prompt.
    ai: {
      hint: "One sentence that makes people want to come, in the source's own words.",
    },
  },
  {
    key: "description",
    type: "editor",
    label: "Description",
    tab: "Content",
    translatable: true,
  },
  {
    key: "booking_url",
    type: "url",
    label: "Booking link",
    tab: "Content",
    // A link per language, the same in every language until one gets its
    // own: written in one language, it goes into all of them.
    translatable: true,
    synci18n: true,
  },

  // ── When and where ───────────────────────────────────────────────────────
  {
    key: "starts_on",
    type: "date",
    label: "Date",
    tab: "When and where",
    cols: 4,
  },
  {
    key: "starts_at",
    type: "time",
    label: "Starts at",
    tab: "When and where",
    cols: 4,
  },
  {
    key: "ends_at",
    type: "time",
    label: "Ends at",
    tab: "When and where",
    cols: 4,
  },
  // Six venues: Magic Fill lists them for the AI, which picks one by its
  // id, and a venue the source names goes in by itself.
  {
    key: "venue",
    type: "fks",
    label: "Venue",
    tab: "When and where",
    attrs: {
      endpoint: "/api/venues",
      itemText: "name",
      itemValue: "id",
      returnObject: false,
    },
  },
  { key: "online", type: "switch", label: "Online", tab: "When and where" },
  // A group that starts closed, shown only for an event online: an answer
  // that sets "Online" reveals it, and "Next to check" opens it.
  {
    key: "stream_url",
    type: "url",
    label: "Stream link",
    tab: "When and where",
    group: "Streaming",
    show: ({ model }) => model.online === true,
  },
  // A secret by its name: Magic Fill never asks the AI for it, even when
  // the source writes it.
  {
    key: "stream_password",
    type: "text",
    label: "Stream password",
    tab: "When and where",
    group: "Streaming",
    show: ({ model }) => model.online === true,
  },

  // ── People ───────────────────────────────────────────────────────────────
  // A list whose items point to a person: forty, too many to list, so the
  // AI writes each speaker's name and Magic Fill searches it inside the
  // item. The speakers go after the event's own, never one it has already.
  {
    key: "speakers",
    type: "repeater",
    label: "Speakers",
    tab: "People",
    fields: [
      {
        key: "person",
        type: "fks",
        label: "Person",
        cols: 6,
        attrs: {
          endpoint: "/api/people",
          itemText: "name",
          itemValue: "id",
          returnObject: false,
        },
      },
      { key: "role", type: "text", label: "Role", cols: 6 },
    ],
  },
  // A backoffice user, by email: few enough to list for the AI, but an
  // email must not reach the provider. `list: false` keeps the list away:
  // the AI writes the email it reads, which Magic Fill searches.
  {
    key: "contact",
    type: "fks",
    label: "Contact",
    tab: "People",
    attrs: {
      endpoint: "/api/users/",
      itemText: "email",
      itemValue: "id",
      returnObject: false,
    },
    ai: { list: false },
  },

  // ── SEO ──────────────────────────────────────────────────────────────────
  // A nested object, `seo`, as dotted fields, in a group with two subtabs.
  {
    key: "seo.title",
    type: "text",
    label: "Title for search engines",
    tab: "SEO",
    group: "Search and social",
    subtab: "Search",
  },
  {
    key: "seo.description",
    type: "textarea",
    label: "Description for search engines",
    tab: "SEO",
    group: "Search and social",
    subtab: "Search",
  },
  {
    key: "seo.social_title",
    type: "text",
    label: "Title for social networks",
    tab: "SEO",
    group: "Search and social",
    subtab: "Social",
  },
];

export const EVENT_SIDEBAR_FIELDS: AnyFieldDescriptor[] = [
  {
    key: "status",
    type: "select",
    label: "Status",
    attrs: {
      items: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
    },
  },
  {
    key: "price",
    type: "number",
    label: "Price (€)",
    attrs: { min: 0, step: 0.01 },
  },
  {
    key: "capacity",
    type: "number",
    label: "Capacity",
    attrs: { min: 1, max: 5000 },
  },
  // The editors' own: nothing of a source belongs here.
  {
    key: "internal_notes",
    type: "textarea",
    label: "Internal notes",
    ai: { exclude: true },
  },
  // Read-only for the backend too: the AI is never asked for it.
  { key: "views", type: "number", label: "Views", readonly: true },
];

/**
 * The fields the import page asks for each event a source describes: what
 * a programme usually says. The others stay for the event's own page.
 */
export const EVENT_IMPORT_FIELDS: AnyFieldDescriptor[] = [
  ...EVENT_FIELDS,
  ...EVENT_SIDEBAR_FIELDS,
].filter((field) =>
  [
    "title",
    "summary",
    "starts_on",
    "starts_at",
    "ends_at",
    "venue",
    "online",
    "price",
  ].includes(String(field.key)),
);
