import type { FieldRegistry } from "../types/index.js";

// Nuxt UI components are registered as lazy imports — NUI uses Vite auto-import (compile-time),
// so resolveComponent() at runtime would find nothing. Thin wrapper .vue files are required.
// Custom Mapo components are also lazy imports for tree-shaking.

export const defaultRegistry: FieldRegistry = {
  mapping: {
    // ─── Nuxt UI — thin wrappers that use <UInput> etc. in the template ──────
    text: () => import("../components/fields/nui/NuiInput.vue"),
    textarea: () => import("../components/fields/nui/NuiTextarea.vue"),
    email: () => import("../components/fields/nui/NuiInput.vue"),
    url: () => import("../components/fields/nui/NuiInput.vue"),
    number: () => import("../components/fields/nui/NuiInput.vue"),
    boolean: () => import("../components/fields/nui/NuiCheckbox.vue"),
    switch: () => import("../components/fields/nui/NuiSwitch.vue"),
    slider: () => import("../components/fields/nui/NuiSlider.vue"),
    color: () => import("../components/fields/nui/NuiInput.vue"),
    file: () => import("../components/fields/MapoFileField.vue"),

    // ─── Nuxt UI with specific config ────────────────────────────────────────
    select: () => import("../components/fields/nui/NuiSelectMenu.vue"),

    // ─── Custom Mapo components (non-trivial logic) ───────────────────────────
    date: () => import("../components/fields/MapoDateField.vue"),
    time: () => import("../components/fields/MapoTimeField.vue"),
    datetime: () => import("../components/fields/MapoDateTimeField.vue"),
    fks: () => import("../components/fields/MapoFksField.vue"),
    m2m: () => import("../components/fields/MapoFksField.vue"),
    seo: () => import("../components/fields/MapoSeoPreview.vue"),
    editor: () => import("../components/fields/MapoWygEditor.vue"),
    map: () => import("../components/fields/MapoMapField.vue"),
    repeater: () => import("../components/fields/MapoRepeater.vue"),

    // ─── Media pickers ────────────────────────────────────────────────────────
    // The fields live here with every other field type; the Media Manager they
    // drive ships with @mapomodule/uikit and is resolved at runtime
    // (see useMediaManager). Without uikit they render an explicit notice.
    media: () => import("../components/fields/MapoMediaField.vue"),
    "media-m2m": () => import("../components/fields/MapoMediaM2mField.vue"),
    "enhanced-media": () =>
      import("../components/fields/MapoEnhancedMediaField.vue"),
  },

  attrs: {
    // Applied to all fields
    All: {
      class: "w-full",
    },
    number: {
      type: "number",
    },
    email: {
      type: "email",
    },
    url: {
      type: "url",
    },
    color: {
      type: "color",
    },
    select: {
      // NUI v3 uses `labelKey`/`valueKey`; descriptor uses `{ text, value }` convention.
      labelKey: "text",
      valueKey: "value",
    },
    fks: {
      itemValue: "id",
      returnObject: true,
    },
    m2m: {
      itemValue: "id",
      returnObject: true,
      multiple: true,
    },
  },

  accessor: {
    // date/time/datetime: conversion handled internally by the Mapo*Field components
    // (ISO string ↔ @internationalized/date CalendarDate/CalendarDateTime).
    seo: {
      // v1 used `permalink` key — accept both `permalink` and `url` aliases, normalise to `permalink`
      get: ({ val }) => {
        const v = (val as Record<string, unknown> | null | undefined) ?? {};
        const { url, ...rest } = v as { url?: unknown; [k: string]: unknown };
        return {
          title: "",
          description: "",
          ...rest,
          permalink: rest.permalink ?? url ?? "",
        };
      },
      set: ({ val }) => {
        const v = (val as Record<string, unknown> | null | undefined) ?? {};
        const { url, ...rest } = v as { url?: unknown; [k: string]: unknown };
        return {
          title: "",
          description: "",
          ...rest,
          permalink: rest.permalink ?? url ?? "",
        };
      },
    },
  },
};
