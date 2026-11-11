// Answers of the mock provider for the /ai/fill scenario, registered the way
// an app does it: a Nitro plugin calling registerMapoAiMockFixtures(). A
// source picks one by writing "#mock:fixture=<name>", or by being its very
// text (`source`). An answer is what a model writes for the article's
// contract: every field of the form, as text, "" for what the source does
// not give, and a quote of the source for each value. A related record is
// the id of one Magic Fill lists for the AI (a category: Culture is 4), or
// a name that it searches (an author). It goes through the
// gateway's checks like any answer: a value whose quote is not in the
// source comes back to check, one that breaks a rule of its field comes
// back discarded. The sources are in shared/aiArticleSamples.ts.
import { NO_SOURCE, NOTE, RELEASE, UPDATE } from "#shared/aiArticleSamples";
import { LIBRARY } from "#shared/aiPageSamples";

/** Every field of the article form (app/utils/aiArticleForm.ts), empty. */
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
  author: "",
  reviewer: "",
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
          author: "Anna Rossi",
          // Searched, never listed: the form says `ai: { list: false }`.
          reviewer: "sara.conti@example.org",
        },
        evidence: [
          quote("title", RELEASE.title),
          quote("subtitle", RELEASE.subtitle),
          quote("excerpt", RELEASE.excerpt),
          quote("body", `${RELEASE.excerpt} ${RELEASE.more}`),
          quote("reading_time", RELEASE.reading),
          quote("author", RELEASE.byline),
          quote("reviewer", RELEASE.reviewed),
        ],
      },
    },
    {
      // A model that guesses: a slug and a date no quote proves, a featured
      // flag quoted from words the source does not have, a status the form
      // does not list and a reading time above the backend's maximum (120);
      // the category it picks from the list, which goes in, and an author
      // three records match, which the operator picks.
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
          category: "4",
          author: "Rossi",
        },
        evidence: [
          quote("title", NOTE.title),
          quote("excerpt", NOTE.excerpt),
          quote("featured", "Featured on the home page"),
          quote("reading_time", "a 300 minutes read"),
          quote("published_at", "to be built by 2028"),
          quote("category", NOTE.category),
          quote("author", NOTE.signed),
        ],
      },
    },
    {
      // An update of article 1 (/ai/magic-fill/1), whose values it mostly
      // holds already: a new title, verified; a subtitle quoted from words
      // the source does not have and a reading time with no quote, which
      // would replace the article's; its own slug, and `featured` as it is.
      // The first three wait in the preview, before and after; the last
      // two are already in the record. On a new article, the title and the
      // slug go in by themselves. The only author a search for Bianchi gives
      // is Marco Bianchi: found under another name, he waits.
      name: "article-update",
      answer: {
        values: {
          ...EMPTY,
          title: UPDATE.title,
          slug: UPDATE.slug,
          subtitle: "A shorter guide to the form engine",
          featured: "true",
          reading_time: "10",
          author: "Bianchi",
        },
        evidence: [
          quote("title", UPDATE.title),
          quote("slug", UPDATE.slug),
          quote("subtitle", "A shorter guide to the form engine"),
          quote("author", UPDATE.editor),
        ],
      },
    },
    {
      // An update of the city library (/ai/magic-fill-blocks/1), for the
      // items of a list: five blocks, each with its template, so none is
      // verified, the hero being the page's own, two of them credits with
      // an author by name (Anna Rossi, found; Rossi, three authors to pick
      // from once the block is in); three reviews, the first the page's own
      // too, the third quoted with words the source does not have. Only the
      // lists are given: every other field comes back empty.
      name: "page-update",
      answer: {
        values: {
          // A block's fields carry its template's name in the answer
          // (`hero_title`), as the contract names them, and so do their
          // quotes; the list inside the FAQ names its own fields plainly.
          blocks: [
            {
              _template: "hero",
              hero_title: LIBRARY.hero,
              evidence: [quote("hero_title", LIBRARY.hero)],
            },
            {
              _template: "text",
              text_heading: LIBRARY.heading,
              text_body: LIBRARY.body,
              evidence: [
                quote("text_heading", LIBRARY.heading),
                quote("text_body", LIBRARY.body),
              ],
            },
            {
              _template: "faq",
              faq_heading: "Questions",
              faq_questions: [
                {
                  question: LIBRARY.question,
                  answer: LIBRARY.answer,
                  evidence: [
                    quote("question", LIBRARY.question),
                    quote("answer", LIBRARY.answer),
                  ],
                },
              ],
              evidence: [quote("faq_heading", "Questions")],
            },
            // Credits by name: Anna Rossi is found; Rossi, three authors.
            {
              _template: "credits",
              credits_author: "Anna Rossi",
              credits_role: "Text",
              evidence: [
                quote("credits_author", LIBRARY.credits.text),
                quote("credits_role", LIBRARY.credits.text),
              ],
            },
            {
              _template: "credits",
              credits_author: "Rossi",
              credits_role: "Photos",
              evidence: [
                quote("credits_author", LIBRARY.credits.photos),
                quote("credits_role", LIBRARY.credits.photos),
              ],
            },
          ],
          reviews: [
            ...LIBRARY.reviews.map(({ author, quote: words }) => ({
              author,
              quote: words,
              evidence: [quote("author", author), quote("quote", words)],
            })),
            {
              ...LIBRARY.unproven,
              evidence: [
                quote("author", LIBRARY.unproven.author),
                quote("quote", "Not enough seats in the reading room."),
              ],
            },
          ],
        },
        evidence: [],
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
