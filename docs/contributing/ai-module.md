# Working on the AI module

How `@mapomodule/ai` is built, why it is built this way, what it does well and where it falls short, and how to extend it. What the package offers to app developers is on [AI-assisted entry](/modules/ai); this page is about its source and its design. The package is experimental and grows one piece at a time: the page describes the code as it is, and its last section says what comes next.

## Where the module is going

The module will help an operator enter data with a language model, in two ways:

- **Magic Fill** will fill the form of one record from a text or a file;
- **Import AI** will extract several related records from a long source.

In both, the model only proposes: the operator reviews every value before anything is saved, and the gateway never writes to the backend.

Neither feature exists yet. Today the package installs the gateway, with its `status` route and an encrypted storage on the server for its state, and the shared core both features will run on: what the AI may fill in a record, what it is asked, and how its answer is checked. The core is pure TypeScript and is not part of the package's public types yet.

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
| `src/module.ts`                   | The Nuxt module: routes, storage plugin, private secret     |
| `src/storage.ts`                  | At build time, the storage's default mount                  |
| `src/runtime/server/routes/`      | The gateway's Nitro handlers, one file per route            |
| `src/runtime/server/storage/`     | The sealed storage of the gateway's state                   |
| `src/runtime/server/plugins/`     | When the server starts: the storage's checks and sweeps     |
| `src/runtime/shared/entity.ts`    | The entity model                                            |
| `src/runtime/shared/contract.ts`  | The contract compiler                                       |
| `src/runtime/shared/sanitize.ts`  | The sanitizer and the verification rules                    |
| `src/runtime/shared/citations.ts` | Finding a quote in the source, and a value in a quote       |
| `src/runtime/shared/markdown.ts`  | Restricted Markdown, the rich text the model writes         |
| `src/runtime/shared/dialect.ts`   | The `x-mapo-ai` keyword: a hint for the model, or `exclude` |

The rules for the code are in `packages/@mapomodule/ai/AGENTS.md`: `runtime/shared` stays free of Nuxt, Nitro, Vue and Node imports, secrets stay on the server, outside data is `unknown` until a validator reads it, nothing that keeps the AI out may be lost, one schema serves every provider, and the state is sealed and fails closed.

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

Values come back as the form saves them: numbers, booleans, normalized dates and times, choices mapped back to their value (`"1"` becomes `1`), relations as `{ id }`, `{ search }` or `{ item }`, a point as `{ lat, lng }`. Rich text arrives as restricted Markdown and becomes HTML from a closed list of tags, `p`, `ul`, `ol`, `li`, `strong`, `em`, and `a` with an `http` or `https` address; everything else becomes escaped text, so no HTML the model writes reaches the page. What the answer has that cannot be used becomes a warning, with its path in the answer.

A list's outcome holds its items: each with its template, the outcome of each of its fields and its own `verified`. An item without a value is skipped, since models pad lists; one that is not an object, names no template of the list, or has every value discarded is taken out (`dropped`). An item is verified when every value it gives is, none was discarded and it has every value its fields require; an item that repeats one before it, or follows a template, is not, since no quote proves a second item or which kind of block it is. A list is verified only when every item is, none was taken out and it is long enough; too many items discard it (`too-many-values`). Its value is the items as the form saves them, dotted keys as nested objects and `_template` when the items vary, every key as data (`__proto__` included). `outcomesByPath(fields)` gives every outcome under the path of its value in the form, the way the form's annotations are keyed: `speakers.0.name`, with the indexes of the list's value. A value inside a list is applied with its list: only the list's own `verified` lets Magic Fill skip the preview.

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

Today only the core reads the rules. They will become an option of the app, then a setting that admins can change, for the whole app or for one entity.

### Strengths and weaknesses

- **It fails safe.** Whatever it cannot read leaves the value to check. Against answers recorded from two local models, none of the values they got wrong comes out verified, the midnight, the year and the time zone they invented included.
- **It proves that a value is in the source, not that it belongs to this field.** A model that puts the right words in the wrong field, with the right quote, still gets a verified value.
- **Month names come from `Intl`**, in Italian, English, French, German, Spanish, Portuguese and Dutch, as the runtime writes them, full and short. A date in words in another language never verifies, and stays to check; so do a time zone named by letters (`CET`) and a time in words (`alle nove`). In the quote of a date and time, `12.50` reads as a time.
- **One quote, one moment.** A quote that writes two days never verifies a date and time, because the time could belong to either; a time zone counts only on the time it follows.
- **Strict rules cost reviews.** An Italian `alle 21` is not a time unless `bareHours` is on, and an ambiguous number such as `1.500` never verifies.
- **A point verifies only as a pair of decimal degrees.** Labels between the numbers (`lat 45.46, lng 9.19`), degrees with minutes and seconds (`45°27′51″N`) and whole degrees (`45, 9`) verify nothing, and the point stays to check.
- **A templated list always needs a look.** Which kind of block an item is, is the model's choice: no quote can prove it.

