import type { H3Event } from "h3";
import { createError } from "h3";
import { isCategory } from "./categories";
import { requireUser } from "./session";

// The articles of the example: the record Magic Fill fills on its detail
// page. In memory, as a small DRF backend keeps them: a list with
// `?search=`, the record, its changes checked field by field (400 with
// the errors by field), and `OPTIONS` with DRF's standard metadata, which
// MapoDetail asks and Magic Fill sends to the AI with the form's fields.
// It resets when the server restarts.

/** A source of an article: where its facts come from. */
export interface ArticleSource {
  title: string;
  url: string;
}

/** An article as the backend answers it. */
export interface Article {
  id: number;
  title: string;
  slug: string;
  subtitle: string;
  excerpt: string;
  /** The rich text of the editor, as HTML. */
  body: string;
  status: "draft" | "review" | "published";
  featured: boolean;
  /** Minutes, from 1 to 120. */
  reading_time: number | null;
  /** `YYYY-MM-DD`; the form shows it only for a published article. */
  published_on: string | null;
  /** The id of a category (`/api/categories`): a relation, which Magic Fill never writes. */
  category: number | null;
  /** A list of nested objects, as a DRF ListSerializer: Magic Fill adds its items after these. */
  sources: ArticleSource[];
}

const STATUSES = ["draft", "review", "published"] as const;

/**
 * One article to start from: /articles/1, where a value replaces one, and
 * whose source a text may give again: Magic Fill does not add it twice.
 */
const articles = new Map<number, Article>([
  [
    1,
    {
      id: 1,
      title: "Ten years of open data",
      slug: "ten-years-of-open-data",
      subtitle: "",
      excerpt: "",
      body: "",
      status: "draft",
      featured: false,
      reading_time: null,
      published_on: null,
      category: null,
      sources: [
        { title: "The open data portal", url: "https://data.example.org" },
      ],
    },
  ],
]);
let nextId = 2;

/** The signed-in user may `codename` an article: a superuser always may. */
export function requireArticlePermission(
  event: H3Event,
  action: "view" | "add" | "change" | "delete",
): void {
  const user = requireUser(event);
  const codename = `${action}_article`;
  if (user.is_superuser || user.all_permissions.includes(codename)) return;
  throw createError({
    statusCode: 403,
    data: { detail: "You do not have permission to perform this action." },
  });
}

/** The articles, as a paginated DRF list, by `search` in the title or the slug. */
export function listArticles(search = "") {
  const query = search.toLowerCase();
  const results = [...articles.values()].filter(
    (article) =>
      !query ||
      article.title.toLowerCase().includes(query) ||
      article.slug.includes(query),
  );
  return { count: results.length, next: null, previous: null, results };
}

export function getArticle(id: number): Article {
  const article = articles.get(id);
  if (!article) {
    throw createError({ statusCode: 404, data: { detail: "Not found." } });
  }
  return article;
}

export function createArticle(body: unknown): Article {
  const values = checked(body, { partial: false });
  const article: Article = {
    id: nextId++,
    title: "",
    slug: "",
    subtitle: "",
    excerpt: "",
    body: "",
    status: "draft",
    featured: false,
    reading_time: null,
    published_on: null,
    category: null,
    sources: [],
    ...values,
  };
  if (!article.slug) article.slug = slugOf(article.title);
  articles.set(article.id, article);
  return article;
}

export function updateArticle(
  id: number,
  body: unknown,
  partial: boolean,
): Article {
  const article = getArticle(id);
  const values = checked(body, { partial });
  const updated = { ...article, ...values, id };
  articles.set(id, updated);
  return updated;
}

