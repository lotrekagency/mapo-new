import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  toRaw,
  watch,
} from "vue";
import type { Ref } from "vue";
import { useNuxtApp } from "nuxt/app";
import { metadataToJsonSchema } from "@mapomodule/utils";
import type { JSONSchema } from "@mapomodule/utils";
import { fieldsToJsonSchema } from "@mapomodule/form/runtime/utils/fieldsToJsonSchema";
import { resolveFieldAccessor } from "@mapomodule/form/runtime/types/registry";
import type {
  AnyFieldDescriptor,
  FieldAccessor,
  FieldAnnotation,
  FieldAnnotationAction,
  FieldAnnotations,
  FieldRegistry,
} from "@mapomodule/form/types";
import {
  MapoAiFillAnswerError,
  dataOf,
  declaredKeys,
  foundQuoteOf,
  holdsRelation,
  isItemHeld,
  isItemList,
  isItemResolved,
  isRecordList,
  proposalOf,
  verifiedItemsToAdd,
  isEmptyFormValue,
  isSafePath,
  isUnprovenValue,
  mapoAiValueText,
  readModelValue,
  runMapoAiFill,
  undoModelWrite,
  writeModelValue,
} from "../shared/fill";
import type {
  MapoAiFillEntity,
  MapoAiFillEntry,
  MapoAiFillResponse,
  MapoAiFillReview,
  MapoAiModelWrite,
} from "../shared/fill";
import type { MapoAiRefusalReason, MapoAiSourcePart } from "../shared/gateway";
import { isRecord } from "../shared/guards";
import {
  MAPO_AI_FILL_SESSION_FORMAT,
  isPlainData,
  readMapoAiFillSession,
} from "../shared/fillSession";
import type {
  MapoAiFillAnswer,
  MapoAiFillSession,
  MapoAiFillSessionField,
} from "../shared/fillSession";
import {
  effectiveMatch,
  holdsRelationId,
  isRelationResolved,
  mapoAiRelationFields,
  relationIdOf,
  sameId,
} from "../shared/relations";
import type {
  MapoAiRelationField,
  MapoAiRelationMatch,
} from "../shared/relations";
import type { AiFieldOutcome, AiItemOutcome } from "../shared/sanitize";
import { gatewayGetter, gatewayPoster } from "./poster";
import { translatorOf } from "./translate";
import type { Translate } from "./translate";

/**
 * The form `useMapoAiFill()` fills: what it reads and what it writes. The
 * context of `MapoDetail`, from `useMapoDetail()`, is one.
 */
export interface MapoAiFillTarget<T extends object = Record<string, unknown>> {
  /** The record's values: the AI's go in here. */
  model: Ref<T>;
  /** The fields of the form's body. */
  fields: Readonly<Ref<readonly AnyFieldDescriptor<T>[]>>;
  /** The fields of the form's sidebar. */
  sidebarFields?: Readonly<Ref<readonly AnyFieldDescriptor<T>[]>>;
  /** The marks next to the fields: the composable adds its own, and removes only those. */
  annotations: Ref<FieldAnnotations>;
  /**
   * The `OPTIONS` response of the record's endpoint: the backend's schema
   * is read from it. Without it, the fields alone describe the record.
   */
  metadata?: () => Promise<Record<string, unknown> | undefined>;
  /**
   * The record is new: the gateway asks `add_` on its model, `change_`
   * otherwise. Without it the record counts as new.
   */
  isNew?: Readonly<Ref<boolean>>;
  /** The language the form edits translatable values in, such as `it`. */
  currentLang?: Readonly<Ref<string>>;
  /** The form's languages: a `synci18n` field gets its value in each. */
  languages?: Readonly<Ref<readonly string[]>>;
  /** The form's field registry, for the accessors of the field types. */
  registry?: Readonly<Ref<FieldRegistry>>;
  /** The form cannot be edited: the composable neither asks nor writes. */
  readonly?: Readonly<Ref<boolean>>;
  /**
   * The form is saving or deleting its record: the composable writes
   * nothing meanwhile, since the save may load the record back over it. A
   * value that would have gone in by itself waits, marked, for Apply.
   */
  isBusy?: Readonly<Ref<boolean>>;
  /** The record is loading: nothing is written meanwhile, since the load would replace it. */
  isLoading?: Readonly<Ref<boolean>>;
  /**
   * Calls a function after each save of the record that succeeds: the
   * session ends there, since the values now belong to the record. The
   * context of `MapoDetail` gives it.
   */
  onSaved?: (handler: (record: T) => void) => () => void;
}

/** How `useMapoAiFill()` describes the record. */
export interface MapoAiFillOptions {
  /**
   * What the AI should know about the record: its name (`label`), what it
   * is (`description`), its backend model, for the permission check
   * (`model`, such as `article`), keys it never fills (`exclude`), the
   * records a relation may point to (`relationChoices`), and `evidence`.
   */
  entity?: MapoAiFillEntity;
  /**
   * Reads the backend's schema from the `OPTIONS` response, as the
   * `MapoDetail` prop of the same name: pass the same function. Default:
   * `metadataToJsonSchema()` of `@mapomodule/utils`. Return `undefined` to
   * send none.
   */
  schemaFromMetadata?: (
    metadata: Record<string, unknown>,
  ) => JSONSchema | undefined;
}

/** What one call of `fill()` adds to the request. */
export interface MapoAiFillCall {
  /** The operator's own instructions for this source, such as "only the first event". */
  instructions?: string;
  /** The provider and the model to call, among those `status` lists; the app's default otherwise. */
  provider?: { id?: string; model?: string };
}

/** A field of the session, and what became of the AI's value. */
export interface MapoAiFillField extends MapoAiFillEntry {
  /** The AI's value is in the form: it went in by itself, or the operator applied it. */
  applied: boolean;
  /** What the operator did with it; none while the value waits or stays marked. */
  review?: MapoAiFillReview;
  /**
   * The field holds a value the AI wrote in the session, this answer's or
   * an earlier one's: `restore()` and `undo()` put back what it held before.
   */
  undoable: boolean;
  /** The answer of the session that gave it, from 1: `undo()` goes back newest first. */
  round: number;
}

/** How `apply()` writes the value of a field. */
export interface MapoAiFillApplyOptions {
  /**
   * For a list of items: the items to add after the field's own, by their
   * place in the AI's list. Default: every item the field does not hold
   * yet. An item the field already holds is never added again.
   */
  items?: readonly number[];
}

/** What a value of the session would replace in the form. */
export interface MapoAiFillReplaced {
  /** What the field holds at the value's path: in the language the form edits, for a translatable field. */
  value: unknown;
  /**
   * For a value written into every language (`synci18n`): what each other
   * language holds, by language, where it is a value that differs from
   * `value` and from the AI's. The write replaces those too.
   */
  languages?: Record<string, unknown>;
}

/** Why the last `fill()` got no answer. */
export interface MapoAiFillError {
  /** The gateway's status code; `0` when no answer arrived, or none could be read. */
  status: number;
  /** What went wrong, for the operator, in the app's language. */
  message: string;
  /** Seconds to wait before trying again, when the gateway says. */
  retryAfter?: number;
  /**
   * Why the gateway refused before calling a provider, when it says: what
   * the user may call changed since the page asked `status`, which a page
   * asks again.
   */
  reason?: MapoAiRefusalReason;
}

/** What `useMapoAiFill()` returns. */
export interface MapoAiFill {
  /**
   * Sends the source to the AI with the record's two descriptions, then
   * writes into the form each value a quote verifies on an empty field it
   * shows, and marks the fields the answer gives; a value a field already
   * holds as its own is `unchanged`, with no mark. Once those writes are
   * done, a verified value on an empty field they revealed goes in too.
   * The answer joins the session: it takes a field's place only where it
   * gives a value, so the marks and the memory of the earlier answers stay
   * until the operator decides, saves or ends the session. A new call
   * cancels the wait of the previous one. Never rejects: a failure is in
   * `error`, and the session stays as it was.
   */
  fill(
    source: string | readonly MapoAiSourcePart[],
    call?: MapoAiFillCall,
  ): Promise<void>;
  /**
   * Writes the AI's value of a field that waits for the operator, by its
   * path, when the form shows the field now: a hidden one keeps waiting.
   * The items of a list go after the field's own: those `options.items`
   * names, or every one the field does not hold yet.
   */
  apply(path: string, options?: MapoAiFillApplyOptions): void;
  /**
   * Puts back what a field held before the AI's values went in, while the
   * field still holds what the AI wrote; the value waits again.
   */
  restore(path: string): void;
  /**
   * Keeps the AI's value of a field as the operator's: its mark goes, and
   * `undo()` leaves it.
   */
  keep(path: string): void;
  /**
   * Puts in the record the operator picks, by its place among the
   * candidates of a mark that asks for one, by the mark's path: a related
   * record several records match, in the field's value or inside an item
   * the AI's list added (`blocks.4.article`). The value goes in as Apply
   * writes it; inside an item, or in a list of records already in, it joins
   * what the AI wrote, and Restore takes it away with the rest.
   */
  choose(path: string, candidate: number): void;
  /**
   * Removes the composable's mark of a field, by its path or the mark's,
   * or every mark: a value that waits is ignored, one in the form stays.
   * The mark of a record to pick in a value already in ignores the pick.
   */
  dismiss(path?: string): void;
  /**
   * Puts back every field that still holds a value the AI wrote in the
   * session, newest first, as it was before (a key the AI added goes
   * away), then ends the session. Values the operator kept or changed stay.
   */
  undo(): void;
  /**
   * Ends the session: the marks and the memory of what to undo go, a call
   * under way stops, and the values stay as they are. A save of the record
   * ends it by itself (`onSaved` of the target).
   */
  close(): void;
  /**
   * Stops waiting for the answer, and closes the request: the gateway
   * stops the provider's call, which counts against the user's limit once
   * the provider was called. Behind a proxy that keeps the request open,
   * or on an edge runtime, the call runs until it ends.
   */
  cancel(): void;
  /**
   * Whether the form shows a field of the last answer now, by its path:
   * `apply()` writes only into a field the operator sees.
   */
  isShown(path: string): boolean;
  /**
   * What a value of the session would replace, by its path: what the field
   * holds there, and, for a value written into every language, each other
   * language's value it would replace. `undefined` for a path the session
   * does not have.
   */
  replaced(path: string): MapoAiFillReplaced | undefined;
  /**
   * A value of a field of the session as the marks show it, by the
   * field's path: the label of a choice or the name of a related record,
   * a rich text's words, a list's values, or how many items a list has.
   */
  textOf(path: string, value: unknown): string;
  /**
   * For a list of related records of the session, by its path: the
   * records a write would add after the field's own, as the field saves
   * them, those it holds left out; `[]` when it holds them all.
   * `undefined` for a path that is no such list.
   */
  recordsToAdd(path: string): unknown[] | undefined;
  /**
   * The paths of the marks that wait for the operator, in the order of the
   * form (the body's fields, then the sidebar's, the items of a list by
   * their place): a value to apply, a record to pick, a value to set by
   * hand, inside an item too. Not a value already in the form, unless a
   * record of it is still to pick, nor a discarded one.
   */
  toCheck: Readonly<Ref<readonly string[]>>;
  /**
   * The next mark to check after `after`, in the order of `toCheck`, for a
   * button that takes the operator from one to the next: the first one
   * when none follows, or without `after`; `undefined` when none waits.
   * `after` may have stopped waiting meanwhile.
   */
  nextToCheck(after?: string): string | undefined;
  /** A call is waiting for its answer. */
  pending: Readonly<Ref<boolean>>;
  /** Why the last call got no answer. */
  error: Readonly<Ref<MapoAiFillError | undefined>>;
  /** The last answer: the AI's proposal, or its refusal (`status: "refused"`). */
  response: Readonly<Ref<MapoAiFillResponse | undefined>>;
  /**
   * Each field of the session, and what became of it: for each, the last
   * answer that gave it a value, or that gave it first.
   */
  fields: Readonly<Ref<readonly MapoAiFillField[]>>;
  /** How many answers the session has had: a field's `round` names its answer. */
  rounds: Readonly<Ref<number>>;
  /**
   * The answers of the session, oldest first: the provider and the model
   * that gave each, and when. A field's `round` names its answer.
   */
  answers: Readonly<Ref<readonly MapoAiFillAnswer[]>>;
  /**
   * The session as data `JSON.stringify()` can write, for a draft: each
   * field with the AI's value, its quotes and what became of it, what
   * `restore()` and `undo()` would put back, and the answers. Never the
   * source, the files or the instructions. `undefined` without a session.
   * Store it as it is: its format is Mapo's own.
   */
  snapshot(): object | undefined;
  /**
   * Takes back a session `snapshot()` gave, in place of the one under
   * way, on the form as it is now: restore the form's values first, and
   * call it once the form has its fields, those `OPTIONS` gives too. The
   * data is read as outside data; a field the form no longer has there is
   * left out, and a write outside a field's own paths is never undone.
   * Anything else that is not such a session ends the one under way, as
   * `close()`. Returns whether a session was taken back.
   */
  resume(snapshot: unknown): boolean;
}

