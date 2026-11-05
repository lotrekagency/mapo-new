// What Django REST Framework's SimpleMetadata serves on OPTIONS for the page
// serializer of the AI lab's block page (app/pages/ai/ollama/blocks/[id].vue).
// The gateway merges it with the form's fields: the form decides which fields
// exist, the stricter limit wins. Two ways a backend describes a repeater:
// - `reviews` and `locations` are ListFields of nested serializers (`list`
//   with a `nested object` child): the backend gives their items' types and
//   limits, which the two custom fields of the form, `stars` and `country`,
//   borrow;
// - `blocks` is a JSONField, which DRF names `field`: the backend says
//   nothing of it, and the form's templates describe the blocks.

const COUNTRIES = [
  { value: "IT", display_name: "Italy" },
  { value: "CH", display_name: "Switzerland" },
  { value: "FR", display_name: "France" },
  { value: "DE", display_name: "Germany" },
  { value: "AT", display_name: "Austria" },
  { value: "ES", display_name: "Spain" },
  { value: "GB", display_name: "United Kingdom" },
  { value: "US", display_name: "United States" },
];

const DAYS = [
  { value: "mon", display_name: "Monday" },
  { value: "tue", display_name: "Tuesday" },
  { value: "wed", display_name: "Wednesday" },
  { value: "thu", display_name: "Thursday" },
  { value: "fri", display_name: "Friday" },
  { value: "sat", display_name: "Saturday" },
  { value: "sun", display_name: "Sunday" },
];

function field(
  type: string,
  label: string,
  more: Record<string, unknown> = {},
) {
  return { type, required: false, read_only: false, label, ...more };
}

export function pageMetadata() {
  return {
    name: "Page List",
    description: "Landing pages of the example app, made of blocks.",
    renders: ["application/json", "text/html"],
    parses: [
      "application/json",
      "application/x-www-form-urlencoded",
      "multipart/form-data",
    ],
    actions: {
      POST: {
        id: { type: "integer", required: false, read_only: true, label: "ID" },
        title: field("string", "Title", { required: true, max_length: 120 }),
        slug: field("slug", "Slug", { max_length: 120 }),
        summary: field("string", "Summary", { max_length: 300 }),
        intro: field("string", "Intro"),
        // A JSONField: DRF says nothing of what it holds.
        blocks: field("field", "Blocks"),
        reviews: field("list", "Reviews", {
          max_length: 10,
          child: {
            type: "nested object",
            required: true,
            read_only: false,
            children: {
              author: field("string", "Author", {
                required: true,
                max_length: 80,
              }),
              quote: field("string", "Quote", { max_length: 300 }),
              stars: field("integer", "Stars", {
                min_value: 1,
                max_value: 5,
              }),
              date: field("date", "Date"),
            },
          },
        }),
        locations: field("list", "Sites", {
          max_length: 5,
          child: {
            type: "nested object",
            required: true,
            read_only: false,
            children: {
              name: field("string", "Name", {
                required: true,
                max_length: 100,
              }),
              address: field("string", "Address", { max_length: 200 }),
              country: field("choice", "Country", { choices: COUNTRIES }),
              phone: field("string", "Phone", { max_length: 30 }),
              email: field("email", "Email"),
              opening_hours: field("list", "Opening hours", {
                max_length: 7,
                child: {
                  type: "nested object",
                  required: true,
                  read_only: false,
                  children: {
                    day: field("choice", "Day", {
                      required: true,
                      choices: DAYS,
                    }),
                    opens: field("time", "Opens"),
                    closes: field("time", "Closes"),
                    closed: field("boolean", "Closed"),
                  },
                },
              }),
            },
          },
        }),
        seo: field("nested object", "SEO", {
          children: {
            title: field("string", "Title", { max_length: 60 }),
            description: field("string", "Description", { max_length: 160 }),
            permalink: field("string", "Permalink", { max_length: 200 }),
          },
        }),
        status: field("choice", "Status", {
          choices: [
            { value: "draft", display_name: "Draft" },
            { value: "review", display_name: "In review" },
            { value: "published", display_name: "Published" },
          ],
        }),
        published_at: field("datetime", "Published at"),
        show_until: field("date", "Show until"),
        show_in_menu: field("boolean", "Show in the menu"),
        featured: field("boolean", "Featured"),
        priority: field("integer", "Priority", { min_value: 0, max_value: 10 }),
        accent_color: field("string", "Accent color", { max_length: 7 }),
        contact_email: field("email", "Contact email"),
        website: field("url", "Website"),
        country: field("choice", "Country", { choices: COUNTRIES }),
        audiences: field("multiple choice", "Audiences", {
          choices: [
            { value: "families", display_name: "Families" },
            { value: "students", display_name: "Students" },
            { value: "tourists", display_name: "Tourists" },
            { value: "residents", display_name: "Residents" },
          ],
        }),
        // Relations and media: DRF names them "field", with no endpoint.
        category: field("field", "Category"),
        tags: field("field", "Tags"),
        cover: field("field", "Cover"),
        gallery: field("field", "Gallery"),
        video: field("field", "Video"),
        brochure: field("file upload", "Brochure"),
        position: field("field", "Position"),
        webhook_secret: field("string", "Webhook secret", { max_length: 64 }),
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
