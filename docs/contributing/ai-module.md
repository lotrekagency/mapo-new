# Working on the AI module

How `@mapomodule/ai` is built, why it is built this way, what it does well and where it falls short, and how to extend it. What the package offers to app developers is on [AI-assisted entry](/modules/ai); this page is about its source and its design. The package is experimental and grows one piece at a time: the page describes the code as it is, and its last section says what comes next.

## Where the module is going

The module is meant to help an operator enter data with a language model, in two ways:

- **Magic Fill**, to fill the form of one record from a text or a file;
- **Import AI**, to extract several related records from a long source.

In both, the model only proposes: the operator reviews every value before anything is saved, and the gateway never writes to the backend.

The foundations are in place; neither feature has its interface yet. The package installs the gateway, behind the backend session: `status`; `read`, which reads a file into text with Mapo's readers or the app's; `run`, which builds what the AI is asked from a record's descriptions, calls a provider (the `mock`, a model in OpenAI's or Anthropic's cloud through `openai` or `anthropic`, a model on the app's own servers through `ollama` or `openai-compatible`, or one the app registers) and answers the outcome of each field, with an audit of every call in an encrypted storage on the server; and the routes of the keys, where the AI's admins assign provider keys and models and each user may save a token of their own, so that each call uses the key nearest its user. In the browser, `useMapoAiFill()` fills a detail form through `run` and `useMapoAiRead()` sends a file to `read`: they are the first pieces of Magic Fill, without its panel, and the AI settings page calls the routes of the keys. Under them is the shared core both features will run on: what the AI may fill in a record, what it is asked, and how its answer is checked. The core is pure TypeScript; the types of its results are public, since `run` answers them.