/** Where a key of the answer goes in the form. */
interface KeyTarget<T extends object> {
  descriptor: AnyFieldDescriptor<T>;
  /** The path of the value in the model. */
  path: string;
  /** The path of the field's value, where its mark goes: the form looks there. */
  markPath: string;
  /** What follows the field's key in the answer's: `.title` in `seo.title`, or `""`. */
  rest: string;
}

/** One value the composable wrote, and what undoes it. */
interface WriteRecord {
  path: string;
  /** What the path held before. */
  before: unknown;
  write: MapoAiModelWrite;
  /** The data written, to tell whether the field still holds it. */
  written: string | undefined;
}

/** One write of a field's value, at each of its paths: what `restore()` and `undo()` put back. */
interface FieldWrite {
  /** When it was made in the session: `undo()` goes back newest first. */
  order: number;
  records: WriteRecord[];
}

/** What a write leaves in a field, and, for a list, which of the AI's entries it adds. */
interface PlannedWrite {
  value: unknown;
  /** For a list: the AI's entries it adds, by their place in the AI's list, in order. */
  added?: number[];
  /** For a list: how many entries the field held before them. */
  own?: number;
}

/** A record to pick at a mark, and the field of the session whose value names it. */
interface Pick {
  field: MapoAiFillField;
  match: MapoAiRelationMatch;
}

/** The message of each error status of `run`, under `mapo.ai.errors`. */
const ERROR_MESSAGES: Readonly<Record<number, string>> = {
  400: "unsupported",
  401: "signedOut",
  403: "forbidden",
  413: "tooLarge",
  415: "unsupported",
  422: "nothingToFill",
  429: "rateLimited",
  502: "providerFailed",
  503: "unavailable",
  504: "timeout",
};

/**
 * The message of a provider's failure that has one of its own, by the name
 * `run` gives it in `data.failure`: a cut answer, or a prompt the model
 * cannot read whole, is not fixed by trying again, as the other failures
 * of a 502 may be, and a long form can be what overflows, not only the text.
 */
const FAILURE_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["truncated", "cutOff"],
  ["too-long", "tooLongForModel"],
  // A refusal of the provider's own rules: trying again changes nothing.
  ["refused-request", "providerRefused"],
]);

/**
 * The message of a refusal of the gateway before any call, by its
 * `data.reason`: a key or a model taken away while the page was open is no
 * reason to try again later, as a plain 503 or 403 would say.
 */
const REFUSAL_MESSAGES: ReadonlyMap<MapoAiRefusalReason, string> = new Map([
  ["no-provider", "noProvider"],
  ["no-key", "noKey"],
  ["provider-off", "modelOff"],
  ["model-off", "modelOff"],
]);

/** Messages that can say how long to wait, as `<message>In`. */
const WAITING_MESSAGES = new Set(["rateLimited", "unavailable"]);

/** Quotes a mark shows of a value, the first ones the AI gave. */
const MAX_QUOTES = 2;

/**
 * Fills a detail form with the AI, through the gateway's `run`. It sends
 * the form's fields and the backend's schema of the record, read from its
 * `OPTIONS`, with the source; then it applies the answer field by field:
 * - a value a quote of the source verifies goes into an empty field the
 *   form shows by itself, marked, with "Restore";
 * - a value no quote proves, one that would replace the field's value, or
 *   one for a hidden field, waits for the operator, marked with "Apply";
 * - a related record waits for the operator to choose it in the field;
 * - a value the gateway discarded is shown with its reason, never written.
 *
 * A value goes in as the form writes one: through the field's accessor, in
 * every language for a `synci18n` field, then its `onChange`. Call it in
 * the setup of a detail extension, with the detail's context. The AI never
 * saves: the operator does, with the detail's own Save. A read-only form
 * is neither asked nor written, and while the detail saves the values wait
 * for Apply. Labels come from the `mapo.ai.*` messages of the app's i18n.
 *
 * @param target  The form: `useMapoDetail()` in a detail extension.
 * @param options What the AI should know about the record.
 *
 * @example
 * // A detail extension, placed in "body-top"
 * const detail = useMapoDetail();
 * const ai = detail
 *   ? useMapoAiFill(detail, { entity: { label: "Article", model: "article" } })
 *   : undefined;
 * await ai?.fill(pastedText);
 */
