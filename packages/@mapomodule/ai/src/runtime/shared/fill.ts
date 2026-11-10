/**
 * Filling a form through the gateway, as the browser does it: the request
 * of `run` built from the form's two descriptions, the answer read as
 * outside data, and what becomes of each field's outcome in the form.
 * `useMapoAiFill()` runs these steps on a detail form; here they are pure,
 * their dependencies passed in, so they run the same without a UI.
 *
 * What goes into the form by itself: a value a quote of the source
 * verifies, on a field that is empty. Anything else waits for the
 * operator: a value no quote proves, or one that would replace what the
 * form holds; a related record, which the form cannot take before someone
 * finds it; a value the gateway discarded, shown with its reason and never
 * written.
 */

import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import type { AnyFieldDescriptor } from "@mapomodule/form/types";
import type { JSONSchema } from "@mapomodule/utils";
import { MAPO_AI_GATEWAY_PATH } from "./gateway";
import type {
  MapoAiFillRequest,
  MapoAiRunEntity,
  MapoAiRunResponse,
  MapoAiSourcePart,
  MapoAiUsage,
} from "./gateway";
import { isRecord } from "./guards";
import type {
  AiAnswerWarning,
  AiCoordinates,
  AiDiscardReason,
  AiDroppedValue,
  AiFieldOutcome,
  AiFieldOutcomes,
  AiFillResult,
  AiItemOutcome,
  AiItemValue,
  AiQuote,
  AiRelationRef,
  AiScalar,
  AiSingleValue,
  AiValue,
} from "./sanitize";

// ─── The request ─────────────────────────────────────────────────────────────

/** What the AI should know about the record, besides its two descriptions. */
export type MapoAiFillEntity = Pick<
  MapoAiRunEntity,
  "label" | "description" | "model" | "exclude" | "relationChoices" | "evidence"
>;

/** What a fill request is built from. */
export interface MapoAiFillInput<T = Record<string, unknown>> {
  /** The form's fields, the sidebar's included. */
  fields: readonly AnyFieldDescriptor<T>[];
  /** The backend's schema of the record, in Mapo's dialect; none when left out. */
  schema?: JSONSchema;
  /** The source: a text, or its parts. */
  source: string | readonly MapoAiSourcePart[];
  /** The record exists: the gateway asks `change_` on its model, not `add_`. */
  existing?: boolean;
  /** The language the form's translatable values are written in, such as `it`. */
  language?: string;
  /** The operator's own instructions for this source. */
  instructions?: string;
  /** The provider and the model to call, among those `status` lists. */
  provider?: { id?: string; model?: string };
  /** What the AI should know about the record. */
  entity?: MapoAiFillEntity;
}

/**
 * The body of `run` that fills the record the input describes: the form's
 * fields as `fieldsToJsonSchema()` writes them, and the backend's schema
 * when there is one. Blank instructions are left out.
 */
export function mapoAiFillRequest<T>(
  input: MapoAiFillInput<T>,
): MapoAiFillRequest {
  const parts: MapoAiSourcePart[] =
    typeof input.source === "string"
      ? [{ kind: "text", text: input.source }]
      : input.source.map((part) => ({ ...part }));
  const instructions = input.instructions?.trim();
  const entity: MapoAiRunEntity = {
    ...entityFacts(input.entity),
    fields: fieldsToJsonSchema(input.fields),
  };
  if (input.schema) entity.schema = input.schema;
  const request: MapoAiFillRequest = {
    task: "fill",
    entity,
    existing: input.existing === true,
    parts,
  };
  if (input.language) request.language = input.language;
  if (instructions) request.instructions = instructions;
  if (input.provider) request.provider = { ...input.provider };
  return request;
}

/** The facts of an entity the input gives, and nothing else. */
function entityFacts(entity: MapoAiFillEntity = {}): MapoAiFillEntity {
  const facts: MapoAiFillEntity = {};
  if (entity.label !== undefined) facts.label = entity.label;
  if (entity.description !== undefined) facts.description = entity.description;
  if (entity.model !== undefined) facts.model = entity.model;
  if (entity.exclude !== undefined) facts.exclude = [...entity.exclude];
  if (entity.relationChoices !== undefined)
    facts.relationChoices = entity.relationChoices;
  if (entity.evidence !== undefined) facts.evidence = entity.evidence;
  return facts;
}

// ─── The answer ──────────────────────────────────────────────────────────────

