/**
 * The AI's keyword in Mapo's JSON Schema dialect. The rest of the dialect
 * (`x-mapo-field`, `x-mapo-attrs`, `relation`, `translatable`…) lives in
 * `@mapomodule/utils`, shared by the form reader, its writer and the
 * normalizers; this keyword only matters to the AI.
 */
import { isRecord } from "./guards";

/**
 * Carries a property's AI options, `{ hint?, exclude? }`. A field schema can
 * hold it, and so can a backend schema that wants to guide or stop the AI.
 */
export const AI_KEYWORD = "x-mapo-ai";

/** The AI options a property carries under {@link AI_KEYWORD}. */
export interface AiPropertyOptions {
  /** Extra guidance for the model about this field, written by a developer. */
  hint?: string;
  /** The AI never fills this field. */
  exclude?: boolean;
}

/**
 * Reads {@link AI_KEYWORD} from a property schema. Anything that is not a
 * non-empty hint or `exclude: true` is ignored: the schema may come from a
 * backend.
 */
export function readAiOptions(property: unknown): AiPropertyOptions {
  if (!isRecord(property)) return {};
  const options = property[AI_KEYWORD];
  if (!isRecord(options)) return {};

  const hint = typeof options.hint === "string" ? options.hint.trim() : "";
  const isExcluded = options.exclude === true;
  return {
    ...(hint ? { hint } : {}),
    ...(isExcluded ? { exclude: true } : {}),
  };
}
