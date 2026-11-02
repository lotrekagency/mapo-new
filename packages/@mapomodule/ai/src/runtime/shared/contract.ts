/**
 * The contract compiler: what the AI is asked to return for one or more
 * entities, compiled from their models (`entity.ts`).
 *
 * One schema serves every provider. It stays inside what they all accept in
 * strict mode:
 * - objects with every key in `required` and `additionalProperties: false`;
 * - strings, arrays and string `enum`s;
 * - one `anyOf` at most, never at the root;
 * - no `null`, no numeric or length limits, no formats;
 * - at most 250 values in one `enum` and 1000 in the whole schema;
 * - at most 5000 properties, 10 levels of nesting, and 100,000 characters of
 *   property names and enum values;
 * - property names of letters, digits and `_`, up to 64 characters.
 *
 * A value the source does not give is the empty string, or an empty list.
 * Formats, limits and choices the schema cannot hold are written in each
 * property's description, and the sanitizer applies them to the answer. Two
 * kinds of limit only the sanitizer applies: a pattern on rich text, which
 * the HTML must match, and the limits of a relation's key.
 */
import type { JSONSchema } from "@mapomodule/utils";
import type {
  AiChoice,
  AiConstraints,
  AiEntity,
  AiField,
  AiValueKind,
} from "./entity";

// ─── The contract ────────────────────────────────────────────────────────────

/**
 * Version of the contract's format: it goes up when a contract or the answer
 * it asks for changes shape. Not the gateway's `MAPO_AI_CONTRACT_VERSION`
 * (`gateway.ts`), which versions the routes; a contract travels in a route's
 * body, so a change here that the gateway reads raises that one too.
 */
export const AI_CONTRACT_FORMAT_VERSION = 1;

/**
 * How a relation field is answered: `choice`, one id among a short list of
 * records; `search`, text that Mapo searches for in the related endpoint.
 */
export type AiRelationMode = "choice" | "search";

/** A field as the contract asks for it. */
export interface AiContractField extends AiField {
  /** The property name in the answer: the key made safe for every provider. */
  wire: string;
  /**
   * The values the AI may answer with: a choice's, or the records a relation
   * picks from in `choice` mode. One per value as the answer writes it, a
   * string, the first one listed: of `true` and `"true"` only the first stays.
   */
  choices?: AiChoice[];
  /** The field's values are an `enum` of the schema; otherwise only the description lists them. */
  choicesInSchema: boolean;
  /** How a relation is answered. */
  relationMode?: AiRelationMode;
  /**
   * In an extraction, the entity type whose items a relation may point to:
   * its value, or each element of its list, is `{ record, item }`. When a
   * link gives both, the existing record that `record` names or finds wins
   * over the item.
   */
  linksTo?: string;
}

/** An entity as the contract describes it. */
export interface AiContractEntity {
  /** The entity's type in an extraction, such as `event`. */
  type?: string;
  /** The entity's name for people, such as "Event". */
  label?: string;
  /** What a record of this entity is, written by the developer. */
  description?: string;
  /** The endpoint its records are created at. */
  endpoint?: string;
  /** The answer quotes the source for each value it gives. */
  evidence: boolean;
  /** The fields the AI fills, in the form's order. */
  fields: AiContractField[];
}

interface AiContractBase {
  /** {@link AI_CONTRACT_FORMAT_VERSION} at the time it was compiled. */
  version: number;
  /** The language translatable values are written in, such as `it`. */
  language?: string;
  /** The JSON Schema the answer must match. */
  schema: JSONSchema;
}

/** Fill one record: Magic Fill. */
export interface AiFillContract extends AiContractBase {
  task: "fill";
  entity: AiContractEntity;
}

/** Extract every record a source describes, of one or more entities: Import AI. */
export interface AiExtractContract extends AiContractBase {
  task: "extract";
  entities: AiContractEntity[];
}

/** What the AI is asked to return. */
export type AiContract = AiFillContract | AiExtractContract;

