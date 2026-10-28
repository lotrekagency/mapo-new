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
 * - {@link metadataToJsonSchema} — an endpoint's OPTIONS response as JSON Schema (Camomilla or DRF)
 * - {@link drfMetadataToJsonSchema} — DRF's OPTIONS metadata as JSON Schema
 * - {@link openApiToJsonSchema} — a component of an OpenAPI document as JSON Schema
 * - {@link openApiModels}      — the models of an OpenAPI document, with their endpoints
 */
export type { JSONSchema } from "./types.js";
export {
  matchesSchema,
  applyConditionals,
  hasConditionals,
} from "./conditionals.js";
export { resolveSchema, extractDefs, getDefaultForSchema } from "./resolve.js";
export { FIELD_KEYWORD, ATTRS_KEYWORD, placeholderType } from "./dialect.js";
export { drfMetadataToJsonSchema, metadataToJsonSchema } from "./drf.js";
export type { DrfFieldInfo, DrfMetadataOptions, DrfTypeSchema } from "./drf.js";
export { openApiModels, openApiToJsonSchema } from "./openapi.js";
export type { OpenApiModel, OpenApiOptions } from "./openapi.js";
