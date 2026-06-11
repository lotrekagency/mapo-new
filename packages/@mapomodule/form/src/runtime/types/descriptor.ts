import type { Component } from "vue";

/** Lookup table for decrementing depth at compile time. */
type Prev = [never, 0, 1, 2, 3, 4];

/**
 * Recursively builds all valid dotted-path keys of T up to depth D.
 * Arrays are not expanded — repeater items declare their own nested `fields`.
 * When T is the default `Record<string, unknown>`, this resolves to `string`
 * so untyped field arrays remain unconstrained.
 */
export type DeepKeyOf<T, D extends number = 4> = [D] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T & string]:
          | K
          | (NonNullable<T[K]> extends unknown[]
              ? never
              : NonNullable<T[K]> extends object
                ? `${K}.${DeepKeyOf<NonNullable<T[K]>, Prev[D]>}`
                : never);
      }[keyof T & string]
    : never;

/**
 * All field types recognised by the default Mapo form registry.
 * Use {@link FieldType} when you need to accept custom (string) types too.
 */
export enum KnownFieldType {
  Text = "text",
  Textarea = "textarea",
  Email = "email",
  Url = "url",
  Number = "number",
  Boolean = "boolean",
  Switch = "switch",
  Slider = "slider",
  Color = "color",
  File = "file",
  Select = "select",
  Fks = "fks",
  M2m = "m2m",
  Date = "date",
  Time = "time",
  Datetime = "datetime",
  Editor = "editor",
  Seo = "seo",
  Map = "map",
  Repeater = "repeater",
  Media = "media",
  MediaM2m = "media-m2m",
  EnhancedMedia = "enhanced-media",
}

/**
 * Accepts any {@link KnownFieldType} value **or** an arbitrary string for custom types
 * registered by the consumer via `defineFormField()` or `nuxt.config`.
 */
export type FieldType = `${KnownFieldType}` | (string & {});

/**
 * Custom get/set accessor pair for a field.
 * Use this to redirect reads/writes to a different model path or to apply
 * a transformation (e.g. serialise a Date object to an ISO string).
 */
export interface FieldAccessor<TValue = unknown, TModel = unknown> {
  get?: (ctx: { model: TModel; val: TValue; lang?: string }) => TValue;
  set?: (ctx: { model: TModel; val: TValue; lang?: string }) => TValue;
}

/**
 * Common properties shared by every field descriptor.
 * All concrete descriptor types extend this interface.
 */
interface FieldBase<T> {
  /** Model key. Accepts a direct `keyof T` or a dotted path up to 4 levels deep (e.g. `"data.hero.title"`). */
  key: DeepKeyOf<T>;
  /** Human-readable label displayed above the field. */
  label?: string;
  /** Adds a required validation rule and marks the field visually. */
  required?: boolean;
  /** Renders the field in read-only mode (no user input allowed). */
  readonly?: boolean;
  /** `v-if` predicate — removes the field from the DOM entirely when `false`. */
  visible?: (ctx: { model: T }) => boolean;
  /** `v-show` predicate — hides the field while keeping it in the DOM. */
  show?: (ctx: { model: T }) => boolean;
  /** Callback fired after the field value changes. */
  onChange?: (ctx: { model: T; val: unknown }) => void;
  /**
   * Synchronous client-side validation.
   * Return `null` if the value is valid, or an error message string otherwise.
   * The first argument is the current field value, typed as the union of all
   * model values (plus `null` / `undefined`) so TypeScript can contextually type
   * the callback parameter without falling back to implicit `any`.
   */
  validate?: (
    val: T[keyof T & string] | null | undefined,
    ctx: { model: T },
  ) => string | null;
  /**
   * Asynchronous validation (e.g. uniqueness check, server-side rule).
   * Runs debounced after every value change.
   * Return `null` if valid, or an error message string otherwise.
   */
  validateAsync?: (
    val: T[keyof T & string] | null | undefined,
    ctx: { model: T },
  ) => Promise<string | null>;
  /** Debounce delay in milliseconds for `validateAsync`. Default: `600`. */
  validateAsyncDebounce?: number;
  /** Custom get/set accessor. Overrides the registry-level accessor for this field. */
  accessor?: FieldAccessor;
  /** When `true`, reads/writes `model.translations[currentLang][key]` instead of `model[key]`. */
  translatable?: boolean;
  /** When `true`, propagates the value to all available language translations simultaneously. */
  synci18n?: boolean;
  /** Group name. Fields sharing the same group are rendered inside a collapsible group card. */
  group?: string;
  /**
   * Sub-tab name inside the group card. When set, the field is placed in a
   * tab bar rendered within its parent group card. Requires `group` to be set.
   *
   * @example
   * { group: 'seo', subtab: 'basic',    key: 'meta_title' }
   * { group: 'seo', subtab: 'advanced', key: 'og_image'   }
   * // → "seo" group card shows a "basic" / "advanced" tab bar inside
   */
  subtab?: string;
  /**
   * Tab name. Fields sharing the same tab are rendered under the same tab panel.
   *
   * Supports nested tabs via an array path or a `/`-separated string:
   * - `tab: 'settings'` — top-level tab (backward-compatible)
   * - `tab: ['settings', 'seo']` — nested: "seo" sub-tab inside "settings"
   * - `tab: 'settings/seo'` — equivalent slash-separated form
   */
  tab?: string | string[];
  /**
   * Column span (out of 12) for the field wrapper.
   * Accepts a plain number or a responsive breakpoint map `{ sm, md, lg }`.
   * Default: `12` (full width).
   */
  cols?: number | { sm?: number; md?: number; lg?: number };
  /** CSS class applied to the outer field wrapper element. */
  class?: string | string[] | Record<string, boolean>;
  /**
   * When `true`, the field renders an expand button that fills the group container.
   * The group becomes a full-screen overlay and all other fields are hidden.
   * Useful for large textarea, rich-text editors, maps, etc.
   */
  expandable?: boolean;
  /** Debounce delay in milliseconds for the `update:modelValue` emit. Default: `300`. Use `0` for immediate. */
  debounce?: number;
  /**
   * Extra props forwarded verbatim to the underlying input component via `v-bind`
   * (e.g. Nuxt UI props: `icon`, `variant`, `color`, `size`…).
   *
   * Use `attrs` for the field's own typed configuration; `passthrough` is the
   * escape hatch for anything the wrapped component accepts.
   */
  passthrough?: Record<string, unknown>;
  /** Direct component override. Takes priority over `registry.mapping[type]`. */
  is?: Component;
  /**
   * When `true`, this field's value is excluded from draft snapshots saved to localStorage.
   * Use for sensitive fields (passwords, API keys, tokens) that should never be persisted client-side.
   */
  noDraft?: boolean;
}