/** One entity to compile. */
export interface AiContractSource {
  /** Its model, from `buildAiEntity()`. */
  entity: AiEntity;
  /** Its type: required in an extraction, unique there. */
  type?: string;
  /** The entity's name for people, such as "Event". */
  label?: string;
  /** What a record of this entity is, for the AI. */
  description?: string;
  /**
   * Where its records are created. In an extraction, a relation of another
   * entity that points here may link to its items. Endpoints are compared as
   * a relation field reaches them: by path, then by query, so
   * `/api/places/?kind=venue` and `/api/places/?kind=city` are two
   * collections; two entities of one contract cannot share both.
   */
  endpoint?: string;
  /**
   * The records a relation field may point to, by field key, when they are
   * few: the AI then picks an id instead of writing text to search for.
   */
  relationChoices?: Readonly<Record<string, readonly AiChoice[]>>;
  /** Ask for quotes from the source. Default `true`. */
  evidence?: boolean;
}

/** Options of {@link compileFillContract} and {@link compileExtractContract}. */
export interface CompileContractOptions {
  /** The language translatable values are written in, such as `it`. */
  language?: string;
}

// ─── Limits every provider accepts ───────────────────────────────────────────

/** Enum values in the whole schema. */
const MAX_ENUM_VALUES = 1000;
/** Values of one `enum`: a longer list goes to the description. */
const MAX_PROPERTY_ENUM = 250;
/** Characters of property names and enum values in the whole schema, with a margin. */
const MAX_SCHEMA_CHARACTERS = 100_000;
/** Properties of all the objects in the schema. */
const MAX_PROPERTIES = 5000;
/** Longest property name. */
const MAX_WIRE_LENGTH = 64;

// ─── Property names ──────────────────────────────────────────────────────────

/**
 * A property name every provider accepts, from a field key: `seo.title`
 * becomes `seo_title`. A name already taken gets a number.
 */
function wireName(key: string, taken: Set<string>): string {
  const safe = key
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_WIRE_LENGTH);
  const base = safe || "field";
  let name = base;
  for (let index = 2; taken.has(name); index++) {
    const suffix = `_${index}`;
    name = `${base.slice(0, MAX_WIRE_LENGTH - suffix.length)}${suffix}`;
  }
  taken.add(name);
  return name;
}

// ─── Choices ─────────────────────────────────────────────────────────────────

/**
 * Choices the AI can answer with, one per value as the answer writes it, a
 * string: of `1` and `"1"`, or of `true` and `"true"`, the first one listed.
 * `""`, which means "none", is not a choice.
 */
function answerableChoices(choices: readonly AiChoice[]): AiChoice[] {
  const seen = new Set<string>();
  return choices.filter((choice) => {
    const value = String(choice.value);
    const isNew = value !== "" && !seen.has(value);
    seen.add(value);
    return isNew;
  });
}

/** The strings the schema lists for one value of the field, or `undefined` for free text. */
function allowedValues(field: AiContractField): string[] | undefined {
  if (!field.choicesInSchema) return undefined;
  if (field.kind === "boolean") return ["true", "false"];
  return (field.choices ?? []).map((choice) => String(choice.value));
}

/** A single value, or a link, can also be empty: the schema adds `""`. */
function allowsEmpty(field: AiContractField): boolean {
  return !field.multiple || !!field.linksTo;
}

/** The `enum` values the field puts in the schema. */
function enumSize(field: AiContractField): number {
  const allowed = allowedValues(field);
  if (!allowed) return 0;
  return allowed.length + (allowsEmpty(field) ? 1 : 0);
}

// ─── Descriptions ────────────────────────────────────────────────────────────

const KIND_RULES: Readonly<Record<AiValueKind, string>> = {
  string: "Plain text on one line.",
  text: "Plain text; line breaks are allowed.",
  html: 'Text in restricted Markdown: paragraphs, lists ("- " or "1. "), **bold**, *italic* and [links](https://example.com). No other markup and no HTML.',
  email: "An email address.",
  url: "An absolute http or https URL.",
  color: "A colour as #RRGGBB.",
  integer:
    "A whole number in digits, without thousands separators, such as 1200.",
  number:
    "A number in digits, with a dot for decimals and no thousands separators, such as 12.5.",
  boolean: '"true" or "false".',
  date: "A date as YYYY-MM-DD. A date the source gives only in part, such as a month without a day or a day without a year, counts as not given: never add the missing parts.",
  datetime:
    'A date and time as YYYY-MM-DDTHH:MM:SS, then the UTC offset as +HH:MM or -HH:MM when the source states it, or names a time zone: for a time zone, the offset in force on that date, summer time included. A value the source gives only in part, such as a date without a time or a day without a year, counts as not given: never add the missing parts, except ":00" seconds when the source gives none.',
  time: "A time as HH:MM, 24-hour.",
  choice:
    "One of the listed values; empty when the source's value is none of them.",
  relation: "",
};

