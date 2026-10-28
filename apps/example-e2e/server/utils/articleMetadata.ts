// What Django REST Framework's SimpleMetadata serves on OPTIONS for an article
// serializer, with no `schema` (the extension Camomilla adds). MapoDetail reads
// it with `experimentalFieldsFromSchema`: pages/form/drf-metadata/[id].vue.
// DRF lists `POST` only to users who can create; this mock always does.
export function articleMetadata() {
  return {
    name: "Article List",
    description: "Articles of the example app.",
    renders: ["application/json", "text/html"],
    parses: [
      "application/json",
      "application/x-www-form-urlencoded",
      "multipart/form-data",
    ],
    actions: {
      POST: {
        id: { type: "integer", required: false, read_only: true, label: "ID" },
        title: {
          type: "string",
          required: true,
          read_only: false,
          label: "Title",
          max_length: 200,
        },
        slug: {
          type: "slug",
          required: false,
          read_only: false,
          label: "Slug",
          max_length: 200,
          help_text: "Built from the title when empty.",
        },
        excerpt: {
          type: "string",
          required: false,
          read_only: false,
          label: "Excerpt",
          max_length: 500,
        },
        status: {
          type: "choice",
          required: false,
          read_only: false,
          label: "Status",
          choices: [
            { value: "draft", display_name: "Draft" },
            { value: "review", display_name: "In review" },
            { value: "ready", display_name: "Ready" },
            { value: "published", display_name: "Published" },
            { value: "archived", display_name: "Archived" },
          ],
        },
        featured: {
          type: "boolean",
          required: false,
          read_only: false,
          label: "Featured",
        },
        reading_time: {
          type: "integer",
          required: false,
          read_only: false,
          label: "Reading time",
          help_text: "Minutes.",
          min_value: 1,
          max_value: 120,
        },
        published_at: {
          type: "datetime",
          required: false,
          read_only: false,
          label: "Published at",
        },
        // Relations: DRF names them "field", with no endpoint.
        category: {
          type: "field",
          required: false,
          read_only: false,
          label: "Category",
        },
        tags: {
          type: "field",
          required: false,
          read_only: false,
          label: "Tags",
        },
        created_at: {
          type: "datetime",
          required: false,
          read_only: true,
          label: "Created at",
        },
      },
    },
  };
}