/** The answer of `run` to a fill request: what the AI proposes, or its refusal. */
export type MapoAiFillResponse =
  | Extract<MapoAiRunResponse, { task: "fill"; status: "answered" }>
  | (Extract<MapoAiRunResponse, { status: "refused" }> & { task: "fill" });

/** Deepest nesting of lists read in an answer; the contract allows less. */
const MAX_DEPTH = 16;

const DISCARD_REASONS: ReadonlySet<string> = new Set<AiDiscardReason>([
  "format",
  "not-listed",
  "too-short",
  "too-long",
  "too-low",
  "too-high",
  "step",
  "pattern",
  "too-many-values",
]);

/**
 * The answer of `run` to a fill request, read as outside data: the server
 * may run another version of the gateway, or a backend its own. An outcome
 * that cannot be read is left out, so nothing of it reaches the form;
 * `undefined` when the answer is no fill answer at all.
 */
export function readMapoAiFillResponse(
  value: unknown,
): MapoAiFillResponse | undefined {
  if (!isRecord(value)) return undefined;
  const isFill = value.task === "fill";
  const provider = providerOf(value.provider);
  const usage = usageOf(value.usage);
  const prompt = value.prompt;
  const isPrompt = typeof prompt === "number";
  if (!isFill || !provider || !usage || !isPrompt) return undefined;
  const base = { task: "fill" as const, provider, prompt, usage };
  if (value.status === "refused") {
    const refusal = value.refusal;
    if (typeof refusal !== "string") return undefined;
    return { ...base, status: "refused", refusal };
  }
  if (value.status !== "answered") return undefined;
  const result = fillResultOf(value.result);
  return result ? { ...base, status: "answered", result } : undefined;
}

function providerOf(value: unknown): { id: string; model: string } | undefined {
  if (!isRecord(value)) return undefined;
  const { id, model } = value;
  const isId = typeof id === "string";
  const isModel = typeof model === "string";
  return isId && isModel ? { id, model } : undefined;
}

function usageOf(value: unknown): MapoAiUsage | undefined {
  if (!isRecord(value)) return undefined;
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } =
    value;
  const isInput = typeof inputTokens === "number";
  const isOutput = typeof outputTokens === "number";
  if (!isInput || !isOutput) return undefined;
  return {
    inputTokens,
    outputTokens,
    ...(typeof cacheReadTokens === "number" ? { cacheReadTokens } : {}),
    ...(typeof cacheWriteTokens === "number" ? { cacheWriteTokens } : {}),
  };
}

function fillResultOf(value: unknown): AiFillResult | undefined {
  if (!isRecord(value)) return undefined;
  const { readable } = value;
  const fields = outcomesOf(value.fields, 0);
  if (typeof readable !== "boolean" || !fields) return undefined;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter(isWarning)
    : [];
  return { readable, fields, warnings };
}

/** The outcomes of a record or an item, by key; those it cannot read left out. */
function outcomesOf(
  value: unknown,
  depth: number,
): AiFieldOutcomes | undefined {
  if (!isRecord(value) || depth > MAX_DEPTH) return undefined;
  // A map, so a key such as `__proto__` stays data.
  const outcomes = new Map<string, AiFieldOutcome>();
  for (const [key, raw] of Object.entries(value)) {
    const outcome = outcomeOf(raw, depth);
    if (outcome) outcomes.set(key, outcome);
  }
  return Object.fromEntries(outcomes);
}

function outcomeOf(value: unknown, depth: number): AiFieldOutcome | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === "empty") return { status: "empty" };
  if (value.status === "filled") return filledOf(value, depth);
  if (value.status !== "discarded") return undefined;
  const { reason, proposed } = value;
  const quotes = quotesOf(value.quotes);
  const isReason = typeof reason === "string" && DISCARD_REASONS.has(reason);
  if (!isReason || !quotes) return undefined;
  return {
    status: "discarded",
    reason: discardReason(reason),
    proposed,
    quotes,
  };
}

