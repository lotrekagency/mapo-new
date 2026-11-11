import type { H3Event } from "h3";
import { createError } from "h3";
import { isPerson } from "./people";
import { isUser, requireUser } from "./session";
import { isVenue } from "./venues";

// The events of the example: the large record of the app, where Magic Fill
// meets most of what a form can hold. In memory, as a small DRF backend
// keeps them: a list with `?search=`, the record, its changes checked field
// by field (400 with the errors by field), and `OPTIONS` with DRF's
// standard metadata, which MapoDetail asks and Magic Fill, and the import
// page, send to the AI with the form's fields. What the record holds:
// - translations: the summary, the description and the booking link are
//   written per language (`translations.en`, `translations.it`);
// - a nested object, `seo`, which the form shows as dotted fields;
// - relations: a venue (six, listed for the AI), a contact among the
//   backoffice's users (found by email, never listed) and, inside the items
//   of `speakers`, a person (forty, searched by name);
// - what the AI never gets: `stream_password`, a secret by its name;
//   `views`, which only the backend writes; `internal_notes`, which the
//   form keeps away with `ai.exclude`.
// It resets when the server restarts.

/** A speaker of an event: a person (`/api/people`) and their part. */
export interface EventSpeaker {
  person: number | null;
  role: string;
}

/** What an event writes in each language. */
export interface EventText {
  summary: string;
  /** The rich text of the editor, as HTML. */
  description: string;
  booking_url: string;
}

/** What search engines and social networks show of an event. */
export interface EventSeo {
  title: string;
  description: string;
  social_title: string;
}

/** An event as the backend answers it. */
export interface CityEvent {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  /** `YYYY-MM-DD`. */
  starts_on: string | null;
  /** `HH:MM`. */
  starts_at: string | null;
  /** `HH:MM`. */
  ends_at: string | null;
  /** The id of a venue (`/api/venues`): six, which Magic Fill lists for the AI. */
  venue: number | null;
  online: boolean;
  stream_url: string;
  /** A secret by its name: Magic Fill never sends it, nor asks the AI for it. */
  stream_password: string;
  /** A decimal as DRF answers one: a string with two decimals, `"12.50"`. */
  price: string | null;
  /** People, from 1 to 5000. */
  capacity: number | null;
  /** The id of a backoffice user (`/api/users/`), found by email. */
  contact: number | null;
  speakers: EventSpeaker[];
  seo: EventSeo;
  /** The editors' own notes: the form keeps them away from the AI. */
  internal_notes: string;
  /** Read-only: the backend counts the views, nobody writes them. */
  views: number;
  /** By language: `en` and `it`. */
  translations: Record<string, EventText>;
}

const STATUSES = ["draft", "published"] as const;
const LANGUAGES = ["en", "it"] as const;

function emptyText(): EventText {
  return { summary: "", description: "", booking_url: "" };
}

/**
 * One event to start from: /events/1, with a summary in English only, a
 * speaker, a contact and its notes, so a source can give the record's own
 * values again (Magic Fill does not add them twice) and new ones.
 */
const events = new Map<number, CityEvent>([
  [
    1,
    {
      id: 1,
      title: "A night at the library",
      slug: "a-night-at-the-library",
      status: "draft",
      starts_on: "2026-12-05",
      starts_at: "20:00",
      ends_at: null,
      venue: 2,
      online: false,
      stream_url: "",
      stream_password: "",
      price: null,
      capacity: 120,
      contact: 2,
      speakers: [{ person: 1, role: "Host" }],
      seo: { title: "", description: "", social_title: "" },
      internal_notes: "Ask the caretaker to keep the side door open.",
      views: 348,
      translations: {
        en: {
          summary:
            "The library stays open until midnight, with readings and music.",
          description: "",
          booking_url: "",
        },
        it: emptyText(),
      },
    },
  ],
]);
let nextId = 2;

/** The signed-in user may `codename` an event: a superuser always may. */
export function requireEventPermission(
  event: H3Event,
  action: "view" | "add" | "change" | "delete",
): void {
  const user = requireUser(event);
  const codename = `${action}_event`;
  if (user.is_superuser || user.all_permissions.includes(codename)) return;
  throw createError({
    statusCode: 403,
    data: { detail: "You do not have permission to perform this action." },
  });
}

/** The events, as a paginated DRF list, by `search` in the title or the slug. */
export function listCityEvents(search = "") {
  const query = search.toLowerCase();
  const results = [...events.values()].filter(
    (one) =>
      !query ||
      one.title.toLowerCase().includes(query) ||
      one.slug.includes(query),
  );
  return { count: results.length, next: null, previous: null, results };
}

