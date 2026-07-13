/**
 * Injects media field types into the global $mapoFormRegistry.
 * This plugin runs after the form registry plugin (ordering via filename prefix).
 * Media field components live in @mapomodule/uikit to avoid a circular
 * dependency between @mapomodule/form → @mapomodule/uikit.
 */
import { defineNuxtPlugin, useNuxtApp } from "#app";

export default defineNuxtPlugin(() => {
  const { $mapoFormRegistry } = useNuxtApp() as unknown as {
    $mapoFormRegistry: {
      mapping: Record<string, () => Promise<unknown>>;
    };
  };

  if (!$mapoFormRegistry) return;

  $mapoFormRegistry.mapping["media"] = () =>
    import("../components/fields/MapoMediaField.vue");

  $mapoFormRegistry.mapping["media-m2m"] = () =>
    import("../components/fields/MapoMediaM2mField.vue");

  $mapoFormRegistry.mapping["enhanced-media"] = () =>
    import("../components/fields/MapoEnhancedMediaField.vue");
});