/** Kinds whose text is written in the record's language. */
const PROSE_KINDS = new Set<AiValueKind>(["string", "text", "html"]);

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Text as a Markdown code span, its fence longer than any run of backticks in it. */
function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  // Markdown drops one space from each end when both have one: pad then too.
  const hasEdgeTick = text.startsWith("`") || text.endsWith("`");
  const hasEdgeSpaces =
    text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "";
  return hasEdgeTick || hasEdgeSpaces
    ? `${fence} ${text} ${fence}`
    : `${fence}${text}${fence}`;
}

function constraintRules(field: AiContractField): string[] {
  const all: AiConstraints = field.constraints;
  // A relation's limits, but for the number of records, are the key's: the
  // AI writes an id from a list, or a name to search for.
  const isRelation = field.kind === "relation";
  const limits: AiConstraints = isRelation
    ? { minItems: all.minItems, maxItems: all.maxItems }
    : all;
  // Rich text is asked in Markdown, but the backend measures and matches
  // the HTML it becomes: the sanitizer checks patterns after converting.
  const isHtml = field.kind === "html";
  const length = (n: number) =>
    isHtml
      ? `${plural(n, "character")} once turned into HTML, tags included`
      : plural(n, "character");
  const rules: string[] = [];
  const add = (value: number | undefined, text: (n: number) => string) => {
    if (value !== undefined) rules.push(text(value));
  };
  // A minimum of zero is none.
  const positive = (n: number | undefined) =>
    n !== undefined && n > 0 ? n : undefined;
  const minLength = positive(limits.minLength);
  const minItems = positive(limits.minItems);
  add(minLength, (n) => `At least ${length(n)}.`);
  add(limits.maxLength, (n) => `At most ${length(n)}.`);
  add(limits.minimum, (n) => `At least ${n}.`);
  add(limits.maximum, (n) => `At most ${n}.`);
  add(limits.exclusiveMinimum, (n) => `Greater than ${n}.`);
  add(limits.exclusiveMaximum, (n) => `Less than ${n}.`);
  add(minItems, (n) => `At least ${plural(n, "value")}.`);
  add(limits.maxItems, (n) => `At most ${plural(n, "value")}.`);
  const patterns = isHtml ? [] : (limits.patterns ?? []);
  for (const pattern of patterns)
    rules.push(`Matches the regular expression ${codeSpan(pattern)}.`);
  // A minimum is the backend's, not a reason to make text or values up.
  const hasMinimum = minLength !== undefined || minItems !== undefined;
  if (hasMinimum)
    rules.push(
      "Never add words or values the source does not give to reach a minimum.",
    );
  return rules;
}

/** The label says more than the value: it is neither blank nor the value itself. */
function hasOwnLabel(choice: AiChoice): boolean {
  const label = choice.label.trim();
  return label !== "" && label !== String(choice.value).trim();
}

/** `"draft" (Draft), "live" (Published)`: the label only when it says more than the value. */
function listChoices(choices: readonly AiChoice[]): string {
  return choices
    .map((choice) => {
      const value = JSON.stringify(String(choice.value));
      return hasOwnLabel(choice) ? `${value} (${choice.label.trim()})` : value;
    })
    .join(", ");
}

/**
 * A sentence from a label or a help text: trimmed, with a full stop unless
 * it ends with punctuation already; `undefined` when it is blank.
 */
