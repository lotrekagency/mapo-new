/**
 * The AI's keyword in Mapo's JSON Schema dialect. The rest of the dialect
 * (`x-mapo-field`, `x-mapo-attrs`, `relation`, `translatable`…) lives in
 * `@mapomodule/utils`, shared by the form reader, its writer and the
 * normalizers; this keyword only matters to the AI.
 */
import { isRecord } from "./guards";

/**
 * Carries a property's AI options, `{ hint?, exclude?, list? }`. A field
 * schema can hold it, and so can a backend schema that wants to guide or
 * stop the AI. A form's field gives it with `ai` on its descriptor.
 */
export const AI_KEYWORD = "x-mapo-ai";

/** The AI options a property carries under {@link AI_KEYWORD}. */
export interface AiPropertyOptions {
  /** Extra guidance for the model about this field, written by a developer. */
  hint?: string;
  /** The AI never fills this field. */
  exclude?: boolean;
  /**
   * `false`: a relation's records never go to the AI as a list, even when
   * few; the AI writes the name it reads, which is searched afterwards.
   */
  list?: false;
}

/**
 * Reads {@link AI_KEYWORD} from a property schema. Anything that is not a
 * non-empty hint, `exclude: true` or `list: false` is ignored: the schema
 * may come from a backend.
 */
export function readAiOptions(property: unknown): AiPropertyOptions {
  if (!isRecord(property)) return {};
  return aiOptionsFrom(property[AI_KEYWORD]);
}

/**
 * The AI options of a form's field, from the `ai` of its descriptor, as
 * {@link readAiOptions} reads them from a schema: what is not one of them
 * is ignored.
 */
export function aiOptionsFrom(options: unknown): AiPropertyOptions {
  if (!isRecord(options)) return {};
  const hint = typeof options.hint === "string" ? options.hint.trim() : "";
  const isExcluded = options.exclude === true;
  const isUnlisted = options.list === false;
  return {
    ...(hint ? { hint } : {}),
    ...(isExcluded ? { exclude: true } : {}),
    ...(isUnlisted ? { list: false } : {}),
  };
}