export function useMapoAiFill<T extends object>(
  target: MapoAiFillTarget<T>,
  options: MapoAiFillOptions = {},
): MapoAiFill {
  const app = useNuxtApp();
  const t = translatorOf(app);
  const post = gatewayPoster(app);
  // The backend's records, with the operator's session, as the form's own
  // relation fields read them.
  const get = gatewayGetter(app);

  const pending = shallowRef(false);
  const error = shallowRef<MapoAiFillError>();
  const response = shallowRef<MapoAiFillResponse>();
  const fields = shallowRef<readonly MapoAiFillField[]>([]);
  const rounds = shallowRef(0);
  const answers = shallowRef<readonly MapoAiFillAnswer[]>([]);

  let controller: AbortController | undefined;
  /** The marks the composable set, by the path they sit at: the only ones it removes. */
  const marks = new Map<string, FieldAnnotation>();
  /** Where each key of the session's answers goes. */
  const targets = new Map<string, KeyTarget<T>>();
  /** What the composable wrote into each field in the session, by its path, oldest first. */
  const memory = new Map<string, FieldWrite[]>();
  /** What a field that waits held when its answer came: a change is the operator's. */
  const held = new Map<string, string | undefined>();
  /** The records each relation listed for the AI, by path: their names show ids. */
  const listed = new Map<string, readonly unknown[]>();
  /** Writes made in the session, to order them. */
  let writes = 0;

  const isReadonly = () => target.readonly?.value === true;
  const isBusy = () => target.isBusy?.value === true;
  const isLoading = () => target.isLoading?.value === true;
  const canWrite = () => !isReadonly() && !isBusy() && !isLoading();
  const fieldAt = (path: string) =>
    fields.value.find((field) => field.path === path);
  const markPathOf = (field: MapoAiFillField) =>
    targets.get(field.key)?.markPath ?? field.path;

  async function fill(
    source: string | readonly MapoAiSourcePart[],
    call: MapoAiFillCall = {},
  ): Promise<void> {
    if (isReadonly()) return;
    cancel();
    error.value = undefined;
    const own = new AbortController();
    controller = own;
    pending.value = true;
    try {
      // The OPTIONS first: a detail that takes its languages or its fields
      // from it has them once it answers.
      const schema = await schemaOf();
      if (controller !== own) return;
      const descriptors = [
        ...target.fields.value,
        ...(target.sidebarFields?.value ?? []),
      ];
      const language = target.currentLang?.value ?? "";
      const declared = declaredKeys(fieldsToJsonSchema(descriptors));
      const located = new Map<string, KeyTarget<T>>();
      const locate = (key: string) => {
        if (!located.has(key)) {
          const found = keyTarget(descriptors, key, language, declared);
          if (found) located.set(key, found);
        }
        return located.get(key);
      };
      const answer = await runMapoAiFill(
        {
          fields: descriptors,
          schema,
          source,
          existing: target.isNew ? !target.isNew.value : false,
          language,
          instructions: call.instructions,
          provider: call.provider,
          entity: options.entity,
          form: {
            pathOf: (key) => locate(key)?.path,
            read: (path) => readModelValue(target.model.value, path),
            pathsOf: (key) => {
              const found = locate(key);
              return found ? writePaths(found) : [];
            },
            isShown: (key) => isShown(locate(key)),
            canTake: (key) => canTake(locate(key)),
            holds: (key, value) => holdsSame(locate(key), value),
          },
          signal: own.signal,
        },
        { post, get },
      );
      if (controller !== own) return;
      for (const [path, records] of Object.entries(answer.lists.records)) {
        listed.set(path, records);
      }
      const reply = answer.response;
      response.value = reply;
      // A refusal, and an answer that cannot be read, leave the session
      // as it was.
      const isAnswered = reply.status === "answered";
      if (!isAnswered || !reply.result.readable) return;
      // The answer joins the session: the marks and the memory of the
      // earlier answers stay where it gives nothing new.
      rounds.value += 1;
      answers.value = [
        ...answers.value,
        {
          round: rounds.value,
          provider: { ...reply.provider },
          prompt: reply.prompt,
          at: Date.now(),
        },
      ];
      for (const [key, found] of located) targets.set(key, found);
      const { joined, renewed } = join(answer.entries, rounds.value);
      for (const path of joined) {
        const field = fieldAt(path);
        if (field?.action !== "apply") continue;
        // An earlier write's onChange may have filled the field since the
        // plan found it empty: its value then waits, as a replacement the
        // operator sees before and after. A list's items go after what the
        // onChange put there.
        const isFilledSince = !joinsOwn(field.outcome) && holdsValue(field);
        if (isFilledSince) setField(path, { action: "confirm" });
        else write(path);
      }
      promoteRevealed(rounds.value);
      const reworded = retakeWaiting();
      refreshMarks(marksAt([...joined, ...renewed, ...reworded]));
    } catch (failure) {
      if (controller !== own) return;
      error.value = mapoAiFillErrorOf(failure, t);
    } finally {
      if (controller === own) {
        controller = undefined;
        pending.value = false;
      }
    }
  }

  /** The backend's schema, from the `OPTIONS` response; none when it cannot be had. */
  async function schemaOf(): Promise<JSONSchema | undefined> {
    let metadata: Record<string, unknown> | undefined;
    try {
      metadata = await target.metadata?.();
    } catch {
      // One description is enough: the form's fields describe the record.
      return undefined;
    }
    if (!metadata) return undefined;
    const read = options.schemaFromMetadata ?? metadataToJsonSchema;
    return read(metadata);
  }

  /** The form shows the field, as `isFieldShown()` of the form decides. */
  function isShown(located: KeyTarget<T> | undefined): boolean {
    if (!located) return false;
    const { descriptor } = located;
    const model = target.model.value;
    try {
      const removed = descriptor.visible
        ? !descriptor.visible({ model })
        : false;
      const hidden = descriptor.show ? !descriptor.show({ model }) : false;
      return !removed && !hidden;
    } catch {
      // A predicate that fails hides nothing for sure: the value waits.
      return false;
    }
  }

  /** A part of a field that converts its whole value cannot be written alone. */
  function canTake(located: KeyTarget<T> | undefined): boolean {
    if (!located) return false;
    const isPart = located.rest !== "";
    return !isPart || !accessorOf(located.descriptor).set;
  }

  function accessorOf(descriptor: AnyFieldDescriptor<T>): FieldAccessor {
    const registry = target.registry?.value;
    return registry
      ? resolveFieldAccessor(descriptor, registry)
      : (descriptor.accessor ?? {});
  }

  /**
   * Writes the AI's value of a field, a copy of it (`plannedWrite()`), or
   * what `planned` gives. A list goes after the field's own entries, never
   * in their place (`listWith()`, `recordsWith()`): an earlier write's
   * `onChange` may have put some in the field after the plan found it
   * empty. `false` when it cannot, or when a list has nothing left to add.
   */
  function write(path: string, planned?: PlannedWrite): boolean {
    const field = fieldAt(path);
    const located = field ? targets.get(field.key) : undefined;
    if (!field || !located || field.outcome.status !== "filled") return false;
    if (field.applied || field.review !== undefined || !canWrite()) {
      return false;
    }
    const chosen = planned ?? plannedWrite(field);
    if (chosen === undefined) return false;
    const records = writeField(located, chosen.value);
    if (!records) return false;
    writes += 1;
    memory.set(path, [...(memory.get(path) ?? []), { order: writes, records }]);
    setField(path, {
      applied: true,
      undoable: true,
      ...placedRelations(field, chosen),
    });
    return true;
  }

  /**
   * What a write of a field's own proposal leaves in it: a copy of the
   * AI's value; for a value that names related records, the records found
   * in their place; for a list, the field's own entries, then the AI's it
   * does not hold yet. `undefined` when there is nothing to write, as for a
   * value that names records no one looked for.
   */
  function plannedWrite(field: MapoAiFillField): PlannedWrite | undefined {
    const { outcome } = field;
    if (isNamedUnresolved(field)) return undefined;
    if (isItemList(outcome)) return listWith(field, undefined);
    if (isRecordList(outcome)) return recordsWith(field);
    const value = proposalOf(outcome, field.relations);
    return value === undefined ? undefined : { value: structuredClone(value) };
  }

  /**
   * Where the records the items of a list name go, once a write put the
   * items in the field: their place there (`blocks.4.article`), where one
   * the operator picks is marked.
   */
  function placedRelations(
    field: MapoAiFillField,
    planned: PlannedWrite,
  ): Partial<MapoAiFillField> {
    const { relations } = field;
    const isItems = isItemList(field.outcome);
    if (!relations || !isItems || !planned.added) return {};
    const own = planned.own ?? 0;
    const places = new Map(
      planned.added.map((index, rank) => [index, own + rank]),
    );
    return {
      relations: relations.map((match) => {
        const [first = "", ...rest] = match.at.split(".");
        const place = places.get(Number(first));
        const isPlaced = place !== undefined && rest.length > 0;
        if (!isPlaced) return match;
        return { ...match, path: [field.path, place, ...rest].join(".") };
      }),
    };
  }

  /**
   * Writes again into a field the AI's value is in, as one more write of
   * the session: a record the operator picks joins what the AI wrote.
   * Restore and undo take it away with the rest, newest first.
   */
  function rewrite(field: MapoAiFillField, value: unknown): boolean {
    const located = targets.get(field.key);
    const isOurs = field.applied && field.review === undefined;
    if (!located || !isOurs || !canWrite()) return false;
    const records = writeField(located, value);
    if (!records) return false;
    writes += 1;
    memory.set(field.path, [
      ...(memory.get(field.path) ?? []),
      { order: writes, records },
    ]);
    return true;
  }

  /**
   * The relation a field of the session is, as its descriptor declares it:
   * an `fks` or `m2m` field with an endpoint.
   */
  function relationFieldOf(
    field: MapoAiFillField,
  ): MapoAiRelationField | undefined {
    return relationOfTarget(targets.get(field.key));
  }

  /**
   * Writes a value as the form writes one: through the field's accessor,
   * in every language for a `synci18n` field, then its `onChange`.
   */
  function writeField(
    located: KeyTarget<T>,
    value: unknown,
  ): WriteRecord[] | undefined {
    const model = target.model.value;
    const { descriptor, rest } = located;
    const isWhole = rest === "";
    const paths = writePaths(located);
    let stored: unknown;
    try {
      const { set } = accessorOf(descriptor);
      const lang = target.currentLang?.value;
      stored = isWhole && set ? set({ model, val: value, lang }) : value;
    } catch {
      return undefined;
    }
    const records: WriteRecord[] = [];
    for (const at of paths) {
      const before = readModelValue(model, at);
      const done = writeModelValue(model, at, stored);
      if (!done) {
        undoRecords(records);
        return undefined;
      }
      records.push({ path: at, before, write: done, written: dataOf(stored) });
    }
    try {
      const changed = isWhole
        ? stored
        : readModelValue(model, located.markPath);
      descriptor.onChange?.({ model, val: changed });
    } catch {
      // The app's handler failed: the value is in, as when the operator types.
    }
    return records;
  }

  /**
   * Where a value of a field is written, as the form's own write: the
   * field's key in every language for a `synci18n` field, its path
   * otherwise. The plan reads the same paths, so a value that would go
   * into every language waits when any of them holds one.
   */
  function writePaths(located: KeyTarget<T>): string[] {
    const { descriptor, rest } = located;
    const languages = target.languages?.value ?? [];
    const isSynced = rest === "" && descriptor.synci18n === true;
    if (!isSynced || !languages.length) return [located.path];
    const key = String(descriptor.key);
    return languages.map((lang) => `translations.${lang}.${key}`);
  }

  /** The records of a write whose paths still hold what was written. */
  function untouchedOf(records: readonly WriteRecord[]): WriteRecord[] {
    const model = target.model.value;
    return records.filter((record) => {
      const current = dataOf(readModelValue(model, record.path));
      return record.written !== undefined && current === record.written;
    });
  }

  /**
   * A path of a write no longer holds what was written. A value whose data
   * could not be read when it was written (a cycle, a `BigInt`) tells no
   * change, and is left alone.
   */
  function isChanged(records: readonly WriteRecord[]): boolean {
    const model = target.model.value;
    return records.some((record) => {
      if (record.written === undefined) return false;
      return dataOf(readModelValue(model, record.path)) !== record.written;
    });
  }

  function undoRecords(records: readonly WriteRecord[]): void {
    const model = target.model.value;
    for (const record of [...records].reverse()) {
      undoModelWrite(model, record.path, record.write, record.before);
    }
  }

  /** What a field holds now, at every path its value is written to. */
  function snapshotOf(field: MapoAiFillField): string | undefined {
    const located = targets.get(field.key);
    const paths = located ? [field.path, ...writePaths(located)] : [field.path];
    const model = target.model.value;
    return dataOf(paths.map((path) => readModelValue(model, path)));
  }

  /**
   * The form already holds a value of the answer as its own: the same data
   * at every path a write would reach, where the session wrote nothing. An
   * AI value still in the field is the AI's, and stays to review. A field
   * whose type converts its whole value as it stores it (an accessor's
   * `set`) is never compared: its value would replace.
   */
  function holdsSame(
    located: KeyTarget<T> | undefined,
    value: unknown,
  ): boolean {
    if (!located || memory.has(located.path)) return false;
    try {
      const isWhole = located.rest === "";
      if (isWhole && accessorOf(located.descriptor).set) return false;
    } catch {
      // A type the registry cannot resolve: nothing tells how it stores.
      return false;
    }
    const model = target.model.value;
    // A related record is held when the field holds the same one, by its
    // id: the form may keep the record with other properties than the
    // endpoint's.
    const relation = relationOfTarget(located);
    if (relation) {
      const proposed: readonly unknown[] = Array.isArray(value)
        ? value
        : [value];
      const ids = proposed.map((one) => relationIdOf(one, relation.itemValue));
      const isKnown = ids.length > 0 && ids.every((id) => id !== undefined);
      if (!isKnown) return false;
      return writePaths(located).every((path) => {
        const held = readModelValue(model, path);
        return ids.every(
          (id) =>
            id !== undefined && holdsRelationId(held, id, relation.itemValue),
        );
      });
    }
    // A list of items is held when every item is, wherever it sits.
    const isItems =
      Array.isArray(value) && value.length > 0 && value.every(isRecord);
    if (isItems) {
      return writePaths(located).every((path) => {
        const held = readModelValue(model, path);
        return value.every((item) => isItemHeld(item, held));
      });
    }
    const data = dataOf(value);
    if (data === undefined) return false;
    return writePaths(located).every(
      (path) => dataOf(readModelValue(model, path)) === data,
    );
  }

  /** The field holds a value at any path its value would be written to. */
  function holdsValue(field: MapoAiFillField): boolean {
    const located = targets.get(field.key);
    const paths = located ? [field.path, ...writePaths(located)] : [field.path];
    const model = target.model.value;
    return paths.some((path) => !isEmptyFormValue(readModelValue(model, path)));
  }

  /**
   * Adds an answer's fields to the session. A field takes the place of
   * the session's one at its path only when it is news: a value the
   * session did not have there, or a discard where it had found nothing.
   * The same value again leaves what became of it: a value still the AI's,
   * in the form or waiting, only takes the new answer's proof when that
   * verifies it (`renewed`).
   */
  function join(
    entries: readonly MapoAiFillEntry[],
    round: number,
  ): { joined: string[]; renewed: string[] } {
    const next = new Map(fields.value.map((field) => [field.path, field]));
    const joined: string[] = [];
    const renewed: string[] = [];
    for (const entry of entries) {
      const earlier = next.get(entry.path);
      if (earlier === undefined || isNews(earlier, entry)) {
        next.set(entry.path, {
          ...entry,
          applied: false,
          // An earlier answer's value may still be in the field.
          undoable: memory.has(entry.path),
          round,
        });
        joined.push(entry.path);
        continue;
      }
      // The operator's decision stays; so does the proof the new one lacks.
      const isUndecided = earlier.review === undefined;
      const isProof =
        entry.outcome.status === "filled" && entry.outcome.verified;
      if (!isUndecided || !isProof) continue;
      next.set(entry.path, { ...earlier, outcome: entry.outcome });
      renewed.push(entry.path);
    }
    fields.value = [...next.values()];
    for (const path of joined) {
      const field = fieldAt(path);
      if (field) held.set(path, snapshotOf(field));
    }
    return { joined, renewed };
  }

  /**
   * An answer's field says something the session's did not: a value it
   * did not have, a value discarded where it had found nothing, or a value
   * the field held before and no longer holds.
   */
  function isNews(earlier: MapoAiFillField, entry: MapoAiFillEntry): boolean {
    // A value the field held as its own was no proposal: once the field
    // holds something else, the same value is one, as for any field.
    const wasHeld = earlier.action === "unchanged";
    if (wasHeld && entry.action !== "unchanged") return true;
    const now = entry.outcome;
    const before = earlier.outcome;
    if (now.status === "filled") {
      if (before.status !== "filled") return true;
      // A value with no JSON form is never the same.
      const was = dataOf(before.value);
      return was === undefined || was !== dataOf(now.value);
    }
    const isDiscarded = now.status === "discarded";
    return isDiscarded && before.status === "empty";
  }

  /**
   * After writes, what each field that waits holds is where the operator
   * starts from: a field's `onChange` may have written into another one,
   * which is no change of the operator's. Whether its value would replace
   * one is read again too. Returns the paths whose wording changed.
   */
  function retakeWaiting(): string[] {
    const reworded: string[] = [];
    for (const field of fields.value) {
      const isWaiting =
        !field.applied &&
        field.review === undefined &&
        field.action !== "unchanged" &&
        field.outcome.status !== "empty";
      if (!isWaiting) continue;
      held.set(field.path, snapshotOf(field));
      if (field.outcome.status !== "filled") continue;
      // A list's items, or records, go after the field's own: they
      // replace nothing.
      const replaces = !joinsOwn(field.outcome) && holdsValue(field);
      if (replaces === field.replaces) continue;
      setField(field.path, { replaces });
      reworded.push(field.path);
    }
    return reworded;
  }

  /** The paths of the marks of fields, by their value paths: those inside their items too. */
  function marksAt(paths: readonly string[]): string[] {
    return paths.flatMap((path) => {
      const field = fieldAt(path);
      return field ? markPathsOf(field) : [];
    });
  }

  /**
   * After an answer's own writes, a field they revealed may take its value
   * by itself: verified, empty and shown now. The pass only promotes, and
   * runs again while a write changes what the form shows.
   */
  function promoteRevealed(round: number): void {
    let isChanging = true;
    while (isChanging) {
      isChanging = false;
      for (const field of fields.value) {
        const { outcome } = field;
        const isCandidate =
          field.round === round &&
          field.action === "confirm" &&
          !field.applied &&
          field.review === undefined &&
          outcome.status === "filled" &&
          outcome.verified;
        if (!isCandidate) continue;
        // Records found under another name, or not found, still wait.
        const isNamed = holdsRelation(outcome);
        if (isNamed && !isRelationResolved(field.relations)) continue;
        const located = targets.get(field.key);
        const isTakenNow =
          isShown(located) && canTake(located) && !holdsValue(field);
        if (!isTakenNow) continue;
        setField(field.path, { action: "apply", shown: true, replaces: false });
        if (write(field.path)) isChanging = true;
      }
    }
  }

  function apply(path: string, options: MapoAiFillApplyOptions = {}): void {
    const field = fieldAt(path);
    const isWaiting = field?.action === "apply" || field?.action === "confirm";
    if (!field || !isWaiting) return;
    // The form may have hidden the field since the answer came: a value
    // the operator would not see go in waits until it shows again.
    if (!shownNow(path)) return;
    const isList = isItemList(field.outcome);
    const list = isList ? listWith(field, options.items) : undefined;
    if (isList && !list) return;
    if (!write(path, list)) return;
    const reworded = retakeWaiting();
    refreshMarks([...markPathsOf(field), ...marksAt([path, ...reworded])]);
  }

  function choose(markPath: string, candidate: number): void {
    const pick = pickAt(markPath);
    if (!pick || !canWrite()) return;
    const { field, match } = pick;
    const picked = match.candidates?.[candidate];
    if (!picked) return;
    // A value that waits goes in only into a field the operator sees.
    const isWaiting = !field.applied && match.path === undefined;
    if (isWaiting && !shownNow(field.path)) return;
    // A value already in goes on only while it holds what the AI wrote:
    // the operator may have moved or removed the item the record goes to.
    const last = memory.get(field.path)?.at(-1);
    const isOurs = last !== undefined && !isChanged(last.records);
    if (!isWaiting && !isOurs) return;
    const before = markPathsOf(field);
    setField(field.path, {
      relations: (field.relations ?? []).map((one) =>
        one.at === match.at ? { ...one, choice: candidate } : one,
      ),
    });
    const updated = fieldAt(field.path);
    let isDone = false;
    if (updated && match.path !== undefined) {
      // Inside an item the AI's list added: the record goes there.
      const value = valueWith(updated, match.path, picked.value);
      isDone = value !== undefined && rewrite(updated, value);
    } else if (updated?.applied) {
      // A list of records already in: the record joins them.
      const list = recordsWith(updated);
      isDone = list !== undefined && rewrite(updated, list.value);
    } else if (updated) {
      // The value waits: it goes in with the record picked, as Apply.
      isDone = write(updated.path);
    }
    // A pick that could not be written is no pick.
    if (!isDone) setField(field.path, { relations: field.relations });
    const reworded = retakeWaiting();
    refreshMarks([...before, ...marksAt([field.path, ...reworded])]);
  }

  /**
   * The record to pick at a mark: inside an item the AI's list added, the
   * one whose place it is; at a field's mark, the only record of its value
   * that several records match, with candidates to pick from.
   */
  function pickAt(markPath: string): Pick | undefined {
    for (const field of fields.value) {
      if (field.review !== undefined || !field.relations) continue;
      const nested = field.relations.find((match) => match.path === markPath);
      if (nested) {
        const isOpen = field.applied && isToPick(nested);
        return isOpen ? { field, match: nested } : undefined;
      }
      if (markPathOf(field) !== markPath) continue;
      // Several records to pick in a list of records: one at a time, in
      // the AI's order, so the buttons are always those of one name.
      const first = field.relations.find(
        (match) => !match.at.includes(".") && isToPick(match),
      );
      if (first) return { field, match: first };
    }
    return undefined;
  }

  /** The record a mark inside an item of a list is about, and its field. */
  function nestedAt(markPath: string): Pick | undefined {
    for (const field of fields.value) {
      const match = field.relations?.find((one) => one.path === markPath);
      if (match) return { field, match };
    }
    return undefined;
  }

  /** The paths of a field's marks: its own, and those of the records to pick inside its items. */
  function markPathsOf(field: MapoAiFillField): string[] {
    const nested = (field.relations ?? []).flatMap((match) =>
      match.path !== undefined ? [match.path] : [],
    );
    return [markPathOf(field), ...nested];
  }

  /**
   * A copy of the field's value with `value` at a path inside it, where an
   * item the AI added holds a record to pick: only what is on the way is
   * copied, so the other items stay as they are. `undefined` when the path
   * no longer leads anywhere in the value.
   */
  function valueWith(
    field: MapoAiFillField,
    path: string,
    value: unknown,
  ): unknown {
    const isInside = path.startsWith(`${field.path}.`) && isSafePath(path);
    if (!isInside) return undefined;
    const segments = path.slice(field.path.length + 1).split(".");
    const current = readModelValue(target.model.value, field.path);
    return withValueAt(toRaw(current), segments, structuredClone(value));
  }

  /**
   * The list a write of a list's items leaves in its field: the field's own
   * items, then the chosen ones it does not hold yet, in the AI's order,
   * each with the records it names that were found (one not found is
   * `null`, to pick once the item is in). `undefined` when none is left to
   * add. The own items are those of the field's path: a `synci18n` list
   * then goes into every language, as the form writes it.
   */
  function listWith(
    field: MapoAiFillField,
    chosen: readonly number[] | undefined,
  ): PlannedWrite | undefined {
    // Items that name records no one looked up are never written.
    if (isNamedUnresolved(field)) return undefined;
    const proposal = proposalOf(field.outcome, field.relations);
    if (!Array.isArray(proposal)) return undefined;
    const proposed: readonly unknown[] = proposal;
    const held = readModelValue(target.model.value, field.path);
    // The field's own items stay the same objects, so the form keeps them
    // as they are; the AI's are copies.
    const own: readonly unknown[] = Array.isArray(held) ? toRaw(held) : [];
    const indexes = chosen ?? proposed.map((_, index) => index);
    // An item the AI gives twice goes in once.
    const added: { index: number; item: unknown }[] = [];
    for (const [index, item] of proposed.entries()) {
      const isChosen = indexes.includes(index);
      const taken = [...own, ...added.map((one) => one.item)];
      if (isChosen && !isItemHeld(item, taken)) added.push({ index, item });
    }
    if (!added.length) return undefined;
    return {
      value: [...own, ...added.map((one) => structuredClone(one.item))],
      added: added.map((one) => one.index),
      own: own.length,
    };
  }

  /**
   * The list a write of a list of related records leaves in its field: the
   * field's own records, then the records found that it does not hold yet,
   * in the AI's order. `undefined` when none is left to add.
   *
   * @param withRenamed Records found under another name go too: Apply and
   *   a pick come after the operator saw both names; a write by itself
   *   comes only when every record was found with the AI's own name.
   */
  function recordsWith(
    field: MapoAiFillField,
    withRenamed = true,
  ): PlannedWrite | undefined {
    const relation = relationFieldOf(field);
    if (!relation || !field.relations) return undefined;
    const held = readModelValue(target.model.value, field.path);
    const own: readonly unknown[] = Array.isArray(held) ? toRaw(held) : [];
    const added: { index: number; value: unknown }[] = [];
    for (const match of field.relations.map(effectiveMatch)) {
      const isFound = match.status === "found" && match.id !== undefined;
      const isUsable = withRenamed || match.renamed !== true;
      if (!isFound || !isUsable || match.id === undefined) continue;
      const taken = [...own, ...added.map((one) => one.value)];
      if (holdsRelationId(taken, match.id, relation.itemValue)) continue;
      added.push({ index: Number(match.at), value: match.value });
    }
    if (!added.length) return undefined;
    return {
      value: [...own, ...added.map((one) => structuredClone(one.value))],
      added: added.map((one) => one.index),
      own: own.length,
    };
  }

  function recordsToAdd(path: string): unknown[] | undefined {
    const field = fieldAt(path);
    if (!field || !isRecordList(field.outcome)) return undefined;
    const planned = recordsWith(field);
    const records = Array.isArray(planned?.value) ? planned.value : [];
    return records.slice(planned?.own ?? records.length);
  }

  /** The form shows a field of the answer now: its predicates on the model as it is. */
  function shownNow(path: string): boolean {
    const field = fieldAt(path);
    return field ? isShown(targets.get(field.key)) : false;
  }

  function restore(path: string): void {
    const field = fieldAt(path);
    const holdsAiValue = field?.applied === true || field?.undoable === true;
    if (!field || !holdsAiValue || field.review !== undefined || !canWrite()) {
      return;
    }
    // Every write of the field, newest first: an earlier answer's value
    // goes too, so the field is as it was before the AI.
    const stack = memory.get(path) ?? [];
    for (const one of [...stack].reverse()) {
      undoRecords(untouchedOf(one.records));
    }
    memory.delete(path);
    // The marks inside its items go with the items.
    const paths = markPathsOf(field);
    setField(path, {
      applied: false,
      undoable: false,
      // The records picked go too: the value waits as it came.
      ...(field.relations ? { relations: field.relations.map(unpicked) } : {}),
    });
    // What the fields that wait hold now is where the operator starts from.
    const reworded = retakeWaiting();
    refreshMarks([...paths, ...marksAt(reworded)]);
  }

  function keep(path: string): void {
    const field = fieldAt(path);
    if (!field?.applied || field.review !== undefined) return;
    memory.delete(path);
    setField(path, { review: "kept", undoable: false });
    refreshMarks(markPathsOf(field));
  }

  function dismiss(path?: string): void {
    // The mark of a record to pick in a value already in: the pick goes,
    // the value stays the AI's.
    const pick = path === undefined ? undefined : pickOrNoteAt(path);
    if (pick) {
      setField(pick.field.path, {
        relations: (pick.field.relations ?? []).map((one) =>
          one.at === pick.match.at ? { ...one, ignored: true } : one,
        ),
      });
      refreshMarks(markPathsOf(pick.field));
      return;
    }
    const chosen = fields.value.filter(
      (field) =>
        path === undefined || field.path === path || markPathOf(field) === path,
    );
    for (const field of chosen) {
      // A value the field already holds has nothing to ignore.
      const isUndecided =
        field.review === undefined && field.action !== "unchanged";
      if (isUndecided) setField(field.path, { review: "ignored" });
    }
    const paths =
      path === undefined
        ? [...marks.keys()]
        : chosen.length
          ? chosen.flatMap(markPathsOf)
          : [path];
    refreshMarks(paths);
  }

  /**
   * A record to pick, or to set by hand, whose mark sits in a value already
   * in: inside an item the AI's list added, or in a list of records.
   */
  function pickOrNoteAt(markPath: string): Pick | undefined {
    const nested = nestedAt(markPath);
    if (nested) return nested;
    const pick = pickAt(markPath);
    return pick?.field.applied ? pick : undefined;
  }

  /**
   * An operator's change makes a value theirs: the mark goes, and so does
   * what would undo the AI's value.
   */
  function markEdited(path: string): void {
    const field = fieldAt(path);
    if (!field || field.review !== undefined) return;
    memory.delete(path);
    setField(path, { review: "edited", undoable: false });
    refreshMarks(markPathsOf(field));
  }

  function undo(): void {
    if (!canWrite()) return;
    const made = [...memory.values()].flat();
    made.sort((one, other) => other.order - one.order);
    for (const one of made) undoRecords(untouchedOf(one.records));
    close();
  }

  function close(): void {
    cancel();
    setMarks([...marks.keys()].map((path) => [path, undefined]));
    fields.value = [];
    response.value = undefined;
    error.value = undefined;
    memory.clear();
    held.clear();
    listed.clear();
    targets.clear();
    rounds.value = 0;
    answers.value = [];
  }

  function snapshot(): object | undefined {
    if (rounds.value === 0) return undefined;
    const session: MapoAiFillSession = {
      format: MAPO_AI_FILL_SESSION_FORMAT,
      rounds: rounds.value,
      answers: answers.value.map((answer) => ({
        ...answer,
        provider: { ...answer.provider },
      })),
      fields: fields.value.map(keptField),
    };
    return session;
  }

  /**
   * A field as a draft keeps it. Its writes go only when JSON carries what
   * they put back: a file or a date that was there is not written back as
   * text, so nothing undoes that field after a restore.
   */
  function keptField(field: MapoAiFillField): MapoAiFillSessionField {
    const stack = memory.get(field.path) ?? [];
    const isCarried = stack.every((one) =>
      one.records.every((record) => isPlainData(record.before)),
    );
    const kept = isCarried
      ? stack.map((one) => ({
          order: one.order,
          records: one.records.map((record) => ({ ...record })),
        }))
      : [];
    const wasHeld = held.get(field.path);
    return {
      key: field.key,
      path: field.path,
      action: field.action,
      replaces: field.replaces,
      shown: field.shown,
      outcome: field.outcome,
      applied: field.applied,
      ...(field.review ? { review: field.review } : {}),
      undoable: field.undoable && kept.length > 0,
      round: field.round,
      ...(wasHeld !== undefined ? { held: wasHeld } : {}),
      ...(field.relations ? { relations: field.relations } : {}),
      writes: kept,
    };
  }

  function resume(data: unknown): boolean {
    close();
    const session = readMapoAiFillSession(data);
    if (!session) return false;
    const descriptors = [
      ...target.fields.value,
      ...(target.sidebarFields?.value ?? []),
    ];
    const declared = declaredKeys(fieldsToJsonSchema(descriptors));
    const taken: MapoAiFillField[] = [];
    for (const saved of session.fields) {
      const located = locateKept(descriptors, declared, saved);
      if (!located) continue;
      targets.set(saved.key, located);
      // Undoing writes only where the field's value goes.
      const reach = new Set([located.path, ...writePaths(located)]);
      const isReached = saved.writes.every((one) =>
        one.records.every((record) => reach.has(record.path)),
      );
      const kept = isReached ? saved.writes : [];
      if (kept.length) {
        memory.set(
          saved.path,
          kept.map((one) => ({
            order: one.order,
            records: one.records.map((record) => ({
              path: record.path,
              before: record.before,
              write: record.write,
              written: record.written,
            })),
          })),
        );
      }
      if (saved.held !== undefined) held.set(saved.path, saved.held);
      taken.push({
        key: saved.key,
        path: saved.path,
        action: saved.action,
        replaces: saved.replaces,
        shown: saved.shown,
        outcome: saved.outcome,
        applied: saved.applied,
        ...(saved.review ? { review: saved.review } : {}),
        undoable: saved.undoable && kept.length > 0,
        round: saved.round,
        ...(saved.relations ? { relations: saved.relations } : {}),
      });
    }
    fields.value = taken;
    // A field that waits with nothing kept of what it held starts from
    // what it holds now.
    for (const field of taken) {
      const isWaiting = !field.applied && field.review === undefined;
      if (isWaiting && !held.has(field.path)) {
        held.set(field.path, snapshotOf(field));
      }
    }
    rounds.value = session.rounds;
    answers.value = session.answers;
    const orders = [...memory.values()].flat().map((one) => one.order);
    writes = Math.max(0, ...orders);
    refreshMarks(taken.flatMap(markPathsOf));
    return true;
  }

  /**
   * Where a kept field goes in the form as it is now: its key, at the
   * descriptor that declares it, in the language of its path; `undefined`
   * when the form no longer has it there.
   */
  function locateKept(
    descriptors: readonly AnyFieldDescriptor<T>[],
    declared: ReadonlySet<string>,
    saved: MapoAiFillSessionField,
  ): KeyTarget<T> | undefined {
    const languages = new Set([
      target.currentLang?.value ?? "",
      ...(target.languages?.value ?? []),
      "",
    ]);
    for (const language of languages) {
      const found = keyTarget(descriptors, saved.key, language, declared);
      if (found?.path === saved.path) return found;
    }
    return undefined;
  }

  function cancel(): void {
    controller?.abort();
    controller = undefined;
    pending.value = false;
  }

  function setField(path: string, change: Partial<MapoAiFillField>): void {
    fields.value = fields.value.map((field) =>
      field.path === path ? { ...field, ...change } : field,
    );
  }

  // The fields the operator changed: a value in the form that no longer
  // holds what the AI wrote, or a field that waits and no longer holds what
  // it held when the answer came. Read on the form as it is now.
  const changedPaths = computed(() =>
    fields.value
      .filter((field) => {
        // A value the field already held is no proposal to lose.
        const isTracked =
          field.review === undefined &&
          field.action !== "unchanged" &&
          field.outcome.status !== "empty";
        if (!isTracked) return false;
        if (!field.applied) return snapshotOf(field) !== held.get(field.path);
        const last = memory.get(field.path)?.at(-1);
        return last ? isChanged(last.records) : false;
      })
      .map((field) => field.path),
  );
  watch(changedPaths, (paths) => {
    for (const path of paths) markEdited(path);
  });

  // A save makes the values the record's: the session ends there.
  target.onSaved?.(() => close());

  function refreshMarks(paths: readonly string[]): void {
    const unique = [...new Set(paths)];
    setMarks(
      unique.map((one) => [
        one,
        nestedAt(one) ? relationMarkOf(one) : markOf(one),
      ]),
    );
  }

  /**
   * The mark of a record to pick inside an item the AI's list added, while
   * the list is the AI's: the candidates to pick from, or the words that
   * say to set it by hand, with Ignore.
   */
  function relationMarkOf(markPath: string): FieldAnnotation | undefined {
    const nested = nestedAt(markPath);
    if (!nested) return undefined;
    const { field, match } = nested;
    const isOpen =
      field.applied && field.review === undefined && match.ignored !== true;
    if (!isOpen || effectiveMatch(match).status === "found") return undefined;
    const ignore: FieldAnnotationAction = {
      label: t("mapo.ai.fill.ignore"),
      icon: "i-lucide-x",
      onClick: () => dismiss(markPath),
    };
    const description = relationNote(match);
    if (isToPick(match)) {
      return {
        label: t("mapo.ai.fill.ambiguous"),
        icon: "i-lucide-triangle-alert",
        color: "warning",
        description,
        actions: [...candidateActions(markPath, match), ignore],
      };
    }
    return {
      label: t("mapo.ai.fill.manual"),
      icon: "i-lucide-link",
      color: "info",
      description,
      actions: [ignore],
    };
  }

  /** A button for each record the operator can pick at a mark. */
  function candidateActions(
    markPath: string,
    match: MapoAiRelationMatch,
  ): FieldAnnotationAction[] {
    return (match.candidates ?? []).map((candidate, index) => ({
      label: mapoAiValueText(candidate.label, 60),
      icon: "i-lucide-link",
      onClick: () => choose(markPath, index),
    }));
  }

  /** What a mark says of a record that several records match, or none. */
  function relationNote(match: MapoAiRelationMatch): string {
    const name = mapoAiValueText(match.name, 80);
    if (match.status === "ambiguous") {
      return isToPick(match)
        ? t("mapo.ai.fill.relationPick", { name })
        : t("mapo.ai.fill.relationMany", { name, n: match.count ?? 0 });
    }
    return match.failed
      ? t("mapo.ai.fill.relationFailed", { name })
      : t("mapo.ai.fill.relationNone", { name });
  }

  /**
   * What a field's mark says of the records its value names that need the
   * operator: one found under another name, several to pick from, none.
   * Those inside items have marks of their own.
   */
  function relationLines(field: MapoAiFillField): string[] {
    const active = pickAt(markPathOf(field))?.match.at;
    return (field.relations ?? []).flatMap((match) => {
      if (match.at.includes(".") || match.ignored === true) return [];
      const current = effectiveMatch(match);
      // Another record to pick waits for the one whose buttons the mark has.
      const isNext = isToPick(match) && match.at !== active;
      if (isNext) {
        const name = mapoAiValueText(match.name, 80);
        return [t("mapo.ai.fill.relationPickNext", { name })];
      }
      if (current.status !== "found") return [relationNote(match)];
      if (current.renamed !== true) return [];
      return [
        t("mapo.ai.fill.relationRenamed", {
          name: mapoAiValueText(match.name, 80),
          label: mapoAiValueText(current.label ?? "", 80),
        }),
      ];
    });
  }

  /** Sets or removes marks, by path; a mark of someone else is removed only when replaced. */
  function setMarks(
    changes: readonly [string, FieldAnnotation | undefined][],
  ): void {
    const next = new Map(Object.entries(target.annotations.value));
    for (const [path, mark] of changes) {
      const ours = marks.get(path);
      const isOurs = ours !== undefined && toRaw(next.get(path)) === ours;
      if (isOurs) next.delete(path);
      marks.delete(path);
      if (!mark) continue;
      next.set(path, mark);
      marks.set(path, mark);
    }
    target.annotations.value = Object.fromEntries(next);
  }

  /**
   * The fields a mark tells of, and how they stand. A field the operator
   * decided has no mark, nor one that already held the value, and neither
   * does a value with no quote at all while it waits: it is listed apart.
   * A record to pick or to set by hand keeps its mark, the only place that
   * says so.
   */
  function markGroupOf(markPath: string): {
    group: MapoAiFillField[];
    waiting: MapoAiFillField[];
    applied: MapoAiFillField[];
    manual: MapoAiFillField[];
  } {
    const group = fields.value.filter(
      (field) =>
        markPathOf(field) === markPath &&
        field.outcome.status !== "empty" &&
        field.action !== "unchanged" &&
        field.review === undefined &&
        (field.applied ||
          !isUnprovenValue(field.outcome) ||
          isWithoutProofs() ||
          relationLines(field).length > 0),
    );
    return {
      group,
      waiting: group.filter(
        (field) =>
          !field.applied &&
          (field.action === "apply" || field.action === "confirm"),
      ),
      applied: group.filter((field) => field.applied),
      manual: group.filter((field) => field.action === "manual"),
    };
  }

  /**
   * Whether a mark waits for the operator: a value to apply, a record to
   * pick, a value to set by hand, inside an item too. Not a value in the
   * form, unless a record of it is still to pick, nor a discarded one.
   */
  function asksOperator(markPath: string): boolean {
    if (nestedAt(markPath)) return relationMarkOf(markPath) !== undefined;
    const { group, waiting, applied, manual } = markGroupOf(markPath);
    if (!group.length) return false;
    // In the order of `markOf()`: a value in the form wins over the record
    // to pick it came from, once picked.
    if (waiting.length > 0) return true;
    if (applied.length > 0) return pickAt(markPath) !== undefined;
    return manual.length > 0;
  }

  /**
   * Where a path sits in the form, to sort marks as the operator meets
   * them: its field's place among the body's and the sidebar's fields,
   * then the item's place in a list, then the path itself.
   */
  function formPlaceOf(markPath: string): [number, number, string] {
    const descriptors: readonly AnyFieldDescriptor<T>[] = [
      ...target.fields.value,
      ...(target.sidebarFields?.value ?? []),
    ];
    // The field of the session the mark tells of: its own, or the list
    // that holds the item a record to pick is in.
    const owner =
      nestedAt(markPath)?.field ??
      fields.value.find((field) => markPathOf(field) === markPath);
    const descriptor = owner ? targets.get(owner.key)?.descriptor : undefined;
    const place = descriptor ? descriptors.indexOf(descriptor) : -1;
    const isInside =
      owner !== undefined && markPath.startsWith(`${owner.path}.`);
    const rest = isInside ? markPath.slice(owner.path.length + 1) : "";
    const item = Number.parseInt(rest, 10);
    return [
      place >= 0 ? place : descriptors.length,
      Number.isNaN(item) ? -1 : item,
      markPath,
    ];
  }

  function compareFormPlaces(a: string, b: string): number {
    const [fieldA, itemA, pathA] = formPlaceOf(a);
    const [fieldB, itemB, pathB] = formPlaceOf(b);
    if (fieldA !== fieldB) return fieldA - fieldB;
    if (itemA !== itemB) return itemA - itemB;
    return pathA.localeCompare(pathB);
  }

  const toCheck = computed<string[]>(() => {
    const paths = new Set(fields.value.flatMap(markPathsOf));
    return [...paths].filter(asksOperator).sort(compareFormPlaces);
  });

  function nextToCheck(after?: string): string | undefined {
    const paths = toCheck.value;
    if (after === undefined) return paths[0];
    const next = paths.find(
      (path) => path !== after && compareFormPlaces(path, after) > 0,
    );
    return next ?? paths.find((path) => path !== after) ?? paths[0];
  }

  /**
   * The mark of a field: what the AI proposed for it, and what the operator
   * can do. A field whose value has parts (`seo.title`, `seo.description`)
   * gets one mark, at the field, that tells each part.
   */
  function markOf(markPath: string): FieldAnnotation | undefined {
    const { group, waiting, applied, manual } = markGroupOf(markPath);
    if (!group.length) return undefined;
    const undoable = group.filter((field) => field.undoable);
    const isWaiting = waiting.length > 0;
    const isApplied = applied.length > 0;
    const isManual = manual.length > 0;
    const [only] = group;
    const description =
      group.length === 1 && only
        ? lineOf(only)
        : group
            .map((field) => `${partOf(field)}: ${lineOf(field)}`)
            .join(" · ");
    const ignore: FieldAnnotationAction = {
      label: t("mapo.ai.fill.ignore"),
      icon: "i-lucide-x",
      onClick: () => dismiss(markPath),
    };
    // A list adds by itself only its verified items it does not hold:
    // with none, its items are the operator's to choose. A list of records
    // adds those found that the field does not hold.
    const applicable = waiting.filter((field) => {
      if (isItemList(field.outcome)) return itemsByDefault(field).length > 0;
      if (isRecordList(field.outcome)) return recordsWith(field) !== undefined;
      return true;
    });
    // The candidates of a record to pick, and the Ignore of the pick in a
    // value already in.
    const pick = pickAt(markPath);
    const picks = pick ? candidateActions(markPath, pick.match) : [];
    const applyAll: FieldAnnotationAction = {
      label: t("mapo.apply"),
      icon: "i-lucide-check",
      color: "primary",
      onClick: () =>
        applicable.forEach((field) =>
          apply(
            field.path,
            isItemList(field.outcome) ? { items: itemsByDefault(field) } : {},
          ),
        ),
    };
    const restoreAll: FieldAnnotationAction = {
      label: t("mapo.restore"),
      icon: "i-lucide-undo-2",
      onClick: () => undoable.forEach((field) => restore(field.path)),
    };
    const keepAll: FieldAnnotationAction = {
      label: t("mapo.ai.fill.keep"),
      icon: "i-lucide-check",
      onClick: () => applied.forEach((field) => keep(field.path)),
    };
    if (isWaiting) {
      return {
        label: t("mapo.ai.fill.confirm"),
        icon: "i-lucide-sparkles",
        color: "warning",
        dot: true,
        description,
        // An earlier answer's value in the field: Restore puts it back too.
        actions: [
          ...(applicable.length ? [applyAll] : []),
          ...picks,
          ...(undoable.length ? [restoreAll] : []),
          ignore,
        ],
      };
    }
    if (isApplied) {
      const isVerified = applied.every(isProvedWrite);
      return {
        label: t("mapo.ai.fill.applied"),
        icon: "i-lucide-sparkles",
        color: isVerified ? "success" : "warning",
        description,
        // Ignore here ignores the pick: the value stays the AI's.
        actions: [keepAll, restoreAll, ...picks, ...(pick ? [ignore] : [])],
      };
    }
    if (isManual && pick) {
      return {
        label: t("mapo.ai.fill.ambiguous"),
        icon: "i-lucide-triangle-alert",
        color: "warning",
        description,
        actions: [...picks, ignore],
      };
    }
    if (isManual) {
      return {
        label: t("mapo.ai.fill.manual"),
        icon: "i-lucide-link",
        color: "info",
        description,
        actions: [ignore],
      };
    }
    return {
      label: t("mapo.ai.fill.discarded"),
      icon: "i-lucide-ban",
      color: "error",
      description,
      actions: [ignore],
    };
  }

  /** What the mark says of one field of the answer. */
  function lineOf(field: MapoAiFillField): string {
    const { outcome } = field;
    if (outcome.status === "discarded") {
      return t(`mapo.ai.fill.reasons.${outcome.reason}`, {
        value: shown(field, outcome.proposed),
      });
    }
    if (outcome.status !== "filled") return "";
    // A value that names records shows those found, by their names.
    const proposed = proposalOf(outcome, field.relations);
    const value = shown(field, proposed ?? outcome.value);
    const proof = proofOf(outcome);
    const relationNotes = relationLines(field);
    if (field.action === "manual" && !field.applied) {
      // Records looked for and not found: what was found of each, and what
      // a record picked would replace, so the operator sees both.
      if (field.relations) {
        const replacing = field.replaces ? pickReplacementOf(field) : "";
        return [...relationNotes, replacing, proof].filter(Boolean).join(" ");
      }
      const message = holdsRelation(outcome)
        ? "mapo.ai.fill.manualText"
        : "mapo.ai.fill.manualField";
      return t(message, { value });
    }
    const notes = [
      ...(outcome.dropped?.length
        ? [t("mapo.ai.fill.dropped", { n: outcome.dropped.length })]
        : []),
      ...(outcome.tooFew ? [t("mapo.ai.fill.tooFew")] : []),
    ];
    const added =
      field.applied && outcome.items ? itemsAdded(field) : undefined;
    if (added && outcome.items) {
      const { items } = outcome;
      const verified = added.filter((at) => items[at]?.verified);
      // A quote proves what the write added only when every item it added
      // is verified: the first one any of them quotes.
      const isProved = added.length > 0 && verified.length === added.length;
      const addedQuote = isProved
        ? added
            .map((at) => itemQuoteOf(items[at]))
            .find((one) => one !== undefined)
        : undefined;
      return [
        t("mapo.ai.fill.itemsAdded", {
          n: added.length,
          verified: verified.length,
        }),
        ...(addedQuote !== undefined
          ? [
              t("mapo.ai.fill.proven", {
                quote: mapoAiValueText(addedQuote, 200),
              }),
            ]
          : []),
        ...notes,
      ].join(" ");
    }
    if (field.applied) return [proof, ...relationNotes, ...notes].join(" ");
    if (outcome.items)
      return [itemsLineOf(field, outcome.items), ...notes].join(" ");
    const proposal = field.replaces
      ? replacementOf(field, value)
      : t("mapo.ai.fill.proposes", { value });
    return [proposal, ...relationNotes, proof, ...notes].join(" ");
  }

  /**
   * What a mark says of a value's proof: the words of the source that
   * prove it, each with where the AI places them (a file, a page), or a
   * list's first quote among its items; otherwise the words the AI quoted
   * that are not in the source, for the operator to look for, and that no
   * quote proves it, or that the page asks for none.
   */
  function proofOf(outcome: AiFieldOutcome): string {
    if (outcome.status !== "filled") return "";
    const found = outcome.quotes.filter((one) => one.found);
    if (outcome.verified && found.length) {
      const seen = new Set<string>();
      const lines = found.flatMap((one) => {
        const quote = mapoAiValueText(one.quote, 200);
        if (seen.has(quote)) return [];
        seen.add(quote);
        const where = mapoAiValueText(one.where, 60);
        return [
          where
            ? t("mapo.ai.fill.provenIn", { quote, where })
            : t("mapo.ai.fill.proven", { quote }),
        ];
      });
      return lines.slice(0, MAX_QUOTES).join(" ");
    }
    const quote = foundQuoteOf(outcome);
    if (outcome.verified && quote !== undefined) {
      return t("mapo.ai.fill.proven", { quote: mapoAiValueText(quote, 200) });
    }
    const missing = outcome.quotes
      .filter((one) => !one.found && one.quote.trim() !== "")
      .slice(0, 1)
      .map((one) =>
        t("mapo.ai.fill.quotedNotFound", {
          quote: mapoAiValueText(one.quote, 120),
        }),
      );
    const lead = isWithoutProofs()
      ? t("mapo.ai.fill.notAsked")
      : t("mapo.ai.fill.notProven");
    return [...missing, lead].join(" ");
  }

  /** The page asks for no quotes: a value without any is no proposal without proof. */
  function isWithoutProofs(): boolean {
    return options.entity?.evidence === false;
  }

  /**
   * What the mark of a list that waits says: how many items, how many
   * verified, how many the field holds already, and, when none would go in
   * by itself and some could be added, that the operator chooses them.
   */
  function itemsLineOf(
    field: MapoAiFillField,
    items: readonly AiItemOutcome[],
  ): string {
    const verified = items.filter((item) => item.verified).length;
    const held = itemsHeld(field);
    // Items with a record to pick once they are in, or to set by hand.
    const toPick = items.filter(
      (_, index) => !isItemResolved(field.relations, index),
    ).length;
    return [
      t("mapo.ai.fill.proposesItems", { n: items.length, verified }),
      ...(held ? [t("mapo.ai.fill.itemsHeld", { n: held })] : []),
      ...(toPick ? [t("mapo.ai.fill.itemsToPick", { n: toPick })] : []),
      ...(itemsByDefault(field).length || held === items.length
        ? []
        : [t("mapo.ai.fill.chooseItems")]),
    ].join(" ");
  }

  /**
   * The items of a list Apply adds on its mark: the verified ones the field
   * does not hold, whose records were all found with the AI's names.
   */
  function itemsByDefault(field: MapoAiFillField): number[] {
    return verifiedItemsToAdd(
      field.outcome,
      readModelValue(target.model.value, field.path),
      field.relations,
    );
  }

  /**
   * The AI's items the session's writes of a list added, by their place in
   * its list: those the field holds now and did not hold before the first
   * of them. `undefined` when what it held then is not known, as after a
   * draft that could not keep it.
   */
  function itemsAdded(field: MapoAiFillField): number[] | undefined {
    const proposal = proposalOf(field.outcome, field.relations);
    if (!Array.isArray(proposal)) return [];
    const first = memory.get(field.path)?.at(0)?.records[0];
    if (!first) return undefined;
    const now = readModelValue(target.model.value, field.path);
    const proposed: readonly unknown[] = proposal;
    return proposed.flatMap((item, index) =>
      isItemHeld(item, now) && !isItemHeld(item, first.before) ? [index] : [],
    );
  }

  /**
   * A value in the form is proved: a value by its quote, a list's writes
   * by every item they added, or by the list's own `verified` when what
   * they added is not known.
   */
  function isProvedWrite(field: MapoAiFillField): boolean {
    const { outcome } = field;
    if (outcome.status !== "filled") return false;
    const items = outcome.items;
    const added = items ? itemsAdded(field) : undefined;
    if (!items || !added) return outcome.verified;
    return added.every((at) => items[at]?.verified === true);
  }

  /** The first quote of an item found in the source, among its values. */
  function itemQuoteOf(item: AiItemOutcome | undefined): string | undefined {
    if (!item) return undefined;
    return Object.values(item.fields)
      .map(foundQuoteOf)
      .find((one) => one !== undefined);
  }

  /** How many items of a list the field holds already. */
  function itemsHeld(field: MapoAiFillField): number {
    const proposal = proposalOf(field.outcome, field.relations);
    if (!Array.isArray(proposal)) return 0;
    const own = readModelValue(target.model.value, field.path);
    const proposed: readonly unknown[] = proposal;
    return proposed.filter((item) => isItemHeld(item, own)).length;
  }

  /**
   * A value that would replace one, as its mark says it: before and after,
   * the field's value now and, for a `synci18n` field, each other
   * language's value the write would replace (`en: …`). When that shows
   * nothing, the plain words say it replaces a value.
   */
  function replacementOf(field: MapoAiFillField, value: string): string {
    const before = replaced(field.path);
    const own =
      before && !isEmptyFormValue(before.value)
        ? shown(field, before.value)
        : "";
    const others = Object.entries(before?.languages ?? {}).map(
      ([language, held]) => `${language}: ${shown(field, held)}`,
    );
    const current = [own, ...others].filter(Boolean).join(" · ");
    return current
      ? t("mapo.ai.fill.proposesInsteadOf", { value, current })
      : t("mapo.ai.fill.proposesInstead", { value });
  }

  /** What a record the operator picks for a field that holds a value would replace. */
  function pickReplacementOf(field: MapoAiFillField): string {
    const before = replaced(field.path);
    const current =
      before && !isEmptyFormValue(before.value)
        ? shown(field, before.value)
        : "";
    return current ? t("mapo.ai.fill.pickReplaces", { current }) : "";
  }

  function replaced(path: string): MapoAiFillReplaced | undefined {
    const field = fieldAt(path);
    const located = field ? targets.get(field.key) : undefined;
    if (!field || !located) return undefined;
    const model = target.model.value;
    const value = readModelValue(model, field.path);
    const own = dataOf(value);
    const { outcome } = field;
    const proposed =
      outcome.status === "filled" ? dataOf(outcome.value) : undefined;
    // The other paths a write reaches: every language of a `synci18n`
    // field, `translations.<language>.<key>`.
    const lost = writePaths(located).flatMap((at) => {
      if (at === field.path) return [];
      const held = readModelValue(model, at);
      const data = dataOf(held);
      const isLost =
        !isEmptyFormValue(held) && data !== own && data !== proposed;
      const language = at.split(".")[1];
      return isLost && language ? [[language, held] as const] : [];
    });
    return lost.length
      ? { value, languages: Object.fromEntries(lost) }
      : { value };
  }

  /** The part of a field a key names: `title` for `seo.title`. */
  function partOf(field: MapoAiFillField): string {
    const rest = targets.get(field.key)?.rest ?? "";
    return rest ? rest.slice(1) : field.key;
  }

  /**
   * A value as the marks show it: the labels of a select's choices or the
   * names of related records, its text, or how many items a list has.
   */
  function shown(field: MapoAiFillField, value: unknown): string {
    const label = labelsOf(field, value);
    if (label) return label;
    const text = mapoAiValueText(value);
    if (text || !Array.isArray(value)) return text;
    return t("mapo.ai.fill.items", { n: value.length });
  }

  function textOf(path: string, value: unknown): string {
    const field = fieldAt(path);
    return field ? shown(field, value) : mapoAiValueText(value);
  }

  /**
   * The labels a value shows, when each of its values has one: a choice
   * of a select, a related record (found, listed for the AI, or its own
   * name), a record the AI picked from the page's list. `undefined` when
   * one of them has none, so the value shows as it is.
   */
  function labelsOf(
    field: MapoAiFillField,
    value: unknown,
  ): string | undefined {
    const located = targets.get(field.key);
    const values: readonly unknown[] = Array.isArray(value) ? value : [value];
    if (!values.length) return undefined;
    const labels = values.map((one) => labelOfValue(field, located, one));
    const isNamed = labels.every((one) => one !== undefined && one !== "");
    return isNamed ? labels.join(", ") : undefined;
  }

  function labelOfValue(
    field: MapoAiFillField,
    located: KeyTarget<T> | undefined,
    value: unknown,
  ): string | undefined {
    // A record the AI picked by its id, from the page's list.
    const isPicked =
      isRecord(value) && Object.keys(value).length === 1 && "id" in value;
    if (isPicked) return pageChoiceLabel(field.key, value.id);
    const relation = relationOfTarget(located);
    if (relation) return recordLabel(field, relation, value);
    return located ? selectLabel(located.descriptor, value) : undefined;
  }

  /** The label of a record the page lists for the AI, by its id. */
  function pageChoiceLabel(key: string, id: unknown): string | undefined {
    const lists = options.entity?.relationChoices;
    const choices = lists && Object.hasOwn(lists, key) ? lists[key] : undefined;
    return choices?.find((choice) => sameId(choice.value, id))?.label;
  }

  /**
   * The name of a related record a field holds, the record or its id: the
   * record found for the AI's value, one the endpoint listed, or the
   * record's own name.
   */
  function recordLabel(
    field: MapoAiFillField,
    relation: MapoAiRelationField,
    value: unknown,
  ): string | undefined {
    const id = relationIdOf(value, relation.itemValue);
    if (id === undefined) return undefined;
    const found = (field.relations ?? [])
      .map(effectiveMatch)
      .find((match) => match.status === "found" && sameId(match.id, id));
    if (found?.label) return found.label;
    const records = listed.get(relation.path) ?? [];
    const record = records.find((one) =>
      sameId(relationIdOf(one, relation.itemValue), id),
    );
    const named = isRecord(record) ? record : isRecord(value) ? value : {};
    const text = named[relation.itemText];
    const isText = typeof text === "string" || typeof text === "number";
    return isText ? String(text) : undefined;
  }

  // A component that goes away stops waiting: its form may be gone too.
  if (getCurrentScope()) onScopeDispose(cancel);

  return {
    fill,
    apply,
    choose,
    restore,
    keep,
    dismiss,
    undo,
    close,
    cancel,
    isShown: shownNow,
    replaced,
    textOf,
    recordsToAdd,
    toCheck,
    nextToCheck,
    pending,
    error,
    response,
    fields,
    rounds,
    answers,
    snapshot,
    resume,
  };
}

