/** What can take the focus inside a field's control. */
const FOCUSABLE = [
  'input:not([type="hidden"])',
  "textarea",
  "select",
  "button",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Puts the focus back on a field's control when nothing holds it. An action
 * in a field's mark can take the mark away, or replace the button pressed,
 * and the browser then drops the focus on the page: the field is where the
 * operator was. A focus held elsewhere, as by a dialog the action opened,
 * stays where it is.
 *
 * @param id The id of the field's control, as `MapoFormField` gives it: `field-<key>`.
 * @returns Whether the focus went to the field.
 */
export function refocusField(id: string): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  const isLost = active === null || active === document.body;
  if (!isLost) return false;
  const root = document.getElementById(id);
  if (!root) return false;
  const control = root.matches(FOCUSABLE)
    ? root
    : root.querySelector<HTMLElement>(FOCUSABLE);
  if (!control) return false;
  control.focus();
  return true;
}

/**
 * Puts the focus on a field's control and scrolls the field into view, its
 * label and mark included: what `revealField()` ends with. The control is
 * the element with the field's id inside the field's own element: an id
 * alone could name the same field of another repeater item.
 *
 * @param field The field's element, as `MapoFormField` renders it.
 * @param id The id of the field's control: `field-<key>`.
 * @returns Whether the control took the focus. Not while it cannot have it,
 *   as when it is disabled or not rendered yet.
 */
export function focusFieldControl(field: unknown, id: string): boolean {
  if (!isElement(field)) return false;
  const escaped = id.replace(/["\\]/g, "\\$&");
  const root = field.querySelector<HTMLElement>(`[id="${escaped}"]`);
  if (!root) return false;
  const control = root.matches(FOCUSABLE)
    ? root
    : root.querySelector<HTMLElement>(FOCUSABLE);
  if (!control) return false;
  // A scroll the operator asked to keep still is not animated.
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  field.scrollIntoView?.({ block: "center", behavior });
  control.focus({ preventScroll: true });
  return field.ownerDocument.activeElement === control;
}

/** An element of the page: the headless renderer of the tests gives plain objects. */
function isElement(value: unknown): value is HTMLElement {
  const isObject = typeof value === "object" && value !== null;
  return isObject && typeof (value as Element).querySelector === "function";
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