// ─── Discriminated union for each KnownFieldType ─────────────────────────────

/**
 * Descriptor for plain text input (`type: 'text'`), multi-line textarea
 * (`type: 'textarea'`), and native email / url inputs.
 */
export interface TextDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type:
    | `${KnownFieldType.Text}`
    | `${KnownFieldType.Textarea}`
    | `${KnownFieldType.Email}`
    | `${KnownFieldType.Url}`;
  attrs?: {
    placeholder?: string;
    maxLength?: number;
    minLength?: number;
    /** Visible rows for `type: 'textarea'`. */
    rows?: number;
  };
}

/** Descriptor for numeric input (`type: 'number'`) and range slider (`type: 'slider'`). */
export interface NumberDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Number}` | `${KnownFieldType.Slider}`;
  attrs?: { min?: number; max?: number; step?: number; placeholder?: string };
}

/** Descriptor for checkbox (`type: 'boolean'`) and toggle switch (`type: 'switch'`). */
export interface BooleanDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Boolean}` | `${KnownFieldType.Switch}`;
}

/**
 * Descriptor for a single-value or multi-value select menu.
 * Provide the choices via `attrs.items` (Nuxt UI shape) or the legacy
 * `attrs.options` (Mapo v1 shape).
 */
export interface SelectDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Select}`;
  attrs: {
    /** Choices in Nuxt UI shape (or plain strings) — forwarded to `USelectMenu`. */
    items?: ReadonlyArray<string | { label: string; value: unknown }>;
    /** Choices in Mapo v1 shape (`text`/`value`). Used when `items` is absent. */
    options?: ReadonlyArray<{ text: string; value: unknown }>;
    multiple?: boolean;
    placeholder?: string;
  };
}

/**
 * Descriptor for FK autocomplete (`type: 'fks'`) and many-to-many autocomplete (`type: 'm2m'`).
 * Requires `attrs.endpoint`.
 */
export interface FksDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Fks}` | `${KnownFieldType.M2m}`;
  attrs: {
    endpoint: string;
    itemText?: string;
    itemValue?: string;
    returnObject?: boolean;
    multiple?: boolean;
  };
}

/** Descriptor for date (`type: 'date'`), time (`type: 'time'`), and datetime (`type: 'datetime'`) pickers. */
export interface DateDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type:
    | `${KnownFieldType.Date}`
    | `${KnownFieldType.Time}`
    | `${KnownFieldType.Datetime}`;
  attrs?: {
    min?: string;
    max?: string;
    granularity?: string;
    /** Timezone strategy for datetime parsing/serialisation. Default: `"naive"`. */
    tz?: "naive" | "utc";
  };
}

