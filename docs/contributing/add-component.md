# Adding a UIKit component

How to add a `Mapo*` component to `@mapomodule/uikit` (or a shell component to `@mapomodule/form`). Read it before creating a component, and before changing the props or slots of an existing one.

## Reuse first

Climb this ladder and stop at the first rung that works:

1. An existing Mapo component, used as it is.
2. The same component with a prop or a slot it already has.
3. A Nuxt UI component (the `nuxt-ui` MCP server lists them).
4. An existing component extended with one orthogonal prop or slot.
5. A composition of existing components.
6. Only then a new component. A new shared component needs a second user.

## Steps

### 1. The file

Create `packages/@mapomodule/uikit/src/runtime/components/Mapo<Name>.vue`:

- `<script setup lang="ts">` with typed `defineProps` and `defineEmits`;
- a JSDoc comment on the component and on every prop, as in `MapoLangSwitcher.vue`;
- explicit imports from `vue`, `vue-router` and `#app` where a runtime import is needed.

The JSDoc matters: the MCP server extracts props, events, slots and exposed methods from the source with `vue-component-meta`, and `mapo_component_api` gives AI assistants these comments as the documentation of each prop.

### 2. Registration

Components are registered by name, not by scanning the folder. Add the name to the `components` list in `packages/@mapomodule/uikit/src/module.ts`, in the section it belongs to.

Register it as `global: true` only when another package resolves it by name at runtime, as `@mapomodule/form` does with `MapoMediaManagerDialog`.

### 3. Overrides

Every registered `Mapo*` component can be replaced by an app through `app/mapooverride/<Name>.vue`. Treat its props, events and slots as public API: renaming one breaks the apps that override or use it. If a change is breaking, say so in the commit (`feat!:` or a `BREAKING CHANGE` footer).

### 4. Labels

No user-facing string is hardcoded, `aria-label` included. Use `useI18n()` from `vue-i18n` and keys under the `mapo.` namespace:

```ts
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const label = t("mapo.listActions.permanentDelete");
```

Add every new key to both catalogs: `packages/@mapomodule/i18n/src/runtime/locales/mapo.en.json` and `mapo.it.json`. Reuse an existing key when the meaning is the same.

### 5. Styling

- Build with Nuxt UI components and Tailwind utilities, and use the semantic tokens (`text-muted`, `bg-elevated`, …) so apps can theme the component.
- `packages/@mapomodule/uikit/src/runtime/assets/main.css` tells Tailwind which sources to scan. A class built at runtime (a template literal) is not scanned: add it to the `@source inline(...)` safelist there.
- A component that touches `window`, `document` or a DOM-only library renders inside `<ClientOnly>`.

### 6. Types

Shared types go in `packages/@mapomodule/uikit/src/runtime/types/` and are re-exported from `packages/@mapomodule/uikit/src/index.ts`, which makes them available from `@mapomodule/uikit/types` and from the `mapomodule/types` aggregator. Types used only by the component stay in the component.

### 7. Tests

Put logic that does not need rendering (mapping, formatting, state transitions) in a composable or a util and test it with Vitest. The uikit tests are not part of `pnpm test`: run them with `pnpm exec vitest run packages/@mapomodule/uikit` (see [Testing](./testing#known-gap)).

### 8. Docs, MCP and the reference app

- A narrative page in `docs/uikit/` (or a section of an existing one), added to the sidebar.
- An entry in `docs/uikit/api.md` with props, emits, slots and exposed methods.
- A recipe in `packages/@mapomodule/mcp/src/runtime/core/recipes.ts` when the component makes a new task possible.
- A page or a section in `apps/example-e2e` that uses it, checked in the running app. → [Live verification](./testing#live-verification-in-the-reference-app)

## Checklist

- [ ] The reuse ladder did not offer an existing piece.
- [ ] Props, events and the component itself carry JSDoc.
- [ ] The name is in the `components` list of `module.ts`.
- [ ] Labels come from both catalogs; nothing is hardcoded.
- [ ] Styling uses Nuxt UI and semantic tokens; runtime classes are safelisted.
- [ ] Logic is tested; the docs, the API reference and the sidebar are updated.
- [ ] The component works in `apps/example-e2e`, in light and dark mode.
