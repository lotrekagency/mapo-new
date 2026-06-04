/**
 * JSON Schema utilities for the Mapo form engine.
 *
 * - {@link JSONSchema}         — shared type definition
 * - {@link matchesSchema}      — validate a value against a schema node
 * - {@link applyConditionals}  — resolve `if/then/else` and dependent keywords
 * - {@link hasConditionals}    — check whether a schema has runtime conditionals
 * - {@link resolveSchema}      — dereference `$ref`, `anyOf`, `oneOf`
 * - {@link extractDefs}        — extract the `$defs` / `definitions` map
 * - {@link getDefaultForSchema} — derive a zero/empty default value from a schema
 */
export type { JSONSchema } from "./types.js";
export {
  matchesSchema,
  applyConditionals,
  hasConditionals,
} from "./conditionals.js";
export { resolveSchema, extractDefs, getDefaultForSchema } from "./resolve.js";