export function getCityEvent(id: number): CityEvent {
  const found = events.get(id);
  if (!found) {
    throw createError({ statusCode: 404, data: { detail: "Not found." } });
  }
  return found;
}

export function createCityEvent(body: unknown): CityEvent {
  const values = checked(body, { partial: false });
  const created: CityEvent = {
    id: nextId++,
    title: "",
    slug: "",
    status: "draft",
    starts_on: null,
    starts_at: null,
    ends_at: null,
    venue: null,
    online: false,
    stream_url: "",
    stream_password: "",
    price: null,
    capacity: null,
    contact: null,
    speakers: [],
    internal_notes: "",
    ...values,
    seo: { title: "", description: "", social_title: "", ...values.seo },
    views: 0,
    translations: withTexts({}, values.translations),
  };
  if (!created.slug) created.slug = slugOf(created.title);
  events.set(created.id, created);
  return created;
}

export function updateCityEvent(
  id: number,
  body: unknown,
  partial: boolean,
): CityEvent {
  const current = getCityEvent(id);
  const values = checked(body, { partial });
  const updated: CityEvent = {
    ...current,
    ...values,
    seo: { ...current.seo, ...values.seo },
    translations: withTexts(current.translations, values.translations),
    id,
    views: current.views,
  };
  events.set(id, updated);
  return updated;
}

export function deleteCityEvent(id: number): void {
  getCityEvent(id);
  events.delete(id);
}

/** The texts of every language, the changed ones over the current ones. */
function withTexts(
  current: Record<string, EventText>,
  changed: Record<string, Partial<EventText>> | undefined,
): Record<string, EventText> {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      {
        ...emptyText(),
        ...current[language],
        ...changed?.[language],
      },
    ]),
  );
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

/** What a body changes, read field by field. */
type EventValues = Partial<
  Omit<CityEvent, "id" | "views" | "seo" | "translations">
> & {
  seo?: Partial<EventSeo>;
  translations?: Record<string, Partial<EventText>>;
};

/**
 * The values of a body, checked as a DRF serializer checks them: each
 * error by its field, all of them in one 400. A partial update checks only
 * the fields it has; `views` is read-only, so a body's is ignored, as DRF
 * ignores a read-only field.
 */
function checked(
  body: unknown,
  { partial }: { partial: boolean },
): EventValues {
  const data = isRecord(body) ? body : {};
  const errors: Record<string, unknown> = {};
  const values: EventValues = {};
  const has = (key: string) => Object.hasOwn(data, key);

  const text = (
    key: "title" | "slug" | "stream_password" | "internal_notes",
    max: number,
  ) => {
    if (!has(key)) return;
    const error = textError(data[key], max, { blank: key !== "title" });
    if (error) errors[key] = [error];
    else values[key] = String(data[key]);
  };

  if (!partial && !has("title")) errors.title = ["This field is required."];
  text("title", 200);
  text("slug", 200);
  if (typeof values.slug === "string" && !/^[-a-z0-9_]*$/.test(values.slug)) {
    errors.slug = [
      "Enter a valid slug: letters, numbers, underscores or hyphens.",
    ];
  }
  text("stream_password", 100);
  text("internal_notes", 2000);

  if (has("status")) {
    const status = STATUSES.find((one) => one === data.status);
    if (status) values.status = status;
    else errors.status = [`"${String(data.status)}" is not a valid choice.`];
  }
  if (has("online")) {
    if (typeof data.online === "boolean") values.online = data.online;
    else errors.online = ["Must be a valid boolean."];
  }
  if (has("stream_url")) {
    const error = urlError(data.stream_url);
    if (error) errors.stream_url = [error];
    else values.stream_url = String(data.stream_url);
  }

  if (has("starts_on")) {
    const read = dayOf(data.starts_on);
    if (read.ok) values.starts_on = read.value;
    else errors.starts_on = [read.error];
  }
  for (const key of ["starts_at", "ends_at"] as const) {
    if (!has(key)) continue;
    const read = timeOf(data[key]);
    if (read.ok) values[key] = read.value;
    else errors[key] = [read.error];
  }

  if (has("price")) {
    const read = priceOf(data.price);
    if (read.ok) values.price = read.value;
    else errors.price = [read.error];
  }
  if (has("capacity")) {
    const people = data.capacity;
    const isEmpty = people === null || people === "";
    const isPeople =
      Number.isInteger(people) && Number(people) >= 1 && Number(people) <= 5000;
    if (isEmpty) values.capacity = null;
    else if (isPeople) values.capacity = Number(people);
    else errors.capacity = ["Ensure this value is between 1 and 5000."];
  }

  if (has("venue")) {
    const read = relatedId(data.venue, isVenue);
    if (read.ok) values.venue = read.id;
    else errors.venue = [read.error];
  }
  if (has("contact")) {
    const read = relatedId(data.contact, isUser);
    if (read.ok) values.contact = read.id;
    else errors.contact = [read.error];
  }
  if (has("speakers")) {
    const read = speakersOf(data.speakers);
    if (read.ok) values.speakers = read.speakers;
    else errors.speakers = read.errors;
  }
  if (has("seo")) {
    const read = seoOf(data.seo);
    if (read.ok) values.seo = read.seo;
    else errors.seo = read.errors;
  }
  if (has("translations")) {
    const read = translationsOf(data.translations);
    if (read.ok) values.translations = read.translations;
    else errors.translations = read.errors;
  }

  if (Object.keys(errors).length) {
    throw createError({ statusCode: 400, data: errors });
  }
  return values;
}

