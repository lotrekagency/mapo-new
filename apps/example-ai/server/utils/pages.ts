import type { H3Event } from "h3";
import { createError } from "h3";
import { requireUser } from "./session";

// The pages of the example: a landing page made of blocks, as a CMS keeps
// it. In memory, reset when the server restarts. `blocks` is a JSON field:
// the backend says nothing of it in its OPTIONS, the form's templates
// describe the blocks (app/utils/pageForm.ts), so Magic Fill's AI reads
// them from the form.

/** One block of a page: `_template` says which, the rest are its fields. */
export interface PageBlock {
  _template: string;
  [field: string]: unknown;
}

/** A page as the backend answers it. */
export interface Page {
  id: number;
  title: string;
  slug: string;
  summary: string;
  blocks: PageBlock[];
  status: "draft" | "review" | "published";
}

const STATUSES = ["draft", "review", "published"] as const;

/** The templates a block may follow: those of the page's form. */
const TEMPLATES = ["hero", "text", "quote", "faq", "stats", "event"];

/**
 * One page to start from: /pages/1, whose hero a text may give again:
 * Magic Fill does not add it a second time.
 */
const pages = new Map<number, Page>([
  [
    1,
    {
      id: 1,
      title: "The city library",
      slug: "city-library",
      summary: "",
      blocks: [
        {
          _template: "hero",
          title: "A library for everyone",
          subtitle: "",
          cta_label: "",
          cta_url: "",
        },
      ],
      status: "draft",
    },
  ],
]);
let nextId = 2;

/** The signed-in user may `codename` a page: a superuser always may. */
export function requirePagePermission(
  event: H3Event,
  action: "view" | "add" | "change" | "delete",
): void {
  const user = requireUser(event);
  const codename = `${action}_page`;
  if (user.is_superuser || user.all_permissions.includes(codename)) return;
  throw createError({
    statusCode: 403,
    data: { detail: "You do not have permission to perform this action." },
  });
}

/** The pages, as a paginated DRF list, by `search` in the title or the slug. */
export function listPages(search = "") {
  const query = search.toLowerCase();
  const results = [...pages.values()].filter(
    (page) =>
      !query ||
      page.title.toLowerCase().includes(query) ||
      page.slug.includes(query),
  );
  return { count: results.length, next: null, previous: null, results };
}

export function getPage(id: number): Page {
  const page = pages.get(id);
  if (!page) {
    throw createError({ statusCode: 404, data: { detail: "Not found." } });
  }
  return page;
}

export function createPage(body: unknown): Page {
  const values = checked(body, { partial: false });
  const page: Page = {
    id: nextId++,
    title: "",
    slug: "",
    summary: "",
    blocks: [],
    status: "draft",
    ...values,
  };
  if (!page.slug) page.slug = slugOf(page.title);
  pages.set(page.id, page);
  return page;
}

export function updatePage(id: number, body: unknown, partial: boolean): Page {
  const page = getPage(id);
  const values = checked(body, { partial });
  const updated = { ...page, ...values, id };
  pages.set(id, updated);
  return updated;
}

export function deletePage(id: number): void {
  getPage(id);
  pages.delete(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A block of the JSON field: an object with a template of the form. */
function isBlock(value: unknown): value is PageBlock {
  return (
    isRecord(value) &&
    typeof value._template === "string" &&
    TEMPLATES.includes(value._template)
  );
}

function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The values of a body, checked as a DRF serializer checks them: each
 * error by its field, all of them in one 400. A partial update checks only
 * the fields it has. The blocks are a JSON field: a list of objects, each
 * with a template of the form.
 */
function checked(
  body: unknown,
  { partial }: { partial: boolean },
): Partial<Omit<Page, "id">> {
  const data = isRecord(body) ? body : {};
  const errors: Record<string, string[]> = {};
  const values: Partial<Omit<Page, "id">> = {};
  const has = (key: string) => Object.hasOwn(data, key);

  const text = (key: "title" | "slug" | "summary", max: number) => {
    if (!has(key)) return;
    const value = data[key] ?? "";
    if (typeof value !== "string") errors[key] = ["Not a valid string."];
    else if (value.length > max) {
      errors[key] = [`Ensure this field has no more than ${max} characters.`];
    } else values[key] = value;
  };

  if (!partial && !has("title")) errors.title = ["This field is required."];
  text("title", 200);
  if (has("title") && data.title === "") {
    errors.title = ["This field may not be blank."];
  }
  text("slug", 200);
  if (typeof values.slug === "string" && !/^[-a-z0-9_]*$/.test(values.slug)) {
    errors.slug = [
      "Enter a valid slug: letters, numbers, underscores or hyphens.",
    ];
  }
  text("summary", 500);

  if (has("blocks")) {
    const blocks: unknown = data.blocks ?? [];
    if (Array.isArray(blocks) && blocks.every(isBlock)) values.blocks = blocks;
    else
      errors.blocks = ["Enter a list of blocks, each with a known template."];
  }
  if (has("status")) {
    const status = STATUSES.find((one) => one === data.status);
    if (status) values.status = status;
    else errors.status = [`"${String(data.status)}" is not a valid choice.`];
  }

  if (Object.keys(errors).length) {
    throw createError({ statusCode: 400, data: errors });
  }
  return values;
}

/**
 * What DRF's SimpleMetadata serves on `OPTIONS` for the page serializer.
 * `blocks` is a JSONField, which DRF names `field`: it says nothing of the
 * blocks, which the form's templates describe.
 */
export function pageMetadata() {
  return {
    name: "Page List",
    description: "The pages of the example, made of blocks.",
    renders: ["application/json"],
    parses: ["application/json"],
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
        summary: {
          type: "string",
          required: false,
          read_only: false,
          label: "Summary",
          max_length: 500,
        },
        blocks: {
          type: "field",
          required: false,
          read_only: false,
          label: "Blocks",
        },
        status: {
          type: "choice",
          required: false,
          read_only: false,
          label: "Status",
          choices: [
            { value: "draft", display_name: "Draft" },
            { value: "review", display_name: "In review" },
            { value: "published", display_name: "Published" },
          ],
        },
      },
    },
  };
}
