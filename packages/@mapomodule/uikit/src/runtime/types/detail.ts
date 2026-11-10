import type { Component, ComputedRef, Ref } from "vue";
import type {
  AnyFieldDescriptor,
  FieldAnnotations,
  FieldRegistry,
} from "@mapomodule/form/types";
import type { JSONSchema } from "@mapomodule/utils";

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
  /**
   * The name of the record's model for people, as the page titles it
   * (`modelName`): "Article"; `null` without one. `MapoDetail` always gives
   * it; optional, so a context built elsewhere, as a test's, still compiles.
   */
  modelName?: ComputedRef<string | null>;
  /**
   * The backend model the page checks the permissions of (`permissionModel`):
   * `article`; `undefined` without one. `MapoDetail` always gives it;
   * optional, as `modelName`.
   */
  permissionModel?: ComputedRef<string | undefined>;
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
  /**
   * How the page turns the `OPTIONS` response into a JSON Schema
   * (`schemaFromMetadata`), when it has its own way; `undefined`: Mapo's
   * `metadataToJsonSchema`. `MapoDetail` always gives it; optional, as
   * `modelName`.
   */
  schemaFromMetadata?: ComputedRef<
    ((metadata: Record<string, unknown>) => JSONSchema | undefined) | undefined
  >;
  /**
   * Calls `handler` after each save that succeeds, with the record as the
   * backend returned it, before the page moves to a new record's address
   * or goes back. Returns the function that removes it; one registered in
   * a component's setup goes with the component. A handler that throws
   * leaves the save done. `MapoDetail` always gives it; optional, as
   * `modelName`.
   */
  onSaved?: (handler: (record: T) => void) => () => void;
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
