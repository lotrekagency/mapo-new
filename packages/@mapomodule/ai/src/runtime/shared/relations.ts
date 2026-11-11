/**
 * The related records of a fill, as the browser finds them with the
 * operator's session. Before the call, the records of each relation the
 * form declares, when they are few: the AI then picks one by its id, from
 * a closed list. After the answer, each name the AI wrote instead, searched
 * in the relation's endpoint with `?search=`, as the form's own field
 * searches. A record is found when the search gives one, or when one alone
 * among several has the AI's very name; otherwise several match, or none.
 *
 * Pure: the backend is reached through `get`, which the caller passes. The
 * gateway never searches: it has no session of the operator's, and never
 * reaches the backend.
 */

import type { AiChoice } from "./entity";
import { isRecord } from "./guards";
import type {
  AiFieldOutcome,
  AiFieldOutcomes,
  AiRelationRef,
} from "./sanitize";

/** Records a relation lists for the AI to pick from; one with more is searched by name. */
export const MAPO_AI_RELATION_LIST_MAX = 50;

/** Records of a search the operator can pick in the field's mark; with more, in the field. */
export const MAPO_AI_RELATION_CANDIDATES_MAX = 5;

/**
 * Names one answer searches at most: a list of many items could otherwise
 * send as many requests. A name beyond them is not searched (`failed`).
 */
export const MAPO_AI_RELATION_SEARCH_MAX = 25;

/** Requests to the backend at once, while the records are listed or searched. */
const MAX_CONCURRENT_REQUESTS = 4;

/** Characters of a record's value or name the gateway takes in a list. */
const MAX_CHOICE_TEXT = 500;

/** Deepest nesting of lists and items looked through, as in an answer. */
const MAX_DEPTH = 16;

/** A relation field of the form, as its records are listed and searched. */
export interface MapoAiRelationField {
  /**
   * Its path in the record, as the answer names it, `*` standing for an
   * item of a list: `category`, `speakers.*.organisation`.
   */
  path: string;
  /** For a field of a templated item: the key of its template. */
  template?: string;
  /** Where its records are listed and searched, as the field's `attrs.endpoint`. */
  endpoint: string;
  /** The property of a record that names it: `name` by default, as the field's. */
  itemText: string;
  /** The property that tells records apart, and that the field saves with `returnObject: false`: `id` by default. */
  itemValue: string;
  /** The field saves the record itself (the default), or its `itemValue`. */
  returnObject: boolean;
  /** The field holds a list of records. */
  multiple: boolean;
}

/** A record the operator can pick for a name several records match. */
export interface MapoAiRelationCandidate {
  /** Its `itemValue`, which tells it apart. */
  id: AiChoice["value"];
  /** What the field saves: the record, or its `itemValue`. */
  value: unknown;
  /** Its name, the `itemText`. */
  label: string;
}

/**
 * A related record the AI named in a field's value, and what Mapo found
 * for it. The session keeps what became of it once its value is in.
 */
export interface MapoAiRelationMatch {
  /**
   * Where the AI named it in the field's value: `""` for the value itself,
   * `"2"` for the third of a list of records, `"1.organisation"` inside the
   * second item of a list.
   */
  at: string;
  /** The name the AI wrote, or the name of the record it picked from the list. */
  name: string;
  /**
   * What Mapo found: `found`, the record; `ambiguous`, several records,
   * none alone with the AI's name; `none`, no record, or a search that
   * failed (`failed`).
   */
  status: "found" | "ambiguous" | "none";
  /** For `found`: the record's `itemValue`. */
  id?: AiChoice["value"];
  /** For `found`: what the field saves, the record or its `itemValue`. */
  value?: unknown;
  /** For `found`: the record's name. */
  label?: string;
  /**
   * For `found`: the record's name is not the AI's. A quote of the AI's
   * name proves no record, so it never goes in by itself.
   */
  renamed?: boolean;
  /** For `ambiguous`: the records to pick from, when they are five at most. */
  candidates?: MapoAiRelationCandidate[];
  /** For `ambiguous`: how many records the search gave. */
  count?: number;
  /** For `none`: the search failed, so nothing says that no record matches. */
  failed?: boolean;
  /**
   * For `ambiguous`: the candidate the operator picked, by its place: the
   * record is then found ({@link effectiveMatch}). Restore forgets it.
   */
  choice?: number;
  /** The operator ignored the mark that asked to pick it. */
  ignored?: boolean;
  /**
   * Where the record goes in the form, once the item that holds it is in
   * the field: `blocks.4.article`. A record to pick there is marked there.
   */
  path?: string;
}

