import { mockPageTypes } from "../_store";

// GET /api/mock/menus/page_types → content types linkable from a menu node.
// Consumed by the node editor's `fks` field (relational link type).
export default defineEventHandler(() => ({
  count: mockPageTypes.length,
  next: null,
  previous: null,
  results: mockPageTypes,
}));
