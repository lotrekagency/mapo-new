<script setup lang="ts">
// A tour of what the AI module does in this app, from the simplest to the
// most complex: each stop names the page that shows it and what to look
// at. The files to attach are in public/ai-files/, the texts to paste
// below. The app's own code is plain: nuxt.config.ts (`mapo.ai`), the
// pages, and three Nitro plugins in server/plugins/.

definePageMeta({
  layout: "mapo-default",
  label: "Tour",
  icon: "i-lucide-map",
  sidebarOrder: 1,
  middleware: ["auth"],
});

interface Stop {
  title: string;
  what: string;
  links: { label: string; to: string }[];
}

const STOPS: Stop[] = [
  {
    title: "1. What the AI offers you",
    what: "The status lists the providers and models you may call and where each key comes from. On AI settings you pick your model and check the connection; the admins assign keys, change how the AI works and read the usage.",
    links: [
      { label: "AI status", to: "/" },
      { label: "AI settings", to: "/ai-settings" },
    ],
  },
  {
    title: "2. Magic Fill on a new article",
    what: "Fill with AI, in the sidebar card: paste a text, Extract. The values a quote proves go into the empty fields; the others wait in the banner above the form, each with the words that prove it.",
    links: [{ label: "A new article", to: "/articles/new" }],
  },
  {
    title: "3. An article that has values",
    what: "A value that would replace the article's waits: the preview shows it before and after, to tick and apply. Undo all puts the form back. Reload during a session: Restore brings it back without a new call.",
    links: [{ label: "Article 1", to: "/articles/1" }],
  },
  {
    title: "4. Files",
    what: "Attach a file in the panel: Markdown, a web page, CSV, Excel, JSON, and a calendar event, which the app reads itself. The line Internal: of open-data.md never reaches the AI: the app's read hook takes it out.",
    links: [
      { label: "A new article", to: "/articles/new" },
      { label: "A new event", to: "/events/new" },
    ],
  },
  {
    title: "5. Related records",
    what: "A category or a venue is picked from a short list; tags and speakers are searched by name; a contact is searched by email, which the AI never sees listed. One found under another name, or several, waits for you to pick.",
    links: [
      { label: "Article 1", to: "/articles/1" },
      { label: "Event 1", to: "/events/1" },
    ],
  },
  {
    title: "6. Lists of items",
    what: "Sources of an article, blocks of a page, speakers of an event: the items the AI finds are ticked one by one in the banner, and go after the record's own, never one it has already.",
    links: [
      { label: "Page 1", to: "/pages/1" },
      { label: "Event 1", to: "/events/1" },
    ],
  },
  {
    title: "7. A large form",
    what: "Tabs, groups that start closed, a nested object, a value revealed by the answer (online shows the streaming group). Next to check, in the banner, opens the tab and the group of each value that waits. What I send to the AI lists the fields it never gets: the slug, the stream password, the views, the internal notes.",
    links: [
      { label: "A new event", to: "/events/new" },
      { label: "Event 1", to: "/events/1" },
    ],
  },
  {
    title: "8. Languages",
    what: "Switch the event's form to Italian and Extract an Italian text: the summary, the description and the booking link go into the Italian translation. The booking link, written once, goes into every language.",
    links: [{ label: "Event 1", to: "/events/1" }],
  },
  {
    title: "9. Other ways on the same article",
    what: "Magic Fill turned off by the page; Magic Fill asking for no quotes, so every value waits; and a panel of the app's own, built on useMapoAiFill() and useMapoAiRead().",
    links: [
      { label: "Off", to: "/articles/no-magic-fill/1" },
      { label: "No quotes", to: "/articles/no-quotes/1" },
      { label: "The app's panel", to: "/articles/own-panel/1" },
    ],
  },
  {
    title: "10. Import several events",
    what: "One call finds every event of a programme: each value verified, to check or discarded. Tick the events to create: they become drafts.",
    links: [{ label: "Import events", to: "/events/import" }],
  },
  {
    title: "11. Who may use the AI",
    what: "Sign in as viewer (no group the app names) or contractor (an external account the app's hook refuses): no Magic Fill, and the status says the app keeps them out. Admin, editor and writer use it.",
    links: [{ label: "AI status", to: "/" }],
  },
];