function sentence(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return /[.!?:;]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** What a link to another item of the answer holds, and which part wins. */
function linkRule(field: AiContractField): string {
  const target = JSON.stringify(field.linksTo);
  const subject = field.multiple
    ? `Links to the related records of type ${target}, one per record the source names`
    : `A link to the related record of type ${target}`;
  return `${subject}: "record" finds an existing record, "item" points to an item of this answer that describes it. Give both when both apply: Mapo links the existing record when it finds one, otherwise the item.`;
}

function kindRule(field: AiContractField): string {
  if (field.linksTo) return linkRule(field);
  if (field.relationMode === "choice")
    return field.multiple
      ? "The ids of the related records the source names, from the list; leave out a record that is not listed."
      : "The id of the related record, from the list; empty when the record the source names is not listed.";
  if (field.relationMode === "search")
    return field.multiple
      ? "The names of the related records as the source writes them: Mapo searches for each."
      : "The name of the related record as the source writes it: Mapo searches for it.";
  const isMultipleChoice = field.kind === "choice" && field.multiple;
  return isMultipleChoice
    ? "The values from the list that the source gives; leave out a value that is not listed."
    : KIND_RULES[field.kind];
}

function emptyRule(field: AiContractField): string {
  if (field.multiple) return "An empty list when the source gives none.";
  if (field.linksTo)
    return 'Both "record" and "item" empty ("") when the source does not give it.';
  return 'Empty ("") when the source does not give it.';
}

function describe(
  field: AiContractField,
  language: string | undefined,
): string {
  const parts: string[] = [field.label, field.description, field.hint].flatMap(
    (text) => sentence(text) ?? [],
  );
  parts.push(kindRule(field));

  // The schema lists the values already: the description repeats them only
  // when they are not there, or when a label says more than its value.
  const choices = field.choices ?? [];
  const hasLabels = choices.some(hasOwnLabel);
  const needsList = !field.choicesInSchema || hasLabels;
  if (choices.length && needsList)
    parts.push(`Values: ${listChoices(choices)}.`);
  parts.push(...constraintRules(field));

  // Only prose is translated: numbers, dates, links, choices and names to
  // search for stay as the source and the backend write them.
  const isTranslated =
    field.translatable && !!language && PROSE_KINDS.has(field.kind);
  if (isTranslated)
    parts.push(`Write it in the language with code "${language}".`);
  if (field.required)
    parts.push("The form needs it, but leave it empty rather than guess.");
  parts.push(emptyRule(field));
  return parts.join(" ");
}

// ─── Value schemas ───────────────────────────────────────────────────────────

/** One value of the field: a string, or one of its allowed strings. */
function elementSchema(field: AiContractField, withEmpty: boolean): JSONSchema {
  const allowed = allowedValues(field);
  if (!allowed) return { type: "string" };
  return { type: "string", enum: withEmpty ? ["", ...allowed] : allowed };
}

/** In an extraction, a relation that may point to another item of the answer. */
function linkedSchema(field: AiContractField): JSONSchema {
  const record =
    field.relationMode === "choice"
      ? "The id of the record, from the list; empty when it is not listed."
      : "The name of the record as the source writes it, for Mapo to search among the existing records; empty when the source gives no name.";
  return {
    type: "object",
    additionalProperties: false,
    required: ["record", "item"],
    properties: {
      // A link to a new item has no record yet: the record can be empty.
      record: { ...elementSchema(field, true), description: record },
      item: {
        type: "string",
        description: `The ref of another item of this answer, of type ${JSON.stringify(field.linksTo)}, that describes the same record; empty when no item does.`,
      },
    },
  };
}

function valueSchema(
  field: AiContractField,
  language: string | undefined,
): JSONSchema {
  const description = describe(field, language);
  const element = () =>
    field.linksTo ? linkedSchema(field) : elementSchema(field, !field.multiple);
  if (field.multiple) return { type: "array", items: element(), description };
  return { ...element(), description };
}

function valuesSchema(
  fields: readonly AiContractField[],
  language: string | undefined,
): JSONSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: fields.map((field) => field.wire),
    properties: Object.fromEntries(
      fields.map((field) => [field.wire, valueSchema(field, language)]),
    ),
  };
}

function evidenceSchema(
  fields: readonly AiContractField[],
  listsFields: boolean,
): JSONSchema {
  const wires = fields.map((field) => field.wire);
  return {
    type: "array",
    description:
      "For each value given, the words of the source it comes from. A value without a quote is checked by hand.",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["field", "quote", "where"],
      properties: {
        field: listsFields
          ? { type: "string", enum: wires }
          : {
              type: "string",
              description: `The name of the value's property, one of: ${wires.join(", ")}.`,
            },
        quote: {
          type: "string",
          description:
            "The exact words of the source that give the value, copied without changes.",
        },
        where: {
          type: "string",
          description:
            "Where the quote is, such as a page, a sheet or a section; empty when the source has no such parts.",
        },
      },
    },
  };
}

