import type { Component, ComputedRef, Ref } from "vue";
import type {
  AnyFieldDescriptor,
  FieldAnnotations,
  FieldRegistry,
} from "@mapomodule/form/types";

/**
 * What `MapoDetail` shares with the components inside it: its slots, its forms
 * and the extensions it renders. Read it with `useMapoDetail()`.
 */
export interface MapoDetailContext<T extends object = Record<string, unknown>> {
  /** The REST endpoint of the record. */
  endpoint: ComputedRef<string>;
  /** The record id; `"new"` for a record not created yet. */
  id: ComputedRef<string | number>;
  isNew: ComputedRef<boolean>;
  /** The record being edited: write to it to change the values of the form. */
  model: Ref<T>;
  /** The body fields rendered: the `fields` prop, or the ones derived from the schema. */
  fields: ComputedRef<AnyFieldDescriptor<T>[]>;
  /** The sidebar fields rendered. */
  sidebarFields: ComputedRef<AnyFieldDescriptor<T>[]>;
  /** The languages of the record; empty when it is not translated. */
  languages: ComputedRef<string[]>;
  /** The language being edited: write to it to switch. */
  currentLang: Ref<string>;
  /** The field registry the forms use. */
  registry: ComputedRef<FieldRegistry>;
  /** Server errors by field path, as the last save returned them. */
  errors: Readonly<Ref<Record<string, string[]>>>;
  /** Whether the record is read-only for this user. */
  readonly: ComputedRef<boolean>;
  /** While the record loads. */
  isLoading: Readonly<Ref<boolean>>;
  /** From a save until it is done; after `save(true)`, until the page has gone back. */
  isSaving: ComputedRef<boolean>;
  /** While a save, a delete or a navigation back is under way. */
  isBusy: ComputedRef<boolean>;
  /** Whether the model differs from the record as loaded or last saved. */
  isDirty: ComputedRef<boolean>;
  /**
   * Marks set from inside the detail, shown with those of the `annotations`
   * prop; on the same path the prop wins. Replace the map to change them.
   */
  annotations: Ref<FieldAnnotations>;
  /** Which extensions the page allows: all, none, or the listed keys. */
  extensions: ComputedRef<boolean | readonly string[]>;
  /** Saves the record, as the Save buttons do; ignored while busy. */
  save: (andBack?: boolean) => Promise<void>;
  /** Goes back, as the Back button does; ignored while busy. */
  back: () => void;
  /**
   * The endpoint's `OPTIONS` response, requested once per page and shared
   * with `MapoDetail`, or `undefined` when the endpoint has none.
   */
  metadata: () => Promise<Record<string, unknown> | undefined>;
}

/**
 * Where `MapoDetail` renders an extension: `actions`, the sidebar card above
 * Save; `body-top`, above the body form.
 */
export type DetailExtensionPlacement = "actions" | "body-top";

/** A component that loads another: `() => import("./MyAction.vue")`. */
export type DetailExtensionLoader = () => Promise<
  Component | { default: Component }
>;

/** A component added to every `MapoDetail`, registered with `defineDetailExtension()`. */
export interface DetailExtension {
  /**
   * Names the extension. A page picks extensions by key with the `extensions`
   * prop, and registering a key again replaces the extension.
   */
  key: string;
  /** Where the detail renders it. */
  placement: DetailExtensionPlacement;
  /**
   * The component, or a loader of it. It reads the detail with
   * `useMapoDetail()`. A function is always taken as a loader.
   */
  component: Component | DetailExtensionLoader;
  /** Whether a detail page shows it. Default: always. */
  visible?: (detail: MapoDetailContext) => boolean;
  /** Order among the extensions of a placement, lower first. Default: `0`. */
  order?: number;
}
