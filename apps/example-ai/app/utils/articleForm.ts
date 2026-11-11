// The form of an article, shared by its pages: /articles/[id], with Magic
// Fill, and the three that show other ways (app/pages/articles/*/[id].vue):
// Magic Fill turned off, Magic Fill asking for no quotes, and a panel of
// the app's own, with useMapoAiFill(). The sources are a list: the AI's go
// after the article's own, chosen one by one in the banner. The category
// and the tags are relations; the date of publication shows once the
// article is published.
import type { AnyFieldDescriptor } from "mapomodule/types";

export const ARTICLE_FIELDS: AnyFieldDescriptor[] = [
  { key: "title", type: "text", label: "Title", required: true },
  { key: "slug", type: "text", label: "Slug" },
  { key: "subtitle", type: "text", label: "Subtitle" },
  { key: "excerpt", type: "textarea", label: "Excerpt" },
  { key: "body", type: "editor", label: "Body" },
  {
    key: "sources",
    type: "repeater",
    label: "Sources",
    fields: [
      { key: "title", type: "text", label: "Title", cols: 6 },
      { key: "url", type: "url", label: "Link", cols: 6 },
    ],
  },
];

export const ARTICLE_SIDEBAR_FIELDS: AnyFieldDescriptor[] = [
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
  { key: "featured", type: "switch", label: "Featured" },
  { key: "reading_time", type: "number", label: "Reading time (minutes)" },
  // Shown only for a published article: a status of "published" in Magic
  // Fill's answer reveals it, and its verified date then goes in too.
  {
    key: "published_on",
    type: "date",
    label: "Published on",
    show: ({ model }) => model.status === "published",
  },
  // A relation with five records: Magic Fill lists them for the AI, which
  // picks one by its id, and a category the source names goes in by itself.
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
  // A relation to sixty tags, a page at a time: the AI writes their names,
  // which Magic Fill searches; the tags found go after the article's own.
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
];
