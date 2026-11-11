/**
 * The cases of the evaluation, version 1: fifteen sources on the forms of
 * the reference app, an article and a page of blocks, in English and in
 * Italian, pasted or attached as a web page or a CSV sheet. They hold the
 * mistakes models make: values the source does not give (a category, a
 * featured flag, a date of publication from a date with no time), numbers
 * of something else (a cooking time as a reading time), a name several
 * records have, a record under another name, an item almost the same as
 * one the record holds. PDFs and images come with the readers that read
 * them.
 *
 * Each case also says what the mock answers, so the scoring runs without a
 * model in `pnpm test`: some of those answers are wrong on purpose.
 */
import type { EvalCase } from "./case";

/** A quote of the answer: the words of the source that prove a value. */
function q(field: string, quote: string) {
  return { field, quote, where: "" };
}

// ─── The article ─────────────────────────────────────────────────────────────

const RELEASE = {
  title: "Open Milan: ten years of open data",
  subtitle: "How the city opened its records to everyone",
  lead: "The city council published its first open dataset in 2016.",
  more: "Ten years later, more than 400 datasets are online, from bus timetables to air quality.",
  reading: "Reading time: about 6 minutes.",
  byline: "By Anna Rossi.",
  reviewed: "Reviewed by sara.conti@example.org.",
};

const NOTE = {
  title: "Bike lanes: the new plan",
  lead: "The council approved 40 km of new bike lanes, to be built by 2028.",
  category: "Category: Culture",
  signed: "Signed: Rossi, transport office.",
};

const UPDATE = {
  title: "Building admin UIs with Mapo v2, second edition",
  slug: "building-admin-uis-mapo-v2",
  editor: "Edited by Bianchi.",
};

const COMUNICATO = {
  title: "Milano Aperta: dieci anni di dati aperti",
  subtitle: "Come la città ha aperto i suoi archivi a tutti",
  lead: "Il comune ha pubblicato il suo primo dataset aperto nel 2016.",
  more: "Oggi sono online più di 400 dataset.",
  reading: "Tempo di lettura: circa 6 minuti.",
  category: "Categoria: Tecnologia",
};

const BUSES = {
  title: "Night buses return to the suburbs",
  lead: "From 1 December, five night lines will connect the suburbs to the centre every 30 minutes.",
  published: "Published on 20 November 2026 at 09:30.",
  lines: "The lines N1 to N5 run from midnight to 5 am, seven days a week.",
  byline: "By Luca Rossi.",
};

const MUSEUM = {
  title: "Late opening at the science museum",
  lead: "The museum stays open until 11 pm on Fridays, from 6 March 2026.",
  longer:
    "Tickets cost 8 euros; the visit takes a quarter of an hour longer than usual.",
};

const SAUCE = {
  title: "Grandma's tomato sauce",
  ingredients:
    "Ingredients: 1 kg of ripe tomatoes, 2 cloves of garlic, olive oil, basil.",
  cook: "Cook for 40 minutes on a low flame.",
};

const PLAYGROUNDS = {
  title: "Five new playgrounds for the north district",
  lead: "The district council opened five new playgrounds this week.",
  credits: "Text by Davide Colombo; reviewed by Luca Moretti.",
};

const TWO = {
  first: "Smart lighting arrives in the old town",
  firstLead:
    "The council will replace 2,000 street lamps with LED lights by June.",
  second: "A new bridge over the canal",
  secondLead: "Works on the pedestrian bridge start in September.",
};

