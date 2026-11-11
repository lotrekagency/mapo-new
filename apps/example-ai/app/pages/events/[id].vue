<script setup lang="ts">
// An event, with Magic Fill on a large form (app/utils/eventForm.ts): four
// tabs, groups that start closed, a summary, a description and a booking
// link per language, a nested object (`seo`), a venue picked from six, a
// contact found by email, and speakers whose person is searched by name
// inside each item. The page registers nothing for the AI: the module adds
// Magic Fill to every MapoDetail. The language of the form's tabs is the
// language Magic Fill writes the translations in. "Next to check", in the
// banner, opens the tab, the group and the subtab of each value that
// waits. The page keeps drafts, as the articles do. `permission-model`
// names the backend model: the gateway checks add_event (change_event for
// an event that exists), as Save does.
import {
  EVENT_FIELDS,
  EVENT_LANGUAGES,
  EVENT_SIDEBAR_FIELDS,
} from "~/utils/eventForm";

definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
});

const route = useRoute();
</script>

<template>
  <div class="p-4 max-w-[1400px] mx-auto">
    <MapoDetail
      :id="String(route.params.id)"
      endpoint="/api/events"
      model-name="Event"
      permission-model="event"
      :fields="EVENT_FIELDS"
      :sidebar-fields="EVENT_SIDEBAR_FIELDS"
      :languages="EVENT_LANGUAGES"
      :draft="true"
    />
  </div>
</template>
