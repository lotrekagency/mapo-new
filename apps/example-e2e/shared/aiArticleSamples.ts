// The sources the /ai/fill scenario sends to the AI
// (app/components/ai/AiFillPanel.vue), and the words the mock's answers
// quote from them (server/plugins/mapo-ai-fixtures.ts). In one file, so a
// quote stays word for word in its source: the gateway verifies a value
// only by a quote it finds there.

/** Words of a press release, quoted by the fixture `article-verified`. */
export const RELEASE = {
  title: "Open Milan: ten years of open data",
  subtitle: "How the city opened its records to everyone",
  excerpt: "The city council published its first open dataset in 2016.",
  more: "Ten years later, more than 400 datasets are online, from bus timetables to air quality.",
  reading: "Reading time: about 6 minutes.",
};

/** Words of a council note, quoted by the fixture `article-mixed`. */
export const NOTE = {
  title: "Bike lanes: the new plan",
  excerpt: "The council approved 40 km of new bike lanes, to be built by 2028.",
  category: "Category: Culture",
};

/** A source the mock answers by its very text, with no mark: a refusal. */
export const NO_SOURCE = "Write an article about the weather.";

/** A source the panel offers. */
export interface AiArticleSample {
  label: string;
  /** What the sample shows. */
  description: string;
  text: string;
}

export const AI_ARTICLE_SAMPLES: AiArticleSample[] = [
  {
    label: "Lines",
    description:
      'The mock\'s own rules: each "Label: value" line fills the field of that label, quoting the line.',
    text: [
      "Title: Ten years of open data",
      "Slug: ten-years-of-open-data",
      "Subtitle: How a city opened its records",
      "Excerpt: The city published its first dataset in 2016.",
      "Status: In review",
      "Featured: yes",
      "Reading time: 7",
      "Category: Technology",
    ].join("\n"),
  },
  {
    label: "Press release",
    description:
      "Fixture article-verified: every value is quoted word for word, so each one is verified.",
    text: [
      "#mock:fixture=article-verified",
      "",
      RELEASE.title,
      RELEASE.subtitle,
      "",
      `Milan, 4 November 2026. ${RELEASE.excerpt} ${RELEASE.more}`,
      "",
      RELEASE.reading,
    ].join("\n"),
  },
  {
    label: "Council note",
    description:
      "Fixture article-mixed: values no quote proves, a status and a reading time discarded, a category to choose.",
    text: [
      "#mock:fixture=article-mixed",
      "",
      NOTE.title,
      `${NOTE.excerpt} Works start in the spring.`,
      NOTE.category,
    ].join("\n"),
  },
  {
    label: "No source",
    description: "A fixture the mock picks by the text itself: it refuses.",
    text: NO_SOURCE,
  },
  {
    label: "Refusal",
    description: "#mock:refusal: the model refuses to answer.",
    text: "#mock:refusal\nTitle: About us",
  },
  {
    label: "Busy",
    description:
      "#mock:rate-limit: the provider is busy, so the gateway answers 503 with Retry-After.",
    text: "#mock:rate-limit\nTitle: About us",
  },
  {
    label: "Down",
    description:
      "#mock:unavailable: the provider fails, so the gateway answers 502.",
    text: "#mock:unavailable\nTitle: About us",
  },
  {
    label: "Slow",
    description:
      "#mock:slow=8: the answer takes 8 seconds. Cancel stops waiting; the call still counts.",
    text: "#mock:slow=8\nTitle: Slow but sure",
  },
  {
    label: "Timeout",
    description:
      "#mock:timeout: no answer, so the gateway gives up after the mock's timeout, 15 seconds here (504).",
    text: "#mock:timeout\nTitle: About us",
  },
  {
    label: "Not JSON",
    description:
      "#mock:invalid-json: an answer that is not JSON, so every field comes back empty.",
    text: "#mock:invalid-json\nTitle: About us",
  },
];