/** The records each relation lists, as {@link listMapoAiRelations} found them. */
export interface MapoAiRelationLists {
  /** By path: the records the AI picks from, as `relationChoices` of the request sends them. */
  choices: Record<string, AiChoice[]>;
  /** By path: the same records, as the endpoint lists them, to write them as the field saves them. */
  records: Record<string, unknown[]>;
}

/** What the relations need from the app. */
export interface MapoAiRelationDependencies {
  /**
   * Gets a path of the app's backend with the operator's session, and
   * resolves with the answer read as JSON, rejecting on an error status:
   * `$mapoFetch` in a Mapo app.
   */
  get(path: string, options: { signal?: AbortSignal }): Promise<unknown>;
}

/**
 * Gets paths of the backend a few at a time, with the call's signal. A
 * `get` that throws at once rejects like one that fails later, so the
 * operations never reject.
 */
function requester(
  dependencies: MapoAiRelationDependencies,
  signal: AbortSignal | undefined,
): (path: string) => Promise<unknown> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (path) => {
    while (active >= MAX_CONCURRENT_REQUESTS) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await Promise.resolve().then(() =>
        dependencies.get(path, { signal }),
      );
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

// ─── The form's relations ────────────────────────────────────────────────────

/**
 * The relation fields of a form: each `fks` or `m2m` field with an
 * `endpoint`, those inside the items of its lists included, by the path the
 * answer names them with (`speakers.*.organisation`). A field of another
 * type, even one the AI reads as a relation, is not here: its value is the
 * operator's to set.
 */
export function mapoAiRelationFields(
  descriptors: readonly unknown[],
): MapoAiRelationField[] {
  const found: MapoAiRelationField[] = [];
  const visit = (
    list: readonly unknown[],
    prefix: string,
    template: string | undefined,
    depth: number,
  ): void => {
    if (depth > MAX_DEPTH) return;
    for (const descriptor of list) {
      if (!isRecord(descriptor)) continue;
      const { key, type } = descriptor;
      const isKey = typeof key === "string" && key !== "";
      if (!isKey) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const relation = relationFieldOf(descriptor, path, template);
      if (relation) found.push(relation);
      if (type !== "repeater") continue;
      for (const [items, itemTemplate] of itemFieldsOf(descriptor)) {
        visit(items, `${path}.*`, itemTemplate, depth + 1);
      }
    }
  };
  visit(descriptors, "", undefined, 0);
  return found;
}

function relationFieldOf(
  descriptor: Record<string, unknown>,
  path: string,
  template: string | undefined,
): MapoAiRelationField | undefined {
  const { type } = descriptor;
  const isRelation = type === "fks" || type === "m2m";
  const attrs = isRecord(descriptor.attrs) ? descriptor.attrs : {};
  const { endpoint, itemText, itemValue, returnObject, multiple } = attrs;
  const isEndpoint = typeof endpoint === "string" && endpoint.trim() !== "";
  if (!isRelation || !isEndpoint) return undefined;
  const isText = typeof itemText === "string" && itemText !== "";
  const isValue = typeof itemValue === "string" && itemValue !== "";
  return {
    path,
    ...(template !== undefined ? { template } : {}),
    endpoint: endpoint.trim(),
    itemText: isText ? itemText : "name",
    itemValue: isValue ? itemValue : "id",
    returnObject: returnObject !== false,
    multiple: type === "m2m" || multiple === true,
  };
}

/** The fields of a repeater's items: its own, and each template's with its key. */
function itemFieldsOf(
  descriptor: Record<string, unknown>,
): [readonly unknown[], string | undefined][] {
  const lists: [readonly unknown[], string | undefined][] = [];
  if (Array.isArray(descriptor.fields))
    lists.push([descriptor.fields, undefined]);
  const attrs = isRecord(descriptor.attrs) ? descriptor.attrs : {};
  const templates = isRecord(attrs.templates) ? attrs.templates : {};
  for (const [key, declared] of Object.entries(templates)) {
    const fields = Array.isArray(declared)
      ? declared
      : isRecord(declared) && Array.isArray(declared.fields)
        ? declared.fields
        : undefined;
    if (fields) lists.push([fields, key]);
  }
  return lists;
}

// ─── Before the call: the records to pick from ───────────────────────────────

/**
 * Asks each relation's endpoint for its records, once per endpoint and with
 * the operator's session: those that come whole in one answer, at most
 * {@link MAPO_AI_RELATION_LIST_MAX}, become the records the AI picks from,
 * by the field's path. A relation whose records are more, come in pages,
 * cannot be read or cannot be written as a choice is left out: the AI
 * writes a name, which is searched after the answer. A path whose fields
 * disagree on the endpoint or on the record's properties (two templates of
 * a list) is left out too. Never rejects.
 *
 * @param skip Paths left out, such as those whose records the page gives.
 */
export async function listMapoAiRelations(
  fields: readonly MapoAiRelationField[],
  dependencies: MapoAiRelationDependencies,
  options: { signal?: AbortSignal; skip?: ReadonlySet<string> } = {},
): Promise<MapoAiRelationLists> {
  const lists: MapoAiRelationLists = { choices: {}, records: {} };
  const byPath = agreeingFields(fields);
  const request = requester(dependencies, options.signal);
  const asked = new Map<string, Promise<unknown[] | undefined>>();
  const ask = (endpoint: string) => {
    let pending = asked.get(endpoint);
    if (!pending) {
      pending = request(endpointPath(endpoint)).then(wholeListOf, () => {
        return undefined;
      });
      asked.set(endpoint, pending);
    }
    return pending;
  };
  const paths = [...byPath].filter(([path]) => !options.skip?.has(path));
  await Promise.all(
    paths.map(async ([path, field]) => {
      const records = await ask(field.endpoint);
      const isShort =
        records !== undefined &&
        records.length > 0 &&
        records.length <= MAPO_AI_RELATION_LIST_MAX;
      if (!isShort) return;
      const choices = choicesOf(records, field);
      if (!choices) return;
      lists.choices[path] = choices;
      lists.records[path] = records;
    }),
  );
  return lists;
}

/** One field per path, where every field at the path lists the same records the same way. */
function agreeingFields(
  fields: readonly MapoAiRelationField[],
): Map<string, MapoAiRelationField> {
  const byPath = new Map<string, MapoAiRelationField>();
  const disagree = new Set<string>();
  for (const field of fields) {
    const earlier = byPath.get(field.path);
    if (!earlier) {
      byPath.set(field.path, field);
      continue;
    }
    const isSameEndpoint = earlier.endpoint === field.endpoint;
    const isSameText = earlier.itemText === field.itemText;
    const isSameValue = earlier.itemValue === field.itemValue;
    if (!isSameEndpoint || !isSameText || !isSameValue)
      disagree.add(field.path);
  }
  for (const path of disagree) byPath.delete(path);
  return byPath;
}

/**
 * The records an endpoint answers, when the answer holds them all: a plain
 * list, or a page of Django REST Framework with no next page.
 */
function wholeListOf(answer: unknown): unknown[] | undefined {
  if (Array.isArray(answer)) return answer;
  if (!isRecord(answer) || !Array.isArray(answer.results)) return undefined;
  const { results, next, count } = answer;
  const hasNext = typeof next === "string" && next !== "";
  const isCounted = typeof count === "number" && count > results.length;
  return hasNext || isCounted ? undefined : results;
}

/** The records as the AI picks them; `undefined` when one of them cannot be written as a choice. */
function choicesOf(
  records: readonly unknown[],
  field: MapoAiRelationField,
): AiChoice[] | undefined {
  const choices: AiChoice[] = [];
  for (const record of records) {
    const id = idOf(record, field);
    const label = isRecord(record) ? labelOf(record, field) : "";
    const isWritable = id !== undefined && String(id).length <= MAX_CHOICE_TEXT;
    if (!isWritable || !label) return undefined;
    choices.push({ value: id, label: label.slice(0, MAX_CHOICE_TEXT) });
  }
  return choices;
}

// ─── After the answer: the records the AI named ──────────────────────────────

/** A related record named at a place of a field's value. */
interface Named {
  at: string;
  /** The path of its field, `*` for an item: `blocks.*.article`. */
  path: string;
  /** The template of the item that holds it. */
  template?: string;
  ref: AiRelationRef;
}

/**
 * Finds the record of each relation an answer names, by the answer's key
 * of the field: a record picked from a list by its id, among the records
 * {@link listMapoAiRelations} gave or the page's own `choices`; a name,
 * searched in its field's endpoint. Each name is searched once. A key
 * whose value names a record of a field the form does not describe as a
 * relation is left out, so its value stays the operator's to set. Never
 * rejects: a search that fails finds nothing (`failed`).
 *
 * @param choices The records the page gives, by path, as `relationChoices`.
 */
export async function resolveMapoAiRelations(
  outcomes: AiFieldOutcomes,
  fields: readonly MapoAiRelationField[],
  lists: MapoAiRelationLists,
  dependencies: MapoAiRelationDependencies,
  options: {
    signal?: AbortSignal;
    choices?: Readonly<Record<string, readonly AiChoice[]>>;
  } = {},
): Promise<Record<string, MapoAiRelationMatch[]>> {
  const request = requester(dependencies, options.signal);
  const searched = new Map<string, Promise<SearchResults | undefined>>();
  const search = (field: MapoAiRelationField, name: string) => {
    const key = `${field.endpoint}\u0000${name}`;
    let pending = searched.get(key);
    if (!pending) {
      // Beyond the bound a name is not searched: it says so (`failed`).
      const isWithin = searched.size < MAPO_AI_RELATION_SEARCH_MAX;
      pending = isWithin
        ? request(searchPath(field.endpoint, name)).then(
            searchResultsOf,
            () => {
              return undefined;
            },
          )
        : Promise.resolve(undefined);
      searched.set(key, pending);
    }
    return pending;
  };
  const resolved = new Map<string, MapoAiRelationMatch[]>();
  await Promise.all(
    Object.entries(outcomes).map(async ([key, outcome]) => {
      const named = namedIn(outcome, key);
      if (!named.length) return;
      const matches: MapoAiRelationMatch[] = [];
      for (const one of named) {
        const field = fieldFor(fields, one);
        // A record of a field the form does not describe: the whole value
        // stays the operator's.
        if (!field) return;
        matches.push(await matchOf(one, field, lists, options.choices, search));
      }
      resolved.set(key, matches);
    }),
  );
  return Object.fromEntries(resolved);
}

/** The related records a value names, with where it names them. */
function namedIn(outcome: AiFieldOutcome, key: string): Named[] {
  if (outcome.status !== "filled") return [];
  const named: Named[] = [];
  const visit = (
    value: unknown,
    path: string,
    at: string,
    template: string | undefined,
    depth: number,
  ): void => {
    if (depth > MAX_DEPTH) return;
    const join = (inner: string) => (at ? `${at}.${inner}` : inner);
    if (isRelationRef(value)) {
      named.push({ at, path, ...(template ? { template } : {}), ref: value });
      return;
    }
    if (Array.isArray(value)) {
      const isItems = value.length > 0 && value.every(isRecordValue);
      value.forEach((one, index) => {
        const itemTemplate = isItems ? templateOf(one) : template;
        const inner = isItems ? `${path}.*` : path;
        visit(one, inner, join(String(index)), itemTemplate, depth + 1);
      });
      return;
    }
    if (!isRecordValue(value)) return;
    for (const [name, inner] of Object.entries(value)) {
      if (name === "_template") continue;
      visit(inner, `${path}.${name}`, join(name), template, depth + 1);
    }
  };
  visit(outcome.value, key, "", undefined, 0);
  return named;
}

/** An item's or an object's value: a record that is no related record. */
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !isRelationRef(value);
}