const ARTICLE_CASES: EvalCase[] = [
  {
    id: "press-release",
    title:
      "A press release that gives most values word for word, a reviewer by email, and a date with no time",
    form: "article",
    language: "en",
    source: {
      kind: "text",
      text: [
        RELEASE.title,
        RELEASE.subtitle,
        "",
        `Milan, 4 November 2026. ${RELEASE.lead} ${RELEASE.more}`,
        "",
        RELEASE.reading,
        RELEASE.byline,
        RELEASE.reviewed,
      ].join("\n"),
    },
    expect: {
      title: { value: RELEASE.title, goes: "in" },
      subtitle: { value: RELEASE.subtitle, goes: "in" },
      excerpt: { phrases: ["first open dataset in 2016"], goes: "in" },
      body: { phrases: ["more than 400 datasets"], goes: "in" },
      reading_time: { value: 6, goes: "in" },
      author: { value: 1, goes: "in" },
      reviewer: { value: 3, goes: "in" },
      published_at: { empty: true },
      status: { empty: true },
      featured: { empty: true },
      category: { empty: true },
    },
    // A model that guesses the category: Technology, quoted from nothing.
    mock: {
      values: {
        title: RELEASE.title,
        subtitle: RELEASE.subtitle,
        excerpt: RELEASE.lead,
        body: `${RELEASE.lead} ${RELEASE.more}`,
        reading_time: "6",
        author: "Anna Rossi",
        reviewer: "sara.conti@example.org",
        category: "1",
      },
      evidence: [
        q("title", RELEASE.title),
        q("subtitle", RELEASE.subtitle),
        q("excerpt", RELEASE.lead),
        q("body", `${RELEASE.lead} ${RELEASE.more}`),
        q("reading_time", RELEASE.reading),
        q("author", RELEASE.byline),
        q("reviewer", RELEASE.reviewed),
      ],
    },
  },
  {
    id: "council-note",
    title:
      "A note with a category from the list, a name three authors have, and no status",
    form: "article",
    language: "en",
    source: {
      kind: "text",
      text: [
        NOTE.title,
        `${NOTE.lead} Works start in the spring.`,
        NOTE.category,
        NOTE.signed,
      ].join("\n"),
    },
    expect: {
      title: { value: NOTE.title, goes: "in" },
      excerpt: { phrases: ["40 km of new bike lanes"], goes: "in" },
      category: { value: 4, goes: "in" },
      author: { goes: "by-hand" },
      status: { empty: true },
      reading_time: { empty: true },
      published_at: { empty: true },
    },
    // A status the form does not list: the gateway discards it.
    mock: {
      values: {
        title: NOTE.title,
        excerpt: NOTE.lead,
        category: "4",
        author: "Rossi",
        status: "approved",
      },
      evidence: [
        q("title", NOTE.title),
        q("excerpt", NOTE.lead),
        q("category", NOTE.category),
        q("author", NOTE.signed),
        q("status", NOTE.lead),
      ],
    },
  },
  {
    id: "update-existing",
    title:
      "An update of an article that exists: a new title to replace, a slug it holds, an author under a longer name",
    form: "article",
    language: "en",
    record: {
      title: "Building admin UIs with Mapo v2",
      slug: UPDATE.slug,
      featured: true,
      reading_time: 12,
      author: { id: 7, name: "Elena Ferrari" },
    },
    source: {
      kind: "text",
      text: [
        UPDATE.title,
        `The article keeps its address: ${UPDATE.slug}.`,
        UPDATE.editor,
      ].join("\n"),
    },
    expect: {
      title: { value: UPDATE.title, goes: "waits" },
      slug: { value: UPDATE.slug, goes: "held" },
      author: { value: 4, goes: "waits" },
      reading_time: { empty: true },
      category: { empty: true },
    },
    mock: {
      values: {
        title: UPDATE.title,
        slug: UPDATE.slug,
        author: "Bianchi",
      },
      evidence: [
        q("title", UPDATE.title),
        q("slug", UPDATE.slug),
        q("author", UPDATE.editor),
      ],
    },
  },
  {
    id: "comunicato-it",
    title:
      "A press release in Italian: the values in Italian, the category from the English list",
    form: "article",
    language: "it",
    source: {
      kind: "text",
      text: [
        COMUNICATO.title,
        COMUNICATO.subtitle,
        "",
        `Milano, 4 novembre 2026. ${COMUNICATO.lead} ${COMUNICATO.more}`,
        "",
        COMUNICATO.reading,
        COMUNICATO.category,
      ].join("\n"),
    },
    expect: {
      title: { value: COMUNICATO.title, goes: "in" },
      subtitle: { value: COMUNICATO.subtitle, goes: "in" },
      excerpt: { phrases: ["primo dataset aperto nel 2016"], goes: "in" },
      body: { phrases: ["più di 400 dataset"], goes: "in" },
      reading_time: { value: 6, goes: "in" },
      // The record's name, Technology, is not in the quote: it waits.
      category: { value: 1, goes: "waits" },
      published_at: { empty: true },
    },
    mock: {
      values: {
        title: COMUNICATO.title,
        subtitle: COMUNICATO.subtitle,
        excerpt: COMUNICATO.lead,
        body: `${COMUNICATO.lead} ${COMUNICATO.more}`,
        reading_time: "6",
        category: "1",
      },
      evidence: [
        q("title", COMUNICATO.title),
        q("subtitle", COMUNICATO.subtitle),
        q("excerpt", COMUNICATO.lead),
        q("body", `${COMUNICATO.lead} ${COMUNICATO.more}`),
        q("reading_time", COMUNICATO.reading),
        q("category", COMUNICATO.category),
      ],
    },
  },
  {
    id: "web-page",
    title:
      "A web page with its menu and footer: the article, a date and time of publication, an author",
    form: "article",
    language: "en",
    source: {
      kind: "file",
      name: "night-buses.html",
      content: [
        "<!doctype html>",
        "<html><head><title>City magazine — Night buses</title></head><body>",
        '<nav><a href="/">Home</a> <a href="/news">News</a></nav>',
        "<article>",
        `<h1>${BUSES.title}</h1>`,
        `<p>${BUSES.lead}</p>`,
        `<p>${BUSES.published}</p>`,
        `<p>${BUSES.lines}</p>`,
        `<p>${BUSES.byline}</p>`,
        "</article>",
        "<footer>© City magazine. Cookie policy.</footer>",
        "</body></html>",
      ].join("\n"),
    },
    expect: {
      title: { value: BUSES.title, goes: "in" },
      excerpt: { phrases: ["five night lines"], goes: "in" },
      published_at: { value: "2026-11-20T09:30", goes: "in" },
      author: { value: 2, goes: "in" },
      featured: { empty: true },
      status: { empty: true },
    },
    // A featured flag quoted from words the page does not have.
    mock: {
      values: {
        title: BUSES.title,
        excerpt: BUSES.lead,
        published_at: "2026-11-20T09:30:00",
        author: "Luca Rossi",
        featured: "true",
      },
      evidence: [
        q("title", BUSES.title),
        q("excerpt", BUSES.lead),
        q("published_at", BUSES.published),
        q("author", BUSES.byline),
        q("featured", "Featured story"),
      ],
    },
  },
  {
    id: "csv-row",
    title:
      "A CSV sheet with one article per row: a choice by its label, a yes, a number, an author",
    form: "article",
    language: "en",
    source: {
      kind: "file",
      name: "articles.csv",
      content: [
        "Title,Category,Reading time,Status,Featured,Author",
        "Spring markets in the old town,Culture,5,Published,yes,Chiara Romano",
      ].join("\n"),
    },
    expect: {
      title: { value: "Spring markets in the old town", goes: "in" },
      category: { value: 4, goes: "in" },
      reading_time: { value: 5, goes: "in" },
      status: { value: "published", goes: "in" },
      featured: { value: true, goes: "in" },
      author: { value: 24, goes: "in" },
      published_at: { empty: true },
    },
    mock: {
      values: {
        title: "Spring markets in the old town",
        category: "4",
        reading_time: "5",
        status: "published",
        featured: "true",
        author: "Chiara Romano",
      },
      evidence: [
        q("title", "Spring markets in the old town"),
        q("category", "Culture"),
        q("reading_time", "5"),
        q("status", "Published"),
        // A quote of one word proves only a value that is that word.
        q("featured", "Published | yes | Chiara Romano"),
        q("author", "Chiara Romano"),
      ],
    },
  },
  {
    id: "museum-dates",
    title:
      "Numbers and dates that are not the form's: a quarter of an hour longer, a start date, a ticket price",
    form: "article",
    language: "en",
    source: {
      kind: "text",
      text: [
        MUSEUM.title,
        MUSEUM.lead,
        MUSEUM.longer,
        "It is one of the five most visited museums in the region.",
      ].join("\n"),
    },
    expect: {
      title: { value: MUSEUM.title, goes: "in" },
      excerpt: { phrases: ["until 11 pm on fridays"], goes: "in" },
      reading_time: { empty: true },
      published_at: { empty: true },
      featured: { empty: true },
    },
    // A reading time worked out from words of another number, and a date
    // of publication from a start date with no time.
    mock: {
      values: {
        title: MUSEUM.title,
        excerpt: MUSEUM.lead,
        reading_time: "15",
        published_at: "2026-03-06",
      },
      evidence: [
        q("title", MUSEUM.title),
        q("excerpt", MUSEUM.lead),
        q("reading_time", MUSEUM.longer),
        q("published_at", MUSEUM.lead),
      ],
    },
  },
  {
    id: "unrelated-recipe",
    title:
      "A source that is no article: a recipe, whose cooking time is no reading time",
    form: "article",
    language: "en",
    source: {
      kind: "text",
      text: [SAUCE.title, SAUCE.ingredients, SAUCE.cook].join("\n"),
    },
    expect: {
      title: { value: SAUCE.title, goes: "in" },
      reading_time: { empty: true },
      category: { empty: true },
      author: { empty: true },
      status: { empty: true },
    },
    // The cooking time, quoted word for word: verified, and wrong.
    mock: {
      values: { title: SAUCE.title, reading_time: "40" },
      evidence: [q("title", SAUCE.title), q("reading_time", SAUCE.cook)],
    },
  },
  {
    id: "reviewer-by-name",
    title:
      "A reviewer named instead of written by email: found by the search, under another name",
    form: "article",
    language: "en",
    source: {
      kind: "text",
      text: [PLAYGROUNDS.title, PLAYGROUNDS.lead, PLAYGROUNDS.credits].join(
        "\n",
      ),
    },
    expect: {
      title: { value: PLAYGROUNDS.title, goes: "in" },
      author: { value: 35, goes: "in" },
      reviewer: { value: 2, goes: "waits" },
    },
    mock: {
      values: {
        title: PLAYGROUNDS.title,
        author: "Davide Colombo",
        reviewer: "Luca Moretti",
      },
      evidence: [
        q("title", PLAYGROUNDS.title),
        q("author", PLAYGROUNDS.credits),
        q("reviewer", PLAYGROUNDS.credits),
      ],
    },
  },
  {
    id: "two-articles",
    title:
      "Two articles in one source, and the operator's instructions to take the first",
    form: "article",
    language: "en",
    instructions: "Only the first article.",
    source: {
      kind: "text",
      text: [
        `1. ${TWO.first}`,
        TWO.firstLead,
        "",
        `2. ${TWO.second}`,
        TWO.secondLead,
      ].join("\n"),
    },
    expect: {
      title: { value: TWO.first, goes: "in" },
      excerpt: { phrases: ["2,000 street lamps"], goes: "in" },
    },
    // A model that takes the second article: both values are wrong.
    mock: {
      values: { title: TWO.second, excerpt: TWO.secondLead },
      evidence: [q("title", TWO.second), q("excerpt", TWO.secondLead)],
    },
  },
];

