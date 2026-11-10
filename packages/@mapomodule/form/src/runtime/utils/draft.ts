import type { AnyFieldDescriptor, RepeaterDescriptor } from "../types/index.js";
import { normalizeTemplates, repeaterItemFields } from "./repeaterTemplates.js";

/** Path segments that lead to an object's prototype instead of a value. */
const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

type Values = Record<string, unknown>;

// `any` accepts descriptors typed against any model: the draft reads only
// what a descriptor says about its field, never the model type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Field = AnyFieldDescriptor<any>;

function isValues(value: unknown): value is Values {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An object of keys and values: not a file, a date, a map or a class's instance. */
function isPlainObject(value: unknown): value is Values {
  if (!isValues(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  const isLiteral = prototype === Object.prototype;
  const isBare = prototype === null;
  return isLiteral || isBare;
}

/**
 * The model as a draft keeps it: a copy of what JSON writes and reads back
 * as it was (texts, finite numbers, booleans, `null`, and lists and plain
 * objects of them), in which the fields marked `noDraft` hold nothing.
 * Anything else stays out, so a restore never writes it back changed: a
 * file not uploaded yet, a date, a map; and so does a value met again
 * inside itself. A field's value is removed at its key (`password`,
 * `api.key`), and for a translatable or `synci18n` field in every language
 * of `translations` too; inside a repeater, at the same paths of each item,
 * by the fields the item renders. A field whose accessor writes its value
 * somewhere else keeps it there.
 *
 * @param model  The form's values.
 * @param fields The form's fields, the sidebar's included.
 * @returns The copy to store.
 */
export function modelForDraft<T extends object>(
  model: T,
  fields: readonly Field[],
): T {
  const copy = plainCopy(model, new Set());
  const values: Values = isPlainObject(copy) ? copy : {};
  removeNoDraft(values, fields);
  // The copy holds the model's own keys, those JSON can carry.
  return values as T;
}

/**
 * The plain data of a value, copied; `undefined` when it has none. A list
 * keeps the items that have some, an object the keys. `inside` holds the
 * objects the value is in, so a cycle ends.
 */
function plainCopy(value: unknown, inside: Set<object>): unknown {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const isList = Array.isArray(value);
  if (!isList && !isPlainObject(value)) return undefined;
  if (inside.has(value)) return undefined;
  inside.add(value);
  let copy: unknown;
  if (isList) {
    copy = value.flatMap((item) => {
      const kept = plainCopy(item, inside);
      return kept === undefined ? [] : [kept];
    });
  } else {
    const kept: Values = {};
    for (const [key, item] of Object.entries(value)) {
      const one = plainCopy(item, inside);
      if (one === undefined) continue;
      // A key such as `__proto__` stays a key, as JSON reads it.
      Object.defineProperty(kept, key, {
        value: one,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    copy = kept;
  }
  inside.delete(value);
  return copy;
}

/** Removes the values of the `noDraft` fields from one record of values: the model, or an item. */
function removeNoDraft(values: Values, fields: readonly Field[]): void {
  const languages = isValues(values.translations)
    ? Object.values(values.translations).filter(isValues)
    : [];
  for (const field of fields) {
    const key = String(field.key);
    const isTranslated = Boolean(field.translatable) || Boolean(field.synci18n);
    const holders = isTranslated ? [values, ...languages] : [values];
    if (field.noDraft) {
      for (const holder of holders) removeAt(holder, key);
      continue;
    }
    if (field.type !== "repeater") continue;
    const repeater = field as RepeaterDescriptor;
    const templates = normalizeTemplates(repeater.attrs?.templates);
    // An item without a template renders the first one, as the repeater does.
    const fallback = templates[0]?.key;
    for (const holder of holders) {
      const items = readAt(holder, key);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!isValues(item)) continue;
        const itemFields = repeaterItemFields(
          repeater,
          templates,
          item,
          fallback,
        );
        removeNoDraft(item, itemFields);
      }
    }
  }
}

/** The value at a dotted path, through own properties only. */
function readAt(values: Values, path: string): unknown {
  const segments = path.split(".");
  if (segments.some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    return undefined;
  }
  let current: unknown = values;
  for (const segment of segments) {
    const isOwn = isValues(current) && Object.hasOwn(current, segment);
    if (!isOwn) return undefined;
    current = (current as Values)[segment];
  }
  return current;
}

/** Removes the key at a dotted path, through own properties only. */
function removeAt(values: Values, path: string): void {
  const segments = path.split(".");
  const last = segments.pop();
  if (last === undefined) return;
  if (UNSAFE_SEGMENTS.has(last)) return;
  const parent = segments.length ? readAt(values, segments.join(".")) : values;
  const isOwn = isValues(parent) && Object.hasOwn(parent, last);
  if (isOwn) delete (parent as Values)[last];
}
