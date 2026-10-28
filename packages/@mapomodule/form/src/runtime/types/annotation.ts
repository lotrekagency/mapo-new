/**
 * A Nuxt UI color: one of the built-in semantic colors, or a color the app
 * registers in its theme (`ui.theme.colors`).
 */
export type FieldAnnotationColor =
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "neutral"
  | (string & {});

/** A button in the popover of a field annotation. */
export interface FieldAnnotationAction {
  /** Button text. */
  label: string;
  /** Iconify name shown before the text, e.g. `i-lucide-check`. */
  icon?: string;
  /** Button color. Default: `neutral`. */
  color?: FieldAnnotationColor;
  /** Runs when the button is clicked. */
  onClick: () => void;
}

/**
 * A mark that decorates a field from outside its descriptor: an icon next to the
 * label that opens a popover, and a count on the tab that holds the field.
 */
export interface FieldAnnotation {
  /**
   * Short text: the accessible name of the mark and the title of its popover,
   * e.g. "Suggested by AI".
   */
  label: string;
  /** Iconify name of the mark. Default: `i-lucide-info`. */
  icon?: string;
  /** Color of the mark and of its tab count. Default: `neutral`. */
  color?: FieldAnnotationColor;
  /** Adds a dot to the mark, to ask for attention without another icon. */
  dot?: boolean;
  /** Longer text in the popover, under the title. */
  description?: string;
  /** Buttons at the bottom of the popover. */
  actions?: readonly FieldAnnotationAction[];
}

/**
 * Annotations keyed by the path of the field's value, the same paths as the
 * server errors: `title`, `translations.it.title`, `blocks.0.title`.
 */
export type FieldAnnotations = Record<string, FieldAnnotation>;
