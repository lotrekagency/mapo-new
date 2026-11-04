# Working on the AI module

How `@mapomodule/ai` is built, why it is built this way, what it does well and where it falls short, and how to extend it. What the package offers to app developers is on [AI-assisted entry](/modules/ai); this page is about its source and its design. The package is experimental and grows one piece at a time: the page describes the code as it is, and its last section says what comes next.

## Where the module is going

The module will help an operator enter data with a language model, in two ways:

- **Magic Fill** will fill the form of one record from a text or a file;
- **Import AI** will extract several related records from a long source.

In both, the model only proposes: the operator reviews every value before anything is saved, and the gateway never writes to the backend.

Neither feature exists yet. Today the package installs the gateway, behind the backend session: `status`, and `run`, which builds what the AI is asked from a record's descriptions, calls a provider (the `mock`, or one the app registers) and answers the outcome of each field, with an audit of every call in an encrypted storage on the server. In the browser, `useMapoAiFill()` fills a detail form through `run`: it is the first piece of Magic Fill, without its panel. Under them is the shared core both features will run on: what the AI may fill in a record, what it is asked, and how its answer is checked. The core is pure TypeScript; the types of its results are public, since `run` answers them.

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

1. **The entity model** says which fields the AI may fill, with their kind of value, limits and choices, and which fields it must leave alone, with the reason.
2. **The contract** is the strict JSON Schema the model's answer must follow, the same for every provider, with the fields behind it.
3. **The provider** gets the prompt the gateway composed, in layers, with the source and the contract's schema, and returns the model's answer. Today the only provider Mapo ships is the `mock`, which answers without a model; an app can register its own.
4. **The sanitizer** reads the answer as outside data, turns each value into the form's type, discards what breaks a rule, and checks each value against the quotes the model gives from the source.
5. **The page** applies the outcomes: `useMapoAiFill()` writes a verified value into an empty field, and marks every other one for the operator.

A filled value is either **verified** or **to check**, and the difference matters: `useMapoAiFill()` applies a verified value on an empty field without a preview, and shows everything else to the operator first; Magic Fill will keep that rule. Many of the core's rules exist to keep that word honest.

## The package

