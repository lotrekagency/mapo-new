import { getNestedValue } from "@mapomodule/utils";
import type {
  AnyFieldDescriptor,
  FieldAnnotation,
  FieldAnnotationColor,
  FieldAnnotations,
  RepeaterDescriptor,
} from "../types/index.js";
import type { TabEntry } from "../types/layout.js";
import { isFieldShown } from "./tabVisibility.js";
import { normalizeTemplates, repeaterItemFields } from "./repeaterTemplates.js";

/** Icon of a mark that does not choose one. */
export const DEFAULT_ANNOTATION_ICON = "i-lucide-info";

/** Color of a mark that does not choose one. */
export const DEFAULT_ANNOTATION_COLOR: FieldAnnotationColor = "neutral";

/**
 * The path of a field's value in the model: its key, or its translation in the
 * current language for a translatable field.
 */
export function valuePath(field: AnyFieldDescriptor, lang: string): string {
  const key = field.key as string;
  const isTranslated = Boolean(field.translatable) && Boolean(lang);
  return isTranslated ? `translations.${lang}.${key}` : key;
}

/**
 * The annotation of a field: the one at the path of its value; for a
 * translatable field, otherwise the one at its bare key, which holds in every
 * language.
 */
export function annotationFor(
  annotations: FieldAnnotations,
  key: string,
  path: string,
): FieldAnnotation | undefined {
  const atPath = annotations[path];
  if (atPath) return atPath;
  const isTranslatedPath = path !== key;
  if (!isTranslatedPath) return undefined;
  return annotations[key];
}

/**
 * The entries under `prefix`, keyed relative to it: with prefix `blocks.0`,
 * `blocks.0.title` becomes `title`. A repeater item reads its errors and its
 * annotations from the parent form this way.
 */
export function entriesUnder<V>(
  record: Record<string, V>,
  prefix: string,
): Record<string, V> {
  const start = `${prefix}.`;
  const result: Record<string, V> = {};
  for (const [path, value] of Object.entries(record)) {
    if (path.startsWith(start)) result[path.slice(start.length)] = value;
  }
  return result;
}

/** The annotations of one icon and one color: one badge with their count. */
export interface AnnotationGroup {
  icon: string;
  color: FieldAnnotationColor;
  count: number;
  /** The distinct labels, for the accessible name of the badge. */
  labels: string[];
}

/** The fields of a tab: its groups, their sub-tabs and its child tabs. */
function tabFields(tab: TabEntry): AnyFieldDescriptor[] {
  const own = [...tab.groups.values()].flatMap((group) => [
    ...group.fields,
    ...[...group.subtabs.values()].flat(),
  ]);
  const nested = [...tab.children.values()].flatMap(tabFields);
  return [...own, ...nested];
}

/**
 * The marks the shown fields display, the marks inside their repeater items
 * included.
 */
function shownAnnotations(
  fields: AnyFieldDescriptor[],
  annotations: FieldAnnotations,
  model: Record<string, unknown>,
  lang: string,
): FieldAnnotation[] {
  return fields
    .filter((field) => isFieldShown(field, model))
    .flatMap((field) => fieldAnnotations(field, annotations, model, lang));
}

/**
 * The marks a field displays: its own and, for a repeater, those of each item,
 * found the way `MapoRepeater` hands them out: under `<key>.<index>`, for the
 * fields the item renders, shown for the item's model.
 */
function fieldAnnotations(
  field: AnyFieldDescriptor,
  annotations: FieldAnnotations,
  model: Record<string, unknown>,
  lang: string,
): FieldAnnotation[] {
  const key = field.key as string;
  const path = valuePath(field, lang);
  const own = annotationFor(annotations, key, path);
  const marks = own ? [own] : [];

  const isRepeater = field.type === "repeater";
  if (!isRepeater) return marks;
  const items = getNestedValue(model, path);
  if (!Array.isArray(items)) return marks;

  const repeater = field as RepeaterDescriptor;
  const templates = normalizeTemplates(repeater.attrs?.templates);
  const firstTemplate = templates[0]?.key;
  items.forEach((item: Record<string, unknown>, index) => {
    const itemFields = repeaterItemFields(
      repeater,
      templates,
      item,
      firstTemplate,
    );
    const itemAnnotations = entriesUnder(annotations, `${key}.${index}`);
    marks.push(...shownAnnotations(itemFields, itemAnnotations, item, lang));
  });
  return marks;
}

/**
 * The badges for a list of fields: the marks of the shown fields, those inside
 * repeater items included, grouped by icon and color in the order they first
 * appear.
 */
export function annotationGroups(
  fields: AnyFieldDescriptor[],
  annotations: FieldAnnotations,
  model: Record<string, unknown>,
  lang: string,
): AnnotationGroup[] {
  const hasAnnotations = Object.keys(annotations).length > 0;
  if (!hasAnnotations) return [];

  const groups = new Map<string, AnnotationGroup>();
  for (const mark of shownAnnotations(fields, annotations, model, lang)) {
    const icon = mark.icon ?? DEFAULT_ANNOTATION_ICON;
    const color = mark.color ?? DEFAULT_ANNOTATION_COLOR;
    const groupKey = `${icon}|${color}`;
    const group = groups.get(groupKey) ?? { icon, color, count: 0, labels: [] };
    group.count++;
    if (!group.labels.includes(mark.label)) group.labels.push(mark.label);
    groups.set(groupKey, group);
  }
  return [...groups.values()];
}

/** The badges of a tab: those of its fields, sub-tabs and child tabs included. */
export function tabAnnotationGroups(
  tab: TabEntry,
  annotations: FieldAnnotations,
  model: Record<string, unknown>,
  lang: string,
): AnnotationGroup[] {
  return annotationGroups(tabFields(tab), annotations, model, lang);
}
