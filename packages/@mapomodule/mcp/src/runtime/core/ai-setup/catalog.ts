/**
 * What `@mapomodule/ai` offers, as `mapo_ai_setup` tells a developer: the
 * topics they may turn on, each pointing at the page and the section that
 * document it, and the needs they may bring, each with what the module
 * answers today.
 *
 * The docs stay the source: a topic made from a recipe reads its task from
 * `recipes.ts`, every other topic names a page and a heading of the docs,
 * and `knowledge.test.ts` checks them all against the real knowledge base.
 * A need says what the module does about it and points at those topics, so
 * a renamed page or heading fails the tests instead of a developer.
 */
import { RECIPES } from "../recipes.js";

/** The groups the catalog lists its topics in. */
export const AI_AREAS = [
  "Magic Fill",
  "Filling from code",
  "Sources",
  "Providers and models",
  "Keys and tokens",
  "People and rules",
  "Costs and limits",
  "Production",
] as const;

export type AiArea = (typeof AI_AREAS)[number];

/** Something the module does, and where the docs explain it. */
export interface AiTopic {
  id: string;
  area: AiArea;
  /** What it lets an app do, in one line. */
  title: string;
  /** Docs path, relative to the docs root. */
  doc: string;
  /** The section of `doc`, as its heading reads. */
  heading?: string;
}

/** A topic made from an AI recipe: its task, page and section. */
function fromRecipe(id: string, area: AiArea): AiTopic {
  const recipe = RECIPES.find((one) => one.id === id);
  if (!recipe) throw new Error(`No recipe "${id}" for the AI catalog`);
  return {
    id,
    area,
    title: recipe.task,
    doc: recipe.doc,
    ...(recipe.heading ? { heading: recipe.heading } : {}),
  };
}

const AI_DOC = "modules/ai.md";
const MAGIC_FILL_DOC = "howto/magic-fill.md";

