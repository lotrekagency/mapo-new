// Answers of the mock provider for the /ai/fill scenario, registered the way
// an app does it: a Nitro plugin calling registerMapoAiMockFixtures(). A
// source picks one by writing "#mock:fixture=<name>", or by being its very
// text (`source`). An answer is what a model writes for the article's
// contract: every field of the form, as text, "" for what the source does
// not give (a category too: in a fill, a related record is the name to
// search for), and a quote of the source for each value. It goes through the
// gateway's checks like any answer: a value whose quote is not in the
// source comes back to check, one that breaks a rule of its field comes
// back discarded. The sources are in shared/aiArticleSamples.ts.
import { NO_SOURCE, NOTE, RELEASE } from "#shared/aiArticleSamples";

/** Every field of the article form of app/pages/ai/fill/[id].vue, empty. */
const EMPTY = {
  title: "",
  slug: "",
  subtitle: "",
  excerpt: "",
  body: "",
  status: "",
  featured: "",
  reading_time: "",
  published_at: "",
  category: "",
};

function quote(field: string, words: string) {
  return { field, quote: words, where: "" };
}

export default defineNitroPlugin(() => {
  registerMapoAiMockFixtures([
    {
      // Every value is in the source, word for word: each one is verified.
      // The source dates the release but gives no time, so `published_at`
      // stays empty: a datetime given in part counts as not given.
      name: "article-verified",
      answer: {
        values: {
          ...EMPTY,
          title: RELEASE.title,
          subtitle: RELEASE.subtitle,
          excerpt: RELEASE.excerpt,
          body: `${RELEASE.excerpt} ${RELEASE.more}`,
          reading_time: "6",
        },
        evidence: [
          quote("title", RELEASE.title),
          quote("subtitle", RELEASE.subtitle),
          quote("excerpt", RELEASE.excerpt),
          quote("body", `${RELEASE.excerpt} ${RELEASE.more}`),
          quote("reading_time", RELEASE.reading),
        ],
      },
    },
    {
      // A model that guesses: a slug and a date no quote proves, a featured
      // flag quoted from words the source does not have, a status the form
      // does not list and a reading time above the backend's maximum (120),
      // and a category, which the operator chooses.
      name: "article-mixed",
      answer: {
        values: {
          ...EMPTY,
          title: NOTE.title,
          slug: "bike-lanes-new-plan",
          excerpt: NOTE.excerpt,
          status: "archived",
          featured: "true",
          reading_time: "300",
          published_at: "2028-01-01T00:00:00",
          category: "Culture",
        },
        evidence: [
          quote("title", NOTE.title),
          quote("excerpt", NOTE.excerpt),
          quote("featured", "Featured on the home page"),
          quote("reading_time", "a 300 minutes read"),
          quote("published_at", "to be built by 2028"),
          quote("category", NOTE.category),
        ],
      },
    },
    {
      // Picked by its text, with no mark.
      name: "no-source",
      source: NO_SOURCE,
      refusal:
        "The mock writes no article from nothing: paste the text it should read.",
    },
  ]);
});
