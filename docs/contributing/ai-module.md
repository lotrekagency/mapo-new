# Working on the AI module

How `@mapomodule/ai` is built, why it is built this way, what it does well and where it falls short, and how to extend it. What the package offers to app developers is on [AI-assisted entry](/modules/ai); this page is about its source and its design. The package is experimental and grows one piece at a time: the page describes the code as it is, and its last section says what comes next.

## Where the module is going

The module will help an operator enter data with a language model, in two ways:

- **Magic Fill** will fill the form of one record from a text or a file;
- **Import AI** will extract several related records from a long source.

In both, the model only proposes: the operator reviews every value before anything is saved, and the gateway never writes to the backend.

Neither feature exists yet. Today the package installs the gateway, with its `status` route, and the shared core both features will run on: what the AI may fill in a record, what it is asked, and how its answer is checked. The core is pure TypeScript and is not part of the package's public types yet.

## How a value travels

```text
backend schema ──┐
                 ├──► entity model ──► contract ──► provider ──► answer ──► sanitizer ──► one outcome per field
form fields ─────┘    entity.ts        contract.ts   (planned)    unknown    sanitize.ts   empty | filled | discarded
```

1. **The entity model** says which fields the AI may fill, with their kind of value, limits and choices, and which fields it must leave alone, with the reason.
2. **The contract** is the strict JSON Schema the model's answer must follow, the same for every provider, with the fields behind it.
3. **The provider** sends the contract and the source to a model. It does not exist yet: the tests write the answers by hand.
4. **The sanitizer** reads the answer as outside data, turns each value into the form's type, discards what breaks a rule, and checks each value against the quotes the model gives from the source.

A filled value is either **verified** or **to check**, and the difference matters: Magic Fill will apply a verified value without a preview, and show everything else to the operator first. Many of the core's rules exist to keep that word honest.

## The package

| File                              | Role                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `src/module.ts`                   | The Nuxt module: registers the gateway's routes             |
| `src/runtime/server/routes/`      | The gateway's Nitro handlers, one file per route            |
| `src/runtime/shared/entity.ts`    | The entity model                                            |
| `src/runtime/shared/contract.ts`  | The contract compiler                                       |
| `src/runtime/shared/sanitize.ts`  | The sanitizer and the verification rules                    |
| `src/runtime/shared/citations.ts` | Finding a quote in the source, and a value in a quote       |
| `src/runtime/shared/markdown.ts`  | Restricted Markdown, the rich text the model writes         |
| `src/runtime/shared/dialect.ts`   | The `x-mapo-ai` keyword: a hint for the model, or `exclude` |

The rules for the code are in `packages/@mapomodule/ai/AGENTS.md`: `runtime/shared` stays free of Nuxt, Nitro, Vue and Node imports, secrets stay on the server, outside data is `unknown` until a validator reads it, nothing that keeps the AI out may be lost, and one schema serves every provider.

## The entity model

`buildAiEntity({ schema, fields }, { exclude })` reads two JSON Schemas in Mapo's dialect:

- the **backend's**, from `OPTIONS`, DRF metadata or an OpenAPI document, normalized by `@mapomodule/utils` ([JSON Schema and forms](/uikit/form/schema-to-form#from-drf-metadata-and-openapi));
- the **form's fields**, as `fieldsToJsonSchema()` writes them.

Both are read with the form's own reader, `useFormFromSchema`, so the AI sees the field types the form shows. With both sources, the form's fields decide which fields exist and of which type; the backend adds its limits, and on each side the stricter limit wins. A disagreement the merge cannot settle becomes a warning for the developer (`type-conflict`, `readonly-conflict`, `choices-conflict`, `limits-conflict`, `unreadable-source`) or a field the AI leaves alone.

### What keeps the AI out

