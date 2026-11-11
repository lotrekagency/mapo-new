/**
 * The forms of the evaluation: those of the reference app, so a case reads
 * as an operator's work in `apps/example-e2e`. The article is the one of the
 * Magic Fill pages (`app/utils/aiArticleForm.ts`), field by field; the page
 * is a part of the AI lab's page of blocks (`app/utils/aiPageForm.ts`): its
 * texts, five of its block templates and its reviews, with `stars` as a
 * number, since the app's own field type needs the app's registry. Keep
 * them in step with those files.
 */
import type { AnyFieldDescriptor } from "@mapomodule/form/types";

/** A form of the evaluation, as a detail page describes its record. */
export interface EvalForm {
  /** What the record is, for the AI: `entity.label`. */
  label: string;
  /** The body's fields, then the sidebar's. */
  fields: AnyFieldDescriptor[];
  /** The languages of the record: its translatable values go in one. */
  languages: string[];
}

const ARTICLE: EvalForm = {
  label: "Article",
  languages: ["en", "it"],
  fields: [
    { key: "title", type: "text", label: "Title", required: true },
    { key: "slug", type: "text", label: "Slug" },
    { key: "subtitle", type: "text", label: "Subtitle", translatable: true },
    {
      key: "excerpt",
      type: "textarea",
      label: "Excerpt",
      ai: { hint: "One or two sentences, in the source's own words." },
    },
    { key: "body", type: "editor", label: "Body", translatable: true },
    {
      key: "status",
      type: "select",
      label: "Status",
      attrs: {
        items: [
          { label: "Draft", value: "draft" },
          { label: "In review", value: "review" },
          { label: "Ready", value: "ready" },
          { label: "Published", value: "published" },
        ],
      },
    },
    { key: "featured", type: "switch", label: "Featured" },
    { key: "reading_time", type: "number", label: "Reading time" },
    { key: "published_at", type: "datetime", label: "Published at" },
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
      key: "author",
      type: "fks",
      label: "Author",
      attrs: { endpoint: "/api/authors", itemText: "name", itemValue: "id" },
    },
    {
      key: "reviewer",
      type: "fks",
      label: "Reviewer",
      attrs: {
        endpoint: "/api/reviewers",
        itemText: "email",
        itemValue: "id",
        returnObject: false,
      },
      ai: { list: false },
    },
  ],
};

const BLOCK_TEMPLATES = {
  hero: {
    label: "Hero",
    description: "A headline with an image and a call to action.",
    fields: [
      { key: "title", type: "text", label: "Title", required: true },
      { key: "subtitle", type: "textarea", label: "Subtitle" },
      { key: "cta_label", type: "text", label: "Button label" },
      { key: "cta_url", type: "url", label: "Button link" },
    ],
  },
  text: {
    label: "Text",
    description: "A heading and a rich text.",
    fields: [
      { key: "heading", type: "text", label: "Heading" },
      { key: "body", type: "editor", label: "Body" },
    ],
  },
  quote: {
    label: "Quote",
    description: "Words of someone, with their name.",
    fields: [
      { key: "text", type: "textarea", label: "Quote" },
      { key: "author", type: "text", label: "Author" },
      { key: "role", type: "text", label: "Role" },
    ],
  },
  event: {
    label: "Event",
    description: "A date, its times and where to book.",
    fields: [
      { key: "name", type: "text", label: "Name" },
      { key: "date", type: "date", label: "Date" },
      { key: "starts_at", type: "time", label: "Starts at" },
      { key: "ends_at", type: "time", label: "Ends at" },
      { key: "online", type: "switch", label: "Online" },
      { key: "booking_url", type: "url", label: "Booking link" },
    ],
  },
  credits: {
    label: "Credits",
    description:
      "Who made the page: an author of the magazine, and their part.",
    fields: [
      {
        key: "author",
        type: "fks",
        label: "Author",
        attrs: { endpoint: "/api/authors", itemText: "name", itemValue: "id" },
      },
      { key: "role", type: "text", label: "Role" },
    ],
  },
} satisfies Record<
  string,
  { label: string; description: string; fields: AnyFieldDescriptor[] }
>;

const PAGE: EvalForm = {
  label: "Page",
  languages: ["en", "it"],
  fields: [
    {
      key: "title",
      type: "text",
      label: "Title",
      required: true,
      translatable: true,
    },
    { key: "slug", type: "text", label: "Slug" },
    { key: "summary", type: "textarea", label: "Summary", translatable: true },
    {
      key: "blocks",
      type: "repeater",
      label: "Blocks",
      attrs: { templates: BLOCK_TEMPLATES },
    },
    {
      key: "reviews",
      type: "repeater",
      label: "Reviews",
      fields: [
        { key: "author", type: "text", label: "Author" },
        { key: "date", type: "date", label: "Date" },
        { key: "quote", type: "textarea", label: "Quote" },
        { key: "stars", type: "number", label: "Stars" },
      ],
    },
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
  ],
};

export const EVAL_FORMS = { article: ARTICLE, page: PAGE } as const;

export type EvalFormName = keyof typeof EVAL_FORMS;