function templateOf(item: unknown): string | undefined {
  const template = isRecord(item) ? item._template : undefined;
  return typeof template === "string" ? template : undefined;
}

/** `{ id }`, `{ search, item? }` or `{ item }`, as the sanitizer writes a related record. */
export function isRelationRef(value: unknown): value is AiRelationRef {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  const isOnly = (key: string) => keys.length === 1 && keys[0] === key;
  if (isOnly("id")) return isScalar(value.id);
  if (isOnly("item")) return typeof value.item === "string";
  const isSearch = typeof value.search === "string";
  const isItem = value.item === undefined || typeof value.item === "string";
  const hasOthers = keys.some((key) => key !== "search" && key !== "item");
  return isSearch && isItem && !hasOthers;
}

/** The relation field of a named record: its template's, else the one at its path. */
function fieldFor(
  fields: readonly MapoAiRelationField[],
  named: Named,
): MapoAiRelationField | undefined {
  const atPath = fields.filter((field) => field.path === named.path);
  const ofTemplate = atPath.find(
    (field) =>
      named.template !== undefined && field.template === named.template,
  );
  if (ofTemplate) return ofTemplate;
  const [only] = atPath;
  return atPath.length === 1 ? only : undefined;
}

async function matchOf(
  named: Named,
  field: MapoAiRelationField,
  lists: MapoAiRelationLists,
  pageChoices: Readonly<Record<string, readonly AiChoice[]>> | undefined,
  search: (
    field: MapoAiRelationField,
    name: string,
  ) => Promise<SearchResults | undefined>,
): Promise<MapoAiRelationMatch> {
  const { at, ref } = named;
  if ("id" in ref) {
    return pickedMatch(at, ref.id, named.path, field, lists, pageChoices);
  }
  // A link to an item of the same answer is an extraction's: a form has none.
  if (!("search" in ref)) return { at, name: ref.item, status: "none" };
  const name = ref.search;
  const results = await search(field, name);
  if (!results) return { at, name, status: "none", failed: true };
  return searchedMatch(at, name, results, field);
}