/** The `values` of an entity, and its `evidence` when asked. */
function entityProperties(
  entity: AiContractEntity,
  language: string | undefined,
  budget: EnumBudget,
): { properties: Record<string, JSONSchema>; required: string[] } {
  const listsFields = !budget.unlistedEvidence.has(entity);
  return {
    properties: {
      values: valuesSchema(entity.fields, language),
      ...(entity.evidence
        ? { evidence: evidenceSchema(entity.fields, listsFields) }
        : {}),
    },
    required: entity.evidence ? ["values", "evidence"] : ["values"],
  };
}

function fillSchema(
  entity: AiContractEntity,
  language: string | undefined,
  budget: EnumBudget,
): JSONSchema {
  const { properties, required } = entityProperties(entity, language, budget);
  return { type: "object", additionalProperties: false, required, properties };
}

function extractSchema(
  entities: readonly AiContractEntity[],
  language: string | undefined,
  budget: EnumBudget,
): JSONSchema {
  const items = entities.map((entity): JSONSchema => {
    const type = entity.type ?? "";
    const { properties, required } = entityProperties(entity, language, budget);
    return {
      type: "object",
      additionalProperties: false,
      required: ["type", "ref", ...required],
      properties: {
        type: { type: "string", enum: [type] },
        ref: {
          type: "string",
          description: `A short name for this item, unique in the answer, such as ${JSON.stringify(`${type}-1`)}. Other items use it to point to this one.`,
        },
        ...properties,
      },
    };
  });
  const [onlyItem] = items;
  const isSingle = items.length === 1 && onlyItem !== undefined;
  return {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        description:
          "One item per record the source describes, of the listed types. None when it describes none.",
        items: isSingle ? onlyItem : { anyOf: items },
      },
    },
  };
}

// ─── From sources to contract entities ───────────────────────────────────────

/** An endpoint as a relation field reaches it, in two parts. */
interface EndpointKey {
  /** The path: no origin, one slash between segments, `.` and `..` resolved. */
  path: string;
  /** The query's parameters, every one, sorted and encoded; `""` without a query. */
  query: string;
}

/** An entity of an extraction that relations may link to. */
interface LinkTarget extends EndpointKey {
  type: string;
}

/**
 * An endpoint as a relation field reaches it: `api/places`, `/api/places/`
 * and `http://host/api/places/` have one path; the fragment does not count.
 */
function endpointKey(endpoint: string): EndpointKey {
  const local = endpoint
    .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/, "")
    .replace(/#.*$/, "");
  const queryStart = local.indexOf("?");
  const path = queryStart < 0 ? local : local.slice(0, queryStart);
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  // Every pair counts, repeated names too, in one order and one encoding.
  const pairs: [string, string][] = [];
  if (queryStart >= 0)
    new URLSearchParams(local.slice(queryStart + 1)).forEach((value, name) =>
      pairs.push([name, value]),
    );
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  pairs.sort(
    ([nameA, valueA], [nameB, valueB]) =>
      order(nameA, nameB) || order(valueA, valueB),
  );
  const query = new URLSearchParams(pairs).toString();
  return { path: `/${segments.join("/")}`, query };
}

/**
 * The entity type a relation's endpoint links to: the entity at the same
 * path and query; otherwise the only one at the same path where one of the
 * two has no query, since a whole collection holds its filtered records.
 * None when two entities could be meant.
 */
function linkTargetOf(
  targets: readonly LinkTarget[],
  endpoint: string,
): string | undefined {
  const key = endpointKey(endpoint);
  const samePath = targets.filter((target) => target.path === key.path);
  const exact = samePath.find((target) => target.query === key.query);
  if (exact) return exact.type;
  const covering = samePath.filter((target) => !target.query || !key.query);
  const [only] = covering;
  return covering.length === 1 ? only?.type : undefined;
}

