// Swaps the default Mapo form registry mapping (Nuxt UI based) with Vuetify
// wrappers. This plugin must run AFTER the form-registry plugin (which is
// added by @mapomodule/form). Plugins in app/plugins run after module plugins
// by default, so order is fine.

export default defineNuxtPlugin(({ $mapoFormRegistry }) => {
  const reg = $mapoFormRegistry as {
    mapping: Record<string, () => Promise<unknown>>;
    attrs: Record<string, Record<string, unknown>>;
  };

  // Replace the entire mapping with Vuetify wrappers. Any descriptor `type`
  // not listed here will fall back to MapoUnknownField.
  reg.mapping = {
    text: () => import("~/components/fields/MapoVTextField.vue"),
    textarea: () => import("~/components/fields/MapoVTextareaField.vue"),
    number: () => import("~/components/fields/MapoVNumberField.vue"),
    select: () => import("~/components/fields/MapoVSelectField.vue"),
    boolean: () => import("~/components/fields/MapoVSwitchField.vue"),
    switch: () => import("~/components/fields/MapoVSwitchField.vue"),
    date: () => import("~/components/fields/MapoVDateField.vue"),
    datetime: () => import("~/components/fields/MapoVDateField.vue"),
  };

  // Drop NUI-specific defaults that don't belong in Vuetify
  reg.attrs = {
    All: {},
  };
});