| Reason        | When                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secret`      | `writeOnly`, `noDraft`, a `password` format or input, or a key that names a password, a token, a secret, or an API, private or access key (`new_password`, `auth_token`, `client_secret`, `apiKey`) |
| `readonly`    | The form does not let the operator change it                                                                                                                                                        |
| `excluded`    | `x-mapo-ai: { exclude: true }` on either side, or the `exclude` option                                                                                                                              |
| `media`       | A file or a media, on either side                                                                                                                                                                   |
| `relation`    | A relation whose endpoint is unknown, so no record can be looked up                                                                                                                                 |
| `unsupported` | A nested value (repeater, object, SEO, map), a list without choices, a value without a JSON type, a `$ref` to nothing                                                                               |
| `conflict`    | The form and the backend leave no valid value: no shared choice, or limits that exclude each other                                                                                                  |

A flag that keeps the AI out counts wherever a schema writes it: beside a union or inside one of its branches, behind a `$ref`, on an object around a dotted key, or in a part of the schema the form's reader cannot read. The reader resolves schemas for display and drops some of these flags; the entity model looks through every variant instead. Losing one would hand a password or a read-only value to the model, so when in doubt the model leaves the field out.

### Strengths and weaknesses

- **One model for both sources**, built by the same reader as the form: the AI never fills a field the form does not show, nor with a type the form would refuse.
- **The keep-out rules fail closed**: a schema the reader cannot read keeps the AI out of what it cannot read, instead of letting it in.
- **Secrets by name are a net, not a guarantee.** DRF's `OPTIONS` does not publish `write_only`: without `noDraft` or a password input, a secret is recognised only by the words of its key, which cover the common names but not every one. Mark secret fields explicitly.
- **Nested values are left to the operator** today: a repeater, an object or a map is skipped as `unsupported`.

## The contract

`compileFillContract(source, options)` asks for the values of one record. `compileExtractContract(sources, options)` asks for the items of one or more entities, each with a `ref` that other items can link to. A source is the entity model with a `label`, a `description`, the `endpoint` its records live at, the `relationChoices` (the records a relation may point to, when they are few enough to list) and `evidence`, the quotes from the source, asked for by default. `options.language` is the language of translatable values.

### One schema for every provider

The answer's schema stays inside what every provider accepts in strict mode: objects whose keys are all required, strings, arrays and string `enum`s; no `null`, no numeric or length limits, no formats. A value the source does not give is `""` or an empty list. What the schema cannot say (formats, limits, long lists of choices, the rich text's markup) goes in each property's description, and the sanitizer enforces it.

The compiler measures the schema it builds against the providers' limits (at most 250 values in one `enum` and 1000 in the whole schema, 5000 properties, 100,000 characters of names and values) and moves the longest lists into the descriptions until the schema fits. When nothing more can move, it throws rather than build a contract a provider would reject.

### Strengths and weaknesses

- **One shape for every provider** means one sanitizer and one set of tests, whichever model answers.
- **A limit written only in a description can be ignored by the model.** The sanitizer then discards the value with its reason: a broken limit costs a value, never a wrong save.
- **A large entity makes a large prompt.** With the schema in the prompt, a form of about 200 fields measured some 28,500 tokens on a local model.

## The sanitizer

`sanitizeFillAnswer(contract, answer, options)` and `sanitizeExtractAnswer(contract, answer, options)` read the answer as outside data, property by property, and never throw on it. Each field gets one outcome:

| Outcome     | What it carries                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty`     | Nothing: the source does not give the value                                                                                                                                 |
| `filled`    | The value typed for the form, its quotes, and `verified`. For a list, the values taken out (`dropped`) and whether it is shorter than its minimum (`tooFew`), both to check |
| `discarded` | The reason (`format`, `not-listed`, `too-short`, `too-long`, `too-low`, `too-high`, `step`, `pattern`, `too-many-values`) and what the model wrote, for the operator to see |

Values come back as the form saves them: numbers, booleans, normalized dates and times, choices mapped back to their value (`"1"` becomes `1`), relations as `{ id }`, `{ search }` or `{ item }`. Rich text arrives as restricted Markdown and becomes HTML from a closed list of tags, `p`, `ul`, `ol`, `li`, `strong`, `em`, and `a` with an `http` or `https` address; everything else becomes escaped text, so no HTML the model writes reaches the page. What the answer has that cannot be used becomes a warning, with its path in the answer.

## Verification

A filled value is **verified** when a quote the model gives is found in the source and holds the value. Without the source's text, nothing is verified.

### Finding a quote