/** The records a source lists for a relation field: its own entries only. */
function relationRecords(source: AiContractSource, key: string): AiChoice[] {
  const lists = source.relationChoices;
  const isListed = !!lists && Object.hasOwn(lists, key);
  const records = isListed ? lists[key] : undefined;
  return Array.isArray(records) ? answerableChoices(records) : [];
}

/** The field as the contract asks for it, or `undefined` when there is nothing to answer with. */
function contractField(
  field: AiField,
  source: AiContractSource,
  taken: Set<string>,
  targets: readonly LinkTarget[],
): AiContractField | undefined {
  if (field.kind !== "relation") {
    const choices = field.choices ? answerableChoices(field.choices) : [];
    // A choice of "none" alone: `buildAiEntity()` skips it already.
    const hasNoChoice = field.kind === "choice" && !choices.length;
    if (hasNoChoice) return undefined;
    const draft: AiContractField = {
      ...field,
      wire: wireName(field.key, taken),
      ...(field.choices ? { choices } : {}),
      choicesInSchema: field.kind === "boolean" || choices.length > 0,
    };
    // A list too long for one `enum` goes to the description.
    const fits = enumSize(draft) <= MAX_PROPERTY_ENUM;
    return fits ? draft : { ...draft, choicesInSchema: false };
  }

  const target = field.endpoint
    ? linkTargetOf(targets, field.endpoint)
    : undefined;
  const records = relationRecords(source, field.key);
  const asChoice: AiContractField = {
    ...field,
    wire: wireName(field.key, taken),
    choices: records,
    choicesInSchema: true,
    relationMode: "choice",
    ...(target ? { linksTo: target } : {}),
  };
  // A short list of records becomes a choice; a long one, or none, a search.
  const isShortList =
    records.length > 0 && enumSize(asChoice) <= MAX_PROPERTY_ENUM;
  if (isShortList) return asChoice;
  const { choices: _choices, ...rest } = asChoice;
  return { ...rest, choicesInSchema: false, relationMode: "search" };
}

function contractEntity(
  source: AiContractSource,
  targets: readonly LinkTarget[],
): AiContractEntity {
  const taken = new Set<string>();
  const fields = source.entity.fields.flatMap((field) => {
    const asked = contractField(field, source, taken, targets);
    return asked ? [asked] : [];
  });
  return {
    ...(source.type ? { type: source.type } : {}),
    ...(source.label ? { label: source.label } : {}),
    ...(source.description ? { description: source.description } : {}),
    ...(source.endpoint ? { endpoint: source.endpoint } : {}),
    // Without fields there is nothing to quote, and no `enum` to name them.
    evidence: (source.evidence ?? true) && fields.length > 0,
    fields,
  };
}

// ─── The enum budget ─────────────────────────────────────────────────────────

/** What the budget took out of the schema, beyond the fields' own `choicesInSchema`. */
interface EnumBudget {
  /** Entities whose evidence names its fields as plain text instead of an `enum`. */
  unlistedEvidence: Set<AiContractEntity>;
}

/** A list the schema may hold as an `enum`, and how to move it out or back. */
interface EnumSite {
  values: number;
  characters: number;
  takeOut: () => void;
  putBack: () => void;
}

/** What the providers count in a schema. */
interface Census {
  properties: number;
  values: number;
  characters: number;
}

function characters(values: readonly string[]): number {
  return values.reduce((sum, value) => sum + value.length, 0);
}

/** Counts the properties, enum values and characters of names and values of a schema. */
function censusOf(schema: JSONSchema): Census {
  const census: Census = { properties: 0, values: 0, characters: 0 };
  const visit = (node: JSONSchema) => {
    const names = Object.keys(node.properties ?? {});
    census.properties += names.length;
    census.characters += characters(names);
    const values = (node.enum ?? []).map((value) =>
      typeof value === "string" ? value : JSON.stringify(value),
    );
    census.values += values.length;
    census.characters += characters(values);
    const children = [
      ...Object.values(node.properties ?? {}),
      ...(node.anyOf ?? []),
      ...(node.items ? [node.items] : []),
    ];
    for (const child of children) visit(child);
  };
  visit(schema);
  return census;
}

