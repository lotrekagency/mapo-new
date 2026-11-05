import { getCurrentScope, onScopeDispose, shallowRef, toRaw } from "vue";
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
  mapoAiValueText,
  readModelValue,
  runMapoAiFill,
  undoModelWrite,
  writeModelValue,
} from "../shared/fill";
import type {
  MapoAiFillDependencies,
  MapoAiFillEntity,
  MapoAiFillEntry,
  MapoAiFillResponse,
  MapoAiModelWrite,
} from "../shared/fill";
import type { MapoAiSourcePart } from "../shared/gateway";
import { isRecord } from "../shared/guards";
import type { AiFieldOutcome } from "../shared/sanitize";

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

/** A field of the last answer, and whether its value is in the form. */
export interface MapoAiFillField extends MapoAiFillEntry {
  /** The AI's value is in the form: it went in by itself, or the operator applied it. */
  applied: boolean;
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
   * shows, and marks every field the answer gives. A new call cancels the
   * wait of the previous one; the previous answer's marks go when the new
   * answer arrives, and stay if it fails. Never rejects: a failure is in
   * `error`.
   */
  fill(
    source: string | readonly MapoAiSourcePart[],
    call?: MapoAiFillCall,
  ): Promise<void>;
  /** Writes the AI's value of a field that waits for the operator, by its path. */
  apply(path: string): void;
  /**
   * Puts back what a field held before the AI's value went in, when the
   * field still holds that value: an operator's own change stays.
   */
  restore(path: string): void;
  /** Removes the composable's mark of a field, or every mark; the values stay. */
  dismiss(path?: string): void;
  /**
   * Puts back every field that still holds the value the AI wrote, as it
   * was before (a key the AI added goes away), and removes the marks.
   */
  undo(): void;
  /**
   * Stops waiting for the answer. The gateway still finishes the call, and
   * counts it against the user's limit.
   */
  cancel(): void;
  /** A call is waiting for its answer. */
  pending: Readonly<Ref<boolean>>;
  /** Why the last call got no answer. */
  error: Readonly<Ref<MapoAiFillError | undefined>>;
  /** The last answer: the AI's proposal, or its refusal (`status: "refused"`). */
  response: Readonly<Ref<MapoAiFillResponse | undefined>>;
  /** Each field of the last answer, and what became of it. */
  fields: Readonly<Ref<readonly MapoAiFillField[]>>;
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
  const post = posterOf(app);

  const pending = shallowRef(false);
  const error = shallowRef<MapoAiFillError>();
  const response = shallowRef<MapoAiFillResponse>();
  const fields = shallowRef<readonly MapoAiFillField[]>([]);

  let controller: AbortController | undefined;
  /** The marks the composable set, by the path they sit at: the only ones it removes. */
  const marks = new Map<string, FieldAnnotation>();
  /** Where each key of the last answer goes. */
  let targets = new Map<string, KeyTarget<T>>();
  /** What the composable wrote for each field of the last answer, by its path. */
  let memory = new Map<string, WriteRecord[]>();