A quote is searched as whole words, once the differences a copy brings are evened out: case, Unicode forms, typographic quotes and dashes, runs of spaces, and the words a PDF splits at the end of a line. A quote that skips words with `...` is found when each of its parts is, in order. It needs at least two words or numbers, or one word that the source writes only once: `impilabile` can be found, `il` never.

### What a found quote must hold

| Value                   | The quote must hold                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text, email, colour     | The whole value, as whole words, also once the quote's Markdown markup is removed. A summary longer than its quotes is never verified                                                                                                    |
| Address                 | The whole address, with its scheme or without: not a longer path, a query or another host (`teatro.it/biglietti/2027`, `teatro.it/biglietti?evento=42`, `www.teatro.it`)                                                                 |
| Rich text               | Its words, and the address of each of its links                                                                                                                                                                                          |
| Number                  | The number, written in a way that reads as one number only: `12,5` is 12.5, while `1.500` (1500 or 1.5) verifies nothing                                                                                                                 |
| Choice, listed record   | Its label, or its value when the value is a word                                                                                                                                                                                         |
| Name to search for      | The name                                                                                                                                                                                                                                 |
| Date                    | The day, the month and the year: in digits that read one way (`14/10/2026`, `10/14/2026`, never `03/04/2026`), or with the month in words (`14 ottobre 2026`, `October 14th, 2026`, `14. Oktober 2026`). A year in two digits is no year |
| Time                    | The hours and the minutes: `21:00`, `21.30`, `21h30`, `9:30 pm`, `9 pm`                                                                                                                                                                  |
| Date and time           | One day only, the time, and on that very time the value's time zone: the same offset (`21:00Z`, `T21:00:00+02:00`, `21:00 UTC+2`), or none, with no zone written elsewhere in the quote                                                  |
| Yes/no, link to an item | Nothing more than being found, with two words or more                                                                                                                                                                                    |

A quote of one word verifies only a value it is whole: a text, a label or a number, never a yes/no, a date, a time or a link to an item.

### The verification rules

What a quote must hold is a set of named rules with prudent defaults, `DEFAULT_VERIFICATION_RULES`, which the sanitizer takes as `options.rules`. `verificationRulesOf(value)` reads them from a value of any shape, such as stored settings: a rule given with a value of the wrong type keeps its default, so a malformed setting never loosens the check. No rule can verify a value without a quote found in the source.

| Rule            | Default    | Changed                                                                                                         |
| --------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `dateYear`      | `true`     | `false`: the day is enough, and `14 ottobre` verifies 14 October of any year                                    |
| `bareHours`     | `false`    | `true`: an hour alone from 13 to 23 counts (`alle 21`), when the quote writes no other time and no other number |
| `timeZones`     | `true`     | `false`: the time zone of a date and time is not compared                                                       |
| `oneWordQuotes` | `"unique"` | `"never"`: a quote of one word is never found                                                                   |
| `richTextLinks` | `true`     | `false`: rich text is verified by its words alone                                                               |

Today only the core reads the rules. They will become an option of the app, then a setting that admins can change, for the whole app or for one entity.

### Strengths and weaknesses

- **It fails safe.** Whatever it cannot read leaves the value to check. Against answers recorded from two local models, none of the values they got wrong comes out verified, the midnight, the year and the time zone they invented included.
- **It proves that a value is in the source, not that it belongs to this field.** A model that puts the right words in the wrong field, with the right quote, still gets a verified value.
- **Month names come from `Intl`**, in Italian, English, French, German, Spanish, Portuguese and Dutch, as the runtime writes them, full and short. A date in words in another language never verifies, and stays to check; so do a time zone named by letters (`CET`) and a time in words (`alle nove`). In the quote of a date and time, `12.50` reads as a time.
- **One quote, one moment.** A quote that writes two days never verifies a date and time, because the time could belong to either; a time zone counts only on the time it follows.
- **Strict rules cost reviews.** An Italian `alle 21` is not a time unless `bareHours` is on, and an ambiguous number such as `1.500` never verifies.

## Testing

The whole core runs without network or UI, with Vitest, in `packages/@mapomodule/ai/src/__tests__/`:

