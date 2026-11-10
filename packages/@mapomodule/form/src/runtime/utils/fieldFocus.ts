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
