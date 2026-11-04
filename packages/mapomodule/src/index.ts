// Aggregated public API for mapomodule.
// Import from 'mapomodule/types' to get all types and composables from every @mapomodule/* package.

export * from "@mapomodule/core/types";
export * from "@mapomodule/store/types";
export * from "@mapomodule/form/types";
export * from "@mapomodule/uikit/types";
export * from "@mapomodule/ai/types";
export * from "@mapomodule/utils";
// Named once more: the store's types carry a `ModelPermissions` too, and
// two `export *` that carry one name are ambiguous for TypeScript until one
// of them is named.
export type { ModelPermissions } from "@mapomodule/utils";