/** Descriptor for a colour picker field. */
export interface ColorDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Color}`;
}

/** Descriptor for a file upload field. */
export interface FileDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.File}`;
  attrs?: { accept?: string; maxSize?: number };
}

/** Descriptor for a Tiptap rich-text editor. */
export interface EditorDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Editor}`;
  attrs?: { extensions?: unknown[] };
}

/** Descriptor for the SEO preview field (title + description + live SERP preview). */
export interface SeoDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Seo}`;
}

/** Descriptor for a Leaflet map field. Model value is `{ lat: number; lng: number }`. */
export interface MapDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Map}`;
  attrs?: {
    defaultLat?: number;
    defaultLng?: number;
    zoom?: number;
  };
}

/** Descriptor for a drag-and-drop repeater with nested field descriptors. */
export interface RepeaterDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: `${KnownFieldType.Repeater}`;
  /**
   * Field descriptors for each item inside the repeater.
   * Optional when `attrs.templates` provides per-template fields.
   */
  fields?: AnyFieldDescriptor[];
  attrs?: {
    /** Multiple templates for heterogeneous items (`oneOf` discriminated union). */
    templates?: Record<string, AnyFieldDescriptor[]>;
    /** Label shown when an item is collapsed. Receives the item and its index. */
    previewLabel?: (item: unknown, index: number) => string;
    confirmDelete?: boolean;
    allowDuplicate?: boolean;
    /** Show a numeric position input alongside the reorder buttons. */
    showPositionField?: boolean;
    defaultExpanded?: boolean;
    maxItems?: number;
    minItems?: number;
    /**
     * Renders a compact preview card for inactive items.
     * Activated when the number of items exceeds `compressThreshold`.
     */
    miniCard?: (
      item: unknown,
      index: number,
    ) => {
      title: string;
      subtitle?: string;
      /** URL or base64 string for a thumbnail image. */
      thumbnail?: string;
      statusColor?: "success" | "info" | "warning" | "error" | "neutral";
    };
    /** Minimum item count above which contextual scaling activates. Default: `3`. */
    compressThreshold?: number;
  };
}

/** Descriptor for media/file manager fields. */
export interface MediaDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type:
    | `${KnownFieldType.Media}`
    | `${KnownFieldType.MediaM2m}`
    | `${KnownFieldType.EnhancedMedia}`;
  attrs?: { mime?: string; multiple?: boolean };
}

/**
 * Escape-hatch descriptor for custom field types registered by the consumer.
 * `attrs` stays fully open here: the wrapped component is user-defined, so its
 * props cannot be known in advance.
 */
export interface CustomDescriptor<
  T = Record<string, unknown>,
> extends FieldBase<T> {
  type: string & {};
  attrs?: Record<string, unknown>;
}

/**
 * Union of the built-in (known) field descriptor types.
 * Use this as the type for a `fields` array passed to `<MapoForm>` or `useMapoForm()`.
 *
 * This union is **strict**: object literals get full excess-property checking
 * on `attrs` (typos and wrong-type keys are compile errors). If the form mixes
 * in custom field types registered via `defineFormField()` / the registry,
 * annotate the array with {@link AnyFieldDescriptor} instead.
 *
 * @example
 * const fields: FieldDescriptor<Article>[] = [
 *   { key: 'title', type: KnownFieldType.Text, label: 'Title', required: true },
 *   { key: 'body',  type: KnownFieldType.Editor, label: 'Body', translatable: true },
 * ]
 */
export type FieldDescriptor<T = Record<string, unknown>> =
  | TextDescriptor<T>
  | NumberDescriptor<T>
  | BooleanDescriptor<T>
  | SelectDescriptor<T>
  | FksDescriptor<T>
  | DateDescriptor<T>
  | ColorDescriptor<T>
  | FileDescriptor<T>
  | EditorDescriptor<T>
  | SeoDescriptor<T>
  | MapDescriptor<T>
  | RepeaterDescriptor<T>
  | MediaDescriptor<T>;

/**
 * {@link FieldDescriptor} plus the {@link CustomDescriptor} escape hatch.
 *
 * This is what the form engine accepts everywhere (MapoForm, useMapoForm,
 * MapoDetail / MapoList editFields…). Annotate your `fields` array with this
 * type when it contains custom field types — note that the open
 * `CustomDescriptor.attrs` disables excess-property checking on the union, so
 * prefer the strict {@link FieldDescriptor} when no custom types are used.
 */
export type AnyFieldDescriptor<T = Record<string, unknown>> =
  | FieldDescriptor<T>
  | CustomDescriptor<T>;
