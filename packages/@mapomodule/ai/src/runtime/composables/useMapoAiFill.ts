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
  holdsRelation,
  isEmptyFormValue,
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
import type { MapoAiSourcePart } from "../shared/gateway";
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
import type { AiFieldOutcome } from "../shared/sanitize";
import { gatewayPoster } from "./poster";
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

/** Why the last `fill()` got no answer. */
export interface MapoAiFillError {
  /** The gateway's status code; `0` when no answer arrived, or none could be read. */
  status: number;
  /** What went wrong, for the operator, in the app's language. */
  message: string;
  /** Seconds to wait before trying again, when the gateway says. */
  retryAfter?: number;
}

/** What `useMapoAiFill()` returns. */
export interface MapoAiFill {
  /**
   * Sends the source to the AI with the record's two descriptions, then
   * writes into the form each value a quote verifies on an empty field it
   * shows, and marks the fields the answer gives. Once those writes are
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
   */
  apply(path: string): void;
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
   * Removes the composable's mark of a field, by its path or the mark's,
   * or every mark: a value that waits is ignored, one in the form stays.
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
]);

/** Messages that can say how long to wait, as `<message>In`. */
const WAITING_MESSAGES = new Set(["rateLimited", "unavailable"]);

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
          },
          signal: own.signal,
        },
        { post },
      );
      if (controller !== own) return;
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
        if (fieldAt(path)?.action === "apply") write(path);
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

  /** Writes the AI's value of a field; `false` when it cannot. */
  function write(path: string): boolean {
    const field = fieldAt(path);
    const outcome = field?.outcome;
    const located = field ? targets.get(field.key) : undefined;
    if (!field || !located || outcome?.status !== "filled") return false;
    if (field.applied || field.review !== undefined || !canWrite()) {
      return false;
    }
    const records = writeField(located, structuredClone(outcome.value));
    if (!records) return false;
    writes += 1;
    memory.set(path, [...(memory.get(path) ?? []), { order: writes, records }]);
    setField(path, { applied: true, undoable: true });
    return true;
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
   * did not have, or a value discarded where it had found nothing.
   */
  function isNews(earlier: MapoAiFillField, entry: MapoAiFillEntry): boolean {
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
        field.outcome.status !== "empty";
      if (!isWaiting) continue;
      held.set(field.path, snapshotOf(field));
      if (field.outcome.status !== "filled") continue;
      const replaces = holdsValue(field);
      if (replaces === field.replaces) continue;
      setField(field.path, { replaces });
      reworded.push(field.path);
    }
    return reworded;
  }

  /** The paths of the marks of fields, by their value paths. */
  function marksAt(paths: readonly string[]): string[] {
    return paths.flatMap((path) => {
      const field = fieldAt(path);
      return field ? [markPathOf(field)] : [];
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
        const located = targets.get(field.key);
        const isTakenNow =
          isShown(located) && canTake(located) && !holdsValue(field);
        if (!isTakenNow) continue;
        setField(field.path, { action: "apply", shown: true, replaces: false });
        if (write(field.path)) isChanging = true;
      }
    }
  }

  function apply(path: string): void {
    const field = fieldAt(path);
    const isWaiting = field?.action === "apply" || field?.action === "confirm";
    if (!field || !isWaiting) return;
    // The form may have hidden the field since the answer came: a value
    // the operator would not see go in waits until it shows again.
    if (!shownNow(path)) return;
    if (!write(path)) return;
    const reworded = retakeWaiting();
    refreshMarks([markPathOf(field), ...marksAt(reworded)]);
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
    setField(path, { applied: false, undoable: false });
    // What the fields that wait hold now is where the operator starts from.
    const reworded = retakeWaiting();
    refreshMarks([markPathOf(field), ...marksAt(reworded)]);
  }

  function keep(path: string): void {
    const field = fieldAt(path);
    if (!field?.applied || field.review !== undefined) return;
    memory.delete(path);
    setField(path, { review: "kept", undoable: false });
    refreshMarks([markPathOf(field)]);
  }

  function dismiss(path?: string): void {
    const chosen = fields.value.filter(
      (field) =>
        path === undefined || field.path === path || markPathOf(field) === path,
    );
    for (const field of chosen) {
      if (field.review === undefined) {
        setField(field.path, { review: "ignored" });
      }
    }
    const paths =
      path === undefined
        ? [...marks.keys()]
        : chosen.length
          ? chosen.map(markPathOf)
          : [path];
    refreshMarks(paths);
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
    refreshMarks([markPathOf(field)]);
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
    refreshMarks(taken.map(markPathOf));
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
        const isTracked =
          field.review === undefined && field.outcome.status !== "empty";
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
    setMarks(unique.map((one) => [one, markOf(one)]));
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
   * The mark of a field: what the AI proposed for it, and what the operator
   * can do. A field whose value has parts (`seo.title`, `seo.description`)
   * gets one mark, at the field, that tells each part.
   */
  function markOf(markPath: string): FieldAnnotation | undefined {
    // A field the operator decided has no mark, and neither does a value
    // with no quote at all while it waits: it is listed apart.
    const group = fields.value.filter(
      (field) =>
        markPathOf(field) === markPath &&
        field.outcome.status !== "empty" &&
        field.review === undefined &&
        (field.applied || !isUnprovenValue(field.outcome)),
    );
    if (!group.length) return undefined;
    const waiting = group.filter(
      (field) =>
        !field.applied &&
        (field.action === "apply" || field.action === "confirm"),
    );
    const applied = group.filter((field) => field.applied);
    const undoable = group.filter((field) => field.undoable);
    const manual = group.filter((field) => field.action === "manual");
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
    const applyAll: FieldAnnotationAction = {
      label: t("mapo.apply"),
      icon: "i-lucide-check",
      color: "primary",
      onClick: () => waiting.forEach((field) => apply(field.path)),
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
        actions: undoable.length
          ? [applyAll, restoreAll, ignore]
          : [applyAll, ignore],
      };
    }
    if (isApplied) {
      const isVerified = applied.every(
        (field) => field.outcome.status === "filled" && field.outcome.verified,
      );
      return {
        label: t("mapo.ai.fill.applied"),
        icon: "i-lucide-sparkles",
        color: isVerified ? "success" : "warning",
        description,
        actions: [keepAll, restoreAll],
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
    const value = shown(field, outcome.value);
    if (field.action === "manual") {
      const message = holdsRelation(outcome)
        ? "mapo.ai.fill.manualText"
        : "mapo.ai.fill.manualField";
      return t(message, { value });
    }
    const quote = quoteOf(outcome);
    const isProven = outcome.verified && quote !== undefined;
    const proof = isProven
      ? t("mapo.ai.fill.proven", { quote: mapoAiValueText(quote, 200) })
      : t("mapo.ai.fill.notProven");
    const notes = [
      ...(outcome.dropped?.length
        ? [t("mapo.ai.fill.dropped", { n: outcome.dropped.length })]
        : []),
      ...(outcome.tooFew ? [t("mapo.ai.fill.tooFew")] : []),
    ];
    if (field.applied) return [proof, ...notes].join(" ");
    const proposal = field.replaces
      ? t("mapo.ai.fill.proposesInstead", { value })
      : t("mapo.ai.fill.proposes", { value });
    return [proposal, proof, ...notes].join(" ");
  }

  /** The part of a field a key names: `title` for `seo.title`. */
  function partOf(field: MapoAiFillField): string {
    const rest = targets.get(field.key)?.rest ?? "";
    return rest ? rest.slice(1) : field.key;
  }

  /**
   * A value as the marks show it: the labels of the records a relation
   * lists, its text, or how many items a list has.
   */
  function shown(field: MapoAiFillField, value: unknown): string {
    const label = choiceLabels(field.key, value);
    if (label) return label;
    const text = mapoAiValueText(value);
    if (text || !Array.isArray(value)) return text;
    return t("mapo.ai.fill.items", { n: value.length });
  }

  /** The labels of the listed records a value points to, by their ids. */
  function choiceLabels(key: string, value: unknown): string | undefined {
    const lists = options.entity?.relationChoices;
    const choices = lists && Object.hasOwn(lists, key) ? lists[key] : undefined;
    if (!choices) return undefined;
    const refs = Array.isArray(value) ? value : [value];
    const labels = refs.map((ref) => {
      const id = isRecord(ref) ? ref.id : undefined;
      return choices.find((choice) => choice.value === id)?.label;
    });
    const isNamed = labels.length > 0 && labels.every((one) => one);
    return isNamed ? labels.join(", ") : undefined;
  }

  // A component that goes away stops waiting: its form may be gone too.
  if (getCurrentScope()) onScopeDispose(cancel);

  return {
    fill,
    apply,
    restore,
    keep,
    dismiss,
    undo,
    close,
    cancel,
    isShown: shownNow,
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

/** The first quote found in the source, the items' included. */
function quoteOf(outcome: AiFieldOutcome): string | undefined {
  if (outcome.status !== "filled") return undefined;
  const own = outcome.quotes.find((one) => one.found)?.quote;
  if (own !== undefined) return own;
  for (const item of outcome.items ?? []) {
    for (const inner of Object.values(item.fields)) {
      const quote = quoteOf(inner);
      if (quote !== undefined) return quote;
    }
  }
  return undefined;
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
  // `$fetch` rejects with a `FetchError`; one without a status got no answer.
  const isFetchFailure = isRecord(failure) && failure.name === "FetchError";
  const unanswered = isFetchFailure ? "network" : "failed";
  const known =
    FAILURE_MESSAGES.get(failureNameOf(failure)) ?? ERROR_MESSAGES[status];
  const name = status === 0 ? unanswered : (known ?? "failed");
  const saysWhen = retryAfter !== undefined && WAITING_MESSAGES.has(name);
  const message = t(`mapo.ai.errors.${saysWhen ? `${name}In` : name}`, {
    seconds: retryAfter,
  });
  return retryAfter === undefined
    ? { status, message }
    : { status, message, retryAfter };
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