/** A record the AI picked by its id: the endpoint's, or the page's choice. */
function pickedMatch(
  at: string,
  id: AiChoice["value"],
  path: string,
  field: MapoAiRelationField,
  lists: MapoAiRelationLists,
  pageChoices: Readonly<Record<string, readonly AiChoice[]>> | undefined,
): MapoAiRelationMatch {
  const records = Object.hasOwn(lists.records, path) ? lists.records[path] : [];
  const record = records?.find((one) => sameId(idOf(one, field), id));
  if (isRecord(record)) {
    const label = labelOf(record, field);
    return { at, name: label, status: "found", ...foundOf(record, field) };
  }
  const listed =
    pageChoices && Object.hasOwn(pageChoices, path) ? pageChoices[path] : [];
  const choice = listed?.find((one) => sameId(one.value, id));
  if (!choice) return { at, name: String(id), status: "none" };
  // The page lists only the id and the name: the record the field saves
  // is made of those two.
  const value = field.returnObject
    ? { [field.itemValue]: choice.value, [field.itemText]: choice.label }
    : choice.value;
  return {
    at,
    name: choice.label,
    status: "found",
    id: choice.value,
    value,
    label: choice.label,
  };
}

/**
 * A searched name's record: the only result, or the only one with that
 * very name among several; several otherwise, or none.
 */