export const AI_TOPICS: AiTopic[] = [
  fromRecipe("ai-magic-fill", "Magic Fill"),
  {
    id: "prepare-fields",
    area: "Magic Fill",
    title:
      "Prepare the fields: a hint for the model, a field kept from the AI, a relation never listed",
    doc: MAGIC_FILL_DOC,
    heading: "3. Prepare the fields",
  },
  {
    id: "turn-off",
    area: "Magic Fill",
    title: "Turn Magic Fill off on a page, or in the whole app",
    doc: MAGIC_FILL_DOC,
    heading: "4. Turn it off",
  },
  {
    id: "no-quotes",
    area: "Magic Fill",
    title: "Ask the AI for no quotes on a page: every value then waits",
    doc: MAGIC_FILL_DOC,
    heading: "Ask for no quotes",
  },
  {
    id: "errors",
    area: "Magic Fill",
    title: "What each error means, and what the operator does about it",
    doc: MAGIC_FILL_DOC,
    heading: "5. When something goes wrong",
  },
  {
    id: "accessibility",
    area: "Magic Fill",
    title: "Keyboard, screen readers and reduced motion",
    doc: MAGIC_FILL_DOC,
    heading: "7. Accessibility",
  },
  {
    id: "customize",
    area: "Magic Fill",
    title: "Replace a part of Magic Fill, or build a panel of your own",
    doc: MAGIC_FILL_DOC,
    heading: "8. Customize it",
  },
  fromRecipe("ai-fill", "Filling from code"),
  fromRecipe("ai-run", "Filling from code"),
  fromRecipe("ai-field-options", "Filling from code"),
  {
    id: "related-records",
    area: "Filling from code",
    title:
      "Find related records: a few listed for the AI, the others searched by name",
    doc: AI_DOC,
    heading: "Related records",
  },
  fromRecipe("ai-read-files", "Sources"),
  fromRecipe("ai-readers", "Sources"),
  fromRecipe("ai-providers", "Providers and models"),
  {
    id: "mock",
    area: "Providers and models",
    title: "Develop and test with the mock: no key, no network, no cost",
    doc: AI_DOC,
    heading: "The mock",
  },
  fromRecipe("ai-cloud-models", "Providers and models"),
  fromRecipe("ai-local-models", "Providers and models"),
  {
    id: "own-provider",
    area: "Providers and models",
    title: "Call another AI service, with a provider of the app's own",
    doc: AI_DOC,
    heading: "Your own provider",
  },
  fromRecipe("ai-keys", "Keys and tokens"),
  {
    id: "personal-tokens",
    area: "Keys and tokens",
    title: "Let users save their own token, where an assignment allows it",
    doc: AI_DOC,
    heading: "Personal tokens",
  },
  {
    id: "secret",
    area: "Keys and tokens",
    title: "Seal the keys, tokens and settings with NUXT_MAPO_AI_SECRET",
    doc: AI_DOC,
    heading: "Set the secret",
  },
  {
    id: "restrict-users",
    area: "People and rules",
    title:
      "Choose who may use the AI: groups, permissions, or a rule of the backend",
    doc: AI_DOC,
    heading: "Restrict who uses the AI",
  },
  {
    id: "admins",
    area: "People and rules",
    title: "Choose who administers the AI",
    doc: AI_DOC,
    heading: "Admins",
  },
  {
    id: "app-rules",
    area: "People and rules",
    title: "Give the AI the app's rules, in every prompt or by entity",
    doc: AI_DOC,
    heading: "Add the app's rules",
  },
  fromRecipe("ai-settings", "People and rules"),
  fromRecipe("ai-admin-settings", "People and rules"),
  {
    id: "verification",
    area: "People and rules",
    title: "Decide what a quote must hold for a value to count as verified",
    doc: AI_DOC,
    heading: "Verification",
  },
  fromRecipe("ai-usage", "Costs and limits"),
  {
    id: "limits",
    area: "Costs and limits",
    title:
      "Limit the calls per user and minute, the source's length and the files' size",
    doc: AI_DOC,
    heading: "Limits",
  },
  {
    id: "prompt-cache",
    area: "Costs and limits",
    title: "Pay less for the part of the prompt that repeats, with the cache",
    doc: AI_DOC,
    heading: "The prompt cache",
  },
  {
    id: "enable",
    area: "Production",
    title: "Turn the module on with `mapo.ai`",
    doc: AI_DOC,
    heading: "Enable the module",
  },
  {
    id: "storage",
    area: "Production",
    title:
      "Keep the AI's sealed state: one disk, a shared store for several instances",
    doc: AI_DOC,
    heading: "Where the state is kept",
  },
  {
    id: "audit",
    area: "Production",
    title: "An audit of every call, metadata only, never the source",
    doc: AI_DOC,
    heading: "The audit",
  },
];

/** How the module answers a need. */
export type AiVerdict = "ready" | "app-code" | "not-yet" | "no";

export const AI_VERDICTS: Record<AiVerdict, string> = {
  ready: "Yes, out of the box",
  "app-code": "Yes, with code of the app",
  "not-yet": "Not yet",
  no: "No",
};

/** The needs a developer may bring, by id: what `wants` takes. */
export const AI_NEED_IDS = [
  "fill-record",
  "extract-records",
  "files",
  "pdf-images",
  "own-format",
  "related-records",
  "private-relations",
  "exclude-fields",
  "hints",
  "translations",
  "lists",
  "review",
  "save-without-review",
  "generate-content",
  "chat",
  "custom-panel",
  "cloud",
  "local-only",
  "own-provider",
  "team-keys",
  "personal-tokens",
  "costs",
  "limits",
  "restrict-users",
  "app-rules",
  "admin-settings",
  "audit",
] as const;

export type AiNeedId = (typeof AI_NEED_IDS)[number];

/** A need, and what the module answers about it. */
export interface AiNeed {
  id: AiNeedId;
  /** The need, as a developer puts it. */
  need: string;
  verdict: AiVerdict;
  /** How the module meets it, or why it does not. */
  how: string;
  /** The topics that document it. */
  topics: string[];
}