function isWithin(census: Census): boolean {
  return (
    census.properties <= MAX_PROPERTIES &&
    census.values <= MAX_ENUM_VALUES &&
    census.characters <= MAX_SCHEMA_CHARACTERS
  );
}

function tooLarge(census: Census): Error {
  return new Error(
    `The answer schema is too large for every provider: ${census.properties} properties (at most ${MAX_PROPERTIES}), ${census.values} enum values (at most ${MAX_ENUM_VALUES}), ${census.characters} characters of names and values (at most ${MAX_SCHEMA_CHARACTERS}).`,
  );
}

/**
 * The lists the budget may move: the names of the fields in the evidence,
 * which the sanitizer checks as well in text, and the lists of the values.
 * Evidence for more fields than one `enum` holds names them in text from
 * the start.
 */
function enumSites(
  entities: readonly AiContractEntity[],
  budget: EnumBudget,
): { evidence: EnumSite[]; values: EnumSite[] } {
  const sites = { evidence: [] as EnumSite[], values: [] as EnumSite[] };
  for (const entity of entities) {
    for (const field of entity.fields) {
      const allowed = allowedValues(field);
      if (!allowed) continue;
      sites.values.push({
        values: enumSize(field),
        characters: characters(allowed),
        takeOut: () => {
          field.choicesInSchema = false;
        },
        putBack: () => {
          field.choicesInSchema = true;
        },
      });
    }
    if (!entity.evidence) continue;
    const wires = entity.fields.map((field) => field.wire);
    const takeOut = () => budget.unlistedEvidence.add(entity);
    if (wires.length > MAX_PROPERTY_ENUM) takeOut();
    else
      sites.evidence.push({
        values: wires.length,
        characters: characters(wires),
        takeOut,
        putBack: () => budget.unlistedEvidence.delete(entity),
      });
  }
  return sites;
}

/**
 * The next list to move: the smallest one that brings the schema within
 * the limits alone, otherwise the largest by what is over.
 */
function nextSite(
  sites: readonly EnumSite[],
  census: Census,
): EnumSite | undefined {
  const overValues = census.values - MAX_ENUM_VALUES;
  const overCharacters = census.characters - MAX_SCHEMA_CHARACTERS;
  const closesAlone = (site: EnumSite) =>
    site.values >= overValues && site.characters >= overCharacters;
  const smallerFirst = (a: EnumSite, b: EnumSite) =>
    a.values - b.values || a.characters - b.characters;
  const byValues = overValues > 0;
  const largerFirst = (a: EnumSite, b: EnumSite) =>
    byValues
      ? b.values - a.values || b.characters - a.characters
      : b.characters - a.characters || b.values - a.values;
  // One pass, the first listed on a tie: a contract may hold thousands.
  let smallest: EnumSite | undefined;
  let largest: EnumSite | undefined;
  for (const site of sites) {
    const isSmallerCloser =
      closesAlone(site) && (!smallest || smallerFirst(site, smallest) < 0);
    if (isSmallerCloser) smallest = site;
    if (!largest || largerFirst(site, largest) < 0) largest = site;
  }
  return smallest ?? largest;
}

/**
 * Builds a schema within every provider's limits. Lists move to the
 * descriptions until it fits: the evidence's names of fields first, then
 * the lists of the values. A list moved early that the schema no longer
 * needs to lose comes back, the values' lists first. The fields'
 * `choicesInSchema` and the budget record the moves.
 *
 * @throws When the schema is still too large with every list moved: too
 *   many fields or entity types, or names too long.
 */
