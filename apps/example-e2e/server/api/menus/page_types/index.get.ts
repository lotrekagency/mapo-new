import { pageTypes } from "../../../utils/menuDb";

// Content types the node editor's relational picker can link to.
export default defineEventHandler(() => ({
  count: pageTypes.length,
  next: null,
  previous: null,
  results: pageTypes,
}));