/** The files of public/ai-files/, to download and attach. */
const FILES = [
  { file: "open-data.md", what: "An article, with an Internal: line" },
  { file: "open-data.html", what: "The same article, as a web page" },
  { file: "articles.csv", what: "Three articles, one per row" },
  { file: "articles.xlsx", what: "The same three articles, in Excel" },
  { file: "launch.ics", what: "An event of a calendar (the app's reader)" },
  {
    file: "jazz-night.json",
    what: "An event, as a ticketing system exports it",
  },
  { file: "programme.csv", what: "Four events, to import" },
  { file: "programme.html", what: "Three events on a web page, to import" },
];

/** Texts to paste in the panel. */
const TEXTS = [
  {
    label: "An article",
    text: `Ten years of open data
How the city opened its records to everyone

Milan, 4 November 2026. The city council published its first open dataset in 2016.
Ten years later, more than 400 datasets are online, from bus timetables to air quality.
Reading time: about 6 minutes. Status: in review.
Tags: transport, open data.`,
  },
  {
    label: "Event 1, in English",
    text: `A night at the library
With Rossi at the piano and Laura Bianchi, the host.
Friday 5 December 2026, from 20:00 to 23:30, at the Central Library.
Tickets: 5 euros. Book at https://tickets.example.org/library-night
Questions: editor@example.com`,
  },
  {
    label: "Event 1, in Italian",
    text: `Una notte in biblioteca
La biblioteca resta aperta fino a mezzanotte, con letture e musica.
Venerdì 5 dicembre 2026 dalle 20:00 alle 23:30, alla Biblioteca centrale.`,
  },
];

const copied = ref<string>();
async function copy(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = label;
  } catch {
    copied.value = undefined;
  }
}
</script>

<template>
  <div class="p-4 max-w-[1100px] mx-auto space-y-4">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-map"
      title="A tour of the AI module"
      description="Each stop names a page and what to look at, from the simplest to the most complex. The AI calls a real model: without a key no model can be called, so start from AI settings (an admin assigns a key) or from a local model."
    />

    <div class="grid gap-3 md:grid-cols-2">
      <UCard
        v-for="stop in STOPS"
        :key="stop.title"
        :ui="{ body: 'space-y-2' }"
      >
        <p class="font-medium">{{ stop.title }}</p>
        <p class="text-sm text-muted">{{ stop.what }}</p>
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="link in stop.links"
            :key="link.to"
            :to="link.to"
            size="xs"
            variant="soft"
            trailing-icon="i-lucide-arrow-right"
          >
            {{ link.label }}
          </UButton>
        </div>
      </UCard>
    </div>

    <UCard :ui="{ body: 'space-y-2' }">
      <template #header>
        <span class="font-medium">Files to attach</span>
      </template>
      <ul class="space-y-1 text-sm">
        <li v-for="one in FILES" :key="one.file">
          <a
            :href="`/ai-files/${one.file}`"
            :download="one.file"
            class="text-primary underline"
          >
            {{ one.file }}
          </a>
          <span class="text-muted"> · {{ one.what }}</span>
        </li>
      </ul>
    </UCard>

    <UCard :ui="{ body: 'space-y-3' }">
      <template #header>
        <span class="font-medium">Texts to paste</span>
      </template>
      <div v-for="one in TEXTS" :key="one.label" class="space-y-1">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">{{ one.label }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :icon="copied === one.label ? 'i-lucide-check' : 'i-lucide-copy'"
            @click="copy(one.label, one.text)"
          >
            {{ copied === one.label ? "Copied" : "Copy" }}
          </UButton>
        </div>
        <pre class="text-xs whitespace-pre-wrap rounded bg-elevated p-2">{{
          one.text
        }}</pre>
      </div>
    </UCard>
  </div>
</template>