function searchedMatch(
  at: string,
  name: string,
  results: SearchResults,
  field: MapoAiRelationField,
): MapoAiRelationMatch {
  const records = results.records.filter(
    (one): one is Record<string, unknown> =>
      isRecord(one) && idOf(one, field) !== undefined,
  );
  const same = records.filter((one) => isSameName(labelOf(one, field), name));
  const [only] = records;
  const [named] = same;
  // The very name is looked for in the first page of results only: an
  // endpoint that does not search answers its first page, where the name
  // may still be; a second record with that name on a later page goes
  // unseen.
  if (same.length === 1 && named) {
    return { at, name, status: "found", ...foundOf(named, field) };
  }
  const isAlone = records.length === 1 && results.count <= 1;
  if (isAlone && only) {
    return {
      at,
      name,
      status: "found",
      ...foundOf(only, field),
      renamed: true,
    };
  }
  if (!records.length) return { at, name, status: "none" };
  // A page of results says how many there are in all.
  const count = Math.max(records.length, results.count);
  const isFew = count <= MAPO_AI_RELATION_CANDIDATES_MAX;
  return {
    at,
    name,
    status: "ambiguous",
    count,
    ...(isFew
      ? { candidates: records.map((record) => candidateOf(record, field)) }
      : {}),
  };
}