export function deleteArticle(id: number): void {
  getArticle(id);
  articles.delete(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
 * the fields it has.
 */
function checked(
  body: unknown,
  { partial }: { partial: boolean },
): Partial<Omit<Article, "id">> {
  const data = isRecord(body) ? body : {};
  // A field's messages; a list of nested objects has one object per item.
  const errors: Record<string, unknown> = {};
  const values: Partial<Omit<Article, "id">> = {};
  const has = (key: string) => Object.hasOwn(data, key);

  const text = (
    key: "title" | "slug" | "subtitle" | "excerpt" | "body",
    max: number,
  ) => {
    if (!has(key)) return;
    const value = data[key];
    if (value === null) errors[key] = ["This field may not be null."];
    else if (typeof value !== "string") errors[key] = ["Not a valid string."];
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
  text("subtitle", 200);
  text("excerpt", 500);
  text("body", 20000);

  if (has("status")) {
    const status = STATUSES.find((one) => one === data.status);
    if (status) values.status = status;
    else errors.status = [`"${String(data.status)}" is not a valid choice.`];
  }
  if (has("featured")) {
    if (typeof data.featured === "boolean") values.featured = data.featured;
    else errors.featured = ["Must be a valid boolean."];
  }
  if (has("reading_time")) {
    const minutes = data.reading_time;
    const isEmpty = minutes === null || minutes === "";
    const isMinutes =
      Number.isInteger(minutes) &&
      Number(minutes) >= 1 &&
      Number(minutes) <= 120;
    if (isEmpty) values.reading_time = null;
    else if (isMinutes) values.reading_time = Number(minutes);
    else errors.reading_time = ["Ensure this value is between 1 and 120."];
  }
  if (has("published_on")) {
    const day = data.published_on;
    const isEmpty = day === null || day === "";
    const isDay =
      typeof day === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      !Number.isNaN(Date.parse(day));
    if (isEmpty) values.published_on = null;
    else if (isDay) values.published_on = day;
    else {
      errors.published_on = [
        "Date has wrong format. Use one of these formats instead: YYYY-MM-DD.",
      ];
    }
  }

  if (has("category")) {
    const category = relatedId(data.category);
    if (category.ok) values.category = category.id;
    else errors.category = [category.error];
  }

  if (has("sources")) {
    const read = sourcesOf(data.sources);
    if (read.ok) values.sources = read.sources;
    else errors.sources = read.errors;
  }

  if (Object.keys(errors).length) {
    throw createError({ statusCode: 400, data: errors });
  }
  return values;
}

/**
 * The sources of a body, checked as a ListSerializer of nested objects
 * checks them: the errors of each item at its place, an empty object for
 * an item without any. A missing list is empty; `null` is not a list.
 */
function sourcesOf(
  value: unknown,
): { ok: true; sources: ArticleSource[] } | { ok: false; errors: unknown } {
  if (value === undefined) return { ok: true, sources: [] };
  if (value === null) {
    return { ok: false, errors: ["This field may not be null."] };
  }
  if (!Array.isArray(value)) {
    const type = pythonType(value);
    return {
      ok: false,
      errors: [`Expected a list of items but got type "${type}".`],
    };
  }
  const sources: ArticleSource[] = [];
  const itemErrors = value.map((item: unknown) => {
    if (!isRecord(item)) {
      const type = pythonType(item);
      return {
        non_field_errors: [
          `Invalid data. Expected a dictionary, but got ${type}.`,
        ],
      };
    }
    const errors: Record<string, string[]> = {};
    const title = textError(item.title, 200);
    if (title) errors.title = [title];
    const isLink =
      typeof item.url === "string" && /^https?:\/\/[^\s]+$/.test(item.url);
    const url =
      textError(item.url, 500) ?? (isLink ? undefined : "Enter a valid URL.");
    if (url) errors.url = [url];
    if (!Object.keys(errors).length) {
      sources.push({ title: String(item.title), url: String(item.url) });
    }
    return errors;
  });
  const hasErrors = itemErrors.some((one) => Object.keys(one).length > 0);
  return hasErrors ? { ok: false, errors: itemErrors } : { ok: true, sources };
}

/**
 * A category's id, as DRF's PrimaryKeyRelatedField reads it: a number, or
 * a string of digits, of a category that exists; `null` clears it.
 */
function relatedId(
  value: unknown,
): { ok: true; id: number | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, id: null };
  const isDigits = typeof value === "string" && /^\d+$/.test(value);
  const id = isDigits ? Number(value) : value;
  if (typeof id !== "number" || !Number.isInteger(id)) {
    const type = pythonType(value);
    return {
      ok: false,
      error: `Incorrect type. Expected pk value, received ${type}.`,
    };
  }
  if (!isCategory(id)) {
    return { ok: false, error: `Invalid pk "${id}" - object does not exist.` };
  }
  return { ok: true, id };
}

/** DRF's message for a text of a nested item, or `undefined` when it is valid. */
function textError(value: unknown, max: number): string | undefined {
  if (value === undefined) return "This field is required.";
  if (value === null) return "This field may not be null.";
  if (typeof value !== "string") return "Not a valid string.";
  if (value === "") return "This field may not be blank.";
  if (value.length > max) {
    return `Ensure this field has no more than ${max} characters.`;
  }
  return undefined;
}

/** The name Python gives the type of a JSON value, as DRF's messages write it. */
function pythonType(value: unknown): string {
  if (value === null) return "NoneType";
  if (Array.isArray(value)) return "list";
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  return "dict";
}

/**
 * What DRF's SimpleMetadata serves on `OPTIONS` for the article serializer:
 * the backend's description, which MapoDetail reads and Magic Fill sends to
 * the AI with the form's fields (the stricter limit of the two wins).
 */
export function articleMetadata() {
  return {
    name: "Article List",
    description: "The articles of the example.",
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
        subtitle: {
          type: "string",
          required: false,
          read_only: false,
          label: "Subtitle",
          max_length: 200,
        },
        excerpt: {
          type: "string",
          required: false,
          read_only: false,
          label: "Excerpt",
          max_length: 500,
        },
        body: {
          type: "string",
          required: false,
          read_only: false,
          label: "Body",
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
          min_value: 1,
          max_value: 120,
          help_text: "In minutes.",
        },
        published_on: {
          type: "date",
          required: false,
          read_only: false,
          label: "Published on",
        },
        // A relation: DRF names it "field", with no endpoint and no choices.
        category: {
          type: "field",
          required: false,
          read_only: false,
          label: "Category",
        },
        sources: {
          type: "list",
          required: false,
          read_only: false,
          label: "Sources",
          child: {
            type: "nested object",
            required: true,
            read_only: false,
            children: {
              title: {
                type: "string",
                required: true,
                read_only: false,
                label: "Title",
                max_length: 200,
              },
              url: {
                type: "url",
                required: true,
                read_only: false,
                label: "Link",
                max_length: 500,
              },
            },
          },
        },
      },
    },
  };
}