function filledOf(
  value: Record<string, unknown>,
  depth: number,
): AiFieldOutcome | undefined {
  const written = value.value;
  const { verified } = value;
  const quotes = quotesOf(value.quotes);
  const isWritten = isAiValue(written, depth);
  const isVerified = typeof verified === "boolean";
  if (!isWritten || !isVerified || !quotes) return undefined;
  const outcome: AiFieldOutcome = {
    status: "filled",
    value: written,
    verified,
    quotes,
  };
  if (value.items !== undefined) {
    const items = itemsOf(value.items, depth + 1);
    if (!items) return undefined;
    outcome.items = items;
  }
  if (value.dropped !== undefined) {
    const dropped = droppedOf(value.dropped);
    if (!dropped) return undefined;
    outcome.dropped = dropped;
  }
  if (value.tooFew === true) outcome.tooFew = true;
  // A list of items comes with the outcome of each item, which says what
  // the item holds: without them, nothing tells a related record inside.
  const isItemList = Array.isArray(written) && !written.every(isSingle);
  const itemCount = outcome.items?.length;
  if (isItemList && itemCount !== written.length) return undefined;
  return outcome;
}

function itemsOf(value: unknown, depth: number): AiItemOutcome[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: AiItemOutcome[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    const fields = outcomesOf(raw.fields, depth);
    const { verified, template } = raw;
    const isVerified = typeof verified === "boolean";
    const isTemplate = template === undefined || typeof template === "string";
    if (!fields || !isVerified || !isTemplate) return undefined;
    items.push(
      template === undefined
        ? { fields, verified }
        : { template, fields, verified },
    );
  }
  return items;
}

function droppedOf(value: unknown): AiDroppedValue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const dropped: AiDroppedValue[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    const { reason } = raw;
    const isReason = typeof reason === "string" && DISCARD_REASONS.has(reason);
    if (!isReason) return undefined;
    dropped.push({ proposed: raw.proposed, reason: discardReason(reason) });
  }
  return dropped;
}

function quotesOf(value: unknown): AiQuote[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const quotes: AiQuote[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    const { quote, where, found } = raw;
    const isQuote = typeof quote === "string";
    const isWhere = typeof where === "string";
    const isFound = typeof found === "boolean";
    if (!isQuote || !isWhere || !isFound) return undefined;
    quotes.push({ quote, where, found });
  }
  return quotes;
}

function discardReason(reason: string): AiDiscardReason {
  switch (reason) {
    case "not-listed":
    case "too-short":
    case "too-long":
    case "too-low":
    case "too-high":
    case "step":
    case "pattern":
    case "too-many-values":
      return reason;
    default:
      return "format";
  }
}

function isWarning(value: unknown): value is AiAnswerWarning {
  if (!isRecord(value)) return false;
  const { kind } = value;
  const isPath = typeof value.path === "string";
  const isKey = typeof value.key === "string";
  const isPattern = typeof value.pattern === "string";
  switch (kind) {
    case "unexpected-shape":
    case "unknown-property":
      return isPath;
    case "unknown-field":
      return isPath && typeof value.field === "string";
    case "unknown-type":
      return isPath && typeof value.type === "string";
    case "repeated-ref":
      return isPath && typeof value.ref === "string";
    case "unknown-item":
      return isPath && typeof value.item === "string";
    case "unreadable-pattern":
    case "unchecked-pattern":
      return isKey && isPattern;
    default:
      return false;
  }
}

function isScalar(value: unknown): value is AiScalar {
  const isText = typeof value === "string";
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const isBoolean = typeof value === "boolean";
  return isText || isNumber || isBoolean;
}

