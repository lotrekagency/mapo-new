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
  /**
   * Whether the model differs from the record as loaded or last saved; for
   * a new record, whether it holds a value it did not hold when the page
   * opened (a blank text, an empty list or an empty object is none).
   */
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
  /**
   * The detail's draft, for a component that keeps a state of its own
   * beside the record's values: it is saved, restored, discarded and
   * cleared with them. With drafts off nothing is kept. `MapoDetail` always
   * gives it; optional, as `modelName`.
   */
  draft?: MapoDetailDraft;
  /**
   * Takes the operator to a field: the form that holds it, the body's or
   * the sidebar's, opens its tab, group or sub-tab and repeater item,
   * scrolls the field into view and puts the focus on its control. The
   * path is the one of its mark: `title`, `translations.it.title`,
   * `blocks.0.title`. Resolves whether the control took the focus: `false`
   * for a field no form has or shows. `MapoDetail` always gives it;
   * optional, as `modelName`.
   */
  revealField?: (path: string) => Promise<boolean>;
}

/**
 * A part of the detail's draft: the state of a component inside it, saved
 * and restored with the record's values.
 */
export interface MapoDetailDraftPart {
  /**
   * What to keep, as data `JSON.stringify()` can write; `undefined` when
   * there is nothing. Called each time the draft is saved; a part that
   * throws is left out of that save.
   */
  save: () => unknown;
  /**
   * Puts back what `save()` returned, when the operator restores the
   * draft, after the record's values; `undefined` when the draft holds
   * nothing for the part, which then starts again from nothing. It comes
   * from the browser's storage: read it as outside data.
   */
  restore: (data: unknown) => void;
}

/** The draft of a `MapoDetail`, for the components inside it. */
export interface MapoDetailDraft {
  /**
   * Keeps a part of the draft under `key`, one per detail: registering the
   * key again replaces the part. The draft is saved when the record changed
   * or a part has something to keep. A part registered after the draft was
   * restored gets its data then. Returns the function that removes it; one
   * registered in a component's setup goes with the component.
   */
  part: (key: string, part: MapoDetailDraftPart) => () => void;
  /**
   * Saves the draft soon, after a change of a part's state: a change of
   * the record's values saves it by itself.
   */
  touch: () => void;
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
