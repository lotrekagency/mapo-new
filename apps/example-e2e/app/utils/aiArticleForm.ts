// The article form of the AI scenarios, /ai/fill with the mock and the AI
// lab, /ai/ollama, with a local model: the fields useMapoAiFill() describes
// to the gateway, with the backend's OPTIONS of /api/articles/.
import type { AnyFieldDescriptor } from "mapomodule/types";

/** The detail's languages: Subtitle and Body are translatable. */
export const AI_ARTICLE_LANGUAGES = ["en", "it"];

export const AI_ARTICLE_FIELDS: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "subtitle", type: "text", label: "Subtitle", translatable: true },
  {
    key: "excerpt",
    type: "textarea",
    label: "Excerpt",
    // What the AI reads beside the label: the field's description in the
    // schema of the answer, which the model gets with the prompt.
    ai: { hint: "One or two sentences, in the source's own words." },
  },
  { key: "body", type: "editor", label: "Body", translatable: true },
];

export const AI_ARTICLE_SIDEBAR_FIELDS: AnyFieldDescriptor[] = [
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
  // Sixty authors, a page at a time: too many to list for the AI, which
  // writes a name that Magic Fill searches. The field keeps the record.
  {
    key: "author",
    type: "fks",
    label: "Author",
    attrs: { endpoint: "/api/authors", itemText: "name", itemValue: "id" },
  },
  // Six reviewers, listed by email: few enough to list for the AI, but an
  // email must not reach the provider. `list: false` keeps the list away:
  // the AI writes the email it reads, which Magic Fill searches.
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
];
