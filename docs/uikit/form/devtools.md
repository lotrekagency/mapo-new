# Devtools panel

`@mapomodule/form` ships a panel inside [Nuxt DevTools](https://devtools.nuxt.com/) that shows the registry state in real time. It is development-only — nothing is shipped to production bundles.

## TL;DR

- Inside Nuxt DevTools → tab **Mapo Forms**
- Or navigate to `http://localhost:3000/_mapo/devtools/forms`

The data shown is the same `$mapoFormRegistry` your forms read at runtime, not a static snapshot.

---

## How to: open it

**Through Nuxt DevTools** (primary path):

1. Run the app in dev (`pnpm dev:example`)
2. Click the DevTools icon in the bottom right
3. Find the **Mapo Forms** tab in the list

**Direct URL** (handy if DevTools won't open):

```
http://localhost:3000/_mapo/devtools/forms
```

The page is a regular Nuxt route, accessible like any other URL during development.

## What it shows

### Global config

The left column reports the module configuration as read from `runtimeConfig.public.mapoForm`:

| Field             | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `debounce`        | Global debounce in ms (default: 300 ms)                                  |
| `groups.expanded` | Whether groups open expanded by default                                  |
| `custom types`    | Number of types added by the user via `defineFormField` or `nuxt.config` |

### Registered custom fields

Lists the types added through `defineFormField()` (or `nuxt.config.ts → mapoForm.fields.mapping`). Custom types are highlighted in blue to set them apart from built-ins. Empty section ⇒ the app uses default types only.

### Registry table

The main table lists every registered type:

| Column          | Content                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `type`          | The descriptor string (`text`, `repeater`, `my-field`, …)                                                                 |
| `component`     | The mapped component: `UInput` for direct NUI types, `(lazy)` for async imports, the component name for direct components |
| `default attrs` | The default attr keys defined in the registry (e.g. `valueKey, labelKey` for `select`)                                    |
| `accessor`      | `get / set` if the type has an accessor in the registry (e.g. `seo`)                                                      |

User-added types are highlighted in blue.

### Quick reference

A copy-pasteable code block showing how to add a custom type, in-panel — useful so you do not have to leave DevTools to recall the API.

### Unknown-field warning

A tip box at the bottom reminds you that if a yellow block appears in your form, the descriptor `type` is missing from the registry. The panel lists every registered type — compare it against the descriptor of the offending field.

## How to: read the console warning

In development, every time `<MapoFormField>` cannot resolve a type, it emits:

```
[mapo:form] Unknown field type "video-cut" at path "blocks.0.cut".
  → Register it: defineFormField('video-cut', () => import('~/components/VideoCutField.vue'))
```

The full path (`blocks.0.cut`) tells you exactly which field is unmapped — even inside nested repeaters. The form keeps working: the field renders `MapoUnknownField` (a yellow placeholder) with the current value displayed as editable JSON, so you do not lose data while you fix the registry.

## How to: troubleshoot common scenarios

### Scenario 1 — the form shows a yellow block

1. Open the devtools panel
2. Read the console warning to find the field path
3. Check whether the descriptor `type` matches a row in the registry table
4. Register the type with `defineFormField()` or via `nuxt.config.ts → mapoForm.fields.mapping`

### Scenario 2 — you want to know the default attrs of a type

1. Open the registry table
2. Read the "default attrs" column for the type in question
3. Descriptor `attrs` always overrides defaults — the column tells you what you can omit safely

### Scenario 3 — your custom type does not appear

1. Open the panel after restarting `pnpm dev:*`
2. The type should appear under "Registered custom fields" and in the main table
3. If it is missing:
   - Make sure `@mapomodule/form` is in `modules[]`
   - Make sure the plugin file is in `app/plugins/` (not just `plugins/`)
   - Make sure the descriptor `type` string matches the `defineFormField()` first argument exactly (case-sensitive)

## How it works under the hood

The panel is a regular Vue page (`/_mapo/devtools/forms`) registered by the module via `extendPages` only when `nuxt.options.dev` is `true`. In production the route does not exist.

The DevTools tab is registered through Nuxt's native `devtools:customTabs` hook (no `@nuxt/devtools-kit` dependency):

```ts
nuxt.hook("devtools:customTabs", (tabs) => {
  tabs.push({
    name: "mapo-forms",
    title: "Mapo Forms",
    icon: "i-lucide-layout-list",
    view: { type: "iframe", src: "/_mapo/devtools/forms" },
  });
});
```

The page reads `useNuxtApp().$mapoFormRegistry` — the same registry the form uses at runtime — so what you see in the panel is the live state, not a stale snapshot.
