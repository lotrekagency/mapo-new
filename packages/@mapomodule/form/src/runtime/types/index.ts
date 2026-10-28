/**
 * Form engine type barrel.
 * Re-exports all descriptor types, the {@link KnownFieldType} enum,
 * and registry helpers.
 */
export { KnownFieldType } from "./descriptor.js";
export type {
  FieldType,
  FieldAccessor,
  FieldDescriptor,
  AnyFieldDescriptor,
  FieldExtensions,
  TextDescriptor,
  NumberDescriptor,
  BooleanDescriptor,
  SelectDescriptor,
  FksDescriptor,
  DateDescriptor,
  ColorDescriptor,
  FileDescriptor,
  EditorDescriptor,
  SeoDescriptor,
  MapDescriptor,
  RepeaterDescriptor,
  RepeaterTemplate,
  MediaDescriptor,
  MediaM2mDescriptor,
  EnhancedMediaDescriptor,
  CustomDescriptor,
} from "./descriptor.js";

export type { MediaLink, MediaItem, EnhancedMediaValue } from "./media.js";

export type {
  FieldAnnotation,
  FieldAnnotationAction,
  FieldAnnotationColor,
  FieldAnnotations,
} from "./annotation.js";

export type {
  FieldComponentEntry,
  FieldRegistry,
  PartialFieldRegistry,
} from "./registry.js";

export {
  resolveFieldComponent,
  resolveFieldAttrs,
  resolveFieldAccessor,
} from "./registry.js";

export type { MapoFormRuntimeConfig } from "./registry.js";