function foundOf(
  record: Record<string, unknown>,
  field: MapoAiRelationField,
): Pick<MapoAiRelationMatch, "id" | "value" | "label"> {
  const candidate = candidateOf(record, field);
  return { id: candidate.id, value: candidate.value, label: candidate.label };
}

function candidateOf(
  record: Record<string, unknown>,
  field: MapoAiRelationField,
): MapoAiRelationCandidate {
  const id = idOf(record, field) ?? "";
  return {
    id,
    value: field.returnObject ? record : id,
    label: labelOf(record, field) || String(id),
  };
}

/** What a search answered: its records, and how many there are in all. */
interface SearchResults {
  records: readonly unknown[];
  /** The `count` of a page of results, else how many records came. */
  count: number;
}

/** The records of a search's answer: a plain list, or a page of Django REST Framework. */
function searchResultsOf(answer: unknown): SearchResults | undefined {
  if (Array.isArray(answer)) return { records: answer, count: answer.length };
  if (!isRecord(answer) || !Array.isArray(answer.results)) return undefined;
  const { results, count } = answer;
  const isCount = typeof count === "number" && Number.isSafeInteger(count);
  return {
    records: results,
    count: isCount ? Math.max(count, results.length) : results.length,
  };
}

// ─── The value the field takes ───────────────────────────────────────────────

/**
 * A match as it stands: one whose candidate the operator picked is that
 * record, found.
 */
export function effectiveMatch(
  match: MapoAiRelationMatch,
): MapoAiRelationMatch {
  const picked =
    match.choice !== undefined ? match.candidates?.[match.choice] : undefined;
  if (match.status !== "ambiguous" || !picked) return match;
  return {
    ...match,
    status: "found",
    id: picked.id,
    value: picked.value,
    label: picked.label,
  };
}

/** A match whose record the field can take with no one's word: found, with the AI's own name. */
export function isExactMatch(match: MapoAiRelationMatch): boolean {
  const current = effectiveMatch(match);
  return current.status === "found" && current.renamed !== true;
}

/**
 * Every record a value names has its match, and each was found with the
 * AI's own name, or picked by the operator: the value can go in as it is,
 * by itself when verified.
 */
export function isRelationResolved(
  matches: readonly MapoAiRelationMatch[] | undefined,
): boolean {
  if (!matches?.length) return false;
  return matches.every(isExactMatch);
}

/** Some record a value names was found, with the AI's name or another, or picked. */
export function hasFoundRelation(
  matches: readonly MapoAiRelationMatch[] | undefined,
): boolean {
  return (
    matches?.some((match) => effectiveMatch(match).status === "found") ?? false
  );
}

/**
 * A record's id as a field holds it: its `itemValue` when the field holds
 * the record, the value itself when it holds the id.
 */
export function relationIdOf(
  value: unknown,
  itemValue: string,
): AiChoice["value"] | undefined {
  const id = isRecord(value) ? value[itemValue] : value;
  return isScalar(id) && id !== "" ? id : undefined;
}