/** A list whose entries join the field's own, and never replace them: items, or related records. */
function joinsOwn(outcome: AiFieldOutcome): boolean {
  return isItemList(outcome) || isRecordList(outcome);
}

/**
 * A value that names related records nobody looked up, as one a draft
 * brings back without them: the form cannot take it as it is.
 */
function isNamedUnresolved(field: MapoAiFillField): boolean {
  return holdsRelation(field.outcome) && !field.relations;
}

/**
 * A record several records match, that the operator has neither picked
 * nor ignored, with candidates to pick from.
 */
function isToPick(match: MapoAiRelationMatch): boolean {
  const isOpen =
    effectiveMatch(match).status === "ambiguous" && match.ignored !== true;
  return isOpen && (match.candidates?.length ?? 0) > 0;
}

/** A match as it came: nobody picked or ignored it, and it has no place in the field. */
function unpicked(match: MapoAiRelationMatch): MapoAiRelationMatch {
  const { choice: _choice, ignored: _ignored, path: _path, ...rest } = match;
  return rest;
}

/**
 * The relation a field is, as its descriptor declares it: an `fks` or
 * `m2m` field with an endpoint, written whole.
 */
function relationOfTarget<T extends object>(
  located: KeyTarget<T> | undefined,
): MapoAiRelationField | undefined {
  if (!located || located.rest !== "") return undefined;
  const key = String(located.descriptor.key);
  return mapoAiRelationFields([located.descriptor]).find(
    (relation) => relation.path === key,
  );
}

