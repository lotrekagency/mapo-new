// The app's own field types, registered for every form with
// defineFormField() (docs/uikit/form/custom-fields.md). The block page of the
// AI lab, app/pages/ai/ollama/blocks/[id].vue, uses both.
export default defineNuxtPlugin(() => {
  defineFormField(
    "stars",
    () => import("~/components/form/StarRatingField.vue"),
    { attrs: { max: 5 } },
  );
  defineFormField(
    "country",
    () => import("~/components/form/CountryField.vue"),
  );
});