  const isReadonly = () => target.readonly?.value === true;
  const isBusy = () => target.isBusy?.value === true;
  const canWrite = () => !isReadonly() && !isBusy();
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
            isShown: (key) => isShown(locate(key)),
            canTake: (key) => canTake(locate(key)),
          },
          signal: own.signal,
        },
        { post },
      );
      if (controller !== own) return;
      // A new answer: the marks of the previous one go, its values stay.
      dismiss();
      targets = located;
      memory = new Map();
      response.value = answer.response;
      fields.value = answer.entries.map((entry) => ({
        ...entry,
        applied: false,
      }));
      for (const field of fields.value) {
        if (field.action === "apply") write(field.path);
      }
      refreshMarks(fields.value.map(markPathOf));
    } catch (failure) {
      if (controller !== own) return;
      error.value = errorOf(failure, t);
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
    if (field.applied || !canWrite()) return false;
    const records = writeField(located, structuredClone(outcome.value));
    if (!records) return false;
    memory.set(path, records);
    update(path, true);
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
    const languages = target.languages?.value ?? [];
    const isSynced = isWhole && descriptor.synci18n === true;
    // As the form's own write: the field's key in every language.
    const key = String(descriptor.key);
    const paths =
      isSynced && languages.length
        ? languages.map((lang) => `translations.${lang}.${key}`)
        : [located.path];
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

  /** Puts back what a field held, where it still holds what was written. */
  function revert(path: string): void {
    const records = memory.get(path) ?? [];
    const model = target.model.value;
    const untouched = records.filter((record) => {
      const current = dataOf(readModelValue(model, record.path));
      return record.written !== undefined && current === record.written;
    });
    undoRecords(untouched);
    memory.delete(path);
    update(path, false);
  }

  function undoRecords(records: readonly WriteRecord[]): void {
    const model = target.model.value;
    for (const record of [...records].reverse()) {
      undoModelWrite(model, record.path, record.write, record.before);
    }
  }

  function apply(path: string): void {
    const field = fieldAt(path);
    const isWaiting = field?.action === "apply" || field?.action === "confirm";
    if (!field || !isWaiting || !write(path)) return;
    refreshMarks([markPathOf(field)]);
  }

  function restore(path: string): void {
    const field = fieldAt(path);
    if (!field?.applied || !canWrite()) return;
    revert(path);
    refreshMarks([markPathOf(field)]);
  }

  function dismiss(path?: string): void {
    const field = path === undefined ? undefined : fieldAt(path);
    const paths =
      path === undefined
        ? [...marks.keys()]
        : [field ? markPathOf(field) : path];
    setMarks(paths.map((one) => [one, undefined]));
  }

  function undo(): void {
    if (!canWrite()) return;
    for (const field of fields.value) {
      if (field.applied) revert(field.path);
    }
    dismiss();
  }

  function cancel(): void {
    controller?.abort();
    controller = undefined;
    pending.value = false;
  }

  function update(path: string, applied: boolean): void {
    fields.value = fields.value.map((field) =>
      field.path === path ? { ...field, applied } : field,
    );
  }

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
    const group = fields.value.filter(
      (field) =>
        markPathOf(field) === markPath && field.outcome.status !== "empty",
    );
    if (!group.length) return undefined;
    const waiting = group.filter(
      (field) =>
        !field.applied &&
        (field.action === "apply" || field.action === "confirm"),
    );
    const applied = group.filter((field) => field.applied);
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
      onClick: () => applied.forEach((field) => restore(field.path)),
    };
    const keep: FieldAnnotationAction = {
      label: t("mapo.ai.fill.keep"),
      icon: "i-lucide-check",
      onClick: () => dismiss(markPath),
    };
    if (isWaiting) {
      return {
        label: t("mapo.ai.fill.confirm"),
        icon: "i-lucide-sparkles",
        color: "warning",
        dot: true,
        description,
        actions: isApplied
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
        actions: [keep, restoreAll],
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
    dismiss,
    undo,
    cancel,
    pending,
    error,
    response,
    fields,
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

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The app's `t()` of `@nuxtjs/i18n`; the key itself without one. */
function translatorOf(app: object): Translate {
  const i18n: unknown = Reflect.get(app, "$i18n");
  const translate: unknown = isRecord(i18n) ? i18n.t : undefined;
  if (typeof translate !== "function") return (key) => key;
  return (key, params = {}) => {
    const text: unknown = Reflect.apply(translate, i18n, [key, params]);
    return typeof text === "string" ? text : key;
  };
}

type Fetcher = (
  request: string,
  options: { method: "POST"; body: unknown; signal?: AbortSignal },
) => Promise<unknown>;

function isFetcher(value: unknown): value is Fetcher {
  return typeof value === "function";
}

/**
 * Posts with `$mapoFetch` of `@mapomodule/core`, so a session that ended
 * leads to the login page as everywhere in Mapo; with `$fetch` without it.
 */
function posterOf(app: object): MapoAiFillDependencies["post"] {
  const mapoFetch: unknown = Reflect.get(app, "$mapoFetch");
  const globalFetch: unknown = Reflect.get(globalThis, "$fetch");
  const fetcher = isFetcher(mapoFetch)
    ? mapoFetch
    : isFetcher(globalFetch)
      ? globalFetch
      : undefined;
  return (path, body, { signal }) =>
    fetcher
      ? fetcher(path, { method: "POST", body, signal })
      : Promise.reject(new Error("No $fetch to call the AI gateway with"));
}

/** The error of a call, for the operator. */
function errorOf(failure: unknown, t: Translate): MapoAiFillError {
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
