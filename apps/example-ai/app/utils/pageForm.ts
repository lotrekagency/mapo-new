// The form of a page of blocks (app/pages/pages/[id].vue), for Magic Fill on
// a form with lists: `blocks` is a repeater with six templates, two of them
// with a list inside (`faq`, `stats`). The backend keeps the blocks as a
// JSON field and says nothing of them, so the AI reads them from these
// templates. No quote can prove which template an item follows, so a block
// is never verified: Magic Fill's preview lists the blocks one by one,
// unticked, and adds the chosen ones after the page's own.
import type { AnyFieldDescriptor } from "mapomodule/types";

/** The blocks of a page: six templates, two with items inside. */
const BLOCK_TEMPLATES = {
  hero: {
    label: "Hero",
    description: "A headline with a call to action.",
    icon: "i-lucide-panels-top-left",
    fields: [
      { key: "title", type: "text", label: "Title", required: true },
      { key: "subtitle", type: "textarea", label: "Subtitle" },
      { key: "cta_label", type: "text", label: "Button label", cols: 6 },
      { key: "cta_url", type: "url", label: "Button link", cols: 6 },
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
} satisfies Record<
  string,
  {
    label: string;
    description: string;
    icon: string;
    fields: AnyFieldDescriptor[];
  }
>;

export const PAGE_FIELDS: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "summary", type: "textarea", label: "Summary" },
  {
    key: "blocks",
    type: "repeater",
    label: "Blocks",
    attrs: { picker: "modal", templates: BLOCK_TEMPLATES },
  },
];

export const PAGE_SIDEBAR_FIELDS: AnyFieldDescriptor[] = [
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
];