/** A field's value holds the record of this id: it, or one of its records. */
export function holdsRelationId(
  held: unknown,
  id: AiChoice["value"],
  itemValue: string,
): boolean {
  const values: readonly unknown[] = Array.isArray(held) ? held : [held];
  return values.some((one) => sameId(relationIdOf(one, itemValue), id));
}

/**
 * The value a field takes from the AI's, each related record as the field
 * saves it: a record found (or picked by the operator) in its place; a
 * record not found left out of a list of records, and `null` for one alone
 * inside an item. `undefined` when the value itself is a record not found.
 *
 * @param withRenamed A record found under another name goes in too: the
 *   operator saw both names. Default `true`.
 */
export function relationValueOf(
  value: unknown,
  matches: readonly MapoAiRelationMatch[],
  withRenamed = true,
): unknown {
  const byAt = new Map(
    matches.map((match) => [match.at, effectiveMatch(match)]),
  );
  const usable = (match: MapoAiRelationMatch | undefined) =>
    match?.status === "found" && (withRenamed || match.renamed !== true);
  const visit = (current: unknown, at: string, depth: number): unknown => {
    if (depth > MAX_DEPTH) return undefined;
    const join = (inner: string) => (at ? `${at}.${inner}` : inner);
    if (isRelationRef(current)) {
      const match = byAt.get(at);
      return usable(match) ? match?.value : undefined;
    }
    if (Array.isArray(current)) {
      const isRecords = current.some(isRelationRef);
      const mapped = current.map((one, index) =>
        visit(one, join(String(index)), depth + 1),
      );
      // A list of records keeps those found; a list of items keeps each.
      return isRecords ? mapped.filter((one) => one !== undefined) : mapped;
    }
    if (!isRecordValue(current)) return current;
    const entries = Object.entries(current).map(([name, inner]) => {
      const taken = visit(inner, join(name), depth + 1);
      // A record alone inside an item, not found: the item holds none.
      return [name, taken === undefined && isRelationRef(inner) ? null : taken];
    });
    return Object.fromEntries(entries);
  };
  return visit(value, "", 0);
}

// ─── Reading records ─────────────────────────────────────────────────────────

/** A record's `itemValue`, when it is one a choice can hold. */
function idOf(
  record: unknown,
  field: MapoAiRelationField,
): AiChoice["value"] | undefined {
  const value = isRecord(record) ? record[field.itemValue] : undefined;
  return isScalar(value) && value !== "" ? value : undefined;
}

/** A record's name, its `itemText`, as text. */
function labelOf(
  record: Record<string, unknown>,
  field: MapoAiRelationField,
): string {
  const text = record[field.itemText];
  const isText = typeof text === "string";
  const isNumber = typeof text === "number" && Number.isFinite(text);
  return isText || isNumber ? String(text).trim() : "";
}

/** A value a choice can hold: a text, a finite number or a boolean. */
export function isScalar(value: unknown): value is AiChoice["value"] {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  return typeof value === "string" || typeof value === "boolean" || isNumber;
}

/** Two ids as the backend compares them: `1` and `"1"` are one record. */
export function sameId(one: unknown, other: unknown): boolean {
  return isScalar(one) && isScalar(other) && String(one) === String(other);
}

/** Two names that are the same but for letter case, accents and spaces. */
export function isSameName(one: string, other: string): boolean {
  const plain = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const left = plain(one);
  return left !== "" && left === plain(other);
}

/** An endpoint as the form's relation field calls it: from the app's root, unless it is a whole address. */
function endpointPath(endpoint: string): string {
  const isRooted = endpoint.startsWith("/") || /^https?:\/\//i.test(endpoint);
  return isRooted ? endpoint : `/${endpoint}`;
}

/** The search of a name in an endpoint, as the form's relation field searches: `?search=`. */
export function searchPath(endpoint: string, name: string): string {
  const path = endpointPath(endpoint);
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}search=${encodeURIComponent(name)}`;
}
