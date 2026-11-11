/**
 * Magic Fill's pure half: what the gateway's `status` offers, read as
 * outside data; the providers and models an operator may pick for a call;
 * the source a panel sends, checked against the gateway's limits before it
 * goes; the preview of a call ("What I send to the AI"), asked and read as
 * outside data; and the summary of an answer. `useMapoAiMagicFill()` runs
 * these on a detail page; a tool without a UI can run them the same way,
 * with its own `post`.
 */

import type { AiOmittedField } from "./contract";
import type { AiFieldOutcome } from "./sanitize";
import type { AiSkipReason } from "./entity";
import {
  MapoAiFillAnswerError,
  foundQuoteOf,
  isItemHeld,
  isItemList,
  isRecordList,
  isUnprovenValue,
  itemRelations,
  mapoAiFillRequest,
  proposalOf,
  withRelationLists,
} from "./fill";
import { effectiveMatch, isExactMatch } from "./relations";
import type { MapoAiRelationMatch } from "./relations";
import type {
  MapoAiFillDependencies,
  MapoAiFillEntry,
  MapoAiFillInput,
  MapoAiFillReview,
} from "./fill";
import {
  MAPO_AI_GATEWAY_PATH,
  MAPO_AI_MAX_PARTS,
  MAPO_AI_MAX_PART_NAME,
} from "./gateway";
import type {
  MapoAiDefaults,
  MapoAiKeyLevel,
  MapoAiKeyStatus,
  MapoAiLimits,
  MapoAiPreference,
  MapoAiPreviewEntity,
  MapoAiPreviewField,
  MapoAiPreviewSkipped,
  MapoAiProviderStatus,
  MapoAiReaderStatus,
  MapoAiRunPreviewResponse,
  MapoAiSecretState,
  MapoAiSourcePart,
  MapoAiStatus,
  MapoAiStorageState,
} from "./gateway";
import { isRecord } from "./guards";

// ─── status ──────────────────────────────────────────────────────────────────

const KEY_LEVELS: ReadonlySet<string> = new Set<MapoAiKeyLevel>([
  "personal",
  "user",
  "group",
  "all",
  "project",
  "none",
]);

const SECRET_STATES: ReadonlySet<string> = new Set<MapoAiSecretState>([
  "set",
  "temporary",
  "missing",
  "too-short",
  "not-text",
]);

/**
 * The answer of `GET /_mapo/ai/status`, read as outside data: the server
 * may run another version of the gateway. A provider, a reader or a block
 * that cannot be read is left out, so a page offers no more than it can
 * read; `undefined` when the answer is no answer of `status` at all.
 */
