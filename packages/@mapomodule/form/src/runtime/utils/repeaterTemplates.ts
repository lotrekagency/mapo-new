import type {
  AnyFieldDescriptor,
  NormalizedRepeaterTemplate,
  RepeaterDescriptor,
  RepeaterTemplate,
} from "../types/descriptor.js";

/** Above this many templates, `picker: "auto"` switches from the dropdown to the modal. */
export const MODAL_PICKER_THRESHOLD = 3;

/**
 * Turns `attrs.templates` into a list with defaults applied. A bare field array
 * becomes a template whose label is its key.
 */
export function normalizeTemplates(
  templates: NonNullable<RepeaterDescriptor["attrs"]>["templates"],
): NormalizedRepeaterTemplate[] {
  return Object.entries(templates ?? {}).map(([key, tpl]) => {
    const meta: Partial<RepeaterTemplate> = Array.isArray(tpl) ? {} : tpl;
    return {
      key,
      label: meta.label ?? key,
      description: meta.description,
      icon: meta.icon,
      image: meta.image,
      wireframe: meta.wireframe,
      category: meta.category,
      fields: Array.isArray(tpl) ? tpl : (tpl.fields ?? []),
    };
  });
}

/** Whether the block picker modal replaces the dropdown for this many templates. */
export function shouldUseModalPicker(
  picker: "auto" | "select" | "modal" | undefined,
  templateCount: number,
): boolean {
  if (templateCount === 0) return false;
  const mode = picker ?? "auto";
  return (
    mode === "modal" ||
    (mode === "auto" && templateCount > MODAL_PICKER_THRESHOLD)
  );
}

/** Filters templates by category and by a case-insensitive text query. */
export function filterTemplates(
  templates: NormalizedRepeaterTemplate[],
  query: string,
  category: string,
): NormalizedRepeaterTemplate[] {
  const q = query.trim().toLowerCase();
  return templates.filter((tpl) => {
    if (category && tpl.category !== category) return false;
    if (!q) return true;
    return [tpl.label, tpl.description, tpl.category].some((v) =>
      v?.toLowerCase().includes(q),
    );
  });
}

export type WireframeShape = "line" | "lines" | "box" | "check";

/** One schematic shape per field type, capped at 5 so it fits a picker card. */
export function wireframeShapes(
  fields: AnyFieldDescriptor[],
): WireframeShape[] {
  return fields.slice(0, 5).map((f) => {
    const type = String(f.type);
    if (type === "textarea" || type === "editor") return "lines";
    if (type.includes("media") || type === "file") return "box";
    if (type === "boolean") return "check";
    return "line";
  });
}

/** True when adding one more item reaches `maxItems`. */
export function reachesMax(current: number, maxItems?: number): boolean {
  return !!maxItems && current + 1 >= maxItems;
}

/**
 * The fields an item renders: those of its template, picked by `item._template`
 * or, for an item without one, by `fallbackKey`; the repeater's own `fields`
 * when it has no templates or the key matches none.
 */
export function repeaterItemFields(
  descriptor: RepeaterDescriptor,
  templates: NormalizedRepeaterTemplate[],
  item: Record<string, unknown>,
  fallbackKey: string | undefined,
): AnyFieldDescriptor[] {
  const ownFields = descriptor.fields ?? [];
  const hasTemplates = templates.length > 0;
  if (!hasTemplates) return ownFields;
  const key = (item._template as string | undefined) ?? fallbackKey;
  return templates.find((tpl) => tpl.key === key)?.fields ?? ownFields;
}