| File                | What it proves                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `entity.test.ts`    | Which fields the AI may fill, the merge rules, and that no keep-out flag is lost wherever a schema writes it |
| `contract.test.ts`  | The schema stays portable (`expectPortable()`), the budget, the links of an extraction                       |
| `sanitize.test.ts`  | Each kind read and discarded, limits, lists, relations, links, quotes and the verification rules             |
| `citations.test.ts` | Finding quotes, numbers read one way, dates, times, time zones and links                                     |
| `markdown.test.ts`  | The closed list of tags: everything else is text                                                             |

- A bug fix leaves a regression test that fails on the previous version.
- Answers recorded from real models are reduced to minimal cases and kept as tests, so the rules are checked against what models actually write, not only against answers written by hand.

```bash
pnpm --filter "@mapomodule/ai..." build   # the tests run the form's built reader
pnpm --filter @mapomodule/ai test
```

## How to extend the core

### Add a value kind

1. Add it to `AiValueKind` in `entity.ts`, with the field types that give it.
2. Describe it to the model in `KIND_RULES` of `contract.ts`, and add it to `PROSE_KINDS` when it is translated text.
3. Read it in `convert()` of `sanitize.ts`, with what its quote must hold.
4. Add it to the tables of the three test files.

### Add a verification rule

1. Add it to `AiVerificationRules` in `sanitize.ts`, with a JSDoc that says what it changes.
2. Give it its prudent value in `DEFAULT_VERIFICATION_RULES`, and read it in `verificationRulesOf()`, so a malformed value falls back to the default.
3. Apply it in `holdsProbe()`, or in the reading it changes in `citations.ts`.
4. Test it on, off and malformed. A rule may change what a found quote must hold; it never verifies a value without one.

### Add a word that names a secret

Add it to `SECRET_WORDS`, or to `SECRET_PAIRS` for two words, in `entity.ts`. Test it from a form alone and from a backend schema alone, with a key that holds the word inside another word and must stay fillable.

### Add a tag of rich text

Add it to `markdown.ts` and to the closed list in its tests, and make sure `MapoWygEditor` accepts it: the editor must keep every tag the AI's HTML has.

## Documentation plan

The module's documentation is written with the code, on this plan. [AI-assisted entry](/modules/ai) is for app developers and says only what works, because the MCP server serves it to assistants as fact. Its sections, and what fills each:

| Section                                          | Filled by                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| What works today, Enable the module, The gateway | The gateway's first route (written)                      |
| Options                                          | Each option, in the change that makes it work            |
| Fill a form with Magic Fill                      | Magic Fill                                               |
| Verified and to check                            | Magic Fill, from the verification described on this page |
| Keep a field away from the AI                    | Magic Fill: `x-mapo-ai`, `noDraft`, the names of secrets |
| Providers and keys                               | The providers, and the keys on three levels              |
| AI settings                                      | The settings page                                        |
| Import several records                           | Import AI                                                |
| Guarantees and limits                            | Every change                                             |

This page, for people who work on Mapo, follows every change to the source. At the end of each milestone both pages are read again and rewritten as one text.

## Next and nice to have

### Planned

In this order:

1. **Nested values in the core**: repeaters, objects, SEO and maps, verified item by item.
2. **Encrypted server storage** for the module's state, with expiry.
3. **The gateway's run route**: authentication, policy, prompts composed in layers, a mock provider, and the verification rules as an option of the app.
4. **Readers** for text, PDF, images and spreadsheets.
5. **Providers**: OpenAI, Anthropic and OpenAI-compatible servers, local ones included.
6. **Keys on three levels**: the project's, those an admin assigns, and the operator's own.
7. **The AI settings page**, where admins also set the verification rules and the extra words that name a secret.
8. **Magic Fill**, with an evaluation set run on real providers; then **Import AI**, with a check for duplicates between new items and existing records.

### Nice to have

Ideas with no place in the plan yet:

- Read month names and dates in words in the source's language, with `Intl`.
- Resolve a named time zone (`CET`, `Europe/Rome`) to its offset on the value's date, so that such quotes can verify.
- Let the form's number input take `multipleOf` as its `step`.
- Limits on dates (a minimum and a maximum day), which the core does not model.
- Expose Magic Fill and Import AI as tools of a conversational agent. The module is designed for it: every action of its interface is an operation that can also run without the interface.
