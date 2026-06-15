/** Defines a single column in the list table. */
export interface ListColumn<T = Record<string, unknown>> {
  /** Property name on the row object. Must be a key of `T`. */
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  /** CSS class applied to the `<td>` cell. */
  class?: string;
}

/** A single selectable option inside a filter dropdown. */
export interface FilterChoice {
  text: string;
  value: unknown;
  icon?: string;
}

/** Describes a filter control rendered in the list filter bar. */
export interface FilterDescriptor {
  /** Query parameter name sent to the backend (e.g. `"status"`, `"date_range"`). */
  value: string;
  /** Label displayed in the filter dropdown. */
  text: string;
  choices?: FilterChoice[];
  datepicker?: boolean;
  /** When `true`, multiple choices can be selected simultaneously (default: `false` → exclusive). */
  multiple?: boolean;
  /** Default value applied on mount (same format as `choice.value`; comma-separated for multi). */
  defaultChoice?: string;
}

/** A filter descriptor with its current active selection state. */
export interface ActiveFilter extends FilterDescriptor {
  active: FilterChoice[];
  dates?: string[];
}

/** Context passed to a bulk action handler. */
export interface ActionContext<T = Record<string, unknown>> {
  /** Selected row objects, or `null` when the "select all" mode is active. */
  selection: T[] | null;
  selectionQuery: URLSearchParams;
  lookup: string;
}

/** Describes a bulk action available in the list actions toolbar. */
export interface ActionDescriptor<T = Record<string, unknown>> {
  label: string;
  handler: (ctx: ActionContext<T>) => Promise<unknown>;
  permissions?: string | string[];
  /** Action is available when individual rows are selected. Default: `true`. */
  handleMultiple?: boolean;
  /** Action is available when the "select all" mode is active. Default: `false`. */
  handleAll?: boolean;
  /** When true, Apply and confirm buttons are rendered with a destructive/error color. */
  dangerous?: boolean;
}

/** A single tab item used in the list tab bar to filter by a fixed value. */
export interface ListTabItem {
  text: string;
  value: string;
  count?: number;
}