/**
 * The label of a select's choice, by its value, from `attrs.items` (Nuxt
 * UI's shape, or plain strings) or `attrs.options` (`text` and `value`).
 */
function selectLabel(descriptor: unknown, value: unknown): string | undefined {
  const attrs =
    isRecord(descriptor) && isRecord(descriptor.attrs) ? descriptor.attrs : {};
  const items: unknown = Array.isArray(attrs.items)
    ? attrs.items
    : attrs.options;
  if (!Array.isArray(items)) return undefined;
  const data = dataOf(value);
  for (const item of items) {
    if (typeof item === "string") {
      if (dataOf(item) === data) return item;
      continue;
    }
    if (!isRecord(item) || dataOf(item.value) !== data) continue;
    const label = item.label ?? item.text;
    if (typeof label === "string") return label;
  }
  return undefined;
}

/**
 * A copy of a list or an object with a value at a path inside it: only
 * what is on the way is copied, so the rest stays the same objects.
 * `undefined` when the path leads nowhere in it.
 */
function withValueAt(
  container: unknown,
  segments: readonly string[],
  value: unknown,
): unknown {
  const [first, ...rest] = segments;
  if (first === undefined) return value;
  if (Array.isArray(container)) {
    const index = Number(first);
    const isPlace =
      Number.isInteger(index) && index >= 0 && index < container.length;
    if (!isPlace) return undefined;
    const inner = withValueAt(toRaw(container[index]), rest, value);
    if (inner === undefined) return undefined;
    const copy = [...container];
    copy[index] = inner;
    return copy;
  }
  if (!isRecord(container)) return undefined;
  const own = Object.hasOwn(container, first) ? container[first] : undefined;
  const inner = rest.length ? withValueAt(toRaw(own), rest, value) : value;
  if (inner === undefined) return undefined;
  return { ...container, [first]: inner };
}

