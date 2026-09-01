/**
 * Subset of the JSON Schema specification used throughout the Mapo form engine.
 * Covers validation keywords, combination keywords, and custom extensions.
 *
 * This is the single source of truth for the schema shape — `conditionals.ts`,
 * `resolve.ts`, and the public barrel all import `JSONSchema` from here.
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  const?: unknown;
  enum?: unknown[];
  not?: JSONSchema;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  dependentSchemas?: Record<string, JSONSchema>;
  dependentRequired?: Record<string, string[]>;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
  definitions?: Record<string, JSONSchema>;
  discriminator?: { propertyName: string };
  title?: string;
  default?: unknown;
  /** e.g. "date-time", "date", "time", "color" — and "textarea" as a multiline hint. */
  format?: string;
  /** Standard JSON Schema. Consumers should render the field disabled, not drop it. */
  readOnly?: boolean;
  writeOnly?: boolean;
  _nullable?: boolean;
  [key: string]: unknown;
}