export const AI_NEEDS: AiNeed[] = [
  {
    id: "fill-record",
    need: "Fill the record an operator is editing from a text or files",
    verdict: "ready",
    how: "Magic Fill, on every `MapoDetail` of an app with uikit: a button in the sidebar card, a panel for the source, a banner that previews every value. A value goes into an empty field by itself only when a quote of the source proves it; every other value waits for the operator.",
    topics: ["ai-magic-fill", "ai-fill"],
  },
  {
    id: "extract-records",
    need: "Create several records from one source, such as a programme or a sheet",
    verdict: "app-code",
    how: 'A page of the app calls `POST /_mapo/ai/run` with `task: "extract"` and the fields from `mapoAiFieldsSchema(fields)`, shows what came back, and creates the records the operator ticks and confirms. Mapo has no import page of its own yet: Import AI is planned.',
    topics: ["ai-run", "ai-field-options"],
  },
  {
    id: "files",
    need: "Start from web pages, Markdown, CSV, Excel or JSON files",
    verdict: "ready",
    how: "The gateway's `read` turns a file into text with Mapo's readers; Magic Fill's panel takes files, and `useMapoAiRead()` does it in a component of the app.",
    topics: ["ai-read-files"],
  },
  {
    id: "pdf-images",
    need: "Start from PDFs, scans or images",
    verdict: "not-yet",
    how: "Mapo does not read them yet. Meanwhile a reader of the app (`registerMapoAiReader()`) can turn them into text with a library the app installs: the AI takes text only.",
    topics: ["ai-readers"],
  },
  {
    id: "own-format",
    need: "Start from a format of the app's own, such as a calendar or an export",
    verdict: "app-code",
    how: "`registerMapoAiReader()` in a Nitro plugin adds a format, or replaces one of Mapo's; the `mapo-ai:read` hook touches up what any reader read, and `mapo.ai.readers` turns a format off.",
    topics: ["ai-readers"],
  },
  {
    id: "related-records",
    need: "Pick related records: categories, tags, authors",
    verdict: "ready",
    how: "A relation with up to 50 records is listed for the AI, which picks one; a larger one is searched by the name the AI writes, with the endpoint's `?search=`. Several matches wait on the field's mark, with candidates to pick.",
    topics: ["related-records"],
  },
  {
    id: "private-relations",
    need: "Keep the names of related records, such as people's emails, from the provider",
    verdict: "ready",
    how: "`ai: { list: false }` on the field: its records are never listed for the AI, which writes what it reads; Magic Fill searches it afterwards, in the browser.",
    topics: ["ai-field-options", "prepare-fields"],
  },
  {
    id: "exclude-fields",
    need: "Keep some fields away from the AI",
    verdict: "ready",
    how: "`ai: { exclude: true }` on the field, or `x-mapo-ai` in the backend's schema. Fields named as secrets (Mapo's words, `mapo.ai.secretWords`, the admins' own), read-only fields and media are left out by themselves.",
    topics: ["ai-field-options", "prepare-fields"],
  },
  {
    id: "hints",
    need: "Tell the AI how to fill a field",
    verdict: "ready",
    how: "`ai: { hint }` on the field: the model reads it as the field's description, in the schema of its answer.",
    topics: ["ai-field-options", "prepare-fields"],
  },
  {
    id: "translations",
    need: "Fill the languages of translatable fields",
    verdict: "ready",
    how: "Magic Fill fills the language the form shows; a `synci18n` value goes into every language. Each language is one extraction.",
    topics: ["ai-magic-fill"],
  },
  {
    id: "lists",
    need: "Fill repeaters, blocks and lists of items",
    verdict: "ready",
    how: "The items the AI finds are ticked one by one in the preview, and go after the record's own; an item the record holds is never added twice.",
    topics: ["ai-magic-fill"],
  },
  {
    id: "review",
    need: "Let the operator check every value before saving",
    verdict: "ready",
    how: "By design: each value shows the words of the source that prove it; a value without proof, or one that would replace the record's, waits for the operator's tick. Undo all puts the form back, and nothing is saved until Save.",
    topics: ["ai-magic-fill"],
  },
  {
    id: "save-without-review",
    need: "Save the AI's values without an operator",
    verdict: "no",
    how: "By design: the gateway never writes to the backend, and Magic Fill fills the form, never saves it. An app that creates records from an extraction does it after the operator confirms.",
    topics: ["ai-magic-fill"],
  },
  {
    id: "generate-content",
    need: "Write content the source does not hold, such as copy or SEO texts from nothing",
    verdict: "no",
    how: "Magic Fill takes values from a source: a value no quote proves waits as a proposal without proof, never goes in by itself. Writing new text is not its job.",
    topics: ["verification"],
  },
  {
    id: "chat",
    need: "A conversational assistant, or an agent that acts in the backoffice",
    verdict: "no",
    how: "The module fills forms from sources; it has no chat and no agent.",
    topics: ["ai-magic-fill"],
  },
  {
    id: "custom-panel",
    need: "A panel or a flow of the app's own",
    verdict: "app-code",
    how: "`useMapoAiFill()` and `useMapoAiRead()` in a detail extension do what Magic Fill does, with the app's interface; or one part of Magic Fill is replaced with MapoOverride.",
    topics: ["customize", "ai-fill"],
  },
  {
    id: "cloud",
    need: "Use OpenAI or Anthropic (Claude) models",
    verdict: "ready",
    how: "The `openai` and `anthropic` providers, with a key in the server's environment or assigned by the AI's admins.",
    topics: ["ai-cloud-models"],
  },
  {
    id: "local-only",
    need: "Keep every source on the company's own servers",
    verdict: "ready",
    how: "The `ollama` and `openai-compatible` providers call models on the app's own servers (Ollama, LM Studio, vLLM, llama.cpp), at the address the app sets; no key, no cost per token.",
    topics: ["ai-local-models"],
  },
  {
    id: "own-provider",
    need: "Use another AI service",
    verdict: "app-code",
    how: "`registerMapoAiProvider()` in a Nitro plugin, enabled in `mapo.ai.providers`; its key comes from the environment like Mapo's providers.",
    topics: ["own-provider", "ai-providers"],
  },
  {
    id: "team-keys",
    need: "Give teams their own keys and models",
    verdict: "ready",
    how: "On the AI settings page the AI's admins assign a key and the models to everyone, a group or a user, in an order of the groups; no deploy, and the keys are sealed in the storage.",
    topics: ["ai-keys", "ai-settings"],
  },
  {
    id: "personal-tokens",
    need: "Let operators bring their own key",
    verdict: "ready",
    how: "An assignment of the admins allows personal tokens; each user saves theirs on the AI settings page, and their calls use it first.",
    topics: ["personal-tokens", "ai-keys"],
  },
  {
    id: "costs",
    need: "Know how much the AI is used and what it costs",
    verdict: "ready",
    how: "The usage, read from the audit, by user, model and day, in tokens, and in money where `mapo.ai.prices` prices the models. The admins read everyone's, each user their own.",
    topics: ["ai-usage"],
  },
  {
    id: "limits",
    need: "Cap how much a user can call the AI",
    verdict: "ready",
    how: "`mapo.ai.limits`: calls per user and minute (counted by each server process), the source's characters, the files' bytes. There is no spending cap per month yet.",
    topics: ["limits"],
  },
  {
    id: "restrict-users",
    need: "Choose who may use the AI",
    verdict: "ready",
    how: "`mapo.ai.users` by groups or permissions; the `mapo-ai:user` hook for a rule of the backend, such as internal accounts only.",
    topics: ["restrict-users"],
  },
  {
    id: "app-rules",
    need: "Rules the AI follows in every prompt",
    verdict: "ready",
    how: "`mapo.ai.instructions` (for every task, for fill, for extract), the `mapo-ai:prompt` hook for rules by entity or user, and the admins' instructions on the AI settings page.",
    topics: ["app-rules", "ai-admin-settings"],
  },
  {
    id: "admin-settings",
    need: "Change how the AI works without a deploy",
    verdict: "ready",
    how: "The AI's admins change the instructions, the rules of verification, the secret words, the prompt cache, Anthropic's fallbacks and the models added, within what the app allows.",
    topics: ["ai-admin-settings"],
  },
  {
    id: "audit",
    need: "Know who called the AI, and when",
    verdict: "ready",
    how: "Every call is audited in the sealed storage: who, which model, the tokens, the outcome; never the source, the instructions or the values.",
    topics: ["audit"],
  },
];

/** The topic of an id, or `undefined`. */
export function aiTopic(id: string): AiTopic | undefined {
  return AI_TOPICS.find((topic) => topic.id === id);
}

/** Where a topic is documented, as `mapo_get_doc` takes it. */
export function topicLink(topic: AiTopic): string {
  return topic.heading
    ? `\`${topic.doc}\` › ${topic.heading}`
    : `\`${topic.doc}\``;
}