/** A date as DRF's DateField reads it: `YYYY-MM-DD`; `null` or `""` clears it. */
function dayOf(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === "") return { ok: true, value: null };
  const isDay =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value));
  if (isDay) return { ok: true, value };
  return {
    ok: false,
    error:
      "Date has wrong format. Use one of these formats instead: YYYY-MM-DD.",
  };
}

/** A time as DRF's TimeField reads it, kept as `HH:MM`; `null` or `""` clears it. */
function timeOf(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === "") return { ok: true, value: null };
  const parts =
    typeof value === "string"
      ? /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value)
      : null;
  if (parts) return { ok: true, value: `${parts[1]}:${parts[2]}` };
  return {
    ok: false,
    error:
      "Time has wrong format. Use one of these formats instead: hh:mm[:ss[.uuuuuu]].",
  };
}

/**
 * A price as DRF's DecimalField(max_digits=6, decimal_places=2,
 * min_value=0) reads it: a number or a string of one, two decimals at
 * most, answered as a string with two; `null` or `""` clears it.
 */
function priceOf(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === "") return { ok: true, value: null };
  const written = typeof value === "number" ? String(value) : value;
  if (typeof written !== "string" || !/^\d+(\.\d+)?$/.test(written.trim())) {
    return { ok: false, error: "A valid number is required." };
  }
  const [whole = "", decimals = ""] = written.trim().split(".");
  if (decimals.length > 2) {
    return {
      ok: false,
      error: "Ensure that there are no more than 2 decimal places.",
    };
  }
  if (whole.replace(/^0+(?=\d)/, "").length > 4) {
    return {
      ok: false,
      error:
        "Ensure that there are no more than 4 digits before the decimal point.",
    };
  }
  return { ok: true, value: Number(written).toFixed(2) };
}

/** DRF's message for a link, or `undefined` when it is one or empty. */
function urlError(value: unknown): string | undefined {
  if (value === "") return undefined;
  const error = textError(value, 500, { blank: true });
  if (error) return error;
  const isLink = typeof value === "string" && /^https?:\/\/\S+$/.test(value);
  return isLink ? undefined : "Enter a valid URL.";
}

/**
 * The speakers of a body, checked as a ListSerializer of nested objects
 * checks them: the errors of each item at its place, an empty object for
 * an item without any. `null` is not a list.
 */
function speakersOf(
  value: unknown,
): { ok: true; speakers: EventSpeaker[] } | { ok: false; errors: unknown } {
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
  const speakers: EventSpeaker[] = [];
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
    const person = relatedId(item.person ?? null, isPerson);
    if (!person.ok) errors.person = [person.error];
    const role = item.role ?? "";
    const roleError = textError(role, 100, { blank: true });
    if (roleError) errors.role = [roleError];
    if (person.ok && !roleError) {
      speakers.push({ person: person.id, role: String(role) });
    }
    return errors;
  });
  const hasErrors = itemErrors.some((one) => Object.keys(one).length > 0);
  return hasErrors ? { ok: false, errors: itemErrors } : { ok: true, speakers };
}

/** The `seo` object of a body, as a nested serializer checks it. */
function seoOf(
  value: unknown,
):
  | { ok: true; seo: Partial<EventSeo> }
  | { ok: false; errors: Record<string, string[]> | string[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [
        `Invalid data. Expected a dictionary, but got ${pythonType(value)}.`,
      ],
    };
  }
  const limits = { title: 70, description: 160, social_title: 70 } as const;
  const seo: Partial<EventSeo> = {};
  const errors: Record<string, string[]> = {};
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (!Object.hasOwn(value, key)) continue;
    const error = textError(value[key], limits[key], { blank: true });
    if (error) errors[key] = [error];
    else seo[key] = String(value[key]);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, seo };
}