function fitSchema(
  entities: readonly AiContractEntity[],
  build: (budget: EnumBudget) => JSONSchema,
): JSONSchema {
  const budget: EnumBudget = { unlistedEvidence: new Set() };
  const sites = enumSites(entities, budget);
  const first = build(budget);
  const census = censusOf(first);
  // Moving a list takes out no property: with too many, refuse at once,
  // counting what would be left with every list moved.
  if (census.properties > MAX_PROPERTIES) {
    for (const site of [...sites.evidence, ...sites.values]) {
      census.values -= site.values;
      census.characters -= site.characters;
    }
    throw tooLarge(census);
  }

  const moveOut = (group: readonly EnumSite[]): EnumSite[] => {
    const left = [...group];
    const moved: EnumSite[] = [];
    while (!isWithin(census)) {
      const site = nextSite(left, census);
      if (!site) break;
      left.splice(left.indexOf(site), 1);
      site.takeOut();
      census.values -= site.values;
      census.characters -= site.characters;
      moved.push(site);
    }
    return moved;
  };
  const movedEvidence = moveOut(sites.evidence);
  const movedValues = moveOut(sites.values);
  if (!isWithin(census)) throw tooLarge(census);

  for (const site of [...movedValues, ...movedEvidence]) {
    const back = {
      ...census,
      values: census.values + site.values,
      characters: census.characters + site.characters,
    };
    if (!isWithin(back)) continue;
    site.putBack();
    Object.assign(census, back);
  }
  const hasMoved = movedEvidence.length + movedValues.length > 0;
  return hasMoved ? build(budget) : first;
}

// ─── Compiling ───────────────────────────────────────────────────────────────

/**
 * Compiles the contract that fills one record (Magic Fill). The answer is
 * `{ values, evidence }`: one property per field the AI may fill, named by
 * its `wire`, and the quotes of the source behind each value. `evidence` is
 * left out when the source turns it off or the entity has no field to fill.
 *
 * @param source The entity, its model and the records its relations may point to.
 * @param options `language` for translatable values.
 * @returns The contract, plain JSON: the browser sends it to the gateway.
 * @throws When the schema is too large for the providers even with every
 *   list in the descriptions: thousands of fields, or names too long.
 *
 * @example
 * const contract = compileFillContract({ entity: buildAiEntity({ schema, fields }) });
 */
export function compileFillContract(
  source: AiContractSource,
  options: CompileContractOptions = {},
): AiFillContract {
  const entity = contractEntity(source, []);
  const schema = fitSchema([entity], (budget) =>
    fillSchema(entity, options.language, budget),
  );
  return {
    version: AI_CONTRACT_FORMAT_VERSION,
    task: "fill",
    ...(options.language ? { language: options.language } : {}),
    entity,
    schema,
  };
}

/**
 * Compiles the contract that extracts every record a source describes, of
 * one or more entities (Import AI). The answer is `{ items }`: each item has
 * the entity `type`, a `ref` that other items can point to, its `values` and
 * its `evidence`. A relation whose endpoint is another entity of the contract
 * may point to an item of the same answer, so a new record and the records it
 * relates to arrive together.
 *
 * @param sources The entities, each with a unique `type` and, when given, a
 *   unique `endpoint`.
 * @param options `language` for translatable values.
 * @returns The contract, plain JSON: the browser sends it to the gateway.
 * @throws When an entity has no type, two share a type or an endpoint, or
 *   the schema is too large for the providers even with every list in the
 *   descriptions.
 *
 * @example
 * const contract = compileExtractContract([
 *   { type: "event", endpoint: "/api/events/", entity: events },
 *   { type: "place", endpoint: "/api/places/", entity: places },
 * ]);
 */
export function compileExtractContract(
  sources: readonly AiContractSource[],
  options: CompileContractOptions = {},
): AiExtractContract {
  const types = sources.map((source) => source.type);
  const hasEveryType = types.every((type) => !!type);
  if (!sources.length || !hasEveryType)
    throw new Error("An extract contract needs entities, each with a type.");
  const isUniqueType = new Set(types).size === types.length;
  if (!isUniqueType)
    throw new Error("Two entities of a contract share a type.");

  // Each endpoint names one entity, so a relation knows which items it may link to.
  const targets: LinkTarget[] = [];
  for (const source of sources) {
    if (!source.endpoint || !source.type) continue;
    const key = endpointKey(source.endpoint);
    const isShared = targets.some(
      (target) => target.path === key.path && target.query === key.query,
    );
    if (isShared)
      throw new Error("Two entities of a contract share an endpoint.");
    targets.push({ ...key, type: source.type });
  }

  const entities = sources.map((source) => contractEntity(source, targets));
  const schema = fitSchema(entities, (budget) =>
    extractSchema(entities, options.language, budget),
  );
  return {
    version: AI_CONTRACT_FORMAT_VERSION,
    task: "extract",
    ...(options.language ? { language: options.language } : {}),
    entities,
    schema,
  };
}
