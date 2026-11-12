/**
 * The interview of `mapo_ai_setup`: what to ask a developer before turning
 * the AI on, in three rounds of three questions. Each question says why it
 * matters and which argument of the tool its answer fills, so the assistant
 * can call the tool again with the answers and get the plan.
 */

/** An answer a question offers. */
export interface AiQuestionOption {
  label: string;
  /** What it means, and what it costs or brings. */
  detail: string;
  /** The value to pass, in the argument the question fills. */
  pass: string;
  recommended?: boolean;
}

export interface AiQuestion {
  id: string;
  round: 1 | 2 | 3;
  question: string;
  /** Why the answer matters. */
  why: string;
  /** The arguments of `mapo_ai_setup` the answer fills. */
  fills: string[];
  options: AiQuestionOption[];
  /** More than one option may apply. */
  several?: boolean;
}

export const AI_ROUNDS: Record<AiQuestion["round"], string> = {
  1: "What the AI is for",
  2: "Models, keys and people",
  3: "Tokens, forms and production",
};

export const AI_QUESTIONS: AiQuestion[] = [
  {
    id: "task",
    round: 1,
    question: "What should the AI do for the operators?",
    why: "It decides between Magic Fill, which works out of the box, and a page of the app that calls the gateway.",
    fills: ["need", "wants"],
    options: [
      {
        label: "Fill the record they are editing",
        detail:
          "From a text or files, on every detail page: Magic Fill. The operator checks every value before saving.",
        pass: 'wants: ["fill-record"]',
        recommended: true,
      },
      {
        label: "Create several records from one source",
        detail:
          'A programme, a sheet: a page of the app calls `run` with `task: "extract"`. Mapo has no import page of its own yet.',
        pass: 'wants: ["extract-records"]',
      },
      {
        label: "Something else",
        detail:
          "Write the need in `need`, and map it to the needs of the catalog (`wants`): the plan says what the module can and cannot do.",
        pass: "need: <their words>",
      },
    ],
    several: true,
  },
  {
    id: "sources",
    round: 1,
    question: "What do the operators start from?",
    why: "The gateway reads text formats today; PDFs and images are not read yet.",
    fills: ["wants", "ownFormat"],
    options: [
      {
        label: "Texts, web pages, Markdown, CSV, Excel, JSON",
        detail:
          "Mapo reads them all: pasted, attached or given as links in Magic Fill's panel.",
        pass: 'wants: ["files", "links"]',
        recommended: true,
      },
      {
        label: "PDFs, scans or images",
        detail:
          "Not yet in Mapo. A reader of the app can turn them into text meanwhile, with a library the app installs.",
        pass: 'wants: ["pdf-images"]',
      },
      {
        label: "A format of the app's own",
        detail:
          "A calendar, an export: a reader of the app, in a Nitro plugin. Give its file extension.",
        pass: 'wants: ["own-format"], ownFormat: "ics"',
      },
    ],
    several: true,
  },
  {
    id: "data",
    round: 1,
    question: "May the records and their sources go to a cloud provider?",
    why: "A cloud model sees what the operator sends; a model on the company's servers keeps it inside. Ask whoever answers for the data, not only the developer.",
    fills: ["dataMayLeave"],
    options: [
      {
        label: "Yes, to a provider we have a contract with",
        detail: "OpenAI or Anthropic, with the region the contract gives.",
        pass: "dataMayLeave: true",
      },
      {
        label: "No, they stay on our servers",
        detail:
          "Ollama, or a server that speaks OpenAI's API (LM Studio, vLLM, llama.cpp), at an address of the app's network. No key, no cost per token; the hardware decides the speed.",
        pass: "dataMayLeave: false",
      },
      {
        label: "Not sure yet",
        detail:
          "Start with the mock in development, which sends nothing anywhere, and decide before production.",
        pass: 'providers: ["mock"]',
      },
    ],
  },
  {
    id: "providers",
    round: 2,
    question: "Which models?",
    why: "Each provider is enabled in `mapo.ai.providers`; the operators pick among the models it lists, within what the admins give them.",
    fills: ["providers"],
    options: [
      {
        label: "OpenAI or Anthropic",
        detail:
          "The best extraction; costs per token. Their efficient models are enough for most forms.",
        pass: 'providers: ["openai"] or ["anthropic"], or both',
        recommended: true,
      },
      {
        label: "Ollama or an OpenAI-compatible server",
        detail:
          "Models on the company's servers: free per token, slower on modest hardware, weaker on large forms.",
        pass: 'providers: ["ollama"] or ["openai-compatible"]',
      },
      {
        label: "Another AI service",
        detail: "A provider of the app's own, registered in a Nitro plugin.",
        pass: 'providers: ["own"]',
      },
    ],
    several: true,
  },
  {
    id: "keys",
    round: 2,
    question: "Who holds the keys, and who pays for the tokens?",
    why: "A call uses the key nearest its user: their own token where allowed, else the admins' assignment to them, their group or everyone, else the project's key.",
    fills: ["keys"],
    options: [
      {
        label: "One project key",
        detail:
          "In the server's environment, never in `nuxt.config.ts`. The simplest start: one bill.",
        pass: 'keys: ["project"]',
        recommended: true,
      },
      {
        label: "Keys per team, assigned by the AI's admins",
        detail:
          "On the AI settings page, without a deploy: a key and the models for everyone, a group or a user.",
        pass: 'keys: ["assigned"]',
      },
      {
        label: "Each operator's own token",
        detail:
          "Allowed by an assignment; each user saves theirs on the AI settings page and pays for their calls.",
        pass: 'keys: ["personal"]',
      },
    ],
    several: true,
  },
  {
    id: "people",
    round: 2,
    question: "Who may use the AI, and who administers it?",
    why: "The gateway asks the backend who is signed in; a rule that cannot be read lets fewer users in, never more.",
    fills: ["userGroups", "userPermissions", "allowedFlag", "adminGroups"],
    options: [
      {
        label: "Every signed-in user; superusers administer",
        detail: "The defaults: nothing to configure.",
        pass: "",
        recommended: true,
      },
      {
        label: "Some groups or permissions",
        detail:
          "`mapo.ai.users` and `mapo.ai.admin`, by the groups or permissions the backend gives.",
        pass: 'userGroups: ["editors"], adminGroups: ["ai-admins"]',
      },
      {
        label: "A rule of the backend",
        detail:
          "Such as internal accounts only: a field of the user the backend returns, checked by a `mapo-ai:user` hook.",
        pass: 'allowedFlag: "is_internal"',
      },
    ],
    several: true,
  },
  {
    id: "tokens",
    round: 3,
    question: "How do you keep the tokens and their cost in check?",
    why: "Every call is audited with its tokens; a price per model turns them into money. The form's size, the source's length and the model decide what a call costs.",
    fills: ["costs", "perUserPerMinute"],
    options: [
      {
        label: "Watch the usage, with costs",
        detail:
          "The usage by user, model and day on the AI settings page, in money once `mapo.ai.prices` prices the models.",
        pass: "costs: true",
        recommended: true,
      },
      {
        label: "Also cap the calls per user",
        detail:
          "`mapo.ai.limits.perUserPerMinute`, 20 by default, counted by each server process.",
        pass: "perUserPerMinute: 10",
      },
      {
        label: "Tokens only",
        detail: "The usage in tokens, without prices.",
        pass: "costs: false",
      },
    ],
    several: true,
  },
  {
    id: "forms",
    round: 3,
    question: "Where does Magic Fill show, and what must the AI never see?",
    why: "Magic Fill is on every detail page by default. Fields named as secrets, read-only fields and media never reach the AI; others are kept out with `ai: { exclude: true }`. Rules the AI must always follow, such as the city or the tone, go in `instructions`.",
    fills: ["magicFill", "instructions", "wants"],
    options: [
      {
        label: "On every detail page",
        detail:
          "Nothing to configure; a field's `ai` option keeps it out, guides the model or keeps a relation's names from the provider.",
        pass: 'magicFill: "every-page"',
        recommended: true,
      },
      {
        label: "Not on some pages",
        detail: "`definePageMeta({ magicFill: false })` on those pages.",
        pass: 'magicFill: "some-pages"',
      },
      {
        label: "A panel of our own instead",
        detail:
          "`mapo.ai.magicFill: false`, and `useMapoAiFill()` in a detail extension of the app.",
        pass: 'magicFill: "own-panel"',
      },
    ],
  },
  {
    id: "deploy",
    round: 3,
    question: "Where does the server run in production?",
    why: "The keys, tokens, settings and audit are sealed in the Nitro storage `mapo-ai`: they need a place that lasts, shared by every instance, and the same secret everywhere.",
    fills: ["deploy"],
    options: [
      {
        label: "One Node server with a lasting disk",
        detail:
          "The module's default: `.data/mapo-ai` on the server; a persistent volume in a container.",
        pass: 'deploy: "single-node"',
        recommended: true,
      },
      {
        label: "Several instances or containers",
        detail:
          "One shared store, such as Redis, and the same secret on all of them.",
        pass: 'deploy: "several-instances"',
      },
      {
        label: "Serverless or edge",
        detail:
          "A function's file system does not last: mount a driver, Redis on functions that run Node, one that works over HTTP (Upstash, Cloudflare KV) on an edge runtime.",
        pass: 'deploy: "serverless"',
      },
    ],
  },
];