## The storage

The gateway's state lives on the app's server, in the Nitro mount `mapo-ai`, and every record is sealed before it reaches the driver. No route writes to it yet; the gateway's routes will reach it through `useMapoAiStorage(event)`, which reads the secret through the request's event (on Cloudflare Workers the environment arrives with the request) and throws a 503 while the storage is closed.

| File                                    | Role                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/storage.ts`                        | At build time: mounts the file system at `mapo-ai` when the app mounts nothing there    |
| `src/runtime/server/storage/sealed.ts`  | Envelopes, a key per purpose, users, expiry and the sweep; pure, as `runtime/shared` is |
| `src/runtime/server/storage/secret.ts`  | `NUXT_MAPO_AI_SECRET`, read as outside data, and what the log says about it             |
| `src/runtime/server/storage/nitro.ts`   | The wiring to the mount and the runtime config: `useMapoAiStorage(event)`               |
| `src/runtime/server/plugins/storage.ts` | When the server starts, after the app's plugins: the checks, the first and hourly sweep |

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

## Testing

The whole core and the storage run without network or UI, with Vitest, in `packages/@mapomodule/ai/src/__tests__/`; the storage tests use unstorage's memory and file-system drivers:

| File                | What it proves                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `entity.test.ts`    | Which fields the AI may fill, the merge rules, and that no keep-out flag is lost wherever a schema writes it |
| `contract.test.ts`  | The schema stays portable (`expectPortable()`), the budget, the links of an extraction                       |
| `sanitize.test.ts`  | Each kind read and discarded, limits, lists, relations, links, quotes and the verification rules             |
| `citations.test.ts` | Finding quotes, numbers read one way, points of a map, dates, times, time zones and links                    |
| `markdown.test.ts`  | The closed list of tags: everything else is text                                                             |
| `nested.test.ts`    | Nested values from the form to the outcome: lists, templates, objects, points, depth, every declaration      |
| `sealed.test.ts`    | Values read back as sealed, nothing in clear in memory or on disk, records bound to their place, the sweep   |
| `secret.test.ts`    | The secret read from the runtime config, the temporary one, and what the log says                            |
| `storage.test.ts`   | Where the default mount goes, and that the app's own mounts stay                                             |
| `plugin.test.ts`    | The plugin on a mocked Nitro: after the app's plugins, hourly, the log, the close, a runtime without timers  |
| `nitro.test.ts`     | The wiring: closed with a 503 without a secret or a mount, the secret read through the event, the warnings   |
| `module.test.ts`    | The module on a mocked kit: the secret private and empty, the warning, the default mount, the registrations  |

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

### Add a tag of rich text

Add it to `markdown.ts` and to the closed list in its tests, and make sure `MapoWygEditor` accepts it: the editor must keep every tag the AI's HTML has.

## Documentation plan

The module's documentation is written with the code, on this plan. [AI-assisted entry](/modules/ai) is for app developers and says only what works, because the MCP server serves it to assistants as fact. Its sections, and what fills each:

| Section                                          | Filled by                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| What works today, Enable the module, The gateway | The gateway's first route (written)                      |
| The secret and the storage                       | The encrypted storage (written)                          |
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

1. **The gateway's run route**: authentication, policy, prompts composed in layers, a mock provider, the verification rules as an option of the app, and an audit log in the storage.
2. **Readers** for text, PDF, images and spreadsheets.
3. **Providers**: OpenAI, Anthropic and OpenAI-compatible servers, local ones included.
4. **Keys on three levels**: the project's, those an admin assigns, and the operator's own, sealed in the storage.
5. **The AI settings page**, where admins also set the verification rules and the extra words that name a secret.
6. **Magic Fill**, with an evaluation set run on real providers, and how a list's items join the items a record already has; then **Import AI**, with a check for duplicates between new items and existing records.

### Nice to have

Ideas with no place in the plan yet:

- Read month names and dates in words in the source's language, with `Intl`.
- Resolve a named time zone (`CET`, `Europe/Rome`) to its offset on the value's date, so that such quotes can verify.
- Let the form's number input take `multipleOf` as its `step`.
- Limits on dates (a minimum and a maximum day), which the core does not model.
- The limits of every declaration of a nested value, not only those of the one it is read from.
- A point of a map from a place name, through a geocoder outside the model, verified against the place the source names.
- Rotate the storage's secret: read with the previous one too, and seal again with the new one at the next write.
- Expire a batch and its drafts through one record, instead of one expiry each.
- Keep the drafts in the browser (IndexedDB), for installations that cannot have a server storage.
- Versions on records, for two tabs that write the same one.
- Expose Magic Fill and Import AI as tools of a conversational agent. The module is designed for it: every action of its interface is an operation that can also run without the interface.