/** `{ id }`, `{ search, item? }` or `{ item }`: a related record, as the answer names it. */
function isRelationRef(value: unknown): value is AiRelationRef {
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

function isCoordinates(value: unknown): value is AiCoordinates {
  if (!isRecord(value)) return false;
  const { lat, lng } = value;
  const isLat = typeof lat === "number" && Number.isFinite(lat);
  const isLng = typeof lng === "number" && Number.isFinite(lng);
  const hasTwo = Object.keys(value).length === 2;
  return isLat && isLng && hasTwo;
}

function isSingle(value: unknown): value is AiSingleValue {
  return isScalar(value) || isRelationRef(value) || isCoordinates(value);
}

function isItemValue(value: unknown, depth: number): value is AiItemValue {
  if (!isRecord(value) || depth > MAX_DEPTH) return false;
  return Object.values(value).every(
    (inner) => isAiValue(inner, depth + 1) || isItemValue(inner, depth + 1),
  );
}

function isAiValue(value: unknown, depth: number): value is AiValue {
  if (!Array.isArray(value)) return isSingle(value);
  const isSingles = value.every(isSingle);
  const isItems = value.every((item) => isItemValue(item, depth + 1));
  return isSingles || isItems;
}

// ─── What becomes of each field ──────────────────────────────────────────────

/**
 * What becomes of a field's outcome in the form:
 * - `apply`: it goes in by itself: a value a quote verifies, on an empty field;
 * - `confirm`: it waits for the operator: no quote proves it, or it would
 *   replace the value the form holds;
 * - `manual`: the form cannot take it as it is: a related record, which
 *   someone has to find;
 * - `discard`: it broke a rule of its field, and is never written;
 * - `empty`: the source does not give it.
 */
export type MapoAiFillAction =
  | "apply"
  | "confirm"
  | "manual"
  | "discard"
  | "empty";

/**
 * What the operator did with a field the AI gave a value for: kept the
 * AI's value (Keep), changed the field, or ignored the mark. A kept or
 * changed value is the operator's: undo leaves it.
 */
export type MapoAiFillReview = "kept" | "edited" | "ignored";

/** One field of the answer, and what becomes of it in the form. */
export interface MapoAiFillEntry {
  /** The field's key, as the answer names it: `title`, `seo.title`. */
  key: string;
  /** The path of its value in the model: `translations.it.title` for a translatable field. */
  path: string;
  action: MapoAiFillAction;
  /** The form holds a value at the path, which this one would replace. */
  replaces: boolean;
  /** The form shows the field; a hidden one never takes a value by itself. */
  shown: boolean;
  /** The outcome, as `run` answered it. */
  outcome: AiFieldOutcome;
}

/** The form an answer is applied to, as the plan reads it. */
export interface MapoAiFillForm {
  /** The path of a field's value in the model; `undefined` for a key the form does not have. */
  pathOf(key: string): string | undefined;
  /** The value at a path of the model. */
  read(path: string): unknown;
  /**
   * Every path a value of the key is written to, as the form writes it:
   * the field's key in each language for a `synci18n` field. Default: none
   * besides `pathOf(key)`. The field holds a value when any of these, or
   * its own path, does.
   */
  pathsOf?(key: string): readonly string[];
  /** The form shows the field of a key. Default: it does. */
  isShown?(key: string): boolean;
  /**
   * The form can take the value of a key as it is. Default: it can. A part
   * of a field that converts its value (an accessor's `set`) cannot.
   */
  canTake?(key: string): boolean;
}

/**
 * What becomes of each field of an answer in the form, by the rule above.
 * A field the form does not have, or whose path could reach an object's
 * prototype, is left out. A list goes in whole, with its own `verified`. A
 * field the form hides waits, and so does a part of a field the form
 * cannot take as it is (`manual`).
 *
 * @param fields The `fields` of a fill result.
 * @param form   Where each field's value is, and what it holds now.
 */
export function planMapoAiFill(
  fields: AiFieldOutcomes,
  form: MapoAiFillForm,
): MapoAiFillEntry[] {
  const entries: MapoAiFillEntry[] = [];
  for (const [key, outcome] of Object.entries(fields)) {
    const path = form.pathOf(key);
    if (path === undefined || !isSafePath(path)) continue;
    // A value that goes into every language replaces any of them.
    const written = (form.pathsOf?.(key) ?? []).filter(isSafePath);
    const replaces = [path, ...written].some(
      (at) => !isEmptyFormValue(form.read(at)),
    );
    const shown = form.isShown?.(key) ?? true;
    const takes = form.canTake?.(key) ?? true;
    entries.push({
      key,
      path,
      action: actionOf(outcome, { replaces, shown, takes }),
      replaces: outcome.status === "filled" && replaces,
      shown,
      outcome,
    });
  }
  return entries;
}

function actionOf(
  outcome: AiFieldOutcome,
  field: { replaces: boolean; shown: boolean; takes: boolean },
): MapoAiFillAction {
  if (outcome.status === "empty") return "empty";
  if (outcome.status === "discarded") return "discard";
  const isManual = holdsRelation(outcome) || !field.takes;
  if (isManual) return "manual";
  const isDirect = outcome.verified && !field.replaces && field.shown;
  return isDirect ? "apply" : "confirm";
}

/**
 * A related record is in the value, at any depth, or in the outcome of one
 * of a list's items. Anything too deep to look through counts as one.
 */
export function holdsRelation(outcome: AiFieldOutcome): boolean {
  if (outcome.status !== "filled") return false;
  const inItems = outcome.items?.some((item) =>
    Object.values(item.fields).some(holdsRelation),
  );
  return inItems === true || namesRecord(outcome.value, 0);
}

/**
 * A value the AI gave without any quote, on itself or on any of its items:
 * nothing ties it to the source. Unlike a quote given and not found, it is
 * no claim to check in the text, so it marks no field: it is listed apart,
 * as a proposal without proof, until the operator applies it.
 */
export function isUnprovenValue(outcome: AiFieldOutcome): boolean {
  if (outcome.status !== "filled" || outcome.verified) return false;
  return !quotesSomething(outcome);
}

function quotesSomething(outcome: AiFieldOutcome): boolean {
  if (outcome.status !== "filled") return false;
  if (outcome.quotes.length > 0) return true;
  return (outcome.items ?? []).some((item) =>
    Object.values(item.fields).some(quotesSomething),
  );
}

function namesRecord(value: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) return true;
  if (isRelationRef(value)) return true;
  const inner = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return inner.some((one) => namesRecord(one, depth + 1));
}