/**
 * Where a key of the answer goes: a key the form's fields declare, at the
 * descriptor whose key is the longest to hold it, in the current language
 * for a translatable field, as the form's `valuePath()` puts it
 * (`translations.it.title`). `undefined` for a key the form does not declare.
 */
function keyTarget<T extends object>(
  descriptors: readonly AnyFieldDescriptor<T>[],
  key: string,
  language: string,
  declared: ReadonlySet<string>,
): KeyTarget<T> | undefined {
  if (!declared.has(key)) return undefined;
  let found: AnyFieldDescriptor<T> | undefined;
  let length = -1;
  for (const descriptor of descriptors) {
    const own = String(descriptor.key);
    const isSame = key === own;
    const isInside = key.startsWith(`${own}.`);
    const isLonger = own.length > length;
    if ((isSame || isInside) && isLonger) {
      found = descriptor;
      length = own.length;
    }
  }
  if (!found) return undefined;
  // The descriptor's own key, and what follows it: `.title` in `seo.title`.
  const own = key.slice(0, length);
  const rest = key.slice(length);
  const isTranslated = Boolean(found.translatable) && language !== "";
  const base = isTranslated ? `translations.${language}.${own}` : own;
  return { descriptor: found, path: `${base}${rest}`, markPath: base, rest };
}

