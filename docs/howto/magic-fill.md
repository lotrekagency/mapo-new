# How-to: fill records with Magic Fill

Goal: let operators fill a record of a detail page from a text or from files with the AI, and check every value before they save.

Time: about ten minutes with the mock, which answers without a key or a cost.

::: tip What you get
On every `MapoDetail`, a **Fill with AI** button and a banner above the form. The AI reads the source and fills the empty fields of the record. A value goes in by itself only when a quote of the source proves it and its field is empty; every other value waits for the operator, marked on its field and listed in the banner. Nothing is saved until the operator saves.
:::

Magic Fill is part of `@mapomodule/ai`, which is experimental. The gateway, the providers, the keys and the AI settings it relies on are described in [AI-assisted entry](/modules/ai).

## 1. Turn it on

Set the `mapo.ai` key and enable a provider. The mock answers in development without a network:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxt/ui", "mapomodule"],

  mapo: {
    ai: {
      providers: { mock: {} },
    },
  },
});
```

Every `MapoDetail` of the app now has the two parts, for a user the app lets use the AI ([Restrict who uses the AI](/modules/ai#restrict-who-uses-the-ai)), on a record they may edit:

- **Fill with AI**, a button in the sidebar card above Save, opens the panel. When no model can be called for the user, as without a key, it is off and says why.
- **A banner above the form** follows the call, sums up the session and lists the values that wait. On a phone, where the sidebar card comes after the form, the banner opens the panel too.

For real models, enable `openai`, `anthropic`, `ollama` or `openai-compatible` ([Providers](/modules/ai#providers)) and give the keys ([Keys](/modules/ai#keys)). In production the gateway needs its secret, `NUXT_MAPO_AI_SECRET` ([The secret and the storage](/modules/ai#the-secret-and-the-storage)).

::: tip With an assistant
An assistant connected to Mapo's MCP server can walk you through it: the `mapo-ai-setup` prompt, or the `mapo_ai_setup` tool, asks what the AI is for, says what the module can and cannot do, and proposes the configuration, the keys and the files ([@mapomodule/mcp](/modules/mcp#setting-up-the-ai)).
:::

## 2. What the operator does

### The panel

The panel slides in from the right, and closing it neither stops nor loses a call:

- **Text**: what the operator pastes, with a count of the characters against `maxSourceChars`.
- **Files**: each one is read through [`read`](/modules/ai#read-a-file) as it is attached, and its text joins the source after the pasted text. The formats and the largest file come from `status`; a file larger than `maxFileBytes` is refused before it is sent.
- **Instructions for this extraction**, closed by default: what the operator wants, such as "only the first event", below the app's and the admins' rules. Hidden when `maxInstructionsChars` is `0`.
- **What I send to the AI**, closed by default: what a call would send now, as the gateway composes it ([Preview a call](/modules/ai#preview-a-call)): the model, the rules and instructions the model reads, the operator's instructions, the source by part and length, the fields the AI may fill and those kept away from it, with why. Never a key. It is composed when it opens with nothing current to show; when the panel changes after, it says so, and Compose again composes it anew, so typing spends nothing.
- **The provider and the model**: those the user may call, from their default; a select when there are several. It says where what is sent goes.
- **Extract**, off while a file is read, the source is empty or longer than the limits, or the record is busy, and the panel says why.

Extract reads the record's description first (the detail's `OPTIONS`), then asks the model; the panel closes when the answer arrives. The banner shows the time it takes, and after twenty seconds says that a model can take minutes. Cancel closes the request, and the gateway stops the provider's call. Errors and refusals show in the banner, and an error in the panel too, which stays open.

### Review the values

After an answer, each field the AI gave a value for carries a mark next to its label. The mark opens a popover with the value, the words of the source that prove it (two at most, each with where the AI says it found them) and what the operator can do:

| Mark                            | What happened                                                                         | Actions                       |
| ------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| Filled by the AI                | The value went in: a quote proves it, or the operator applied it                      | Keep, Restore                 |
| Proposed by the AI (with a dot) | The value waits: no quote proves it, it would replace a value, or the field is hidden | Apply, Ignore                 |
| Several candidates              | Several records match the name the AI wrote                                           | One button per record, Ignore |
| To set by hand                  | No record matches, or the field converts its value                                    | Ignore                        |
| Discarded                       | The value broke a rule of the field and never went in                                 | Ignore                        |

**Next to check**, in the banner, takes the operator to each mark that waits, one after the other, in the order of the form (the body's fields, then the sidebar's): the tab, the group or the list item that holds the field opens, the field scrolls to the middle of the screen and takes the focus. The button counts the marks that wait, and from the last one it starts again from the first.

Keep makes a value the operator's, and so does a change in its field: its mark goes, and Undo all leaves it. Restore puts back what the field held. Ignore takes the mark away and leaves the field as it is.

**A session per record.** A second extraction, of a file after a text, joins the first: the first one's marks stay, a field changes only where the new answer gives it a new value, and Undo all puts back every extraction's values, newest first, then ends the session. The same value in a later extraction does not bring back a mark the operator decided, nor a value they restored or ignored. When an extraction finds nothing new, the banner says so and keeps the summary of the earlier ones; a refusal, or an answer that cannot be read, shows its message beside that summary, with Undo all.

**The session in the draft.** On a page that keeps drafts (`draft` or `draftKey` of `MapoDetail`, [Detail page](/uikit/detail#how-to-enable-draft-auto-save)), the session goes into the draft with the record's values, while Magic Fill is on the page. After a reload, Restore in the draft's banner brings back the values, the marks with their quotes, the summary with the model that answered, and Undo all; Discard drops them with the values. The draft keeps, for each field, the AI's value with its quotes and what became of it, and what Restore and Undo all would put back; and for each answer, the provider and the model that gave it, and when. Never the text, the files or the instructions. The quotes are pieces of the source, kept in clear in the browser's storage, under the user, for 24 hours at most, and gone on Save. A field the form no longer has is left out, and a draft restored while a call runs takes its place. When the form's fields come from the record's description, the session comes back once `OPTIONS` answers. Without drafts, a reload loses the session, as it loses the values.

### The preview

Below the summary, the banner lists the values that wait for the operator, in three groups, each value with a tick:

- **To fill**: values for empty fields that a quote of the source does not prove, or for a field the form hides. Ticked from the start, but a hidden field cannot be ticked: the operator would not see its value go in. A related record shows by its name; one found under another name than the AI's waits unticked, with both names ([Related records](/modules/ai#related-records)), and the records still to pick are named too.
- **To replace**: values that would take the place of what their field holds, shown before and after, with the words of the source that prove them or a note that none does. Never ticked from the start: a value of the record changes only when the operator ticks it. A value that goes into every language, as a `synci18n` field's, shows before it each other language's value it would replace.
- **Proposals without proof**: values the AI gave for empty fields without quoting the source at all, which mark no field. Never ticked from the start.

Apply selected writes the ticked values, as Apply on each field does: each gets its mark, with Keep and Restore, and Undo all puts it back. A value whose field another field's `onChange` filled meanwhile is not written: it waits again, as a replacement, unticked. The values left unticked keep waiting, in the preview and on their fields, until the operator applies them, ignores them or saves; Ignore all ignores every value that waits, and the values in the form stay. On its field, the mark of a value that waits has Apply too, and the mark of a replacement says what it would replace.

A list of items, as a repeater's, is chosen item by item. The preview lists each item under the list, with its template's label and its first values, and says whether a quote proves it or the field holds it already. The chosen items go after the items the field holds, which never change or go, whatever the AI does not fill in them, as an image; an item the field holds already, with every value the AI gives at any depth, is never added again, nor an item the AI gives twice. Ticked from the start are the verified items whose related records were all found with the AI's names: no quote proves a template, so a block of a list with templates waits for the operator's tick, and so does an item with a record to pick, which says so. The list's own tick ticks or unticks all its items. Apply selected uses the list's proposal: the items left unticked go with it, and Restore on the list takes the added items back and brings the proposal back. The mark of a list that waits says how many items it proposes, how many are verified and how many the field holds already, and its Apply adds only the verified items the field does not hold; with none, it has no Apply and says to choose them. Once applied, the mark counts the items the AI added, and quotes the source when every one of them is verified. A list whose every item the field holds counts as already in the record. A list never waits in To replace, even on a field that holds items: it replaces nothing, and shows what the field holds as its before. A list of single values, as tags, goes in whole.

A list of related records, as an `m2m` field's, joins the field's own as a list of items does: the preview names the records it would add, and says how many of the AI's the field holds already.

A value the record already holds, the same data the AI gives, is no replacement: nothing waits for it, no mark appears, and the summary counts it as already in the record. An extraction that gives nothing else found nothing new, and the banner says so.

### Save

The detail's own Save saves the record: the AI never saves. Save ends the session: a call under way stops, the marks go, and the values stay in the record.

## 3. Prepare the fields

The AI reads each field as the form and the backend describe it: its label, its help text, its choices with their labels, its limits (required, length, patterns, numbers' steps) and, for a relation, its records. Write labels and help texts as you would for a new colleague: they are what the model knows of the field.

- **Guide a field** with `ai` on its descriptor: `hint` tells the model what to take and how, `exclude: true` keeps the field from the AI. The backend's schema says the same with `x-mapo-ai` → [Guide a field](/modules/ai#guide-a-field).
- **Fields the AI never fills**: a password, a read-only value, a media or a file, a key named like a secret, a token or credentials, a word of secrets of the app or the admins ([Send the record and the source](/modules/ai#send-the-record-and-the-source)). "What I send to the AI" lists them, with why.
- **Related records**, the `fks` and `m2m` fields with an `endpoint`: up to 50 records go to the AI as a list it picks from; with more, the AI writes a name, which is searched with `?search=` after the answer. For records whose names must not reach the provider, as people listed by their email, give the field `ai: { list: false }`: it is always searched → [Related records](/modules/ai#related-records).
- **Lists**, as a repeater's: the AI fills the items' fields, per template when the items vary, and the operator chooses the items one by one.

```ts
const fields: FieldDescriptor<Article>[] = [
  { key: "title", type: "text", label: "Title", required: true },
  {
    key: "summary",
    type: "textarea",
    label: "Summary",
    ai: { hint: "Two sentences at most, in the source's words." },
  },
  { key: "internal_notes", type: "textarea", ai: { exclude: true } },
  {
    key: "reviewer",
    type: "fks",
    label: "Reviewer",
    attrs: { endpoint: "/api/people/", itemText: "email" },
    ai: { list: false },
  },
];
```

## 4. Turn it off

| Where          | How                                                                    |
| -------------- | ---------------------------------------------------------------------- |
| The whole app  | `magicFill: false` in `mapo.ai`                                        |
| A page         | `definePageMeta({ magicFill: false })`                                 |
| A `MapoDetail` | The `extensions` prop, listing the keys it shows: not Magic Fill's two |

The two parts are [detail extensions](/uikit/detail#how-to-add-an-action-to-every-detail-page) that a plugin the module adds to the app registers: the button, `mapo-ai-magic-fill` in `actions`, and the banner, `mapo-ai-magic-fill-summary` in `body-top`. A page that registers an AI panel of its own, as the pages of the reference app's AI lab do, lists its own key in `extensions`, or the detail shows both.

### Ask for no quotes

```ts
definePageMeta({ magicFill: { evidence: false } });
```

On such a page Magic Fill asks the AI for no quotes of the source, as `evidence: false` of [the body of run](/modules/ai#send-the-record-and-the-source) does: for a record whose values the source does not write word for word, such as a summary of a long text. No value is then verified, so none goes in by itself: each waits on its field, whose mark says that the page asks for no quotes, and in the preview's To fill or To replace; none is a proposal without proof. As for any value no quote proves, those for empty fields are ticked from the start: Apply selected writes them, each with its mark.

## 5. When something goes wrong

The banner says what happened in words the operator can act on, from the `mapo.ai.errors.*` messages:

| The banner says                                                 | Why                                                                             | What to do                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| No key lets you call this model now                             | The key the user had was taken away while the page was open                     | Choose another model, or ask an administrator         |
| This model is no longer given to you                            | An administrator or the app no longer gives the user that provider or model     | Choose another one                                    |
| No AI model can be called now                                   | No provider is enabled                                                          | Ask an administrator                                  |
| You cannot use the AI here                                      | The app does not let the user use the AI, or they may not change the record     | Ask an administrator                                  |
| Too many requests to the AI: try again in … seconds             | The user's calls of the last minute reached `perUserPerMinute`                  | Wait                                                  |
| The AI is busy: try again in … seconds                          | The provider is rate-limited                                                    | Wait                                                  |
| The text is longer than the AI accepts                          | The source or the instructions exceed what the gateway takes (`maxSourceChars`) | Send less                                             |
| The text, with this form, is too long for the AI model          | The source and the form's fields exceed what the model reads                    | A shorter text, or a model that reads more            |
| The AI's answer was too long and got cut off                    | The answer reached the most the model may write                                 | A shorter text, or another model                      |
| The AI provider refused this request                            | The key, the account's credit or the provider's rules do not allow it           | Another model, or an administrator checks the key     |
| The AI declined: …                                              | The model refused, and says why                                                 | Read its reason                                       |
| The AI did not answer properly, or its answer could not be read | The provider failed, or wrote what the gateway cannot read                      | Try again                                             |
| The AI took too long to answer                                  | The provider's `timeout` passed                                                 | Try again; a model on the app's own servers is slower |
| The server could not be reached                                 | The network                                                                     | Check the connection                                  |
| The AI has nothing to fill in this form                         | Every field is kept from the AI                                                 | Check the fields' `ai` and the words of secrets       |

When the gateway refuses because of a key or a model, Magic Fill asks again what the user may call, so the panel offers the models they have now. A file that cannot be read says why on its own line in the panel: a format the gateway does not read, a file larger than the server takes, or a text longer than the AI takes.

## 6. Limits

- **The source**: `maxSourceChars` characters (100,000 by default), the text and the files together; `maxInstructionsChars` for the instructions (2,000); `maxFileBytes` per file (10 MB). The formats are text, Markdown, JSON, HTML, CSV and XLSX; PDF and images are not read yet. → [Limits](/modules/ai#limits)
- **The calls**: `perUserPerMinute` per user (20).
- **Related records**: a relation goes to the AI as a list up to 50 records; an answer searches 25 names at most, four at a time.
- **Time**: a large form makes a long answer, and a model on the app's own servers can take minutes. The banner says so, and Cancel stops the call.
- **What the AI cannot know**: what the source does not say. A value no quote proves always waits for the operator.

## 7. Accessibility

- **Next to check** goes through the marks that wait without the mouse: the button is in the tab order of the banner, and each press puts the focus on the next field, its tab or item opened. It has no keyboard shortcut: one would clash with what the operator types in the fields.
- **The marks** are buttons named by their label ("Filled by the AI", "Proposed by the AI"…): color is never the only signal.
- **The banner** announces where a call is and the summary to screen readers (`aria-live`).
- **Reduced motion**: when the operator's system asks for it, the spinners of Magic Fill stand still, and the scroll to a field is not animated.

## 8. Customize it

The components are registered by name, so an app replaces one with a file of the same name in `app/mapooverride/` ([MapoOverride](/uikit/mapoverride)): `MapoAiMagicFillAction`, `MapoAiMagicFillBanner`, `MapoAiMagicFillPanel` and `MapoAiMagicFillPreview`, each with the prop `detail`, the detail's context. A part of your own says which part it is with `useMapoAiMagicFill(detail, { part: "action" })` (or `banner`, `panel`), so the others know it is there: beside a button of your own that says so, the banner shows no button of its own. Their state is `useMapoAiMagicFill(detail)`, auto-imported: one state per detail, which the parts share, with the source, the files, the instructions, the model, where the call is, `extract()`, `cancel()`, `undoAll()`, `loadPreview()`, `nextToCheck()` and the summary. `useMapoAiStatus()` gives what `status` answers, read once per app and asked again on every detail page. Labels come from the `mapo.ai.magicFill.*` messages of `@mapomodule/i18n`, in English and Italian.

Underneath, Magic Fill runs [`useMapoAiFill()`](/modules/ai#fill-a-detail-form), which a detail extension of your own can use alone.
