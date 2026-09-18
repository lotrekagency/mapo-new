import { resolveComponent } from "vue";

/**
 * Resolves the Media Manager picker dialog at runtime.
 *
 * The media field types ship with `@mapomodule/form`, but the Media Manager
 * itself lives in `@mapomodule/uikit`. Resolving the dialog by name instead of
 * importing it keeps `form` free of a static dependency on `uikit` (which
 * depends on `form`, so a static import would be a cycle) and lets `form` stay
 * usable standalone — the fields then render an explicit notice instead of a
 * broken picker.
 *
 * Must be called from `setup()`.
 */
export function useMediaManager() {
  const MediaDialog = resolveComponent("MapoMediaManagerDialog");
  // resolveComponent() returns the name unchanged when nothing is registered.
  const available = typeof MediaDialog !== "string";

  return { MediaDialog, available };
}