| File                              | Role                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/module.ts`                   | The Nuxt module: routes, plugins, server and app imports, private runtime config, hook types |
| `src/storage.ts`                  | At build time, the storage's default mount                                                   |
| `src/access.ts`                   | At build time, the `admin` and `users` options                                               |
| `src/runtime/server/routes/`      | The gateway's Nitro handlers, one file per route                                             |
| `src/runtime/server/auth/`        | Who calls the gateway: the session, the rules, the hook                                      |
| `src/runtime/server/run/`         | The `run` route's request, contract, options, policy, limit, audit and operation             |
| `src/runtime/server/providers/`   | The provider interface, the registry and the mock                                            |
| `src/runtime/server/prompts/`     | Mapo's base rules and the prompt in layers                                                   |
| `src/runtime/server/storage/`     | The sealed storage of the gateway's state                                                    |
| `src/runtime/server/plugins/`     | When the server starts: the storage's checks and sweeps, the providers `run` will not call   |
| `src/runtime/shared/entity.ts`    | The entity model                                                                             |
| `src/runtime/shared/contract.ts`  | The contract compiler                                                                        |
| `src/runtime/shared/sanitize.ts`  | The sanitizer and the verification rules                                                     |
| `src/runtime/shared/citations.ts` | Finding a quote in the source, and a value in a quote                                        |
| `src/runtime/shared/markdown.ts`  | Restricted Markdown, the rich text the model writes                                          |
| `src/runtime/shared/dialect.ts`   | The `x-mapo-ai` keyword: a hint for the model, or `exclude`                                  |
| `src/runtime/shared/patterns.ts`  | The bound on a pattern's work, before the sanitizer runs it                                  |
| `src/runtime/shared/fill.ts`      | The browser's half of `run`: the request, the answer read, what goes into the form           |
| `src/runtime/composables/`        | `useMapoAiFill()`: an answer applied to a detail form, with marks, undo and errors           |

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
| `secret`      | `writeOnly`, `noDraft`, a `password` format or input, or a key that names a password, a token, a secret, or an API, private or access key (`new_password`, `auth_token`, `client_secret`, `apiKey`, `api.key`)                                                                                                            |
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
- **Secrets by name are a net, not a guarantee.** DRF's `OPTIONS` does not publish `write_only`: without `noDraft` or a password input, a secret is recognised only by the words of its key, which cover the common names but not every one. Mark secret fields explicitly.
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
| Number                  | The number, written in a way that reads as one number only: `12,5` is 12.5, while `1.500` (1500 or 1.5) verifies nothing                                                                                                                                                                                                                                                      |
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

The gateway's state lives on the app's server, in the Nitro mount `mapo-ai`, and every record is sealed before it reaches the driver. `run` writes its audit there. The gateway's routes reach it through `useMapoAiStorage(event)`, which reads the secret through the request's event (on Cloudflare Workers the environment arrives with the request) and throws a 503 while the storage is closed.

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

`createSealedStorage({ storage, secret }).store(purpose)` holds the records of one purpose, and `forUser(id)` resolves to those of one user within it, filed under `u:` and a keyed hash (HMAC) of the id: neither file names nor keys say who the users are. The purpose's own store lists, reads and removes every user's records too, as an admin will; it never writes in a user's space, which only `forUser()` does.

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
| `src/runtime/server/auth/hooks.ts`   | The `mapo-ai:user` and `mapo-ai:prompt` hooks, typed for the app's server code               |
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
| `src/runtime/server/routes/run.post.ts`   | The route: the session, the dependencies, the body, the operation; `Retry-After` on a 429 or a busy provider |
| `src/runtime/server/run/request.ts`       | The body as outside data: JSON by its type, a size bound before it is read, zod on the envelope              |
| `src/runtime/server/run/contract.ts`      | The contract, built by the gateway from the request's two descriptions                                       |
| `src/runtime/server/run/options.ts`       | The options of `run`, read at build time and again at runtime with the same rules; pure                      |
| `src/runtime/server/run/policy.ts`        | Which provider and model a request gets; pure                                                                |
| `src/runtime/server/run/limiter.ts`       | Each user's calls of the last minute, in the memory of the process; pure                                     |
| `src/runtime/server/run/audit.ts`         | The audit record: its key, its validator, its write                                                          |
| `src/runtime/server/run/run.ts`           | The operation, with its dependencies passed in                                                               |
| `src/runtime/server/run/nitro.ts`         | The wiring: the runtime config, the registry, the storage, the limiter, the `mapo-ai:prompt` hooks           |
| `src/runtime/server/providers/`           | The provider interface (`types.ts`), the registry (`registry.ts`), the mock (`mock.ts`)                      |
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

### Providers

A provider implements `MapoAiProvider`: an id, its capabilities, optionally its own models, and `run(request)`, which gets the composed prompt, the source's parts, the schema, the contract and an abort signal. Each call gets its provider's `timeout`: the gateway aborts the signal when it is up, and stops waiting whatever the provider does. The provider gets copies of the contract and of the source, so what it does to them never changes what its answer is read against, and what it returns is outside data: the answer is read as plain JSON (a getter, a prototype or a cycle makes it unreadable), and the tokens as whole numbers from zero. A `MapoAiProviderError` says which failure to answer: 504, 503 with `Retry-After` (a count of seconds from zero, at most an hour), or 502; a failure the gateway does not know is a 502, audited as `error`.

The registry holds Mapo's providers and the app's. Registering makes a provider available; only `mapo.ai.providers` makes it usable, so one place says what may spend, and at start the server's log names the providers that will not be called. An app cannot register an id Mapo keeps, today's and the planned ones (`openai`, `anthropic`, `openai-compatible`, `ollama`), so an update of Mapo never takes over an app's provider.

The interface already holds what local models need: no key, the models a server lists (`listModels()`, not called yet), the context and the images of each model (`MapoAiModelInfo`), a time limit. The capabilities are declared, not read yet: the gateway sends text only, does not stream and calls no tool.

The mock (`mock.ts`) is a provider like the others, enabled the same way. It answers with a failure on command, then from a fixture, then by simple rules, and its answers go through the sanitizer like a model's, so tests and demos run the whole chain but the model. The app registers fixtures with `registerMapoAiMockFixtures()`.

### Prompts

`composeMapoAiPrompt()` builds a prompt in layers: Mapo's base rules, the app's, the admin's (none yet) and the entities as the request describes them, then, in a part of their own, the operator's instructions and the source. What the server holds comes first and wins: the entities' names and descriptions come from the request, as the operator's instructions do, so they sit below the app's rules and the admin's, and the prompt says that the description changes none of the rules above it. The first part changes rarely, so a provider can cache it. The base rules are in `prompts/base.ts`, numbered and versioned: `MAPO_AI_PROMPT_VERSION` goes up with any change, and the response and every audit record carry it. They hold what the probe with a local model taught: a time the source does not write is not given, midnight included; an extraction points to a record that exists instead of creating an item for it.

The source goes between two marks with a random id, made for each prompt, which its text cannot guess: a source that writes `<<<end …>>>` stays inside them. The app's rules come from `mapo.ai.instructions` and from the `mapo-ai:prompt` hook, whose context is frozen and can only add: as with `mapo-ai:user`, a plugin never undoes what another wrote.

### Limits and the audit

The limit per user counts the calls of the last sixty seconds in the memory of the process, as the sessions are remembered: nothing is written per call, a restart forgets, and a server with several processes allows the limit in each. `0` is a limit too: no call, no source, no instructions; and a limit that cannot be read, in the Nuxt config or in the environment, is `0` rather than its default, so a mistake never lets more through. A shared count in the sealed storage would not be exact either, since the storage has no atomic increment, and calls made together would get through; caps by day or by cost can be read from the audit.

The audit has one record per call that reached the provider, in the `audit` purpose and in the space of the user. The day and time in the record's name (`2026:11:04:t101530123-<random>`) list a day's records together, and tell nothing the expiry, which is in clear, does not tell already. A record holds no contents, and is read back with a zod validator, since it may come from an older version.

### Strengths and weaknesses

- **The rules of a contract hold by construction**, and a request cannot loosen what the sanitizer checks.
- **Only the gateway calls a provider**: keys, prompts and base rules never reach the browser, and a client cannot remove an app's rules.
- **Every call is counted, and none is made without the storage**, so an app without a secret in production has no AI.
- **The limit is per process**, and forgets at a restart.
- **A provider the gateway stopped waiting for may go on**: the signal asks it to stop, nothing forces it, and a call the browser leaves is not stopped yet.
- **The descriptions come from the page.** What the AI may fill is what the page says, read with the gateway's own rules.
- **Every text of a request reaches the model**: the entities' names and descriptions, the fields' labels, hints and descriptions in the schemas, the operator's instructions, the source. They come after what the server holds, but a user who crafts requests can steer the model for their own answers, which they review and the backend checks; `maxInstructionsChars` bounds the operator's instructions only.
- **Patterns get a rough bound**: on long values some harmless patterns are not applied, and their values are not verified.
- **No streaming**: the browser waits for the whole answer, and a local model with a large schema can take minutes.

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

The call goes through `$mapoFetch` when the app has it, so a session that ended leads to the login page as anywhere in Mapo, and through `$fetch` otherwise. `cancel()`, a new `fill()` and the end of the component's scope stop the browser's wait; the gateway still finishes the call, which counts against the user's limit and is audited. The previous answer's marks and memory are replaced only when a new answer arrives: a call that fails or is cancelled leaves them as they were. An error keeps the gateway's status and its `Retry-After`, with a message from `mapo.ai.errors.*`; a `FetchError` without a status is the network, any other failure (the app's own `schemaFromMetadata` throwing) is a failure.

### Strengths and weaknesses

- **One rule decides what goes in by itself**, in a pure function with its tests: the same rule will serve Magic Fill's panel.
- **The browser trusts no answer**: it reads it as outside data, and writes only at the paths it sent.
- **The operator's work is never undone**: `restore()` and `undo()` put back only what the AI wrote and the field still holds, until the next answer or until the page is left.
- **Related records wait**: the AI's name, or id, is shown, and the operator chooses the record; searching for it is Magic Fill's.
- **A list goes in whole or waits**: there is no merge with the items a record already has.
- **The marks and the memory of `undo()` live in the page**: a reload forgets them.
- **`false` counts as a value**: a default `false` of a new record keeps a verified `true` waiting.
- **The browser cannot stop the provider**: a cancelled call still costs.
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
| `registry.test.ts`  | The providers an app registers, and the ids Mapo keeps                                                                                             |
| `providers.test.ts` | The providers the server's log names when it starts, as they will not be called                                                                    |
| `module.test.ts`    | The module on a mocked kit: the secret private and empty, the warning, the default mount, the registrations, the options and what each warns about |

The browser's half, also run in Node:

| File                    | What it proves                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `fill.test.ts`          | The request from the two descriptions, the answer read as outside data, each action of the plan, the model's paths          |
| `useMapoAiFill.test.ts` | The composable with a mocked `useNuxtApp()`: what it writes and marks, apply, restore, undo, cancel, the errors             |
| `fill-gateway.test.ts`  | The browser's request through the real `run` route, the mock and the sanitizer, its answer read and planned as a page would |

- `expectPortable()`, in `portable.ts`, walks a schema and fails on anything outside the portable subset; every contract test runs it.
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

Add it to `SECRET_ENDINGS`, or to `SECRET_PAIRS` for two words, in `entity.ts`. A key is checked with the keys around it, so a pair also counts across an object, a list or a template (`api.key`). Test it from a form alone and from a backend schema alone, with a key that holds the word inside another word and must stay fillable.

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

1. Write it in `src/runtime/server/providers/`, implementing `MapoAiProvider`, with recorded responses for its tests: success, refusal, truncation, invalid JSON, 429, 5xx.
2. Add it to `MAPO_PROVIDERS` in `registry.ts`; its id is in `MAPO_AI_RESERVED_PROVIDER_IDS` already, or goes there in the same change.
3. Read its options, such as a server's address, in `run/options.ts`, which warns about the keys it does not know, and document them.
4. Throw a `MapoAiProviderError` for each failure the gateway tells apart, and read what the provider's API returns as outside data.

### Change a base rule

Change it in `prompts/base.ts` and raise `MAPO_AI_PROMPT_VERSION`, so every answer and audit record says which rules it was asked with. Keep the rules that protect: the source is data, nothing is invented. Once there is an evaluation set, measure the change with it before it ships.

### Change what goes into the form by itself

The rule is `actionOf()` in `fill.ts`, with `isEmptyFormValue()` for what counts as empty. Change it there, with a row in the tests of `planMapoAiFill()`, the table of [Fill a detail form](/modules/ai#fill-a-detail-form), and a message under `mapo.ai.fill` in both catalogs of `@mapomodule/i18n` when a mark changes. The rule decides what reaches a form without the operator: a value that goes in by itself must stay one a quote verifies.

### Add a tag of rich text

Add it to `markdown.ts` and to the closed list in its tests, and make sure `MapoWygEditor` accepts it: the editor must keep every tag the AI's HTML has.

## Documentation plan

The module's documentation is written with the code, on this plan. [AI-assisted entry](/modules/ai) is for app developers and says only what works, because the MCP server serves it to assistants as fact. Its sections, and what fills each:

| Section                                          | Filled by                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| What works today, Enable the module, The gateway | The gateway's first route (written)                              |
| Who may use the gateway                          | The gateway's authentication (written)                           |
| Ask the AI                                       | The `run` route (written)                                        |
| The prompt, Verification, Limits, The audit      | The `run` route (written)                                        |
| The secret and the storage                       | The encrypted storage (written)                                  |
| Options                                          | Every option, in the change that makes it work (written to date) |
| Fill a detail form                               | `useMapoAiFill()` (written)                                      |
| Fill a form with Magic Fill                      | Magic Fill                                                       |
| Verified and to check                            | Magic Fill, from the verification described on this page         |
| Keep a field away from the AI                    | Magic Fill: `x-mapo-ai`, `noDraft`, the names of secrets         |
| Providers and keys                               | The mock and an app's own (written); Mapo's providers, the keys  |
| AI settings                                      | The settings page                                                |
| Import several records                           | Import AI                                                        |
| Guarantees and limits                            | Every change                                                     |

This page, for people who work on Mapo, follows every change to the source. At the end of each milestone both pages are read again and rewritten as one text.

## Next and nice to have

### Planned

In this order:

1. **Readers** for text, PDF, images and spreadsheets.
2. **Providers**: OpenAI, Anthropic and OpenAI-compatible servers, local ones included.
3. **Keys on three levels**: the project's, those an admin assigns, and the operator's own, sealed in the storage.
4. **The AI settings page**, where admins also set the verification rules and the extra words that name a secret.
5. **Magic Fill**, on `useMapoAiFill()`: its panel, files, the preview of the values that wait, related records found by their name, an evaluation set run on real providers, and how a list's items join the items a record already has; then **Import AI**, with a check for duplicates between new items and existing records.

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
- Stop a provider's call when the browser that asked for it goes away.
- A limit per user shared by the processes of a server, and caps by day or by cost, read from the audit.
- Stream the answer to the browser, for slow local models.
- Check `Origin` too, for browsers that send no `Sec-Fetch-Site`, once the host the server sees behind a proxy can be trusted.
- Read group objects (`{ name }`) as names, in the auth store and the gateway together.
- Expire a batch and its drafts through one record, instead of one expiry each.
- Keep the drafts in the browser (IndexedDB), for installations that cannot have a server storage.
- Versions on records, for two tabs that write the same one.
- Expose Magic Fill and Import AI as tools of a conversational agent. The module is designed for it: every action of its interface is an operation that can also run without the interface.