/**
 * The error of a call to the gateway, for the operator: its status, a
 * message from `mapo.ai.errors.*` and the seconds of `Retry-After`. Not
 * public: Magic Fill reads the errors of its preview with it.
 */
export function mapoAiFillErrorOf(
  failure: unknown,
  t: Translate,
): MapoAiFillError {
  if (failure instanceof MapoAiFillAnswerError) {
    return { status: 0, message: t("mapo.ai.errors.badAnswer") };
  }
  const status = statusOf(failure);
  const retryAfter = retryAfterOf(failure);
  const reason = refusalReasonOf(failure);
  // `$fetch` rejects with a `FetchError`; one without a status got no answer.
  const isFetchFailure = isRecord(failure) && failure.name === "FetchError";
  const unanswered = isFetchFailure ? "network" : "failed";
  const known =
    FAILURE_MESSAGES.get(failureNameOf(failure)) ??
    (reason ? REFUSAL_MESSAGES.get(reason) : undefined) ??
    ERROR_MESSAGES[status];
  const name = status === 0 ? unanswered : (known ?? "failed");
  const saysWhen = retryAfter !== undefined && WAITING_MESSAGES.has(name);
  const message = t(`mapo.ai.errors.${saysWhen ? `${name}In` : name}`, {
    seconds: retryAfter,
  });
  return {
    status,
    message,
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    ...(reason ? { reason } : {}),
  };
}