/**
 * The form holds nothing at a path: no value, a blank text (paragraphs of
 * a rich text editor with only spaces, `&nbsp;` or line breaks included) or
 * an empty list. `false` and `0` are values.
 */
export function isEmptyFormValue(value: unknown): boolean {
  const isUndefined = value === undefined;
  const isNull = value === null;
  if (isUndefined || isNull) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value !== "string") return false;
  const text = value.replace(/<\/?p>|<br\s*\/?>|&nbsp;/gi, " ");
  return text.trim() === "";
}

// ─── The model ───────────────────────────────────────────────────────────────

/** Path segments that lead to an object's prototype instead of a value. */
const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** Every segment of the path names a value: none is empty or leads to a prototype. */
export function isSafePath(path: string): boolean {
  return path
    .split(".")
    .every((segment) => segment !== "" && !UNSAFE_SEGMENTS.has(segment));
}

/** The value at a path of the model, read through its own properties only. */
export function readModelValue(model: object, path: string): unknown {
  let current: unknown = model;
  for (const segment of path.split(".")) {
    current = ownValue(current, segment);
    if (current === undefined) return undefined;
  }
  return current;
}

/** What a write did to the model, so that it can be undone exactly. */
export interface MapoAiModelWrite {
  /** The key was already there, so undoing writes back what it held. */
  existed: boolean;
  /**
   * The objects the write made on the way, outermost first: where a key
   * was missing, or held `null`, which undoing puts back.
   */
  made: { path: string; wasNull: boolean }[];
}

/**
 * Writes a value at a path of the model, making the objects on the way.
 * Writes nothing, and returns `undefined`, when the path could reach a
 * prototype or goes through a value that is no object.
 */
export function writeModelValue(
  model: object,
  path: string,
  value: unknown,
): MapoAiModelWrite | undefined {
  if (!isSafePath(path)) return undefined;
  const segments = path.split(".");
  const last = segments.pop();
  if (last === undefined) return undefined;
  const made: MapoAiModelWrite["made"] = [];
  let parent: object = model;
  let at = "";
  for (const segment of segments) {
    at = at ? `${at}.${segment}` : segment;
    const child = ownValue(parent, segment);
    const isMissing = child === undefined || child === null;
    if (isMissing) {
      Reflect.set(parent, segment, {});
      made.push({ path: at, wasNull: child === null });
    } else if (typeof child !== "object") return undefined;
    // Read back: a reactive model hands out its proxy of the object.
    const next: unknown = Reflect.get(parent, segment);
    if (typeof next !== "object" || next === null) return undefined;
    parent = next;
  }
  const existed = Object.hasOwn(parent, last);
  if (!Reflect.set(parent, last, value)) return undefined;
  return { existed, made };
}

/**
 * Undoes a write: puts back what the key held, or removes the key when it
 * was not there, then the objects the write made that are empty again.
 */
export function undoModelWrite(
  model: object,
  path: string,
  write: MapoAiModelWrite,
  before: unknown,
): void {
  if (write.existed) writeModelValue(model, path, before);
  else deleteModelValue(model, path);
  for (const { path: at, wasNull } of [...write.made].reverse()) {
    const value = readModelValue(model, at);
    const isEmptyObject =
      typeof value === "object" &&
      value !== null &&
      Object.keys(value).length === 0;
    if (!isEmptyObject) continue;
    if (wasNull) writeModelValue(model, at, null);
    else deleteModelValue(model, at);
  }
}