What comes next, in order, is in [Next and nice to have](#next-and-nice-to-have): Magic Fill, readers for PDFs and images, then Import AI.

## How a value travels

```text
backend schema ──┐
                 ├──► entity model ──► contract ──► prompt ──► provider ──► answer ──► sanitizer ──► one outcome per field
form fields ─────┘    entity.ts        contract.ts  prompts/   providers/   unknown    sanitize.ts   empty | filled | discarded
                      └──────────────────── the gateway, POST /_mapo/ai/run ─────────────────────┘
                                                                                                        │
                                       the form ◄── verified on an empty field: in; the rest: marked ◄──┘
                                                    useMapoAiFill(), fill.ts
```

Before them, a file the operator gives becomes text: `POST /_mapo/ai/read` reads it with the reader of its format, and the page sends that text as the source of `run` ([Reading files](#reading-files)).

1. **The entity model** says which fields the AI may fill, with their kind of value, limits and choices, and which fields it must leave alone, with the reason.
2. **The contract** is the strict JSON Schema the model's answer must follow, the same for every provider, with the fields behind it.
3. **The provider** gets the prompt the gateway composed in layers, the source and the contract's schema, and returns the model's answer. Mapo ships the `mock`, which answers without a model, two providers for models in a cloud, `openai` and `anthropic`, and two for models on the app's own servers, `ollama` and `openai-compatible`; an app can register its own.
4. **The sanitizer** reads the answer as outside data, turns each value into the form's type, discards what breaks a rule, and checks each value against the quotes the model gives from the source.
5. **The page** applies the outcomes: `useMapoAiFill()` writes a verified value into an empty field, and marks every other one for the operator.

A filled value is either **verified** or **to check**, and the difference matters: `useMapoAiFill()` applies a verified value on an empty field without a preview, and shows everything else to the operator first; Magic Fill will keep that rule. Many of the core's rules exist to keep that word honest.

## The package

| File                              | Role                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/module.ts`                   | The Nuxt module: routes, plugins, server and app imports, private runtime config, hook types                                 |
| `src/storage.ts`                  | At build time, the storage's default mount                                                                                   |
| `src/access.ts`                   | At build time, the `admin` and `users` options                                                                               |
| `src/settings.ts`                 | At build time, the `settings` option: the settings page's path and label, the users' and groups' endpoints                   |
| `src/runtime/server/routes/`      | The gateway's Nitro handlers, one file per route                                                                             |
| `src/runtime/server/auth/`        | Who calls the gateway: the session, the rules, the hook                                                                      |
| `src/runtime/server/run/`         | The `run` route's request, contract, options, policy, limit, audit and operation                                             |
| `src/runtime/server/providers/`   | The provider interface, the registry, the mock and the providers for cloud and local models                                  |
| `src/runtime/server/readers/`     | The readers of files, their registry, and the `read` route's request and operation                                           |
| `src/runtime/server/keys/`        | The chain of keys, the admins' assignments in one sealed record, the users' own tokens, the key routes' wiring               |
| `src/runtime/server/settings/`    | The settings page's server: the preference, the check of a connection, the admins' settings                                  |
| `src/runtime/server/usage/`       | The usage and the changes, read from the audit and summed when read; their costs                                             |
| `src/runtime/server/body.ts`      | A request's body read up to a bound, for `run`, `read` and the routes of the keys                                            |
| `src/runtime/server/prompts/`     | Mapo's base rules and the prompt in layers                                                                                   |
| `src/runtime/server/storage/`     | The sealed storage of the gateway's state                                                                                    |
| `src/runtime/server/plugins/`     | When the server starts: the storage's checks and sweeps, the providers `run` will not call                                   |
| `src/runtime/shared/entity.ts`    | The entity model                                                                                                             |
| `src/runtime/shared/contract.ts`  | The contract compiler                                                                                                        |
| `src/runtime/shared/sanitize.ts`  | The sanitizer and the verification rules                                                                                     |
| `src/runtime/shared/citations.ts` | Finding a quote in the source, and a value in a quote                                                                        |
| `src/runtime/shared/markdown.ts`  | Restricted Markdown, the rich text the model writes                                                                          |
| `src/runtime/shared/dialect.ts`   | The `x-mapo-ai` keyword: a hint for the model, or `exclude`                                                                  |
| `src/runtime/shared/patterns.ts`  | The bound on a pattern's work, before the sanitizer runs it                                                                  |
| `src/runtime/shared/gateway.ts`   | The gateway's response types and the contract version                                                                        |
| `src/runtime/shared/fill.ts`      | The browser's half of `run`: the request, the answer read, what goes into the form                                           |
| `src/runtime/shared/read.ts`      | The browser's half of `read`: the file sent as a form, the answer read                                                       |
| `src/runtime/shared/settings.ts`  | The settings page's reading of the backend's users and groups, as DRF lists them                                             |
| `src/runtime/composables/`        | `useMapoAiFill()`: an answer applied to a detail form, with marks, undo and errors; `useMapoAiRead()`: a file sent to `read` |
| `src/runtime/components/`         | `MapoAiSettings` and its parts, with Nuxt UI; `settingsClient.ts` in `composables/` is their client                          |
| `src/runtime/pages/`              | `ai-settings.vue`, the page the module adds when the app has none on its path                                                |

The rules for the code are in `packages/@mapomodule/ai/AGENTS.md`: `runtime/shared` stays free of Nuxt, Nitro, Vue and Node imports, secrets stay on the server, outside data is `unknown` until a validator reads it, nothing that keeps the AI out may be lost, one schema serves every provider, the state is sealed and fails closed, no pattern runs unbounded, `run` builds what it asks and spends last, and the page writes only what the answer verifies on an empty field.

## The entity model

`buildAiEntity({ schema, fields }, { exclude })` reads two JSON Schemas in Mapo's dialect:

- the **backend's**, from `OPTIONS`, DRF metadata or an OpenAPI document, normalized by `@mapomodule/utils` ([JSON Schema and forms](/uikit/form/schema-to-form#from-drf-metadata-and-openapi));
- the **form's fields**, as `fieldsToJsonSchema()` writes them.

Both are read with the form's own reader, `useFormFromSchema`, so the AI sees the field types the form shows. With both sources, the form's fields decide which fields exist and of which type; the backend adds its limits, and on each side the stricter limit wins. A disagreement the merge cannot settle becomes a warning for the developer (`type-conflict`, `readonly-conflict`, `choices-conflict`, `limits-conflict`, `unreadable-source`, which names the nested value when it is in one: `speakers.*`) or a field the AI leaves alone.

### Nested values

- **An object** the form shows as one field, the SEO block or an object read from a schema, is filled through its own fields, under dotted keys: `seo` gives `seo.title`, `seo.description` and `seo.permalink`. The form's object decides which fields exist when it lists them; an object type of the app's lists none, and then the backend's object does. The fields of an optional object are optional.
- **A repeater** becomes a `list` field. Its `items` are read as an entity of their own, from the items of both sources, with every rule of this page: a secret, a read-only value or a media inside an item stays out. When the items vary, each template (`_template`) is read on its own, and `_template` is no field. Of two templates with the same key, the last counts, as in the form's reader.
- **The map field** becomes `coordinates`: one value, `{ lat, lng }`. A part kept out keeps the whole point out: `exclude: ["place.lat"]`, or a secret or an exclusion on `place.lng` in the backend.
- Objects and lists are followed one inside the other down to eight levels, more than a real form has. A schema that contains itself is followed once, and the list that would repeat it stays out. The contract then keeps what the providers accept.
- `exclude` reaches inside: `speakers.email`, or `speakers.*.email`, keeps the email of every speaker out; `speakers.*` and `seo.*` keep the whole list or object out.
- A translatable repeater or object is one value per language, and so is everything inside it.

A nested value is read from one declaration of each source, but what keeps the AI out is read from all of them, on both sides: every declaration on the way to the value, union branches and conditions included, and the items of every list (`speakers.*.pin`). A key names a secret with the keys around it, templates included: `key` in an object, a list or a template `api` is `api.key`.

### What keeps the AI out

| Reason        | When                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secret`      | `writeOnly`, `noDraft`, a `password` format or input, or a key that names a password, a token, a secret, credentials, an API, signing or session key, a JWT, an OTP, a database URL (`new_password`, `auth_token`, `apiKey`, `api.key`, `smtp_pass`), or one of the app's and the admins' words (`secretWords`)           |
| `readonly`    | The form does not let the operator change it                                                                                                                                                                                                                                                                              |
| `excluded`    | `x-mapo-ai: { exclude: true }` on either side, or the `exclude` option                                                                                                                                                                                                                                                    |
| `media`       | A file or a media, on either side                                                                                                                                                                                                                                                                                         |
| `relation`    | A relation whose endpoint is unknown, so no record can be looked up                                                                                                                                                                                                                                                       |
| `unsupported` | A list without choices, a value without a JSON type, a `$ref` to nothing, a value of unknown shape (`field:` types, an object without properties), a repeater with nothing to fill. When every field of a repeater's items is left alone for one reason, the repeater takes that reason: a list of media alone is `media` |
| `conflict`    | The form and the backend leave no valid value: no shared choice, or limits that exclude each other                                                                                                                                                                                                                        |

A flag that keeps the AI out counts wherever a schema writes it: beside a union or inside one of its branches, behind a `$ref`, on an object around a dotted key, in a part of the schema the form's reader cannot read, inside the items of a list, or in another declaration of a nested value. The reader resolves schemas for display and drops some of these flags; the entity model looks through every variant instead. Losing one would hand a password or a read-only value to the model, so when in doubt the model leaves the field out.

### Strengths and weaknesses

- **One model for both sources**, built by the same reader as the form: the AI never fills a field the form does not show, nor with a type the form would refuse.
- **The keep-out rules fail closed**: a schema the reader cannot read keeps the AI out of what it cannot read, instead of letting it in.
- **Secrets by name are a net, not a guarantee.** DRF's `OPTIONS` does not publish `write_only`: without `noDraft` or a password input, a secret is recognised only by the words of its key, which cover the common names but not every one. Mark secret fields explicitly, or add the words of the key to `secretWords` (the app's option, the admins' page).
- **Nested values follow the same rules.** The items of a list are entities of their own, built by the same code as the record, and what the declarations around them say reaches them by path. A secret's name counts with the keys around it, and a point with its parts.
- **A nested value takes its limits from one declaration.** Its keep-out flags come from every declaration, but a second declaration of an object or a list adds no limit to its fields.

## The contract

`compileFillContract(source, options)` asks for the values of one record. `compileExtractContract(sources, options)` asks for the items of one or more entities, each with a `ref` that other items can link to. A source is the entity model with a `label`, a `description`, the `endpoint` its records live at, the `relationChoices` (the records a relation may point to, when they are few enough to list) and `evidence`, the quotes from the source, asked for by default. `options.language` is the language of translatable values. A relation inside a list's items finds its records in `relationChoices` under its path, `*` standing for the item: `speakers.*.organisation`.

### One schema for every provider

The answer's schema stays inside what every provider accepts in strict mode: objects whose keys are all required, strings, arrays and string `enum`s; no `null`, no numeric or length limits, no formats. A value the source does not give is `""` or an empty list. What the schema cannot say (formats, limits, long lists of choices, the rich text's markup) goes in each property's description, and the sanitizer enforces it.

The compiler measures the schema it builds against the providers' limits (at most 250 values in one `enum` and 1000 in the whole schema, 5000 properties, 100,000 characters of names and values) and moves the longest lists into the descriptions until the schema fits. When nothing more can move, it throws rather than build a contract a provider would reject.

### Lists, templates and depth

A list is an array of items. Each item is an object with its fields, named in the item (`name`, `role`), and its own `evidence`, so a quote never needs an index to find its item. When the items vary, the item also has `_template`, one of the templates; a template's fields carry its key (`hero_title`), and the description tells the model to leave them empty in the other kinds of item. `evidence` and `_template` are the item's own names: a field called `evidence` becomes `evidence_2`. The record's `evidence` names the record's own values only.

Nesting is counted as the tests count it: every schema on the deepest way through the answer, the root and the leaf included, at most ten. With quotes, Magic Fill holds two lists one inside the other and Import AI one, since its records sit two levels lower; a list that would go deeper is left out and listed in the entity's `omitted`, with its path (`blocks.*.gallery`). A point of a map is asked for as `"latitude, longitude"`, and only when the source writes both numbers.

Lists and points changed the shape of the answer: `AI_CONTRACT_FORMAT_VERSION` is 2.

### Strengths and weaknesses

- **One shape for every provider** means one sanitizer and one set of tests, whichever model answers.
- **A limit written only in a description can be ignored by the model.** The sanitizer then discards the value with its reason: a broken limit costs a value, never a wrong save.
- **A large entity makes a large prompt.** With the schema in the prompt, a form of about 200 fields measured some 28,500 tokens on a local model.
- **Depth is counted the prudent way.** The providers do not say whether a leaf or an array counts as a level; counting both keeps every provider safe, at the price of one level of lists in Import AI. The branches of Import AI's one `anyOf` count at the union's level; counted one level lower, Import AI would still fit, at exactly ten.

## The sanitizer

`sanitizeFillAnswer(contract, answer, options)` and `sanitizeExtractAnswer(contract, answer, options)` read the answer as outside data, property by property, and never throw on it. Each field gets one outcome:

| Outcome     | What it carries                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty`     | Nothing: the source does not give the value                                                                                                                                 |
| `filled`    | The value typed for the form, its quotes, and `verified`. For a list, the values taken out (`dropped`) and whether it is shorter than its minimum (`tooFew`), both to check |
| `discarded` | The reason (`format`, `not-listed`, `too-short`, `too-long`, `too-low`, `too-high`, `step`, `pattern`, `too-many-values`) and what the model wrote, for the operator to see |

Values come back as the form saves them: numbers, booleans, normalized dates and times, choices mapped back to their value (`"1"` becomes `1`), relations as `{ id }`, `{ search }` or `{ item }`, a point as `{ lat, lng }`. Rich text arrives as restricted Markdown and becomes HTML from a closed list of tags, `p`, `ul`, `ol`, `li`, `strong`, `em`, and `a` with an `http` or `https` address; everything else becomes escaped text, so no HTML the model writes reaches the page. What the answer has that cannot be used becomes a warning, with its path in the answer. A field's pattern runs only within a bound on its work ([Patterns from outside](#patterns-from-outside)): a value whose pattern could not be tested is kept and never verified.

A list's outcome holds its items: each with its template, the outcome of each of its fields and its own `verified`. An item without a value is skipped, since models pad lists; one that is not an object, names no template of the list, or has every value discarded is taken out (`dropped`). An item is verified when every value it gives is, none was discarded and it has every value its fields require; an item that repeats one before it, or follows a template, is not, since no quote proves a second item or which kind of block it is. A list is verified only when every item is, none was taken out and it is long enough; too many items discard it (`too-many-values`). Its value is the items as the form saves them, dotted keys as nested objects and `_template` when the items vary, every key as data (`__proto__` included). `outcomesByPath(fields)` gives every outcome under the path of its value in the form, the way the form's annotations are keyed: `speakers.0.name`, with the indexes of the list's value. A value inside a list is applied with its list: only the list's own `verified` lets Magic Fill skip the preview.

### Patterns from outside

The sanitizer tests a field's patterns on the AI's values, and the patterns come from the schemas, which may come from outside. JavaScript's matcher backtracks: `^(a+)+$` takes about a second on 28 characters, and twice as long with each two more, and a counted repeat such as `a{5000}` walks the value one character at a time, from every position. Before a pattern runs, `patterns.ts` reads it into its parts and bounds, for the value's length, the ways each part can match and the steps it takes to try them all, as a backtracking matcher would:

- a sequence tries the rest after each way of its first part, and alternatives add up;
- a repeat walks its rounds and gives them back; a repeat of something that matches several ways multiplies them at each round, and a repeat of something that can match nothing is not bounded by the value's length;
- a back-reference has no bound;
- a pattern without `^` is tried from every position.

A test runs when its bound is at most ten million steps, and the tests of one answer share fifty million. A value whose pattern could not be tested is kept and never verified: one too costly, one JavaScript cannot read, and one whose matcher fails while it runs, as it does when a value is long enough to exhaust its stack. The bound is rough on purpose: it may call a harmless pattern costly, as `^([a-z]|[0-9])+$`.

## Verification

A filled value is **verified** when a quote the model gives is found in the source and holds the value. Without the source's text, nothing is verified.

### Finding a quote

A quote is searched as whole words, once the differences a copy brings are evened out: case, Unicode forms, typographic quotes and dashes, runs of spaces, and the words a PDF splits at the end of a line. A quote that skips words with `...` is found when each of its parts is, in order. It needs at least two words or numbers, or one word that the source writes only once: `impilabile` can be found, `il` never.

### What a found quote must hold

| Value                   | The quote must hold                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text, email, colour     | The whole value, as whole words, also once the quote's Markdown markup is removed. A summary longer than its quotes is never verified                                                                                                                                                                                                                                         |
| Address                 | The whole address, with its scheme or without: not a longer path, a query or another host (`teatro.it/biglietti/2027`, `teatro.it/biglietti?evento=42`, `www.teatro.it`)                                                                                                                                                                                                      |
| Rich text               | Its words, and the address of each of its links                                                                                                                                                                                                                                                                                                                               |
| Number                  | The number, written in a way that reads as one number only: `12,5` is 12.5, while `1.500` (1500 or 1.5) verifies nothing; by default (`soleNumber`) the only number of the quote, so `6 stars out of 5` verifies neither 6 nor 5, and a date, a time, a range or `1.500` beside it counts as another number                                                                   |
| Choice, listed record   | Its label, or its value when the value is a word                                                                                                                                                                                                                                                                                                                              |
| Name to search for      | The name                                                                                                                                                                                                                                                                                                                                                                      |
| Date                    | The day, the month and the year: in digits that read one way (`14/10/2026`, `10/14/2026`, never `03/04/2026`), or with the month in words (`14 ottobre 2026`, `October 14th, 2026`, `14. Oktober 2026`). A year in two digits is no year                                                                                                                                      |
| Time                    | The hours and the minutes: `21:00`, `21.30`, `21h30`, `9:30 pm`, `9 pm`                                                                                                                                                                                                                                                                                                       |
| Date and time           | One day only, the time, and on that very time the value's time zone: the same offset (`21:00Z`, `T21:00:00+02:00`, `21:00 UTC+2`), or none, with no zone written elsewhere in the quote                                                                                                                                                                                       |
| Point of a map          | Its two coordinates in a row, each with decimals, a degree sign or a hemisphere letter (`N`, `S`, `E`, `W`, `O`) before or after it; the letters say which is the latitude, otherwise it comes first. `45,4642 N e 9,1900 E` and `9.1900 E, 45.4642 N` verify `45.4642, 9.1900`; the numbers swapped, a number twice or two numbers apart (`45 posti, 9 euro`) verify nothing |
| List                    | Every value of every item, through the quotes of its own item; an item that repeats another, follows a template or lacks a value its fields require is never verified                                                                                                                                                                                                         |
| Yes/no, link to an item | Nothing more than being found, with two words or more                                                                                                                                                                                                                                                                                                                         |

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
| `soleNumber`    | `true`     | `false`: a number verifies when its quote writes it, whatever other numbers the quote writes                    |

The app changes them with the `verification` option, which `run` applies to every answer. They will also become a setting that admins can change, for the whole app or for one entity.

### Strengths and weaknesses

- **It fails safe.** Whatever it cannot read leaves the value to check. Against answers recorded from two local models, none of the values they got wrong comes out verified, the midnight, the year and the time zone they invented included.
- **It proves that a value is in the source, not that it belongs to this field.** A model that puts the right words in the wrong field, with the right quote, still gets a verified value.
- **Month names come from `Intl`**, in Italian, English, French, German, Spanish, Portuguese and Dutch, as the runtime writes them, full and short. A date in words in another language never verifies, and stays to check; so do a time zone named by letters (`CET`) and a time in words (`alle nove`). In the quote of a date and time, `12.50` reads as a time.
- **One quote, one moment.** A quote that writes two days never verifies a date and time, because the time could belong to either; a time zone counts only on the time it follows.
- **Strict rules cost reviews.** An Italian `alle 21` is not a time unless `bareHours` is on, and an ambiguous number such as `1.500` never verifies.
- **A point verifies only as a pair of decimal degrees.** Labels between the numbers (`lat 45.46, lng 9.19`), degrees with minutes and seconds (`45°27′51″N`) and whole degrees (`45, 9`) verify nothing, and the point stays to check.
- **A templated list always needs a look.** Which kind of block an item is, is the model's choice: no quote can prove it.

## The storage

The gateway's state lives on the app's server, in the Nitro mount `mapo-ai`, and every record is sealed before it reaches the driver. The audit of `run`, the admins' assignments of keys and the users' own tokens are written there. The gateway's routes reach it through `useMapoAiStorage(event)`, which reads the secret through the request's event (on Cloudflare Workers the environment arrives with the request) and throws a 503 while the storage is closed.

| File                                    | Role                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/storage.ts`                        | At build time: mounts the file system at `mapo-ai` when the app mounts nothing there                                    |
| `src/runtime/server/storage/sealed.ts`  | Envelopes, a key per purpose, users, expiry and the sweep; pure, as `runtime/shared` is                                 |
| `src/runtime/server/storage/secret.ts`  | `NUXT_MAPO_AI_SECRET`, read as outside data, and what the log says about it                                             |
| `src/runtime/server/storage/nitro.ts`   | The wiring to the mount and the runtime config: `useMapoAiStorage(event)`, and `mapoAiStorageState(event)` for `status` |
| `src/runtime/server/plugins/storage.ts` | When the server starts, after the app's plugins: the checks, the first and hourly sweep                                 |

### A sealed record

What the driver stores for one record, here the file `staging/b1.sealed` of the default mount:

```json
{
  "v": 1,
  "kid": "5a67ec5c27baeea6",
  "iv": "Ml-g-E0c1r8Vz28N",
  "ct": "RPjxm0a7Y1Vd…",
  "exp": 1800000005000
}
```

- `ct` is the value, as JSON, encrypted with AES-256-GCM, with its tag; `iv` is a random 12-byte nonce, new at every write.
- The key is derived from the secret with HKDF, one for each purpose of `STORAGE_PURPOSES` (`audit`, `keys`, `tokens`, `settings`, `catalog`, `staging`). `kid` names the key without revealing it, so a record sealed with another secret or for another purpose is told apart from a damaged one. The derivation leaves the envelope's version out: a new format of the envelope keeps the keys and the users' spaces.
- The seal also authenticates the record's path in the mount, the envelope's version and its expiry, `exp`, which stays in clear for the sweep: a record copied to another key or user, or whose expiry was moved, does not open.
- Every record's name on the driver ends with `.sealed`. No key segment has a dot, so a record never takes the name of the folder of the records under it: a batch `b1` and its drafts `b1:d1` are `b1.sealed` and `b1/d1.sealed` on a file system.
- What comes back is outside data: `get(key, read)` hands it to the caller's validator, and returns `undefined` when there is nothing, when it has expired, when it does not open or when the validator refuses it.

Everything is WebCrypto, with no Node import, so the same code runs on every server runtime Nitro targets.

### Purposes and users

`createSealedStorage({ storage, secret }).store(purpose)` holds the records of one purpose, and `forUser(id)` resolves to those of one user within it, filed under `u:` and a keyed hash (HMAC) of the id: neither file names nor keys say who the users are. The purpose's own store lists, reads and removes every user's records too, as the admins' list of saved tokens does; it never writes in a user's space, which only `forUser()` does.

A key is up to 8 segments of lowercase letters, digits, `_` and `-`, each up to 64 characters, joined by `:`, and none is a name Windows keeps for a device (`con`, `nul`, `com1`…). Lowercase because a case-insensitive file system would merge `B1` and `b1`; a route checks an id from a request before it makes a key of it.

### Expiry and the sweep

`set(key, value, { expiresAt })` gives a record its expiry, in epoch milliseconds, later than now or `set` throws a `RangeError`. An expired record is never returned, and is removed when it is read. `sweepExpired()` removes every expired record of the mount, reading only `exp`, so it needs no secret and runs while the storage is closed; the plugin runs it when the server starts and every hour, and skips a round while nothing is mounted, so a driver mounted later is swept from the next round. A driver with its own expiry, such as Redis, also gets `ttl`, in seconds.

The plugin starts on a zero `setTimeout`, once the app's own plugins have run (Nitro runs the plugins of modules before the app's): an app can mount its driver at `mapo-ai` from a plugin, with a password read from the environment, in place of the module's default.

Some runtimes allow no timer while the server starts: Cloudflare Workers run the plugins in their global scope, where a timer throws, and a plugin that throws stops the server. The plugin catches it: the checks run on the first request, with its event, which carries the environment there, and expired records go only when they are read. The tests cover it with a `setTimeout` that throws; it has not run on workerd.

### Without a secret

| `NUXT_MAPO_AI_SECRET`                                                    | `readMapoAiSecret()`      | The storage                |
| ------------------------------------------------------------------------ | ------------------------- | -------------------------- |
| 32 characters or more                                                    | `set`                     | Open                       |
| Not set, in `nuxt dev`                                                   | `temporary`, for this run | Open, and lost at restart  |
| Not set, in production                                                   | `missing`                 | Closed                     |
| Shorter, or not text (the environment can turn it into a number or JSON) | `too-short`, `not-text`   | Closed, in development too |

In `nuxt dev` a run also ends when the server code reloads: Nitro starts a new worker, which makes a new temporary secret.

Closed means no value is read or written: `useMapoAiStorage(event)` throws a 503, and the log says why when the server starts. Only the sweep still runs, since it reads `exp` alone. A secret that is set but unusable is never replaced by a temporary one, which would hide the mistake.

Without a mount, the storage is closed too, rather than kept in the memory of one process. The default mount follows the rules of Nitro's own `data` mount, and its `node` flag: `nuxt dev` and every preset that runs on Node get the folder, serverless functions included, where it does not outlive the instance; the other presets get nothing. A mount the app declares in `devStorage` alone counts in development only.

### Strengths and weaknesses

- **It fails closed.** Without a usable secret or a mount no value is read or written: no fallback to clear text, nor to one process's memory.
- **It never deletes what it cannot read.** A secret changed by mistake leaves the state unreadable but intact, and the old secret opens it again. The other side: after a deliberate change, the old records stay until they expire, and those without an expiry until someone empties the storage.
- **A user's space depends on the secret.** With a new secret, every user gets a new space, and their old records are no longer found.
- **One secret at a time**: there is no rotation yet.
- **The secret's strength is all there is.** HKDF does not slow down guessing, and the key id lets a copy of the storage test a guessed secret offline: the secret must be random, not a passphrase.
- **The sweep reads every record** of the mount once an hour: right for the hundreds of records of a backoffice, slow for millions.
- **Last write wins.** Nothing locks a record: of two writes to one key at the same time, the second stays, and a record written again between the read and the removal of an expired one is removed too.
- **Several instances need a shared driver**, and one secret. The file-system default fits one server, or a volume all of them see.
- **No sweep where timers are not allowed at startup**, such as Cloudflare Workers: expired records go only when they are read.
- **The default trusts Nitro's `node` flag**, not whether the file system keeps what is written: a serverless function on Node (`vercel`, `netlify`, `aws-lambda`) gets a folder that does not last, and the app must mount a driver.

## Authentication

Every route of the gateway starts with one of three functions of `auth/nitro.ts`:

- `requireMapoAiSession(event)` for a route that acts: it refuses with 403 a user the app's rules refuse;
- `requireMapoAiAdmin(event)` for what only the AI's admins may do;
- `readMapoAiCaller(event)` for `status`, which answers a refused user (`allowed: false`) instead of refusing them.

The gateway keeps no session of its own: the backend says who is signed in, as it does for the rest of the backoffice.

| File                                 | Role                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/runtime/server/auth/user.ts`    | The user read from `userInfoApi`'s answer, and the rules: admin, users, a model's permission |
| `src/runtime/server/auth/session.ts` | The answer of the backend for a cookie, and 30 seconds of memory of it; pure                 |
| `src/runtime/server/auth/nitro.ts`   | The wiring: Nitro's local fetch, the runtime config, the hook, the cross-site check          |
| `src/runtime/server/auth/hooks.ts`   | The `mapo-ai:user`, `mapo-ai:prompt` and `mapo-ai:read` hooks, typed for server code         |
| `src/access.ts`                      | At build time: `admin` and `users` read, with a warning for what cannot be read              |

### How a request is let in

1. **A request that changes something must come from the app's pages.** For any method but GET, HEAD and OPTIONS, a `Sec-Fetch-Site` other than `same-origin` gets a 403 before the backend is asked: the session cookie would otherwise let another site spend the user's AI. A client that sends no `Sec-Fetch-Site` is let through: no browser, an old one, or a page served over plain HTTP.
2. **The session.** The request's `cookie` header, and nothing else, goes to `userInfoApi` (from `runtimeConfig.public.mapoCore`, core's default otherwise) through `useNitroApp().localFetch`, under `app.baseURL`: the same path core's session restore takes, so the app's own proxy to the backend sees the call and handles its cookies as for any other. A URL with a protocol goes straight to the backend it names. A `userInfoApi` among the gateway's own routes would make every request call itself without end: the gateway refuses it, with a 502 and the reason in the log.
3. **The backend's answer.** 401, or 403 as DRF's session authentication answers an anonymous request, means nobody is signed in: the gateway answers 401. Anything else that is not a user, such as a 5xx, a page that is not JSON, an object without an `id` or a backend that cannot be reached, gets a 502 and a line in the server's log. It is never a 401, which would send the browser to the login page for a backend that is only down.
4. **The user** is read with zod, as outside data: an object with an `id`, text or a number. The other fields are read leniently and never grant more than they say: only `is_superuser: true` makes a superuser, only strings are groups, and the permissions are read by `userPermissions()` of `@mapomodule/utils`, which the auth store uses too, so the gateway and the interface read the same permissions. On superusers the gateway is stricter: the interface takes any true value of `is_superuser`, the gateway only `true`. The user and the payload are frozen, deep: they are remembered and handed to hooks.
5. **The memory.** A user the backend returned is remembered for 30 seconds under a SHA-256 of the cookie, never the cookie itself, at most 1000 of them, the oldest going first; requests that arrive together with one cookie share one call. A refusal or a failure is not remembered.
6. **The rules.** `admin`: superusers, and whom its groups or permissions pick. `users`: unset, everyone; set, superusers, the admins and whom it picks. Both are read again at every request from the private runtime config, where the environment may have replaced them: a rule that cannot be read picks nobody but superusers (and, for `users`, the admins), and the log says so once.
7. **The app's hooks.** `mapo-ai:user` runs on every request `users` lets in, the remembered ones too, with the request, the user, the payload and whether the user is an admin. A hook refuses with `allowed = false`. The context's `allowed` is a latch: once it is false, setting it again changes nothing, and anything but `true` is a refusal, so the rules of two plugins that each refuse some users both hold. A hook that throws fails the request with a 500.
8. **The answer.** A user the rules or a hook refuse is refused with 403 by `requireMapoAiSession`, and administers nothing. `status` answers them instead, with `allowed: false`.

### Why `status` answers a refused user

A page asks `status` to know whether to offer the AI at all, and "not for you" is a normal answer to that question, not a failure. As a 403 it would be an error on every page that asks, for a user who did nothing wrong, and through `$mapoFetch` core would show its permission-denied message on each of them. So `status` keeps the 401 for a missing session (the user must sign in, and `$mapoFetch` sends them to the login page) and answers a refusal with `allowed: false`; the routes that act keep the 403, because a call there from a refused user is a request that must not run.

`requireModelPermission(session, model, action)` refuses a call on a record of a model the user may not fill: `add_` for a new record, `change_` for an existing one, superusers always passing. `run` calls it with the `model` of each entity of the request, which the page declares; without one there is nothing to check. It keeps the gateway in step with an honest interface, which offers the AI only where the user may add or change; a crafted request can name another model, or none.

### Strengths and weaknesses

- **The backend stays the authority.** The gateway asks it, by the same path as core's session restore, so it works behind any backend integration that proxies `/api`, and a session the backend closes is closed for the gateway within 30 seconds.
- **Thirty seconds of trust.** A closed session, or a permission taken away, still counts for up to 30 seconds. The memory is per process: every server instance asks on its own, and a restart forgets everything.
- **Errors of the backend are not logouts.** A 502 leaves the browser's session alone; the log says what the backend answered.
- **Configuration fails closed.** A rule that cannot be read, at build time or at runtime, picks fewer users, never more.
- **The model comes from the browser.** The check keeps the gateway in step with an honest interface, and protects neither the data nor the cost: a crafted request can name a model the user may fill, or none, and is not checked. The gateway never writes to the backend, and the backend decides every save; what bounds the cost is `users`, the `mapo-ai:user` hook, the per-user limit of `run` and its audit.
- **The cross-site check trusts `Sec-Fetch-Site`.** Every current browser sends it, but only to HTTPS and `localhost`: on a site served over plain HTTP, and from an old browser, only the cookie's `SameSite` stands in the way. There is no `Origin` check, because a proxy in front of the app can change the host the server sees.
- **Groups are strings**, as the auth store reads them: a backend that sends group objects or pks matches no group, in the gateway as in the interface.
- **One backend call per session every 30 seconds, and every hook on every request**: a hook that asks something slow should keep its own memory.
- **One line in the log per request while the backend is down**, as for core's session restore: nothing folds them together.

## The run route

`POST /_mapo/ai/run` is the first route that spends. Its pieces:

| File                                      | Role                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/runtime/server/routes/run.post.ts`   | The route: the session, the body, the operation, stopped if its page goes away; `Retry-After` on 429 and 503 |
| `src/runtime/server/run/request.ts`       | The body as outside data: JSON by its type, a size bound before it is read, zod on the envelope              |
| `src/runtime/server/run/contract.ts`      | The contract, built by the gateway from the request's two descriptions                                       |
| `src/runtime/server/run/options.ts`       | The options of `run`, read at build time and again at runtime with the same rules; pure                      |
| `src/runtime/server/run/policy.ts`        | Which provider and model a request gets; pure                                                                |
| `src/runtime/server/run/limiter.ts`       | Each user's calls of the last minute, in the memory of the process; pure                                     |
| `src/runtime/server/run/audit.ts`         | The audit record: its key, its validator, its write                                                          |
| `src/runtime/server/run/run.ts`           | The operation and its preview (`run-preview.post.ts`), with their dependencies passed in                     |
| `src/runtime/server/run/nitro.ts`         | The wiring: the runtime config, the registry, the storage, the limiter, the `mapo-ai:prompt` hooks           |
| `src/runtime/server/providers/`           | The interface (`types.ts`), the registry (`registry.ts`), the mock (`mock.ts`), the cloud and local models   |
| `src/runtime/server/prompts/`             | Mapo's base rules, versioned (`base.ts`), and the composition in layers (`compose.ts`)                       |
| `src/runtime/server/plugins/providers.ts` | When the server starts: the providers that will not be called, in the log                                    |
| `src/runtime/shared/patterns.ts`          | The bound on a pattern's work, before the sanitizer runs it                                                  |

### Who builds the contract

The page sends the two descriptions of each record, its backend schema and its form's fields, and the gateway builds the entity model and the contract itself, with the same code the page can run. The first design had the browser compile the contract and send it. A contract, though, is a derived object with many rules inside it, its property names, its choices, its templates, the schema the provider gets, and the sanitizer relies on all of them: checking one that a browser sends means writing the compiler again as a validator, and keeping the two in step at every change. The two descriptions are JSON Schemas, which the entity model already reads as outside data, property by property, counting what keeps the AI out wherever it is written. So the rules of a contract hold by construction, and zod reads only the envelope of the request.

- **What it buys**: a request can only send other descriptions; it cannot make the sanitizer read a contract whose names, choices or limits disagree with its schema.
- **What it does not**: the descriptions still come from the page. A crafted request can leave out an exclusion, and the AI then proposes a value the developer kept away from it, to a user who could type it anyway; the backend checks every save. Descriptions the server knows by itself would come with a catalog of entities.
- **What it costs**: the body carries two schemas instead of one contract, and the server builds the model at each call, in milliseconds. Schemas built to make the reader slow (chains of `$ref`, deep lists, twenty thousand fields) stayed under 150 ms in the tests of the step; the body's size bounds them.

### The order of the checks

`runMapoAi()` keeps what costs for last. The provider, the model and the permission on the record's model come first; then the user's limit is looked at, without counting, so a user past it costs no contract and no hook; then the contract and the `mapo-ai:prompt` hooks; only then does the limit count the call. A refused request never uses up the limit, and only a call that reached the provider is audited, as soon as the provider answers, before the answer is read: a call made and paid for is counted even if reading its answer fails. The storage is opened before the body is read: without it the call is not made, since it could not be audited. `requireModelPermission()` asks `add_` on each entity's `model`, or `change_` for an existing record, and checks nothing without a model: a page that fills no backend model can use the AI.

The route watches its response: when it closes before the answer is written, the page has gone away (its `cancel()`, a closed tab), and an abort signal reaches `runMapoAi()`. Found before the limit counts, the request is dropped: no count, no call, no audit. Found while the provider works, it aborts the provider's signal as the timeout does, with another reason, so the audit says `cancelled` instead of `timeout`, and the log stays quiet: an operator who cancels is no failure. A provider's own error never says `cancelled`: only the gateway does. Watching the response needs Node's: on an edge runtime the call runs to its end, and so it does behind a proxy that keeps the request open when the browser closes it.

`previewMapoAiRun()` shares the first half with `runMapoAi()` (`prepareRun()`: provider, model, permission, contract, hooks) and stops at the prompt: it answers the layers the model would read, the parts of the source by name and length, and the fields asked and kept away (`compiledOf()` keeps the entity model the contract was compiled from, with its skipped fields). It calls no provider and audits nothing; the hooks are told it is a preview. It counts against a limit of its own, 30 previews a minute, never against `run`'s: opening "What I send to the AI" must not cost the operator a call, and the limit still bounds what a client can make the server compile.

### Providers

A provider implements `MapoAiProvider`: an id, its capabilities, optionally its own models, and `run(request)`, which gets the composed prompt, the source's parts, the schema, the contract and an abort signal. Each call gets its provider's `timeout`: the gateway aborts the signal when it is up, and stops waiting whatever the provider does. The provider gets copies of the contract and of the source, so what it does to them never changes what its answer is read against, and what it returns is outside data: the answer is read as plain JSON (a getter, a prototype or a cycle makes it unreadable), the tokens as whole numbers from zero, and the `model` that answered only as a name of up to 200 characters. A `MapoAiProviderError` says which failure to answer: 504, 503 with `Retry-After` (a count of seconds from zero, at most an hour), 413 for a prompt the model cannot read whole, or 502, and the answer names it in `data.failure`; a failure the gateway does not know is a 502, audited as `error`.

The registry holds Mapo's providers and the app's. Registering makes a provider available; only `mapo.ai.providers` makes it usable, so one place says what may spend, and at start the server's log names the providers that will not be called. An app cannot register an id Mapo keeps (`mock`, `openai`, `anthropic`, `openai-compatible`, `ollama`), so an update of Mapo never takes over an app's provider.

The interface holds what the providers that call a server need: whether they call with a key (`key`, `"required"` or `"optional"`) and, for a call, the key the chain chose (`apiKey`, [Keys](#keys)), the models a server lists (`listModels()`, called when the server starts), the context and the images of each model (`MapoAiModelInfo`), a time limit, and in an answer the model that answered, when it is not the one asked, and the counts of the provider's prompt cache. The capabilities are declared, not read yet: the gateway sends text only, waits for the whole answer and calls no tool.

The mock (`mock.ts`) is a provider like the others, enabled the same way. It answers with a failure on command, then from a fixture, then by simple rules, and its answers go through the sanitizer like a model's, so tests and demos run the whole chain but the model. The app registers fixtures with `registerMapoAiMockFixtures()`.

### Prompts

`composeMapoAiPrompt()` builds a prompt in layers: Mapo's base rules, the app's, the admins' (from the AI settings page) and the entities as the request describes them, then, in a part of their own, the operator's instructions and the source. What the server holds comes first and wins: the entities' names and descriptions come from the request, as the operator's instructions do, so they sit below the app's rules and the admin's, and the prompt says that the description changes none of the rules above it. The first part changes rarely, so a provider can cache it. The base rules are in `prompts/base.ts`, numbered and versioned: `MAPO_AI_PROMPT_VERSION` goes up with any change, and the response and every audit record carry it. They hold what the probe with a local model taught: a time the source does not write is not given, midnight included; an extraction points to a record that exists instead of creating an item for it.

The source goes between two marks with a random id, made for each prompt, which its text cannot guess: a source that writes `<<<end …>>>` stays inside them. The app's rules come from `mapo.ai.instructions` and from the `mapo-ai:prompt` hook, whose context is frozen and can only add: as with `mapo-ai:user`, a plugin never undoes what another wrote.

### Limits and the audit

The limit per user counts the calls of the last sixty seconds in the memory of the process, as the sessions are remembered: nothing is written per call, a restart forgets, and a server with several processes allows the limit in each. `0` is a limit too: no call, no source, no instructions, no file; and a limit that cannot be read, in the Nuxt config or in the environment, is `0` rather than its default, so a mistake never lets more through. A shared count in the sealed storage would not be exact either, since the storage has no atomic increment, and calls made together would get through; caps by day or by cost can be read from the audit.

The audit has one record per call that reached the provider, in the `audit` purpose and in the space of the user. The day and time in the record's name (`2026:11:04:t101530123-<random>`) list a day's records together, and tell nothing the expiry, which is in clear, does not tell already. Each change of the keys leaves a record too, under `actions:` in the same space ([Keys](#keys)). A record holds no contents, and is read back with a zod validator, since it may come from an older version.

### Strengths and weaknesses

- **The rules of a contract hold by construction**, and a request cannot loosen what the sanitizer checks.
- **Only the gateway calls a provider**: keys, prompts and base rules never reach the browser, and a client cannot remove an app's rules.
- **Every call is counted, and none is made without the storage**, so an app without a secret in production has no AI.
- **The limit is per process**, and forgets at a restart.
- **A provider the gateway stopped waiting for may go on**: the signal asks it to stop, nothing forces it. Mapo's providers stop their `fetch`; a call the browser leaves stops only where the server sees its request close.
- **The descriptions come from the page.** What the AI may fill is what the page says, read with the gateway's own rules.
- **Every text of a request reaches the model**: the entities' names and descriptions, the fields' labels, hints and descriptions in the schemas, the operator's instructions, the source. They come after what the server holds, but a user who crafts requests can steer the model for their own answers, which they review and the backend checks; `maxInstructionsChars` bounds the operator's instructions only.
- **Patterns get a rough bound**: on long values some harmless patterns are not applied, and their values are not verified.
- **No streaming to the browser**: the providers stream from their server, but the browser waits for the whole answer, and a local model with a large schema can take minutes.

## Local models

Two of Mapo's providers call a model on the app's own servers: `ollama`, through Ollama's own API, and `openai-compatible`, through OpenAI's Chat Completions API, as LM Studio, vLLM and the server of llama.cpp speak it.

| File                                               | Role                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/runtime/server/providers/ollama.ts`           | The `ollama` provider: the model's details, the context of each call, the streamed answer           |
| `src/runtime/server/providers/openaiCompatible.ts` | The `openai-compatible` provider: `response_format`, the streamed events, the checks of the context |
| `src/runtime/server/providers/http.ts`             | The calls: failures told apart, an error's text, a stream read line by line within a bound          |
| `src/runtime/server/providers/local.ts`            | What both share: the server's address, the schema in the prompt, the tokens, the models' details    |

### Without an SDK

The providers call their servers with `fetch`: one or two endpoints each, a body built by hand, and the answer read as outside data, line by line. No package is added to every app that installs Mapo, the code runs on every runtime Nitro targets, and the same reading rules hold for every server. The price is ours to pay: when an API changes, the provider changes with it, and the tests on recorded answers say where. An SDK's types would not have spared the validation either, since an answer is outside data whatever its type says.

### Where the server is, and its key

Only the app says where a server is: `baseURL` in `mapo.ai.providers`, `http://localhost:11434` for Ollama unless set, or the environment (`NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL`). A request never names a server, and no admin sets one either: an address written from outside would let the gateway call any server of its network. An address is read as outside data (`serverURL()`): `http:` or `https:`, without credentials, query or fragment; one that cannot be read leaves the provider off. A key, for a server behind a proxy, comes from the environment (`NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`): the module puts an empty `apiKey` in the private runtime config of each such provider, so Nuxt has a place to fill, and `providerKeyOf()` reads it apart from the options, so it never travels with them; a key of digits only, which Nuxt reads as a number, and a key sent over plain `http:` to another machine are said in the log, never the key. `mapoAiProvider(id, settings)` builds Mapo's providers from these settings at each request; what a server says about its models is kept ten minutes, by address. A provider never follows a redirect, which would send the prompt elsewhere, and of an error's JSON body it logs only the message: a validation error can repeat the request, source included.

### What a call to Ollama does

A probe on Ollama 0.40.13 showed why the provider is shaped as it is: a prompt of 13,912 tokens sent with a context of 512 reached the model as 258 tokens, with a 200 and no error, and the rules at the top of the prompt were gone. When the context fills while the model writes, Ollama also drops the start of the prompt to go on. So every call sends `truncate: false`, and Ollama refuses a prompt that does not fit with a 400 that says how many tokens it has, and `shift: false`, and a full context ends the answer. Both are fields of Ollama's chat request that its API reference does not list, so the provider calls only the version it was verified with, 0.40.13, or a later one, and still checks after the call that Ollama read the whole prompt. Each call:

1. reads Ollama's version (`/api/version`) and the model's limit from `/api/show`, under a key named for its architecture (`qwen2.context_length`), both kept ten minutes; an older Ollama is refused, and asked again at the next call, so an update counts at once;
2. puts the answer's schema in the prompt: `format` holds the answer to it, but the model never sees it, and without it a model does not read what each field holds. On a page of blocks, a model without the schema wrote a field name of its own and invented values, and with it filled six blocks of the right templates;
3. asks a context for the prompt, estimated on the high side, and the answer: a power of two from 8192, at most the model's, since a new size reloads the model on the server. When Ollama counts more tokens than the estimate, the provider asks once more with room for Ollama's count, and fails with `too-long` when the model has none;
4. caps the answer (`num_predict`) by the size of its schema, more for an extraction. Every value of the schema is a string, so the constrained answer does not stop a model that loops inside one, as one did in a probe: the cap does, and an answer that reaches it fails with `truncated`;
5. turns the reasoning off (`think: false`), asks for the same answer each time (`temperature: 0`), and streams the answer. Node's `fetch` waits five minutes for a server's first bytes, whatever the gateway's `timeout` says, and Ollama sends them with the first words of the answer: streaming takes the writing out of those five minutes, but loading the model and reading the prompt stay in them. A probe measured 71 seconds before the first bytes, for 28,907 tokens of prompt on a 7B model. Past five minutes the call fails as a timeout, and the log names the cause;
6. after the call, fails with `too-long` when Ollama counted the prompt below a sixth of its characters. Ollama's count includes the tokens it kept in its cache (a recorded answer counts 173 tokens, 172 of them cached), so a prompt read again is counted whole.

### The checks of an OpenAI-compatible server

Such a server sets its models' context itself, and does not take one per call. vLLM refuses a prompt and a cap (`max_tokens`) that do not fit together, and says how many tokens the prompt has, in one of two wordings ("5000 in the messages", "your request has 5000 input tokens"): the provider asks once more with the cap that fits, when at least 1024 tokens are left for the answer. llama.cpp refuses a prompt that does not fit without a count. Both become `too-long`; others cut the prompt in silence, as Ollama's own `/v1` does. The provider checks what it can:

- with the context known, from the server's list of models (vLLM's `max_model_len`) or from the app (`contextTokens`), the cap leaves room for the prompt, a prompt that cannot fit fails before the call, and one the server counted up to the context, with no room left for an answer, fails after it;
- after every call, a prompt counted below a sixth of its characters was cut;
- these come before a cut answer: a prompt cut to fill the context, after which the answer ran out of room, is a prompt too long;
- a stream that ends before a `finish_reason`, and an `error:` event, which llama.cpp sends when it fails while it answers, fail as `unavailable`; a server that sends no counts, with a known context, is said once in the log.

Without a known context the second check is the only one, and it is weak: in the probe a prompt of 73,620 tokens, made of short tokens, came back counted as 16,386, above a sixth of its characters, and went through until `contextTokens` was set. Characters say too little about tokens to do better: a token held from 1.2 to more than 4 characters in the probes. The provider does not turn reasoning off either, since no parameter does so on every server and one a server does not know can fail the call.

### When the server starts

The providers plugin asks every provider `run` may call that lists its models (`listModels()`) for them, and warns about each model `mapo.ai.providers` allows that the list does not have, or that the server cannot be reached; neither stops the start. A model without a tag is listed by Ollama with `:latest`, so the list has both names.

### Strengths and weaknesses

- **A prompt never reaches Ollama's model cut**, on the version the provider was verified with, and an answer never comes back cut as if it were whole: both are failures with a name, 413 and 502, which the page tells apart.
- **Ollama's two flags are not in its API reference.** A later Ollama could drop them; the check after the call would then catch only a gross cut, as on an OpenAI-compatible server without a known context.
- **Five minutes for the first bytes**: a model that loads and reads a long prompt for longer cannot be called, whatever `timeout` says. Lifting the limit takes undici's own `Agent`, a package.
- **No dependency**, and the same code on every runtime.
- **A server's address and key are the app's alone**, read from its config or its environment.
- **An OpenAI-compatible server without a known context can cut a prompt a little too long**, rules included; `contextTokens` closes the gap.
- **Estimates, not counts**: the context asked of Ollama may be larger than needed, costing memory, or smaller, costing a second call; Ollama has no route that counts tokens.
- **A model that reasons on an OpenAI-compatible server** spends time and tokens of the cap on it, unless the server turns it off.
- **The models' details are kept per process**, ten minutes: a model pulled again with another context is seen late.

## Cloud models

Two of Mapo's providers call a model in a provider's cloud: `openai`, through OpenAI's Responses API, and `anthropic`, through Anthropic's Messages API, in its version 2026-10-21.

| File                                        | Role                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/runtime/server/providers/openai.ts`    | The `openai` provider: the body of `/responses`, its streamed events, the end of a response (completed, incomplete, failed) |
| `src/runtime/server/providers/anthropic.ts` | The `anthropic` provider: the body of `/messages`, its streamed events, refusals, fallbacks and the case of enum values     |
| `src/runtime/server/providers/cloud.ts`     | What both share: their addresses, the effort, the cap with the reasoning's room, the key, the failures, refused parameters  |

### What they share with the local ones, and what not

They call their APIs through `http.ts`, like the local providers: the same failures, no redirect followed, a stream read within a bound, and an error's message only, with what looks like a key masked (`maskKeys()`), since OpenAI repeats the key it refuses, masked but for its last characters. Their options are read by the same reader (`SERVER_PROVIDERS` in `run/options.ts`, where `isCloud` gives them `effort` and `promptCache`), and their project's keys, the last level of the chain of keys ([Keys](#keys)), come from the environment in the same way (`NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY`).

They differ where the APIs do:

- **The schema is not in the prompt.** Both providers show it to the model: OpenAI renders `text.format` into the prompt (its prompt cache counts it in the prefix), and Anthropic adds a system prompt with the schema, its descriptions included. Repeating it would pay for it twice; the schema of a large form weighs tens of thousands of tokens.
- **No check of the context.** The APIs refuse a prompt that does not fit, with a message the provider reads as `too-long` (`CONTEXT_REFUSAL`); they never cut it in silence.
- **The cap counts the reasoning.** `max_output_tokens` and `max_tokens` include what the model thinks before it answers, so the cap is the answer's room, from the schema, plus a room for the reasoning that grows with the effort (`cloudAnswerTokens()`): 8192 tokens for `low`, 16,384 for `medium`, 32,768 for `high`.
- **A key, for the provider's own servers.** A call to `api.openai.com`, `eu.api.openai.com` or `api.anthropic.com` without a key fails before it is made, with the variable to set in the log (`needsKey()`); a call to another address goes without one, for a proxy that adds its own.
- **Nothing to turn off.** Both stream, so Node's five minutes for the first bytes cover only the first token, which a cloud sends in seconds.

### What a call does

To OpenAI, `POST /responses`: the stable part of the prompt as a developer message and the variable part as the user's, `text.format` with the schema (`json_schema`, strict), `store: false`, `reasoning.effort`, `max_output_tokens`, and `prompt_cache_options` in explicit mode. The stream's text comes in `response.output_text.delta`, a refusal in `response.refusal.delta`, and the response ends with `response.completed`, `response.incomplete` (`max_output_tokens` is `truncated`, `content_filter` a refusal) or `response.failed`; an `error` event fails the call.

To Anthropic, `POST /messages` with `anthropic-version: 2026-10-21`: the stable part as the system prompt and the variable part as the user's message, `output_config` with the schema and the effort, `max_tokens`, and `fallbacks: "default"` with its beta header. No `temperature`, `top_p` or `top_k`, which the version refuses, and no `thinking`: the current models think by default, and Opus 5.5 cannot stop. The stream's text comes in the `text_delta`s of text blocks (the thinking blocks are not the answer), the counts in `message_start` and `message_delta`, and why the model stopped in `message_delta`: `max_tokens` is `truncated`, `refusal` a refusal, `model_context_window_exceeded` `too-long`. A schema Anthropic cannot compile, which it refuses with "Schema is too complex for compilation" past internal limits it does not publish (a page of blocks has 108 properties, eight levels and 126 listed values; its three published limits, on strict tools, optional parameters and unions, the contract never reaches), is asked again without `output_config.format`, with the schema after the stable part of the prompt (`instructionsWithSchema()`, as for the local models), and the text is read as JSON even inside a block of code or among words (`jsonInText()`). The provider remembers such a schema for a day, in the memory of the process, by server, model and a hash of the schema, at most 500 of them, so the next calls skip the refused one, and it warns once per schema, even when two calls meet the refusal together. Any refusal that names the schema or its grammar with its size or its compilation counts, since Anthropic's wording may change; a refusal of anything else is never asked again. The answer's text is then read with each listed value written as the schema writes it (`withEnumCase()` in `cloud.ts`): Anthropic does not guarantee the case of an `enum`'s values, so a string that matches one listed value but for case becomes that value, and one that matches none, or several, stays as it is, for the sanitizer to read.

### The effort

Both providers ask `low` unless the app says otherwise (`effort: "medium" | "high"`). Filling a form from the quotes of a source is routine work, and the sanitizer checks every value against its quote, so a deeper reasoning buys little and costs written tokens and time. `low` is the one value every current model of both providers takes: OpenAI's Sol and Astra have no `none`, and Opus 5.5 thinks at every effort. The option is read like any other, so the environment changes it (`NUXT_MAPO_AI_PROVIDERS_OPENAI_EFFORT=medium`).

### The prompt cache

Off by default, on with `promptCache: true`. When on, the provider marks the end of the stable part of the prompt, Mapo's rules, the app's, the entities' descriptions and with them the schema, and never the source: `cache_control` on Anthropic's system block, `prompt_cache_breakpoint` on OpenAI's developer message. The first call writes that part at 1.25 times its price, and the calls that follow within the cache's time, 5 minutes for Anthropic and 30 for OpenAI, read it at 0.05 to 0.1 times: it pays from the second call on the same kind of record, and costs a quarter more on the stable part of a call alone.

Off has to mean off on OpenAI: its models from GPT-5.6 cache by themselves, with a breakpoint at the end of the latest user message, the source included, and bill the writing. So the provider sends `prompt_cache_options: { mode: "explicit" }`, which writes only at the breakpoints it marks, with every call (until a model refuses it, below), and marks none without `promptCache`. Anthropic writes nothing without a mark. `usage.cacheReadTokens` and `usage.cacheWriteTokens`, part of `inputTokens`, say what a call read and wrote, in the answer and the audit.

### Refusals and fallbacks

Opus 5.5 and Sonnet 5.5 run safety filters that can decline a harmless request, with `stop_reason: "refusal"` and a category (`bio`, `cyber`…). Every call to Anthropic asks for its fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): Anthropic retries a declined request, in the same stream, on the model it picks for that category, such as Claude Opus 5. That model is not in the app's list, and costs its own price, so the provider says which one answered. It knows a request fell back from a `fallback` block, or, for a request served by the fallback model again, which has no block, from an attempt of type `fallback_message` among its counts; it takes the model from that billed attempt first, then from the block, then from the message's start, which may carry the asked model's full, dated name. The answer then carries `model`, `run` puts it in its answer's `provider.model` and in the audit, and the provider says it in the log. The counts add up every attempt, the declined one too. Haiku 5.5 has no fallback, and some categories have none either: then the answer is a refusal, with the category. A server that does not take the fallbacks, such as a proxy to a cloud that has none, refuses them once, and the provider leaves them out (below).

### Parameters a model does not take

The app may list any model, one newer or older than Mapo's defaults. An older model may not take an effort (`reasoning` for OpenAI, `effort` for Anthropic), OpenAI's cache options, or Anthropic's fallbacks: the server refuses the call with a 400 that says the model does not take the parameter. `callCloud()` in `cloud.ts`, which both providers call, then leaves that parameter out and asks once more, at most once for each parameter. It reads a refusal by OpenAI's code and `param` when the error names them (`unsupported_parameter` on `reasoning.effort`), otherwise by words that name the parameter together with "unsupported", "unknown" or "not permitted": a refusal that only names it, such as a schema error about a field called `reasoning`, or a refusal of the cache's breakpoint alone, fails the call instead. A refusal for the money, the rate or the context is never read as one of a parameter. The parameter left out is remembered, by server and model, for ten minutes, only once a call without it is taken, so the next calls go without it; the log says so each time it is remembered, with what the calls lose: without OpenAI's cache options, OpenAI caches the model's prompts by its own rules, and may bill the writing. Only these optional parameters can go: never `store: false`, the schema or the cap.

A failure after the call was taken, as an answer cut at its cap or an error in the stream, carries the usage the provider had read (`MapoAiProviderError.usage`), and the model that answered when Anthropic's fallback did (`model`): `run` audits a failed call with them, since it is paid. The providers mask the key in every text of a server that reaches the log: the exact key, which a proxy may repeat, and what looks like one (`ProviderServer.mask()`).

### Strengths and weaknesses

- **Strict structured outputs on both**: the answer has the shape asked, or the provider says why not; except a schema Anthropic cannot compile, asked with the schema in the prompt and checked by the sanitizer alone, as for an OpenAI-compatible server.
- **The model that answered is named**, in the answer, the audit and the log, even when Anthropic's fallback answered.
- **No dependency**, and the same code on every runtime, as for the local models.
- **The tests read answers written from the API references, not recorded** (`documented/`): the first real call can show a difference, and the AI lab is where it shows.
- **OpenAI's cache options are new**, documented for its models from GPT-5.6; an older model costs one refused call before they are left out.
- **Anthropic's enums are not exact**: the provider rewrites a value that differs from a listed one only by case, and walks the answer along the schema to do it (objects, arrays, an `anyOf` of objects); a value that differs otherwise reaches the sanitizer as written.
- **The fallback cannot be turned off**: a model the app does not list may answer, at its own price. The counts of a fallback add up two models' tokens under the name of the one that answered.
- **No count of the tokens before a call**: a long source goes to the API, which refuses it; Anthropic's free `count_tokens` would tell first, at the price of a call.
- **`low` may miss a hard mapping** that a deeper reasoning would get; `effort` raises it for the app, not per request.
- **Anthropic's API has no European region**; OpenAI's European endpoint asks for a project made in Europe.

## Reading files

`POST /_mapo/ai/read` turns a file into text parts, the source `run` takes. The page sends the file, shows the text, and sends it to `run`: the two routes stay apart, and `run` takes text only.

| File                                     | Role                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/runtime/server/readers/types.ts`    | `MapoAiReader`, the file a reader gets, the context of the `mapo-ai:read` hook              |
| `src/runtime/server/readers/registry.ts` | Mapo's readers, `registerMapoAiReader()`, the order of the readers, the reader of a file    |
| `src/runtime/server/readers/text.ts`     | The bytes as text (UTF-8, UTF-16, Windows-1252), and the readers of text, Markdown and JSON |
| `src/runtime/server/readers/html.ts`     | HTML into Markdown, with a tokenizer of its own                                             |
| `src/runtime/server/readers/sheets.ts`   | CSV and XLSX into Markdown tables, the CSV parser, the bound on what an XLSX unzips         |
| `src/runtime/server/readers/read.ts`     | The operation: the reader, the hooks, the parts read as outside data, the measure           |
| `src/runtime/server/readers/upload.ts`   | The request: one file in a form, read within the bound                                      |
| `src/runtime/server/readers/nitro.ts`    | The wiring: the readers that are on, the limits, the hooks                                  |

### Why text, and why a route of its own

Every reader writes text. The formats of the first readers are text already, or tables, and a text reaches every provider the same way, a local model's too. The quotes are then verified on the text the model read: a model that read a page's HTML would quote words a tag splits, which the verification cannot find. The page gets the text before it sends it, so the operator sees what the AI will read, and can cut it. `read` keeps nothing, so no file waits on the server, with its storage and its expiry; the text crosses the browser twice, a few hundred kilobytes at most.

How PDFs and images are read is decided with them, after these readers: as text too, through a reader of their own, or as the file itself for the providers that read it.

### Which reader reads a file

A file goes to the reader of its name's extension, then, when no reader takes the extension, to the reader of its declared media type. The extension comes first because the declared type is the browser's guess: Windows declares a `.csv` as `application/vnd.ms-excel` where Excel is installed. Neither is trusted: each reader checks the content (a NUL character is no text, an XLSX is a ZIP, JSON parses), and a file that is not what its name says is `failed`.

The app's readers come before Mapo's, in the order the app registers them, and a reader with the id of one of Mapo's takes its place. Three ways change the reading, one role each: a reader of the app replaces how a format is read, the `mapo-ai:read` hook touches up what any reader read, and `mapo.ai.readers` turns a format off without code. A format that is off stays off: `readerOf()` takes the first reader that is on among those that list the extension, and looks at the media type only when no reader lists the extension, on or off, so a `.csv` is never read as plain text because `csv` is off and the browser declared `text/plain`.

### What the gateway checks

- **The size, before it parses.** The body is read up to `maxFileBytes` plus 16 KB for the form, and refused as soon as it passes (`readLimitedBytes()` in `body.ts`, which `run` shares); the runtime then parses the form (`Response.formData()`), which must hold one file in the field `file`.
- **What a reader or a hook gives.** Both may be the app's code, so their parts are outside data (`partsOf()` in `read.ts`): text parts only, trimmed, a name cut to 200 characters; more parts than the 20 `run` takes is `failed`.
- **Whole or not at all.** A text longer than `maxSourceChars` is `too-long`, never cut: a cut sheet would lose its last rows, and a cut page its end, without a word.
- **What a workbook unzips.** An XLSX is a ZIP: a few kilobytes can unzip into gigabytes, and `read-excel-file` holds what it unzips in memory, sizing its output by what the ZIP's directory declares. `checkWorkbook()` unzips the XML first, as a stream (`DecompressionStream`, on every runtime, with no dependency), each part up to the size its directory declares and all of them up to 20 MB: a part that unzips into more than it declares is a damaged or crafted file, refused before it is all unzipped. It reads the directory from the last end record, as the unzipper does, and refuses more than 10,000 entries; a ZIP64 directory is refused too, since its counts and offsets read as too many entries or as damaged.
- **The cells of a workbook.** `read-excel-file` fills a sheet's grid in memory, every row as wide as the widest, from the first row to the last: one cell in the last column (`XFD`) of each row costs 16,384 cells a row, from a file of a few kilobytes. `checkWorkbook()` counts the rows and the cells of the XML it unzipped, by their references and as they come, and refuses more than 2 million.
- **No file's name in the log.** A name can say whose data a file holds: a failure is logged with the reader's id and the file's size.

### The readers

- **Text, Markdown, JSON**: the text as the file writes it. JSON is parsed only to tell a damaged file, never written again: `JSON.stringify` would round a 20-digit id.
- **HTML**: a tokenizer of its own, with no DOM, which Nitro's runtimes do not have, and no dependency. It writes Markdown, so the AI can carry headings, lists, links, bold and italic into a rich text field, whose restricted Markdown takes them. It skips what a person does not read, a menu (`nav`) included; it keeps a link's address to the web, an email or a phone, for a URL or an email field; a table becomes a Markdown table, a table in a cell its words. It decodes Latin-1's and typography's named characters, every numeric one, and Windows-1252's own range (`&#146;`) as browsers do.
- **CSV**: a parser of its own, RFC 4180 in forty lines, where `papaparse` would add a package and its types. The delimiter is Excel's `sep=` line, else the first of tab, `;`, `|` and `,` that splits the first row and half of the first twenty: `;` before `,`, since a CSV that writes decimals with a comma separates with `;`.
- **XLSX**: `read-excel-file` (MIT), in its `universal` build, which unzips with `fflate` and parses with a SAX parser: plain JavaScript, on every runtime of Nitro. It is imported with the first workbook, so a server that reads none never loads it. A cell gives its value: a date in ISO form, a number with 15 significant digits, as a spreadsheet keeps it.

### Strengths and weaknesses

- **One text for every provider**, verified as the model read it, and shown to the operator first.
- **Every way of reading can be replaced** by the app, Mapo's included, and any turned off without code.
- **One dependency**, for XLSX, loaded only when a workbook comes.
- **A sheet goes whole**: a large one is `too-long` rather than sampled, and a workbook counts all its sheets: the operator cannot pick one sheet yet.
- **A cell's format is lost**: `25%` reads `0.25`, an amount its number; hidden rows and sheets are read.
- **The HTML reader is no browser**: it does not apply the CSS (`display: none` is read), nor know which part of a page is its content, so a page's header and footer reach the AI.
- **The hook is no boundary**: a text the page sends to `run` itself never goes through it, so an app that must keep something away from every provider needs a check where `run` reads its source.
- **No limit of calls on `read`**: it calls no AI, but a large workbook costs the server memory and time.

## Keys

A provider that calls its server with a key gets, for each call, the key nearest the user: their own token, where an admin's assignment allows one; a key the AI's admins assigned to the user, to one of their groups or to everyone; the project's, from the environment. The admins' assignments also narrow the models. The browser never gets a key: `status` says the level and the last four characters.

| File                                     | Role                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/runtime/server/keys/assignments.ts` | The record of the assignments and its changes, the routes' bodies read with zod, `last4()`; pure          |
| `src/runtime/server/keys/chain.ts`       | `providerAccess()`: the models, the personal tokens and the key of one provider for one user; pure        |
| `src/runtime/server/keys/store.ts`       | The record and the tokens in the sealed storage; the changes one at a time; 503 for a record unreadable   |
| `src/runtime/server/keys/nitro.ts`       | The routes' storage, who acts, the audit of each change                                                   |
| `src/runtime/server/run/policy.ts`       | `policyForUser()`: the app's policy narrowed for one user, the defaults chosen again, the 503 without key |
| `src/runtime/server/run/nitro.ts`        | `mapoAiUserPolicy()`: the record and the tokens read, Mapo's providers built again with the user's key    |

### The chain

For each provider, `applyingAssignments()` lists the assignments that apply to the user, nearest first: theirs (by the backend's `id`), their groups' (by name, in the admins' order, then the others by name), everyone's. The nearest decides two things, the models, within those `mapo.ai.providers` enables and in its order, and whether personal tokens are allowed; without an assignment, every model and no personal token. The key is decided apart, climbing: the user's token where allowed, the first assignment that holds a key, the project's. So an assignment can narrow the models without a key of its own, and a group's key serves a user whose own assignment only narrows the models. The other way round is a trap: an assignment that only gives a user a key, with no `models`, opens every model to them, though their group's limits them; the docs tell admins to repeat the models.

The developer admits and the admin assigns: an assignment never opens a provider or a model the options do not enable. An assignment of a model the app no longer enables stays in the record, and the chain drops the model; one that allows no model closes the provider to its scope, and `status` no longer lists it for those users.

`policyForUser()` applies the chain to the app's policy, which `mapoAiPolicy()` still builds for everyone, as the server's start and the admins' routes need it. Mapo's providers hold their key from when they are built, so `mapoAiUserPolicy()` builds them again, at each request, with the user's key; an app's provider is the same object, and gets the key with each call as `request.apiKey`. A provider that needs a key and has none at any level is refused before the call, with a 503 (`canCall()`), and the defaults prefer a provider that can be called.

### Where the keys are kept

The assignments and the order of the groups are one record, `assignments` in the `keys` purpose: a change is one write, a reader never sees half of one, and an assignment is unique by scope and provider by construction. The routes change it one at a time in a process (`changeKeys()`), and a read waits for a change in progress (`readKeys()`), since a driver such as the file system's writes in place and a read in the middle would find half a record. Across processes the last write wins, as for any record of the storage, and a record that does not open is read once more after 50 ms, for a write of another process, before it closes the AI. Five hundred assignments and five hundred groups bound it.

A user's token is a record of their own space in the `tokens` purpose, under the provider's id, with who saved it: the admins list the tokens through the purpose's own store, which reads every user's space, and the hash of the space never needs reversing.

The record is read at each request of `status`, `run` and the token's route. One that is there and does not open, sealed with another secret or by a newer version, closes the AI with a 503: an assignment can close a model or a provider, and going on without it would give users more than the admins decided. Without an open storage there is no record to miss: `status` shows the project's keys, and `run` refuses every call anyway, since it could not audit one.

### What goes out, and what never does

- **No key in an answer.** `status` and `GET keys` answer `last4`, and only for a key of 16 characters or more. The routes' errors name the field, never its value: zod's message is replaced for `key` and `token`.
- **No key in a log or an audit record.** The audit keeps the level of a call's key, and each change of the keys under `actions:` (who, what, for whom, whether the key changed).
- **A key is printable ASCII without spaces**: it goes into a header, where a line break would end it.
- **A key over plain `http:`** to another machine is said in the log, whatever level gave it.

### Strengths and weaknesses

- **One rule decides the models, another the key**, both easy to test: the nearest assignment, and the first key up.
- **Personal tokens are off until an admin allows them**, since a call with one sends the company's data through an account it does not control.
- **The AI fails closed** when the admins' keys cannot be read; recovering means the old secret or removing the record.
- **The last write wins across processes**: two admins saving on two processes at the same moment can lose one change.
- **A token's provider must call with a key**: a provider that uses none takes no key and no token in an assignment.
- **The admin names a user by the backend's id**, which the settings page will have to offer by name.
- **The nearest assignment decides the models alone**: a user's assignment that sets only a key opens every model to them; the settings page should repeat the group's models as a default.

## The AI settings page

The module adds a page at `/ai-settings` (`src/settings.ts` reads the option; `module.ts` adds it with `extendPages` only when the app has no page on that path, as uikit does with `/login`), and registers its interface as a public component, `MapoAiSettings`, for an app that sets the path to `false` and mounts it in a page of its own. The page's meta carries the layout, the `auth` middleware and the sidebar's label, icon and footer: a page loaded from `node_modules` gets no `definePageMeta()` auto-import.

| File                                                  | Role                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/runtime/components/MapoAiSettings.vue`           | Asks `status`; shows the user's part, and the admins' part to the AI's admins                 |
| `src/runtime/components/MapoAiSettingsPersonal.vue`   | The preference, the key in use, the user's own token, the check of the connection             |
| `src/runtime/components/MapoAiSettingsKeys.vue`       | The assignments, the order of the groups, the users' tokens                                   |
| `src/runtime/components/MapoAiSettingsAssignment.vue` | The dialog that saves an assignment; the warning when one user's assignment widens the models |
| `src/runtime/components/MapoAiSettingsPrincipal.vue`  | Picks a user or a group: searched in the app's endpoint, or written by hand                   |
| `src/runtime/composables/settingsClient.ts`           | `$mapoFetch`, the translations and the endpoints, shared by the parts; not public             |
| `src/runtime/server/settings/preferences.ts`          | The user's preference, sealed in their space of the `settings` purpose                        |
| `src/runtime/server/settings/connection.ts`           | `checkConnection()`: the provider's models listed with the user's key; pure                   |
| `src/runtime/components/MapoAiSettingsBehaviour.vue`  | How the AI works, for the admins; parts `…Instructions`, `…Rules`, `…Secrets`, `…Providers`   |
| `src/runtime/server/settings/admin.ts`                | The admins' record: read, a change checked, applied to `run`; pure                            |
| `src/runtime/server/settings/store.ts`                | The record in the `settings` purpose, one change at a time, 503                               |
| `src/runtime/components/MapoAiSettingsUsage.vue`      | The usage of a period: everyone's for the admins, the user's own                              |
| `src/runtime/components/MapoAiSettingsActions.vue`    | The changes of the keys and the settings, for the admins                                      |
| `src/runtime/server/usage/report.ts`                  | The period, the cost of a call, the sums by user, model and day; pure                         |
| `src/runtime/server/usage/read.ts`                    | The records of a period from the audit: only those of its days                                |

### The preference

A user's provider and model are a record of their own space, `preferences` in the `settings` purpose. `mapoAiUserPolicy()` reads it with the keys and the tokens, and `policyForUser()` makes it the defaults of both tasks only while the provider offers the user that model and can be called; otherwise the app's defaults apply, and the record stays, so a model an admin opens again comes back. `status` answers the record as `preference` and what applies as `default`, so the page can say both. Saving one the user is not given is a 403: the check runs on the user's own policy, keys and assignments included.

### The check of a connection

`POST /_mapo/ai/test` builds the user's policy, as `run` does, and calls the provider's `listModels(signal, apiKey)` with the key the chain chose: Mapo's providers are built again with it, an app's gets it as the second argument. Listing the models costs no tokens, and tells the four things the page needs: the server answers, the key is taken, the model is there, and how long it took. A provider that needs a key and has none is `no-key` without a call; one without `listModels` is `unverifiable`. A failure is answered by its kind (`MapoAiProviderFailure`), and its message goes to the log only. Ten checks a minute per user, counted in the memory of the process, apart from the calls of `run`.

### How the AI works, for the admins

One sealed record, `admin` in the `settings` purpose, outside every user's space, holds the admins' instructions, rules of verification, words of secrets and each provider's settings. `withAdminSettings()` applies it to the app's options at each request, in `mapoAiUserPolicy()` and `mapoAiAppPolicy()`: the admins' instructions become layer 3 of the prompt (`adminInstructions`), their rules go over the app's, their words after the app's (`secretWords`, which `contractOf()` passes to `buildAiEntity()`), their prompt cache over the app's, Anthropic's fallbacks on only where both leave them on, and the models they added after the app's (`addedModels`, which `policyOf()` appends) only where the app still sets `adminModels`. `withSettingsInput()` checks a change against what the app allows (400, 403); `PUT /_mapo/ai/settings` asks the provider's server first for each new model, with the admin's own key, through `listedModels()`, the same listing as the check of a connection. A record that does not open closes the AI with a 503, as the keys' does: a word that keeps a field out, or a stricter rule, must not vanish in silence.

- **Strengths**: the app keeps the frame (`adminModels`, `fallbacks`), and the admins work within it without a deploy; the preview shows the rules the model reads, with the instructions not saved yet; the audit names every looser rule; the words of secrets reach nested objects and lists' items.
- **Weaknesses**: the words of secrets are matched on keys only, never on labels; a model the admins added that the provider later drops fails at the call, not when the server starts (the startup check knows the app's models only); the settings hold for the whole app, not for one entity (those come with the catalog).

### The usage

The usage is summed from the audit when the page asks for it (`usage/report.ts`), never at each call: `run` keeps writing one sealed record per call, in its user's space, and nothing else. `readUsageRecords()` lists the keys of the audit (every user's under `u:`, or one user's space) and opens only those of the period, since a key ends in its UTC day and time (`2026:11:06:t101530123-9f2c1e7a`); the newest 20,000 at most, with `truncated` past that. The log of the changes reads the `actions:` records the same way, the newest 500. A cost exists only where the app prices the model that answered (`mapo.ai.prices`), with the cache's tokens at their own price; Mapo keeps no list, so a stale price is never Mapo's. `AUDIT_RECORD_VERSION` stays 1: no release wrote an older format, and the first change after the first release raises it, keeping the older readable.

- **Strengths**: nothing more to write per call, no counter to drift between processes; the period bounds what is opened; a user reads only their own space, which the keyed hash of their id names.
- **Weaknesses**: each look lists every key the audit keeps, up to its retention, and opens the period's records, 50 at a time and 20,000 at most, on a file system one file each; the days are UTC days; the costs are as good as the app's prices.

### Users and groups by name

The backend has no endpoint Mapo knows for its users, so the app names its own (`settings.usersApi`, `settings.groupsApi`, public runtime config), and the page searches it with `?search=` through `$mapoFetch`, with the admin's session: the backend decides who may list its users. `principalsOf()` reads the answer as DRF writes it, plain or paginated, a user by `id` and the first of `username`, `email` or name, a group by `name`. A user's assignment keeps that name as `scope.label`, to show it; the chain matches the id alone. Without an endpoint, the admin writes the id or the name.

### Styling

The components use Nuxt UI and Tailwind utilities. Tailwind generates only the classes it finds in the sources it scans, so uikit's `main.css`, the stylesheet with `@import "tailwindcss"`, has a `@source` for `ai/src/runtime/components`, as it has for form's components; an app without the package has no such folder, and Tailwind skips a missing source.

### Strengths and weaknesses

- **One page for every app, and a component for the others**: the page works with no code; an app that wants it elsewhere sets `path: false`.
- **The check is free and fast**, and proves the key and the model; it does not prove that a call with a large schema goes through, which only a call would.
- **The preference never widens anything**: it applies only within what the user is given.
- **Labels in two languages**, from `mapo.ai.settings.*`; the sidebar's label is a plain text, `settings.label`, since the sidebar does not translate route labels.
- **Lint**: the components carry the Vue template formatting warnings that Prettier and ESLint disagree on, as form and uikit do.
- **No component tests**: the logic the components rely on is tested in the server and in `shared/settings.ts`; the page itself is checked live, in `apps/example-ai`, which turns the module on as a project does; `apps/example-e2e` turns the page off (`settings: { path: false }`) and keeps its keys lab.

## Filling a form

`useMapoAiFill()` is the browser's half of `run`, and the first piece of Magic Fill: it fills the form of a `MapoDetail` from a source, without a panel of its own. A page gives it the detail's context, and calls `fill()` with what the operator pasted.

| File                                       | Role                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `src/runtime/shared/fill.ts`               | Pure: the request from the two descriptions, the answer read as outside data, the plan, the model's paths |
| `src/runtime/composables/useMapoAiFill.ts` | The composable: the plan applied to the detail, the marks, `restore()` and `undo()`, waiting and failing  |

### What goes in by itself

For each field of the answer, `planMapoAiFill()` decides one action: `apply` for a verified value on an empty field, `confirm` for a value no quote proves or one that would replace what the field holds, `manual` for a related record, `discard` for a value the gateway discarded, `empty` for what the source does not give. Only `apply` writes by itself: a verified value cannot be worse than an empty field, while a value that replaces one asks the operator to compare, and a related record is a name the form cannot take before someone finds it (an id the AI picked from `relationChoices` waits too). A field is empty when it holds nothing, a blank text, an empty paragraph of the editor or an empty list; `false` and `0` are values, so a switch the backend sets to `false` keeps it until the operator applies. A field the form hides (`show`, `visible`) waits too: the operator would not see a value go in. A part of a field whose accessor converts the whole value (`seo.title` of such a field) is `manual`: it cannot be written alone. A related record is looked for anywhere in a value, not only in what a list's items say, and a list of items whose answer lacks the outcome of each item is not read at all. A list goes in whole, by its own `verified`, which holds only when every item is verified, none was taken out and the list is long enough.

### Why the page builds the request

The page holds both descriptions: the fields it renders, written with `fieldsToJsonSchema()`, and the backend's schema, read from the `OPTIONS` the detail asks for once (`metadata()`), with `metadataToJsonSchema()` or the page's own `schemaFromMetadata`. The gateway builds the entity model and the contract from them, as for any request of `run`. When `OPTIONS` fails, the fields alone describe the record: the form's own keep-out rules still hold, and every value goes into a field of the form, which the operator reviews before saving. The composable reads the fields, the language and whether the record is new only once `OPTIONS` answered: a detail that takes its languages or its fields from it (Camomilla, `experimentalFieldsFromSchema`) has them then, and not before.

`runMapoAiFill()` is the whole round trip without a UI: it builds the request, posts it through the `post` it is given, reads the answer and plans it, writing nothing. The composable adds the state, the marks and the writes. A tool of a future agent can call the operation with its own `post` and its own form.

### The answer as outside data

The page reads the answer of `run` with a validator, `readMapoAiFillResponse()`, as the gateway reads a provider's: the server may run another version of the gateway, or a backend its own, and the composable writes what it reads into a form. An outcome it cannot read is left out, so nothing of it reaches the form; an answer that is no fill answer at all is an error. Keys stay data, `__proto__` included.

### Writing into the form

A field's value is at the path the form reads it from: its key, `translations.<language>.<key>` for a translatable field in the language the detail edits (the rule of the form's `valuePath()`, which a test keeps in step), and `seo.title` inside its object. The composable writes only the keys the form's fields declare (`declaredKeys()` of the schema it sent: `title.x` or `speakers.length` are not keys), through own properties, never through a segment that leads to a prototype, and a copy of the value. It writes as the form's `setFieldValue()` does, which it cannot call: through the accessor of the field or of its type in the registry, in every language for a `synci18n` field, then the field's `onChange`.

Each write remembers what the path held, whether the key was there and which objects it made on the way (`translations.it`). `restore()` and `undo()` put a path back only while it holds what was written, compared as JSON: a value the operator changed afterwards stays theirs. A key the write added goes away again, and an object it made goes too once empty, so an undone form is the form it was, and the detail no longer counts it as changed. The form is read when the answer arrives, so a field the operator filled meanwhile counts as filled. A read-only form is neither asked nor written, and nothing is written while the detail saves or deletes its record (`isBusy`): the save may load the record back over a value, and leave a mark on a field that no longer holds it.

### The marks

The marks go to the detail's `annotations` channel, at the path the form looks at: the field's value path. A field with parts gets one mark for all of them (the form shows no mark at `seo.title`), which tells each part and applies or restores them together. The proof of a list comes from the quotes of its items, and its mark says when values were taken out or the list is too short. The composable keeps the marks it set and removes only those: a mark of another extension at another field stays, and one at the same field is replaced: it does not come back when the AI's goes. A mark of the page's `annotations` prop wins over the channel at the same path, so it hides the AI's. Each mark carries the actions of its field: Keep and Restore for a value that went in, Apply and Ignore for one that waits, Ignore alone for a related record or a discarded value. The labels come from the app's `$i18n` (`mapo.ai.fill.*`, and the shared `mapo.apply` and `mapo.restore`), read without a dependency on `@mapomodule/i18n`: without it, a label is its key.

### Waiting and failing

The call goes through `$mapoFetch` when the app has it, so a session that ended leads to the login page as anywhere in Mapo, and through `$fetch` otherwise. `cancel()`, a new `fill()` and the end of the component's scope stop the browser's wait and close the request: the gateway notices the response closing unfinished and stops the provider's call (a model on the app's own server is free again), which counts against the user's limit once the provider was called and is audited as `cancelled`. A request whose page went away before the provider was called is dropped, neither counted nor audited. The previous answer's marks and memory are replaced only when a new answer arrives: a call that fails or is cancelled leaves them as they were. An error keeps the gateway's status and its `Retry-After`, with a message from `mapo.ai.errors.*`; a `FetchError` without a status is the network, any other failure (the app's own `schemaFromMetadata` throwing) is a failure.

### Strengths and weaknesses

- **One rule decides what goes in by itself**, in a pure function with its tests: the same rule will serve Magic Fill's panel.
- **The browser trusts no answer**: it reads it as outside data, and writes only at the paths it sent.
- **The operator's work is never undone**: `restore()` and `undo()` put back only what the AI wrote and the field still holds, until the next answer or until the page is left.
- **Related records wait**: the AI's name, or id, is shown, and the operator chooses the record; searching for it is Magic Fill's.
- **A list goes in whole or waits**: there is no merge with the items a record already has.
- **The marks and the memory of `undo()` live in the page**: a reload forgets them.
- **`false` counts as a value**: a default `false` of a new record keeps a verified `true` waiting.
- **Cancel stops the provider only where the server sees the request close**: on a Node server, directly or behind a proxy that closes its request too. On an edge runtime, or behind a proxy that keeps the request open, a cancelled call runs on and costs.
- **The form's write is copied, not called**: `useMapoForm()` keeps `setFieldValue()` to itself, so the composable repeats its steps (accessor, `synci18n`, `onChange`) and must follow it when it changes. It does not mark the field as touched, so the form's own validation of that field waits for Save.

## Testing

The whole core, the storage and the gateway run without network or UI, with Vitest, in `packages/@mapomodule/ai/src/__tests__/`; the storage tests use unstorage's memory and file-system drivers, and the routes run on a bare h3 app, with the mock as the provider:

| File                | What it proves                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity.test.ts`    | Which fields the AI may fill, the merge rules, and that no keep-out flag is lost wherever a schema writes it                                       |
| `contract.test.ts`  | The schema stays portable (`expectPortable()`), the budget, the links of an extraction                                                             |
| `sanitize.test.ts`  | Each kind read and discarded, limits, lists, relations, links, quotes, the verification rules, the patterns the server cannot afford               |
| `patterns.test.ts`  | The bound on a pattern's work: what has none, what it grows with, the lengths it allows                                                            |
| `citations.test.ts` | Finding quotes, numbers read one way, points of a map, dates, times, time zones and links                                                          |
| `markdown.test.ts`  | The closed list of tags: everything else is text                                                                                                   |
| `nested.test.ts`    | Nested values from the form to the outcome: lists, templates, objects, points, depth, every declaration                                            |
| `keys.test.ts`      | The chain of keys, the assignments, the bodies of the routes; `keys-routes.test.ts` runs the routes: who, keys, tokens, audit                      |
| `settings.test.ts`  | The users and groups of the backend, the check of a connection, the preference in the policy, the admins' settings                                 |
| `usage.test.ts`     | The period, the days of a key, the cost of a call, the sums, the app's prices; the routes in `keys-routes.test.ts`                                 |
| `sealed.test.ts`    | Values read back as sealed, nothing in clear in memory or on disk, records bound to their place, the sweep                                         |
| `secret.test.ts`    | The secret read from the runtime config, the temporary one, and what the log says                                                                  |
| `storage.test.ts`   | Where the default mount goes, and that the app's own mounts stay                                                                                   |
| `plugin.test.ts`    | The plugin on a mocked Nitro: after the app's plugins, hourly, the log, the close, a runtime without timers                                        |
| `nitro.test.ts`     | The wiring: closed with a 503 without a secret or a mount, the secret read through the event, the warnings                                         |
| `user.test.ts`      | The user read from a payload, the rules of `admin` and `users`, a model's permission, the hook's types                                             |
| `session.test.ts`   | What each answer of the backend means, the 30 seconds of memory, the calls shared, the oldest forgotten                                            |
| `status.test.ts`    | The route on a bare h3 app with a mocked Nitro: 401, 403, 502, admins, the hook, the cross-site check, a model's permission, the providers offered |
| `run.test.ts`       | `run` on a bare h3 app: who calls it, the body, the policy, the limit, the mock's answers and failures, the audit, the prompt, an app's provider   |
| `policy.test.ts`    | Which provider and model a request gets, the defaults, the providers that cannot be used                                                           |
| `limiter.test.ts`   | The calls of the last sixty seconds, refused calls not counted, the users kept                                                                     |
| `audit.test.ts`     | The record's key, its validator, its write in the user's space with its expiry                                                                     |
| `prompts.test.ts`   | The base rules, the order of the layers, the marks around the source                                                                               |
| `mock.test.ts`      | The mock's rules, its failures on command and its fixtures                                                                                         |
| `registry.test.ts`  | The providers an app registers, the ids Mapo keeps, Mapo's providers built with their server                                                       |
| `providers.test.ts` | The providers the log names at start, as they will not be called, and the models a server does not list; the providers' settings and key           |
| `module.test.ts`    | The module on a mocked kit: the secret private and empty, the warning, the default mount, the registrations, the options and what each warns about |
| `readers.test.ts`   | Mapo's readers on files written in the test: encodings, Markdown, JSON, HTML's cases, CSV's delimiters and quotes, workbooks and their bound       |
| `read.test.ts`      | `read` on a bare h3 app: who calls it, the form and its bounds, every answer, the app's readers and hooks, the operation, the registry             |

The browser's half, also run in Node:

| File                    | What it proves                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `fill.test.ts`          | The request from the two descriptions, the answer read as outside data, each action of the plan, the model's paths          |
| `useMapoAiFill.test.ts` | The composable with a mocked `useNuxtApp()`: what it writes and marks, apply, restore, undo, cancel, the errors             |
| `fill-gateway.test.ts`  | The browser's request through the real `run` route, the mock and the sanitizer, its answer read and planned as a page would |
| `useMapoAiRead.test.ts` | The answer of `read` read as outside data, the file sent as a form, the composable through `$mapoFetch`                     |

The providers that call a server: the local ones on the answers Ollama 0.40.13 sent on its two APIs, kept in `recorded/`, and the cloud ones on the answers of OpenAI and Anthropic as their API references describe them, written by hand in `documented/`; `servers.ts` serves both through a fake `fetch` that keeps every call. Record them again when a server's API changes, and record the cloud ones once a real call can:

| File                       | What it proves                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ollama.test.ts`           | The body, the key, the version, the context asked again, the cut prompt and answer, failures                        |
| `openaiCompatible.test.ts` | The body, the cap, vLLM's refusals, the checks of the context, refusals, events, redirects                          |
| `http.test.ts`             | The calls and their failures, an error's text, `Retry-After`, a stream read line by line, in chunks, within a bound |
| `local.test.ts`            | A server's address, the tokens, the context asked, the models' details kept ten minutes                             |
| `openai.test.ts`           | The body, the key, the effort, the cache's breakpoint, the end of a response, refusals, parameters left out         |
| `anthropic.test.ts`        | The body and headers, the effort, the cache's mark and counts, refusals, fallbacks, parameters left out, enum case  |
| `cloud.test.ts`            | The cap with the reasoning's room, the key a call needs, the counts, refused parameters, stream errors, enum case   |

- `expectPortable()`, in `portable.ts`, walks a schema and fails on anything outside the portable subset; every contract test runs it.
- `workbook()`, in `workbooks.ts`, writes an XLSX from its sheets, a ZIP stored without compression, so a test shows what a workbook holds instead of carrying a binary file; `zip()` can declare other sizes than the entries have, as a ZIP that unzips into more than it weighs.
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
4. Add it to the tables of `entity.test.ts`, `contract.test.ts` and `sanitize.test.ts`.

### Add a verification rule

1. Add it to `AiVerificationRules` in `sanitize.ts`, with a JSDoc that says what it changes.
2. Give it its prudent value in `DEFAULT_VERIFICATION_RULES`, and read it in `verificationRulesOf()`, so a malformed value falls back to the default.
3. Apply it in `holdsProbe()`, or in the reading it changes in `citations.ts`.
4. Test it on, off and malformed. A rule may change what a found quote must hold; it never verifies a value without one.

### Add a word that names a secret

Add it to `SECRET_ENDINGS`, to `SECRET_WORDS` for a whole word, or to `SECRET_PAIRS` for two words, in `entity.ts`, and to `MAPO_SECRET_NAMES`, which the settings page shows. The app and the admins add their own without code (`secretWords`). A key is checked with the keys around it, so a pair also counts across an object, a list or a template (`api.key`). Test it from a form alone and from a backend schema alone, with a key that holds the word inside another word and must stay fillable.

### Add a storage purpose

1. Add it to `STORAGE_PURPOSES` in `sealed.ts`, with a JSDoc that says what it keeps. Its records get a key of their own.
2. Write its records through `useMapoAiStorage(event).store(purpose)`, never with `useStorage()` directly, and give them an expiry unless they must last.
3. Read them with a validator: what comes back is outside data, and may have been written by an older version.
4. Never rename a purpose that has records: the key is derived from its name, and its records would no longer open.

### Add a gateway route

1. Add the handler to `src/runtime/server/routes/`, one file per route, and register it in `module.ts`.
2. Start it with `requireMapoAiSession(event)`, or `requireMapoAiAdmin(event)`, before anything else, and set `Cache-Control: no-store` when the answer is the user's own. Only a route that tells the user what they may do, as `status` does, uses `readMapoAiCaller(event)` and answers a refused user.
3. Read the body with zod: it is outside data.
4. Describe the answer in `runtime/shared/gateway.ts`, raise `MAPO_AI_CONTRACT_VERSION` when an older client cannot read it, and add it to the routes of [AI-assisted entry](/modules/ai#the-gateway).
5. Test it on a bare h3 app, as `status.test.ts` does: without a session, refused, as an admin.

### Add a provider of Mapo

1. Write it in `src/runtime/server/providers/`, implementing `MapoAiProvider`, built from its settings (`MapoAiServerSettings`) with the `fetch` passed in, so its tests serve recorded answers through `servers.ts`: success, refusal, truncation, invalid JSON, 429, 5xx.
2. Call its server through `http.ts`: `callServer()` and `serverJson()` tell the failures apart, `readJsonLines()` and `readEvents()` read a stream within a bound.
3. Add it to `MAPO_PROVIDERS` in `registry.ts`; its id is in `MAPO_AI_RESERVED_PROVIDER_IDS` already, or goes there in the same change.
4. Read its options in `run/options.ts`, which warns about the keys it does not know: for one that calls a server, add it to `SERVER_PROVIDERS`, which gives it `baseURL` and, with `isCloud`, `effort` and `promptCache`; document them. Every provider but the mock has a place for its project's key. A cloud's provider builds on `cloud.ts`.
5. Declare `key`, `"required"` or `"optional"`, when it calls with a key: the chain of keys applies to it, and it is built again at each request with the user's key ([Keys](#keys)).
6. Throw a `MapoAiProviderError` for each failure the gateway tells apart, and read what the provider's API returns as outside data.

### Add a reader of Mapo

1. Write it in `src/runtime/server/readers/`, as a `MapoAiReader`: it reads the bytes as outside data, throws for a file it cannot read, and returns text parts named after the file (`textParts()`).
2. Add it to `MAPO_READERS` in `registry.ts`: its id becomes one of Mapo's, which an app's reader can take the place of, and which `mapo.ai.readers` and the environment can turn off.
3. Import a dependency inside `read()`, so a server that reads no such file never loads it; bound what it holds in memory by what it really unpacks, as `checkWorkbook()` does for a workbook, never by what the file declares.
4. Test it in `readers.test.ts` on files written in the test, and add it to the formats of [Read a file](/modules/ai#read-a-file), to `READERS` in `status.test.ts` and to `READERS_ON` in `module.test.ts`.

### Change a base rule

Change it in `prompts/base.ts` and raise `MAPO_AI_PROMPT_VERSION`, so every answer and audit record says which rules it was asked with. Keep the rules that protect: the source is data, nothing is invented. Once there is an evaluation set, measure the change with it before it ships.

### Change what goes into the form by itself

The rule is `actionOf()` in `fill.ts`, with `isEmptyFormValue()` for what counts as empty. Change it there, with a row in the tests of `planMapoAiFill()`, the table of [Fill a detail form](/modules/ai#fill-a-detail-form), and a message under `mapo.ai.fill` in both catalogs of `@mapomodule/i18n` when a mark changes. The rule decides what reaches a form without the operator: a value that goes in by itself must stay one a quote verifies.

### Add a tag of rich text

Add it to `markdown.ts` and to the closed list in its tests, and make sure `MapoWygEditor` accepts it: the editor must keep every tag the AI's HTML has.

## Documentation plan

The module's documentation is written with the code, on this plan. [AI-assisted entry](/modules/ai) is for app developers and says only what works, because the MCP server serves it to assistants as fact. These sections exist now, and the work that filled each:

| Section                                          | Filled by                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| What works today, Enable the module, The gateway | The gateway's first route                                        |
| Who may use the gateway                          | The gateway's authentication                                     |
| Ask the AI                                       | The `run` route                                                  |
| Fill a detail form                               | `useMapoAiFill()`                                                |
| Read a file                                      | The readers of files, `useMapoAiRead()`                          |
| Providers                                        | The mock, an app's own, local models, the cloud                  |
| Keys                                             | The three levels, the routes of the keys and of the tokens       |
| AI settings                                      | The settings page: preferences, keys, how the AI works, usage    |
| The prompt, Verification, Limits, The audit      | The `run` route                                                  |
| The secret and the storage                       | The encrypted storage                                            |
| Options                                          | Every option, in the change that makes it work (written to date) |

Still to write, each with the work that fills it:

| Section                       | Filled by                                                |
| ----------------------------- | -------------------------------------------------------- |
| Read a file (PDFs, images)    | The readers for PDFs and images                          |
| Fill a form with Magic Fill   | Magic Fill                                               |
| Verified and to check         | Magic Fill, from the verification described on this page |
| Keep a field away from the AI | Magic Fill: `x-mapo-ai`, `noDraft`, the names of secrets |
| Import several records        | Import AI                                                |
| Guarantees and limits         | Every change                                             |

This page, for people who work on Mapo, follows every change to the source. At the end of each milestone both pages are read again and rewritten as one text; the last reread closed the foundations.

## Next and nice to have

### Planned

In this order:

1. **Magic Fill**, on `useMapoAiFill()` and `useMapoAiRead()`: its panel, with files read through `read`, the preview of the values that wait, related records found by their name, an evaluation set run on real providers, and how a list's items join the items a record already has.
2. **Readers for PDFs and images**: a PDF's text, and images and scans, read into text, which is all `run` takes; then the `where` of a quote, the part it names, can narrow its search.
3. **Import AI**, with a check for duplicates between new items and existing records.

### Nice to have

Ideas with no place in the plan yet:

- Read month names and dates in words in the source's language, with `Intl`.
- Resolve a named time zone (`CET`, `Europe/Rome`) to its offset on the value's date, so that such quotes can verify.
- Let the form's number input take `multipleOf` as its `step`.
- Limits on dates (a minimum and a maximum day), which the core does not model.
- The limits of every declaration of a nested value, not only those of the one it is read from.
- A point of a map from a place name, through a geocoder outside the model, verified against the place the source names.
- Rotate the storage's secret: read with the previous one too, and seal again with the new one at the next write.
- Tell the gateway an entity's model from the server, through the catalog, instead of taking it from the request; with the catalog, also its descriptions.
- A limit per user shared by the processes of a server, and caps by day or by cost, read from the audit.
- Stream the answer to the browser, for slow local models.
- Export the providers' factories, so an app can register a second server of a kind under an id of its own, such as a GPU machine beside a laptop's Ollama.
- The context of each model of an OpenAI-compatible server, not one for the whole server; and a count of the prompt's tokens before the call, where a server offers one (vLLM's and llama.cpp's `/tokenize`).
- Turn reasoning off on an OpenAI-compatible server, with the parameter each kind of server takes.
- An option to turn Anthropic's fallbacks off, and the price of each attempt of a fallback in the audit.
- Pick the sheets of a workbook, or a range of rows, before `run`: today a workbook goes whole.
- A hook where `run` reads its source, for an app that must keep something away from every provider, pasted text included.
- A limit of calls on `read`, and reading a large workbook without holding it all in memory.
- A reader of a web page's main content only, without its header, menus and footer.
- Count a prompt's tokens before an Anthropic call (`count_tokens`, free), to warn before a long source.
- The batch APIs of OpenAI and Anthropic, at half the price, for Import AI.
- Claude and OpenAI's models through Amazon Bedrock, Google Vertex AI or Azure, for a region in Europe.
- Tell in `status` the context of each model and whether it reads images, so a page can warn before it sends a long source.
- Check `Origin` too, for browsers that send no `Sec-Fetch-Site`, once the host the server sees behind a proxy can be trusted.
- Read group objects (`{ name }`) as names, in the auth store and the gateway together.
- Expire a batch and its drafts through one record, instead of one expiry each.
- Keep the drafts in the browser (IndexedDB), for installations that cannot have a server storage.
- Versions on records, for two tabs that write the same one.
- Expose Magic Fill and Import AI as tools of a conversational agent. The module is designed for it: every action of its interface is an operation that can also run without the interface.
