<script setup lang="ts">
// Tests: MapoDetail with `experimentalFieldsFromSchema` on an endpoint that
// serves Django REST Framework's standard OPTIONS metadata, with no `schema`
// (server/utils/articleMetadata.ts): the body fields come from `actions.POST`.
// DRF calls relations "field": `schemaFromMetadata` describes `category` as a
// picker of /api/categories, while `tags` stays a placeholder edited as JSON.
import { metadataToJsonSchema } from "@mapomodule/utils";
import type { JSONSchema } from "@mapomodule/utils";

definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-server",
  middleware: ["auth"],
});

const route = useRoute();

function schemaFromMetadata(
  metadata: Record<string, unknown>,
): JSONSchema | undefined {
  return metadataToJsonSchema(metadata, {
    property: (schema, _field, key) =>
      key === "category"
        ? {
            title: schema.title,
            type: "relation",
            endpoint: "/api/categories",
            // The article stores the category id, not the object.
            "x-mapo-attrs": { returnObject: false },
          }
        : schema,
  });
}
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto space-y-3">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-server"
      title="Fields from DRF metadata"
      description="The form below has no fields prop: they come from the OPTIONS response of /api/articles/. Verify: Status lists its five labels, Category is a picker, Tags is a JSON placeholder, ID and Created at are read-only."
    />
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/articles"
      model-name="Article"
      experimental-fields-from-schema
      :schema-from-metadata="schemaFromMetadata"
    />
  </div>
</template>