// ─── The page of blocks ──────────────────────────────────────────────────────

const LIBRARY = {
  title: "The city library opens on Sundays",
  lead: "From January, the central library is open every Sunday, 10 am to 6 pm.",
  opening:
    "Opening day: Sunday 11 January 2026, from 10:00 to 18:00. Book a guided tour at https://library.example.org/tours.",
  quote: "A library that never closes is a city that never stops reading.",
  quoted: "Elena Greco, head librarian.",
  credits: "Credits: text by Anna Rossi; photos by Rossi.",
  first:
    'Marta B., 12 December 2025: "Finally open when I can go." Five stars.',
  second:
    'Pietro L., 3 January 2026: "Quiet, warm, and full of new books." Four stars.',
};

const FESTIVAL = {
  title: "Science festival 2026",
  lead: "Three days of talks and workshops for families.",
  opening:
    "Opening night: Friday 15 May 2026, 18:00–22:00, online too. Book at https://festival.example.org/book",
  quote: "Curiosity is a muscle.",
  quoted: "Chiara Ricci, festival director",
};

const PAGE_CASES: EvalCase[] = [
  {
    id: "library-page",
    title:
      "A page of blocks from a text: an event, a quote, two credits (one name three authors have), two reviews",
    form: "page",
    language: "en",
    source: {
      kind: "text",
      text: [
        LIBRARY.title,
        LIBRARY.lead,
        "",
        LIBRARY.opening,
        "",
        `"${LIBRARY.quote}" — ${LIBRARY.quoted}`,
        "",
        LIBRARY.credits,
        "",
        "Reviews:",
        `- ${LIBRARY.first}`,
        `- ${LIBRARY.second}`,
      ].join("\n"),
    },
    expect: {
      title: { value: LIBRARY.title, goes: "in" },
      summary: { phrases: ["open every sunday"], goes: "in" },
      blocks: {
        phrases: ["elena greco", "library.example.org/tours", "photos"],
        adds: 4,
      },
      reviews: {
        phrases: ["finally open when i can go", "full of new books"],
        adds: 2,
      },
      status: { empty: true },
      published_at: { empty: true },
    },
    mock: {
      values: {
        title: LIBRARY.title,
        summary: LIBRARY.lead,
        blocks: [
          {
            _template: "event",
            event_name: "Opening day",
            event_date: "2026-01-11",
            event_starts_at: "10:00",
            event_ends_at: "18:00",
            event_booking_url: "https://library.example.org/tours",
            evidence: [
              q("event_name", LIBRARY.opening),
              q("event_date", LIBRARY.opening),
              q("event_starts_at", LIBRARY.opening),
              q("event_ends_at", LIBRARY.opening),
              q("event_booking_url", LIBRARY.opening),
            ],
          },
          {
            _template: "quote",
            quote_text: LIBRARY.quote,
            quote_author: "Elena Greco",
            quote_role: "head librarian",
            evidence: [
              q("quote_text", LIBRARY.quote),
              q("quote_author", LIBRARY.quoted),
              q("quote_role", LIBRARY.quoted),
            ],
          },
          {
            _template: "credits",
            credits_author: "Anna Rossi",
            credits_role: "Text",
            evidence: [
              q("credits_author", LIBRARY.credits),
              q("credits_role", LIBRARY.credits),
            ],
          },
          {
            _template: "credits",
            credits_author: "Rossi",
            credits_role: "Photos",
            evidence: [
              q("credits_author", LIBRARY.credits),
              q("credits_role", LIBRARY.credits),
            ],
          },
        ],
        reviews: [
          {
            author: "Marta B.",
            date: "2025-12-12",
            quote: "Finally open when I can go.",
            stars: "5",
            evidence: [
              q("author", LIBRARY.first),
              q("date", LIBRARY.first),
              q("quote", LIBRARY.first),
              q("stars", LIBRARY.first),
            ],
          },
          {
            author: "Pietro L.",
            date: "2026-01-03",
            quote: "Quiet, warm, and full of new books.",
            stars: "4",
            evidence: [
              q("author", LIBRARY.second),
              q("date", LIBRARY.second),
              q("quote", LIBRARY.second),
              q("stars", LIBRARY.second),
            ],
          },
        ],
      },
      evidence: [q("title", LIBRARY.title), q("summary", LIBRARY.lead)],
    },
  },
  {
    id: "pagina-it",
    title: "A page in Italian: the translatable values in Italian, one review",
    form: "page",
    language: "it",
    source: {
      kind: "text",
      text: [
        "La biblioteca apre la domenica",
        "Da gennaio la biblioteca centrale è aperta ogni domenica, dalle 10 alle 18.",
        "Recensioni:",
        '- Marta B.: "Finalmente aperta quando posso andarci." Cinque stelle.',
      ].join("\n"),
    },
    expect: {
      title: { value: "La biblioteca apre la domenica", goes: "in" },
      summary: { phrases: ["aperta ogni domenica"], goes: "in" },
      reviews: { phrases: ["finalmente aperta"], adds: 1 },
    },
    mock: {
      values: {
        title: "La biblioteca apre la domenica",
        summary:
          "Da gennaio la biblioteca centrale è aperta ogni domenica, dalle 10 alle 18.",
        reviews: [
          {
            author: "Marta B.",
            quote: "Finalmente aperta quando posso andarci.",
            stars: "5",
            evidence: [
              q("author", "Marta B."),
              q("quote", "Finalmente aperta quando posso andarci."),
              q("stars", "Cinque stelle"),
            ],
          },
        ],
      },
      evidence: [
        q("title", "La biblioteca apre la domenica"),
        q(
          "summary",
          "Da gennaio la biblioteca centrale è aperta ogni domenica, dalle 10 alle 18.",
        ),
      ],
    },
  },
  {
    id: "near-duplicate",
    title:
      "Reviews of a page that holds one of them, written again with an exclamation mark (B60)",
    form: "page",
    language: "en",
    record: {
      title: "The city library opens on Sundays",
      reviews: [
        {
          author: "Marta B.",
          date: "2025-12-12",
          quote: "Finally open when I can go.",
          stars: 5,
        },
      ],
    },
    source: {
      kind: "text",
      text: [
        "More reviews of the Sunday opening:",
        '- Marta B.: "Finally open when I can go!" Five stars.',
        '- Gino R.: "Great for students before exams." Four stars.',
      ].join("\n"),
    },
    expect: {
      reviews: { phrases: ["great for students"], adds: 1 },
      title: { empty: true },
    },
    mock: {
      values: {
        reviews: [
          {
            author: "Marta B.",
            quote: "Finally open when I can go!",
            stars: "5",
            evidence: [
              q("author", "Marta B."),
              q("quote", "Finally open when I can go!"),
            ],
          },
          {
            author: "Gino R.",
            quote: "Great for students before exams.",
            stars: "4",
            evidence: [
              q("author", "Gino R."),
              q("quote", "Great for students before exams."),
            ],
          },
        ],
      },
      evidence: [],
    },
  },
  {
    id: "festival-html",
    title:
      "A web page of an event: an event block with its times, a quote, nothing for the reviews",
    form: "page",
    language: "en",
    source: {
      kind: "file",
      name: "festival.html",
      content: [
        "<html><body><header>Menu</header><main>",
        `<h1>${FESTIVAL.title}</h1>`,
        `<p>${FESTIVAL.lead}</p>`,
        "<h2>Programme</h2>",
        `<p>${FESTIVAL.opening}</p>`,
        `<blockquote>“${FESTIVAL.quote}” — ${FESTIVAL.quoted}</blockquote>`,
        "</main><footer>Privacy</footer></body></html>",
      ].join("\n"),
    },
    expect: {
      title: { value: FESTIVAL.title, goes: "in" },
      summary: { phrases: ["talks and workshops"], goes: "in" },
      blocks: {
        phrases: ["chiara ricci", "festival.example.org/book"],
        adds: 2,
      },
      reviews: { empty: true },
    },
    mock: {
      values: {
        title: FESTIVAL.title,
        summary: FESTIVAL.lead,
        blocks: [
          {
            _template: "event",
            event_name: "Opening night",
            event_date: "2026-05-15",
            event_starts_at: "18:00",
            event_ends_at: "22:00",
            event_online: "true",
            event_booking_url: "https://festival.example.org/book",
            evidence: [
              q("event_name", FESTIVAL.opening),
              q("event_date", FESTIVAL.opening),
              q("event_starts_at", FESTIVAL.opening),
              q("event_ends_at", FESTIVAL.opening),
              q("event_online", FESTIVAL.opening),
              q("event_booking_url", FESTIVAL.opening),
            ],
          },
          {
            _template: "quote",
            quote_text: FESTIVAL.quote,
            quote_author: "Chiara Ricci",
            quote_role: "festival director",
            evidence: [
              q("quote_text", FESTIVAL.quote),
              q("quote_author", FESTIVAL.quoted),
              q("quote_role", FESTIVAL.quoted),
            ],
          },
        ],
      },
      evidence: [q("title", FESTIVAL.title), q("summary", FESTIVAL.lead)],
    },
  },
  {
    id: "reviews-csv",
    title:
      "A CSV sheet of reviews, one a row: dates, numbers, a quote with a comma",
    form: "page",
    language: "en",
    source: {
      kind: "file",
      name: "reviews.csv",
      content: [
        "Author,Date,Quote,Stars",
        "Marta B.,2025-12-12,Finally open when I can go.,5",
        'Pietro L.,2026-01-03,"Quiet, warm, and full of new books.",4',
        "Sofia T.,2026-01-10,Too cold in the reading room.,2",
      ].join("\n"),
    },
    expect: {
      reviews: { phrases: ["too cold in the reading room"], adds: 3 },
      title: { empty: true },
    },
    mock: {
      values: {
        reviews: [
          ["Marta B.", "2025-12-12", "Finally open when I can go.", "5"],
          [
            "Pietro L.",
            "2026-01-03",
            "Quiet, warm, and full of new books.",
            "4",
          ],
          ["Sofia T.", "2026-01-10", "Too cold in the reading room.", "2"],
        ].map(([author, date, quote, stars]) => ({
          author,
          date,
          quote,
          stars,
          evidence: [
            q("author", String(author)),
            q("date", String(date)),
            q("quote", String(quote)),
            q("stars", String(stars)),
          ],
        })),
      },
      evidence: [],
    },
  },
];

/** Every case of the evaluation, the article's first. */
export const EVAL_CASES: readonly EvalCase[] = [
  ...ARTICLE_CASES,
  ...PAGE_CASES,
];