/** Removes the key at a path of the model, through own properties only. */
export function deleteModelValue(model: object, path: string): void {
  if (!isSafePath(path)) return;
  const segments = path.split(".");
  const last = segments.pop();
  if (last === undefined) return;
  const parent = segments.length
    ? readModelValue(model, segments.join("."))
    : model;
  const isObject = typeof parent === "object" && parent !== null;
  if (isObject && Object.hasOwn(parent, last))
    Reflect.deleteProperty(parent, last);
}

/**
 * The data of a value as JSON text, to tell whether a field still holds
 * what was written into it; `undefined` for a value with no JSON form,
 * which never counts as the same.
 */
export function dataOf(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * The keys a form's JSON Schema declares: each property, and inside an
 * object the paths of its properties (`seo.title`). The items of a list
 * are not keys: a list is written whole.
 */
export function declaredKeys(schema: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (node: unknown, prefix: string, depth: number): void => {
    const properties = isRecord(node) ? node.properties : undefined;
    if (!isRecord(properties) || depth > MAX_DEPTH) return;
    for (const [name, child] of Object.entries(properties)) {
      const key = prefix ? `${prefix}.${name}` : name;
      keys.add(key);
      const isObject = isRecord(child) && child.type === "object";
      if (isObject) visit(child, key, depth + 1);
    }
  };
  visit(schema, "", 0);
  return keys;
}

function ownValue(parent: unknown, segment: string): unknown {
  const isObject = typeof parent === "object" && parent !== null;
  if (!isObject || !Object.hasOwn(parent, segment)) return undefined;
  const value: unknown = Reflect.get(parent, segment);
  return value;
}

// ─── The operation ───────────────────────────────────────────────────────────

/** What {@link runMapoAiFill} needs from the app. */
export interface MapoAiFillDependencies {
  /**
   * Posts a JSON body to a path of the app's server and resolves with the
   * answer read as JSON, rejecting on an error status: `$mapoFetch` in a
   * Mapo app.
   */
  post(
    path: string,
    body: unknown,
    options: { signal?: AbortSignal },
  ): Promise<unknown>;
}

/** What the gateway answered to a fill request, and what becomes of each field. */
export interface MapoAiFillAnswer {
  response: MapoAiFillResponse;
  /** What becomes of each field of the answer; none when the model refused. */
  entries: MapoAiFillEntry[];
}

/** The server answered something that is no answer of `run` to a fill request. */
export class MapoAiFillAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapoAiFillAnswerError";
  }
}

/**
 * Asks the gateway to fill a record, and decides what becomes of each
 * field of its answer. Writes nothing: the caller applies the entries.
 * The form is read when the answer arrives, so a field the operator filled
 * while waiting counts as filled.
 *
 * @throws The rejection of `post` (an error status, a network failure, an
 *   abort), or {@link MapoAiFillAnswerError} when the answer cannot be read.
 */
export async function runMapoAiFill<T>(
  input: MapoAiFillInput<T> & { form: MapoAiFillForm; signal?: AbortSignal },
  dependencies: MapoAiFillDependencies,
): Promise<MapoAiFillAnswer> {
  const body = mapoAiFillRequest(input);
  const answer = await dependencies.post(`${MAPO_AI_GATEWAY_PATH}/run`, body, {
    signal: input.signal,
  });
  const response = readMapoAiFillResponse(answer);
  if (!response) {
    throw new MapoAiFillAnswerError(
      "The server's answer is not an answer of run to a fill request",
    );
  }
  const entries =
    response.status === "answered"
      ? planMapoAiFill(response.result.fields, input.form)
      : [];
  return { response, entries };
}

/**
 * A value of an outcome as plain text, for the operator: a rich text
 * without its tags, a related record by the name to search for, a point as
 * "latitude, longitude", a list of values joined by commas; at most `max`
 * characters. A list of items has no text: `""`.
 */
export function mapoAiValueText(value: unknown, max = 120): string {
  const text = valueText(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function valueText(value: unknown): string {
  if (typeof value === "string") return value.replace(/<[^>]*>/g, " ");
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (isCoordinates(value)) return `${value.lat}, ${value.lng}`;
  if (isRelationRef(value)) {
    if ("search" in value) return value.search;
    if ("id" in value) return String(value.id);
    return value.item;
  }
  if (!Array.isArray(value) || !value.every(isSingle)) return "";
  return value.map(valueText).join(", ");
}