export function readMapoAiStatus(value: unknown): MapoAiStatus | undefined {
  if (!isRecord(value)) return undefined;
  const { contract, allowed, admin } = value;
  const isStatus =
    typeof contract === "number" &&
    typeof allowed === "boolean" &&
    typeof admin === "boolean";
  if (!isStatus) return undefined;
  const status: MapoAiStatus = { contract, allowed, admin };
  const storage = storageOf(value.storage);
  if (storage) status.storage = storage;
  if (Array.isArray(value.providers)) {
    status.providers = value.providers.map(providerOf).filter(isPresent);
  }
  const defaults = defaultsOf(value.default);
  if (defaults) status.default = defaults;
  const preference = preferenceOf(value.preference);
  if (preference) status.preference = preference;
  const limits = limitsOf(value.limits);
  if (limits) status.limits = limits;
  if (Array.isArray(value.readers)) {
    status.readers = value.readers.map(readerOf).filter(isPresent);
  }
  return status;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isKeyLevel(value: unknown): value is MapoAiKeyLevel {
  return typeof value === "string" && KEY_LEVELS.has(value);
}

function isSecretState(value: unknown): value is MapoAiSecretState {
  return typeof value === "string" && SECRET_STATES.has(value);
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function textsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const texts = value.filter((one): one is string => typeof one === "string");
  return texts.length === value.length ? texts : undefined;
}

function storageOf(value: unknown): MapoAiStorageState | undefined {
  if (!isRecord(value)) return undefined;
  const { open, secret, mounted } = value;
  const isState =
    typeof open === "boolean" &&
    isSecretState(secret) &&
    typeof mounted === "boolean";
  if (!isState) return undefined;
  const driver = textOf(value.driver);
  return { open, secret, mounted, ...(driver ? { driver } : {}) };
}

function providerOf(value: unknown): MapoAiProviderStatus | undefined {
  if (!isRecord(value)) return undefined;
  const id = textOf(value.id);
  const models = textsOf(value.models);
  if (!id || !models) return undefined;
  const label = textOf(value.label);
  const hasKey = value.key !== undefined;
  const key = keyOf(value.key);
  // A key the page cannot read could be one the user lacks: leave the
  // provider out rather than offer a call that the gateway refuses.
  if (hasKey && !key) return undefined;
  return {
    id,
    ...(label ? { label } : {}),
    models,
    ...(key ? { key } : {}),
  };
}

function keyOf(value: unknown): MapoAiKeyStatus | undefined {
  if (!isRecord(value) || !isRecord(value.personal)) return undefined;
  const { level, required } = value;
  const { allowed, saved } = value.personal;
  const isKey =
    isKeyLevel(level) &&
    typeof required === "boolean" &&
    typeof allowed === "boolean" &&
    typeof saved === "boolean";
  if (!isKey) return undefined;
  const group = textOf(value.group);
  const last4 = textOf(value.last4);
  const personalLast4 = textOf(value.personal.last4);
  return {
    level,
    ...(group ? { group } : {}),
    ...(last4 ? { last4 } : {}),
    required,
    personal: {
      allowed,
      saved,
      ...(personalLast4 ? { last4: personalLast4 } : {}),
    },
  };
}

function defaultsOf(value: unknown): MapoAiDefaults | undefined {
  if (!isRecord(value) || !isRecord(value.models)) return undefined;
  const provider = textOf(value.provider);
  const fill = textOf(value.models.fill);
  const extract = textOf(value.models.extract);
  if (!provider || !fill || !extract) return undefined;
  return { provider, models: { fill, extract } };
}

function preferenceOf(value: unknown): MapoAiPreference | undefined {
  if (!isRecord(value)) return undefined;
  const provider = textOf(value.provider);
  const model = textOf(value.model);
  return provider && model ? { provider, model } : undefined;
}

/** A count from zero, as the limits are. */
function countOf(value: unknown): number | undefined {
  const isCount =
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  return isCount ? value : undefined;
}

function limitsOf(value: unknown): MapoAiLimits | undefined {
  if (!isRecord(value)) return undefined;
  const perUserPerMinute = countOf(value.perUserPerMinute);
  const maxSourceChars = countOf(value.maxSourceChars);
  const maxInstructionsChars = countOf(value.maxInstructionsChars);
  const maxFileBytes = countOf(value.maxFileBytes);
  const isLimits =
    perUserPerMinute !== undefined &&
    maxSourceChars !== undefined &&
    maxInstructionsChars !== undefined &&
    maxFileBytes !== undefined;
  if (!isLimits) return undefined;
  return {
    perUserPerMinute,
    maxSourceChars,
    maxInstructionsChars,
    maxFileBytes,
  };
}

function readerOf(value: unknown): MapoAiReaderStatus | undefined {
  if (!isRecord(value)) return undefined;
  const id = textOf(value.id);
  const extensions = textsOf(value.extensions);
  const types = textsOf(value.types);
  if (!id || !extensions || !types) return undefined;
  const label = textOf(value.label);
  return { id, ...(label ? { label } : {}), extensions, types };
}

// ─── The provider and the model ──────────────────────────────────────────────

/** A provider and one of its models, as an operator picks them for a call. */
export interface MapoAiProviderChoice {
  provider: string;
  model: string;
  /** The provider's name for people: its `label`, else its id. */
  providerLabel: string;
}

/**
 * Whether `run` may call the provider for the user: a provider that needs
 * a key has one at some level. `run` refuses the others with a 503.
 */
export function isCallableProvider(provider: MapoAiProviderStatus): boolean {
  const needsKey = provider.key?.required === true;
  const hasNone = provider.key?.level === "none";
  return !(needsKey && hasNone);
}

/** Every provider and model `run` may call for the user, in `status`'s order. */
export function mapoAiProviderChoices(
  status: MapoAiStatus,
): MapoAiProviderChoice[] {
  return (status.providers ?? [])
    .filter(isCallableProvider)
    .flatMap((provider) =>
      provider.models.map((model) => ({
        provider: provider.id,
        model,
        providerLabel: provider.label ?? provider.id,
      })),
    );
}

/**
 * The choice a call starts from: the `default` of `status` for the task,
 * which is the user's preference while they may call it, when it is among
 * the choices; else the first choice. `undefined` when `run` may call
 * nothing for the user.
 */
export function defaultMapoAiChoice(
  status: MapoAiStatus,
  task: "fill" | "extract",
): MapoAiProviderChoice | undefined {
  const choices = mapoAiProviderChoices(status);
  const wanted = status.default;
  const found = wanted
    ? choices.find(
        (choice) =>
          choice.provider === wanted.provider &&
          choice.model === wanted.models[task],
      )
    : undefined;
  return found ?? choices[0];
}

// ─── The source ──────────────────────────────────────────────────────────────

/**
 * The parts of a source, as `run` takes them: the pasted text, when it is
 * not blank, then the parts of each file, in order, with names no longer
 * than `run` takes.
 */
export function mapoAiSourceParts(
  text: string,
  files: readonly (readonly MapoAiSourcePart[])[],
): MapoAiSourcePart[] {
  const pasted: MapoAiSourcePart[] =
    text.trim() === "" ? [] : [{ kind: "text", text }];
  const read = files.flatMap((parts) =>
    parts.map((part) => ({
      kind: part.kind,
      text: part.text,
      ...(part.name !== undefined
        ? { name: part.name.slice(0, MAPO_AI_MAX_PART_NAME) }
        : {}),
    })),
  );
  return [...pasted, ...read];
}

/** Why a source cannot go to `run` as it is, found before it is sent. */
export type MapoAiSourceProblem =
  /** No text: nothing pasted, no file read. */
  | { kind: "empty" }
  /** More characters, all the parts together, than `run` takes. */
  | { kind: "too-long"; chars: number; max: number }
  /** More parts than `run` takes. */
  | { kind: "too-many-parts"; parts: number; max: number }
  /** Instructions longer than `run` takes. */
  | { kind: "instructions-too-long"; chars: number; max: number }
  /** Instructions, where the app takes none (`maxInstructionsChars: 0`). */
  | { kind: "no-instructions" };

/**
 * Checks a source and the operator's instructions as `run` checks them,
 * before they are sent: the characters of every part together, the number
 * of parts, the instructions' characters once trimmed, as they go. Without
 * `limits`, which `status` gives, only what does not depend on them.
 */
export function checkMapoAiSource(
  parts: readonly MapoAiSourcePart[],
  instructions: string,
  limits?: MapoAiLimits,
): MapoAiSourceProblem[] {
  const problems: MapoAiSourceProblem[] = [];
  const isEmpty = parts.every((part) => part.text.trim() === "");
  if (isEmpty) problems.push({ kind: "empty" });
  if (parts.length > MAPO_AI_MAX_PARTS) {
    problems.push({
      kind: "too-many-parts",
      parts: parts.length,
      max: MAPO_AI_MAX_PARTS,
    });
  }
  if (!limits) return problems;
  const chars = sourceChars(parts);
  if (chars > limits.maxSourceChars) {
    problems.push({ kind: "too-long", chars, max: limits.maxSourceChars });
  }
  const sent = instructions.trim().length;
  if (sent > 0 && limits.maxInstructionsChars === 0) {
    problems.push({ kind: "no-instructions" });
  } else if (sent > limits.maxInstructionsChars) {
    problems.push({
      kind: "instructions-too-long",
      chars: sent,
      max: limits.maxInstructionsChars,
    });
  }
  return problems;
}

/** The characters of a source, every part together, as `run` counts them. */
export function sourceChars(parts: readonly MapoAiSourcePart[]): number {
  return parts.reduce((sum, part) => sum + part.text.length, 0);
}

// ─── What I send to the AI ───────────────────────────────────────────────────

/**
 * Asks the gateway what `run` would send for the fill the input describes,
 * "What I send to the AI": the same request, to `run/preview`, which calls
 * no provider, counts nothing and audits nothing. With `get`, the records
 * of the form's relations are listed as `run` lists them.
 * @throws The rejection of `post` (an error status, a network failure, an
 *   abort), or `MapoAiFillAnswerError` when the answer is no preview.
 */
export async function previewMapoAiFill<T>(
  input: MapoAiFillInput<T> & { signal?: AbortSignal },
  dependencies: MapoAiFillDependencies,
): Promise<MapoAiRunPreviewResponse> {
  const { entity } = await withRelationLists(input, dependencies);
  const answer = await dependencies.post(
    `${MAPO_AI_GATEWAY_PATH}/run/preview`,
    mapoAiFillRequest({ ...input, entity }),
    { signal: input.signal },
  );
  const preview = readMapoAiRunPreview(answer);
  if (!preview) {
    throw new MapoAiFillAnswerError(
      "The server's answer is not a preview of a call",
    );
  }
  return preview;
}

/**
 * The answer of `POST /_mapo/ai/run/preview`, read as outside data: a
 * field or a part that cannot be read is left out; `undefined` when the
 * answer is no preview at all.
 */
export function readMapoAiRunPreview(
  value: unknown,
): MapoAiRunPreviewResponse | undefined {
  if (!isRecord(value)) return undefined;
  const { task, prompt, instructions } = value;
  const isTask = task === "fill" || task === "extract";
  const provider = isRecord(value.provider) ? value.provider : {};
  const id = textOf(provider.id);
  const model = textOf(provider.model);
  const parts: unknown[] | undefined = Array.isArray(value.parts)
    ? value.parts
    : undefined;
  const entities: unknown[] | undefined = Array.isArray(value.entities)
    ? value.entities
    : undefined;
  const isPreview =
    isTask &&
    typeof prompt === "number" &&
    typeof instructions === "string" &&
    id !== undefined &&
    model !== undefined &&
    parts !== undefined &&
    entities !== undefined;
  if (!isPreview) return undefined;
  const operator = textOf(value.operator);
  return {
    task,
    provider: { id, model },
    prompt,
    instructions,
    ...(operator ? { operator } : {}),
    parts: parts.map(previewPartOf).filter(isPresent),
    entities: entities.map(previewEntityOf).filter(isPresent),
  };
}

function previewPartOf(
  value: unknown,
): { name?: string; chars: number } | undefined {
  if (!isRecord(value)) return undefined;
  const chars = countOf(value.chars);
  if (chars === undefined) return undefined;
  const name = textOf(value.name);
  return { ...(name ? { name } : {}), chars };
}

function previewFieldOf(value: unknown): MapoAiPreviewField | undefined {
  if (!isRecord(value)) return undefined;
  const key = textOf(value.key);
  if (!key) return undefined;
  const label = textOf(value.label);
  return { key, ...(label ? { label } : {}) };
}

function previewSkippedOf(value: unknown): MapoAiPreviewSkipped | undefined {
  const field = previewFieldOf(value);
  const reason = isRecord(value) ? textOf(value.reason) : undefined;
  return field && reason ? { ...field, reason } : undefined;
}

function previewEntityOf(value: unknown): MapoAiPreviewEntity | undefined {
  if (!isRecord(value)) return undefined;
  if (!Array.isArray(value.fields) || !Array.isArray(value.skipped)) {
    return undefined;
  }
  const type = textOf(value.type);
  const label = textOf(value.label);
  return {
    ...(type ? { type } : {}),
    ...(label ? { label } : {}),
    fields: value.fields.map(previewFieldOf).filter(isPresent),
    skipped: value.skipped.map(previewSkippedOf).filter(isPresent),
  };
}

/**
 * The reasons a field is kept away from the AI that this client names: the
 * entity model's and the contract's `too-deep`. A record, so that a new
 * reason of either does not compile until it is named here, with its
 * message in `mapo.ai.magicFill.preview.reasons.*`.
 */
const NAMED_SKIP_REASONS: Record<
  AiSkipReason | AiOmittedField["reason"],
  true
> = {
  secret: true,
  readonly: true,
  excluded: true,
  media: true,
  relation: true,
  unsupported: true,
  conflict: true,
  "too-deep": true,
};

/** The reasons this client names, each with a message in both catalogs. */
export const MAPO_AI_NAMED_SKIP_REASONS: readonly string[] =
  Object.keys(NAMED_SKIP_REASONS);

/**
 * The message key of why the preview keeps a field away from the AI, or
 * `undefined` for a reason this client does not name, as a newer
 * gateway's: the preview then shows it as the gateway wrote it.
 */
export function mapoAiSkipReasonKey(reason: string): string | undefined {
  const isNamed = Object.hasOwn(NAMED_SKIP_REASONS, reason);
  return isNamed ? `mapo.ai.magicFill.preview.reasons.${reason}` : undefined;
}

// ─── The summary ─────────────────────────────────────────────────────────────

/**
 * Why a value waits for the operator: no quote proves it (`not-proven`),
 * it would replace what the field holds (`replaces`), the form hides the
 * field (`hidden`), a related record was found under another name than the
 * AI's (`renamed`), or some of the records it names are to pick in the
 * field, or to set by hand (`to-pick`).
 */
export type MapoAiWaitReason =
  | "not-proven"
  | "replaces"
  | "hidden"
  | "renamed"
  | "to-pick";

/** An item of a list that waits, as the preview lists it. */
export interface MapoAiProposedItem {
  /** Its place in the AI's list, as `apply()` takes it (`items`). */
  index: number;
  /** The item, as the form saves it. */
  value: unknown;
  /** The template it follows, when the items vary. */
  template?: string;
  /** Every value it gives is proved by a quote, and it is complete. */
  verified: boolean;
  /** The field holds it already: it is never added again. */
  held: boolean;
  /**
   * The related records it names, by their place in the item
   * (`organisation`), as they were found: one not found is to pick once
   * the item is in, and the item is not ticked from the start.
   */
  relations?: MapoAiRelationMatch[];
}

/** A value of the answer that waits for the operator's Apply. */
export interface MapoAiToConfirm {
  /** The field's key, as the answer names it. */
  key: string;
  /** The path of its value in the model, as `apply()` takes it. */
  path: string;
  /**
   * The value the AI proposes, as the field would take it: for a value
   * that names related records, the records found in their place.
   */
  value: unknown;
  /** Why it waits; none when the form was busy as the answer arrived. */
  reasons: MapoAiWaitReason[];
  /**
   * For a value that names related records: what was found for each, by
   * its place in the value (`""`, or `2` in a list of records).
   */
  relations?: MapoAiRelationMatch[];
  /** For a list: its items, and how many of them are verified. */
  items?: { total: number; verified: number };
  /**
   * For a list of items: each item, to choose one by one. They go after
   * the items the field holds (`current`), and one it holds is not added.
   */
  list?: MapoAiProposedItem[];
  /** For a verified value: the words of the source that prove it. */
  quote?: string;
  /**
   * For a value that would replace one, or a list of items or of related
   * records that would join the field's own: what the field holds now, at
   * its path, as the summary was given it. The "before" of the preview.
   */
  current?: unknown;
  /**
   * For a value written into every language (`synci18n`) that would
   * replace one: what the other languages hold, by language, where the
   * write would replace a different value.
   */
  languages?: Record<string, unknown>;
}

/** What became of the answers of a session, as the operator reads it. */
export interface MapoAiFillSummary {
  /** Values the AI wrote that are in the form, still its own: by themselves or applied. */
  applied: number;
  /** Values the operator kept as theirs (Keep): undo leaves them. */
  kept: number;
  /** Values the operator changed in their field: theirs now. */
  edited: number;
  /**
   * Values for empty fields that wait for the operator: a quote of the
   * source does not prove them, or the form hides the field. Their fields
   * are marked. A list of items waits here too, whatever its field holds:
   * its items join the field's own, so it replaces nothing.
   */
  toFill: MapoAiToConfirm[];
  /**
   * Values that would replace what their field holds, which `current`
   * gives: the before and after of the preview. Proven or not. Never a
   * list of items.
   */
  toReplace: MapoAiToConfirm[];
  /**
   * Values for empty fields that the AI gave without any quote: no mark on
   * their fields, listed apart until the operator applies one.
   */
  unproven: MapoAiToConfirm[];
  /** Values a field already held as its own: nothing to write, nor to review. */
  unchanged: number;
  /** Values the operator sets by hand: related records, fields that convert their values. */
  manual: number;
  /** Values the gateway discarded, never written. */
  discarded: number;
  /** Fields the AI gave nothing for. */
  notFound: number;
}

/**
 * The summary of a session's fields, as `useMapoAiFill()` lists them, each
 * with what it holds now at its path (`current`) and in the other languages
 * a `synci18n` value goes to (`languages`), for the values that would
 * replace one. A value that waits and that the operator ignored is
 * left out, and one in the form still counts as the AI's; a kept or
 * changed value is theirs. Only a value the AI gave counts as changed: a
 * discarded one the operator then wrote over stays discarded. A value that
 * waits goes to one group of the preview: `toReplace` when the field holds
 * a value it would replace (never a list of items), else `unproven` when
 * the AI quoted nothing for it, else `toFill`. With `evidence: false`, the
 * page asked for no quotes: no value is `unproven`.
 */
export function summarizeMapoAiFill(
  fields: readonly (MapoAiFillEntry & {
    applied: boolean;
    review?: MapoAiFillReview;
    current?: unknown;
    languages?: Record<string, unknown>;
  })[],
  options: { evidence?: boolean } = {},
): MapoAiFillSummary {
  const summary: MapoAiFillSummary = {
    applied: 0,
    kept: 0,
    edited: 0,
    toFill: [],
    toReplace: [],
    unproven: [],
    unchanged: 0,
    manual: 0,
    discarded: 0,
    notFound: 0,
  };
  for (const field of fields) {
    const { action, outcome, review, relations } = field;
    const isChanged = review === "edited" && outcome.status === "filled";
    if (review === "kept") summary.kept += 1;
    else if (isChanged) summary.edited += 1;
    else if (field.applied) summary.applied += 1;
    else if (review === "ignored") continue;
    else if (action === "unchanged") summary.unchanged += 1;
    else if (action === "manual") summary.manual += 1;
    else if (action === "discard") summary.discarded += 1;
    else if (action === "empty") summary.notFound += 1;
    else if (outcome.status === "filled") {
      const quote = outcome.verified ? foundQuoteOf(outcome) : undefined;
      const isList = isItemList(outcome);
      // What a list's items, or records, join is shown too, as what a
      // value replaces.
      const joins = isList || isRecordList(outcome);
      const hasCurrent =
        (field.replaces || joins) && field.current !== undefined;
      // The records of the value itself; those inside items go with them.
      const own = (relations ?? []).filter((one) => !one.at.includes("."));
      const isRenamed = own.some((one) => effectiveMatch(one).renamed === true);
      const isToPick = own.some(
        (one) => effectiveMatch(one).status !== "found" && !one.ignored,
      );
      const waiting: MapoAiToConfirm = {
        key: field.key,
        path: field.path,
        value: proposalOf(outcome, relations) ?? outcome.value,
        reasons: [
          ...(outcome.verified ? [] : ["not-proven" as const]),
          ...(field.replaces ? ["replaces" as const] : []),
          ...(field.shown ? [] : ["hidden" as const]),
          ...(isRenamed ? ["renamed" as const] : []),
          ...(isToPick ? ["to-pick" as const] : []),
        ],
        ...(own.length ? { relations: own } : {}),
        ...(outcome.items
          ? {
              items: {
                total: outcome.items.length,
                verified: outcome.items.filter((item) => item.verified).length,
              },
            }
          : {}),
        ...(quote !== undefined ? { quote } : {}),
        ...(hasCurrent ? { current: field.current } : {}),
        ...(isList
          ? { list: proposedItems(outcome, field.current, relations) }
          : {}),
        ...(field.replaces && field.languages
          ? { languages: field.languages }
          : {}),
      };
      // Without quotes asked, a value without any is no proposal without
      // proof: it waits to fill, as any value no quote proves.
      const isUnproven = options.evidence !== false && isUnprovenValue(outcome);
      if (field.replaces) summary.toReplace.push(waiting);
      else if (isUnproven) summary.unproven.push(waiting);
      else summary.toFill.push(waiting);
    }
  }
  return summary;
}

/**
 * The paths of the values the preview ticks as it lists them: those for
 * empty fields the form shows, which take no value away. A value that
 * would replace one, or that the AI quoted nothing for, waits for the
 * operator's own tick, and so does a related record found under another
 * name; a field the form hides is never ticked, nor written.
 */
export function mapoAiPreselected(summary: MapoAiFillSummary): string[] {
  return summary.toFill
    .filter((item) => !item.reasons.includes("hidden"))
    .filter((item) => !item.reasons.includes("renamed"))
    .filter((item) => !item.list || mapoAiPreselectedItems(item).length > 0)
    .map((item) => item.path);
}

/**
 * The items of a list the preview ticks as it lists them, by their place:
 * the verified ones the field does not hold yet, whose related records
 * were all found with the AI's names. A list of a field the form hides
 * gets none.
 */
export function mapoAiPreselectedItems(item: MapoAiToConfirm): number[] {
  if (!item.list || item.reasons.includes("hidden")) return [];
  return item.list
    .filter((one) => one.verified && !one.held)
    .filter((one) => (one.relations ?? []).every(isExactMatch))
    .map((one) => one.index);
}

/**
 * The items of a list's outcome, as the field would take them, each with
 * whether `held` holds it and the records it names.
 */
function proposedItems(
  outcome: AiFieldOutcome,
  held: unknown,
  relations: readonly MapoAiRelationMatch[] | undefined,
): MapoAiProposedItem[] {
  if (outcome.status !== "filled" || !outcome.items) return [];
  const proposal = proposalOf(outcome, relations);
  const values: readonly unknown[] = Array.isArray(proposal) ? proposal : [];
  return outcome.items.map((item, index) => {
    const inside = itemRelations(relations, index);
    return {
      index,
      value: values[index],
      ...(item.template ? { template: item.template } : {}),
      verified: item.verified,
      held: isItemHeld(values[index], held),
      ...(inside.length ? { relations: inside } : {}),
    };
  });
}