/** The `translations` of a body: a language's texts, each checked. */
function translationsOf(
  value: unknown,
):
  | { ok: true; translations: Record<string, Partial<EventText>> }
  | { ok: false; errors: unknown } {
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [
        `Invalid data. Expected a dictionary, but got ${pythonType(value)}.`,
      ],
    };
  }
  const translations: Record<string, Partial<EventText>> = {};
  const errors: Record<string, unknown> = {};
  for (const [language, texts] of Object.entries(value)) {
    const isLanguage = LANGUAGES.some((one) => one === language);
    if (!isLanguage || !isRecord(texts)) {
      errors[language] = [`"${language}" is not a language of the events.`];
      continue;
    }
    const text: Partial<EventText> = {};
    const textErrors: Record<string, string[]> = {};
    const check = (key: keyof EventText, error: string | undefined) => {
      if (!Object.hasOwn(texts, key)) return;
      if (error) textErrors[key] = [error];
      else text[key] = String(texts[key]);
    };
    check("summary", textError(texts.summary, 300, { blank: true }));
    check("description", textError(texts.description, 20000, { blank: true }));
    check("booking_url", urlError(texts.booking_url));
    if (Object.keys(textErrors).length) errors[language] = textErrors;
    else translations[language] = text;
  }
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, translations };
}

/**
 * A related record's id, as DRF's PrimaryKeyRelatedField reads it: a
 * number, or a string of digits, of a record that exists; `null` clears it.
 */
function relatedId(
  value: unknown,
  exists: (id: number) => boolean,
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
  if (!exists(id)) {
    return { ok: false, error: `Invalid pk "${id}" - object does not exist.` };
  }
  return { ok: true, id };
}

/** DRF's message for a text, or `undefined` when it is valid. */
function textError(
  value: unknown,
  max: number,
  { blank }: { blank: boolean },
): string | undefined {
  if (value === undefined) return "This field is required.";
  if (value === null) return "This field may not be null.";
  if (typeof value !== "string") return "Not a valid string.";
  if (value === "" && !blank) return "This field may not be blank.";
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

/** A writable field of DRF's metadata. */
function writable(
  type: string,
  label: string,
  more: Record<string, unknown> = {},
) {
  return { type, required: false, read_only: false, label, ...more };
}

/**
 * What DRF's SimpleMetadata serves on `OPTIONS` for the event serializer:
 * the backend's description, which MapoDetail reads and Magic Fill sends to
 * the AI with the form's fields (the stricter limit of the two wins). The
 * translations are a JSON field DRF says nothing of: the form's fields,
 * marked `translatable`, describe them.
 */
export function eventMetadata() {
  return {
    name: "Event List",
    description: "The events of the city's culture office.",
    renders: ["application/json"],
    parses: ["application/json"],
    actions: {
      POST: {
        id: { type: "integer", required: false, read_only: true, label: "ID" },
        title: {
          ...writable("string", "Title", { max_length: 200 }),
          required: true,
        },
        slug: writable("slug", "Slug", {
          max_length: 200,
          help_text: "Built from the title when empty.",
        }),
        status: writable("choice", "Status", {
          choices: [
            { value: "draft", display_name: "Draft" },
            { value: "published", display_name: "Published" },
          ],
        }),
        starts_on: writable("date", "Date"),
        starts_at: writable("time", "Starts at"),
        ends_at: writable("time", "Ends at"),
        // A relation: DRF names it "field", with no endpoint and no choices.
        venue: writable("field", "Venue"),
        online: writable("boolean", "Online"),
        stream_url: writable("url", "Stream link", { max_length: 500 }),
        stream_password: writable("string", "Stream password", {
          max_length: 100,
        }),
        price: writable("decimal", "Price", {
          max_digits: 6,
          decimal_places: 2,
          min_value: 0,
          help_text: "In euros; empty when free.",
        }),
        capacity: writable("integer", "Capacity", {
          min_value: 1,
          max_value: 5000,
        }),
        contact: writable("field", "Contact"),
        speakers: writable("list", "Speakers", {
          child: {
            type: "nested object",
            required: true,
            read_only: false,
            children: {
              person: writable("field", "Person"),
              role: writable("string", "Role", { max_length: 100 }),
            },
          },
        }),
        seo: writable("nested object", "SEO", {
          children: {
            title: writable("string", "Title for search engines", {
              max_length: 70,
            }),
            description: writable("string", "Description for search engines", {
              max_length: 160,
            }),
            social_title: writable("string", "Title for social networks", {
              max_length: 70,
            }),
          },
        }),
        internal_notes: writable("string", "Internal notes", {
          max_length: 2000,
        }),
        views: {
          type: "integer",
          required: false,
          read_only: true,
          label: "Views",
        },
        translations: writable("field", "Translations"),
      },
    },
  };
}