/** The reason the gateway gives a refusal before any call, in the answer's `data`. */
function refusalReasonOf(failure: unknown): MapoAiRefusalReason | undefined {
  const body = isRecord(failure) ? failure.data : undefined;
  const data = isRecord(body) ? body.data : undefined;
  const reason = isRecord(data) ? data.reason : undefined;
  return isRefusalReason(reason) ? reason : undefined;
}

function isRefusalReason(value: unknown): value is MapoAiRefusalReason {
  return [...REFUSAL_MESSAGES.keys()].some((reason) => reason === value);
}

/** The status code of a failed call, as `$fetch` rejects it; `0` without one. */
function statusOf(failure: unknown): number {
  if (!isRecord(failure)) return 0;
  const response = isRecord(failure.response) ? failure.response : undefined;
  const candidates = [failure.statusCode, failure.status, response?.status];
  const status = candidates.find(
    (one): one is number => typeof one === "number" && one > 0,
  );
  return status ?? 0;
}

/**
 * The name `run` gives a provider's failure, in the answer's `data`:
 * `$fetch` puts the answer in `data`, and the gateway's error its own `data`
 * in it.
 */
function failureNameOf(failure: unknown): string {
  const body = isRecord(failure) ? failure.data : undefined;
  const data = isRecord(body) ? body.data : undefined;
  const name = isRecord(data) ? data.failure : undefined;
  return typeof name === "string" ? name : "";
}

/** The seconds of the answer's `Retry-After`, when it has one. */
function retryAfterOf(failure: unknown): number | undefined {
  if (!isRecord(failure) || !isRecord(failure.response)) return undefined;
  const headers = failure.response.headers;
  const get: unknown = isRecord(headers) ? headers.get : undefined;
  if (typeof get !== "function") return undefined;
  const header: unknown = Reflect.apply(get, headers, ["retry-after"]);
  const seconds = typeof header === "string" ? Number(header) : Number.NaN;
  const isSeconds = Number.isFinite(seconds) && seconds > 0;
  return isSeconds ? Math.ceil(seconds) : undefined;
}
