/**
 * What `mapo_ai_setup` answers: the interview, while the developer's answers
 * are missing, and the plan, once they are given. Both are markdown, as
 * every tool of the server returns. The plan proposes the configuration and
 * the files; it never holds a key, and only the tool writes the files, when
 * asked (`write: true`).
 */
import type { MapoAppManifest } from "../../../index.js";
import type { WriteRequest } from "../write.js";
import {
  AI_AREAS,
  AI_NEEDS,
  AI_TOPICS,
  AI_VERDICTS,
  aiTopic,
  topicLink,
} from "./catalog.js";
import type { AiNeedId } from "./catalog.js";
import { AI_QUESTIONS, AI_ROUNDS } from "./questions.js";
import type { AiQuestion } from "./questions.js";

export const AI_PROVIDER_CHOICES = [
  "openai",
  "anthropic",
  "ollama",
  "openai-compatible",
  "own",
  "mock",
] as const;
export const AI_KEY_CHOICES = ["project", "assigned", "personal"] as const;
export const AI_MAGIC_FILL_CHOICES = [
  "every-page",
  "some-pages",
  "own-panel",
] as const;
export const AI_DEPLOY_CHOICES = [
  "single-node",
  "several-instances",
  "serverless",
] as const;

export type AiProviderChoice = (typeof AI_PROVIDER_CHOICES)[number];
export type AiKeyChoice = (typeof AI_KEY_CHOICES)[number];

/** The developer's answers, as `mapo_ai_setup` takes them. */
export interface AiSetupAnswers {
  need?: string;
  wants?: AiNeedId[];
  dataMayLeave?: boolean;
  providers?: AiProviderChoice[];
  keys?: AiKeyChoice[];
  userGroups?: string[];
  userPermissions?: string[];
  allowedFlag?: string;
  adminGroups?: string[];
  costs?: boolean;
  perUserPerMinute?: number;
  magicFill?: (typeof AI_MAGIC_FILL_CHOICES)[number];
  instructions?: string;
  ownFormat?: string;
  deploy?: (typeof AI_DEPLOY_CHOICES)[number];
}

/** The arguments that answer a question: `need` alone asks the questions. */
const ANSWER_KEYS = [
  "wants",
  "dataMayLeave",
  "providers",
  "keys",
  "userGroups",
  "userPermissions",
  "allowedFlag",
  "adminGroups",
  "costs",
  "perUserPerMinute",
  "magicFill",
  "instructions",
  "ownFormat",
  "deploy",
] as const satisfies readonly (keyof AiSetupAnswers)[];

/** Whether the developer answered anything yet, beyond their need. */
export function hasAiAnswers(answers: AiSetupAnswers): boolean {
  return ANSWER_KEYS.some((key) => {
    const value = answers[key];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim() !== "";
    return value !== undefined;
  });
}

const CLOUD: readonly AiProviderChoice[] = ["openai", "anthropic"];
const LOCAL: readonly AiProviderChoice[] = ["ollama", "openai-compatible"];

/** The environment variable of a provider's project key. */
function keyVariable(provider: string): string {
  const id = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `NUXT_MAPO_AI_PROVIDERS_${id}_API_KEY`;
}

/** The id the plan gives a provider of the app's own. */
const OWN_PROVIDER = "my-ai";

/** A file extension a reader can take: letters and digits. */
const EXTENSION = /^[a-z0-9]{1,16}$/;

/**
 * The extensions and the ids of Mapo's readers (`MAPO_READERS` of
 * `@mapomodule/ai`): a reader of the app for one of them would take the
 * place of Mapo's, so the plan drafts none.
 */
const MAPO_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "json",
  "html",
  "htm",
  "xhtml",
  "csv",
  "tsv",
  "xlsx",
];
const MAPO_READER_IDS = ["text", "markdown", "json", "html", "csv", "xlsx"];
/** The id that turns links off: no reader may take it. */
const LINK_READER_ID = "link";

/** The extension `ownFormat` names, lower case and without its dot. */
function formatOf(answers: AiSetupAnswers): string | undefined {
  const format = answers.ownFormat?.trim().replace(/^\./, "").toLowerCase();
  return format || undefined;
}

/** Whether the plan may draft a reader for an extension. */
function isDraftable(format: string): boolean {
  return EXTENSION.test(format) && !MAPO_EXTENSIONS.includes(format);
}

/**
 * The id of the app's reader: its extension, unless the extension does not
 * start with a letter, as an id must, or is the id of one of Mapo's readers,
 * or `link`, which turns links off.
 */
function readerIdOf(format: string): string {
  const isTaken = MAPO_READER_IDS.includes(format) || format === LINK_READER_ID;
  const isId = /^[a-z]/.test(format) && !isTaken;
  return isId ? format : `format-${format}`;
}

/** A value of the developer's, quoted in markdown: one short line, no backticks. */
function quoted(value: string): string {
  const line = value.replace(/\s+/g, " ").replace(/`/g, "'").trim();
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

/**
 * A field of the backend's user a hook can read: a name the generated code
 * can quote, and that cannot break out of the comment that names it.
 */
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// ─── The app as it is ─────────────────────────────────────────────────────

/** What the running app already has, from its manifest. */
function appNotes(manifest: MapoAppManifest | null): string[] {
  if (!manifest) {
    return [
      "No app is connected. With the dev server running, `mapo_inspect_app` lists the Mapo modules installed, the routes and the order of the modules.",
    ];
  }
  const names = manifest.modules.map((entry) => entry.name);
  const notes = [
    names.includes("@mapomodule/ai")
      ? "`@mapomodule/ai` is installed: `mapo.ai` is set."
      : "`@mapomodule/ai` is not installed yet: setting `mapo.ai` in `nuxt.config.ts` installs it, through the meta-module.",
    names.includes("@mapomodule/uikit")
      ? "uikit is installed: Magic Fill shows on every `MapoDetail` once the module is on."
      : "uikit is not installed: Magic Fill needs it. `useMapoAiFill()` still fills a form in the app's own components.",
  ];
  const hasSettings = manifest.routes.some(
    (route) => route.path === "/ai-settings",
  );
  if (hasSettings)
    notes.push("The AI settings page answers at `/ai-settings`.");
  const ui = manifest.moduleOrder.indexOf("@nuxt/ui");
  const mapo = manifest.moduleOrder.indexOf("mapomodule");
  const isOrdered = ui >= 0 && mapo >= 0 && ui < mapo;
  if (!isOrdered) {
    notes.push(
      "Register `@nuxt/ui` before `mapomodule` in `modules`: `mapo_doctor` checks it.",
    );
  }
  return notes;
}

// ─── The catalog ──────────────────────────────────────────────────────────

/** Every topic, by area, each with where it is documented. */
function catalog(): string {
  const areas = AI_AREAS.map((area) => {
    const lines = AI_TOPICS.filter((topic) => topic.area === area).map(
      (topic) => `- ${topic.title}: ${topicLink(topic)}`,
    );
    return `### ${area}\n\n${lines.join("\n")}`;
  });
  return `${areas.join("\n\n")}\n\nRead any of them with \`mapo_get_doc\`.`;
}

/** The needs the module answers, as `wants` takes them. */
function needsTable(): string {
  const rows = AI_NEEDS.map(
    (need) =>
      `| \`${need.id}\` | ${need.need} | ${AI_VERDICTS[need.verdict]} |`,
  );
  return [
    "| `wants` | The need | The module |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

// ─── The interview ────────────────────────────────────────────────────────

function question(one: AiQuestion, index: number): string {
  const options = one.options.map((option) => {
    const mark = option.recommended ? " (recommended)" : "";
    const pass = option.pass ? `\`${option.pass}\`` : "nothing to pass";
    return `   - **${option.label}**${mark}: ${option.detail} → ${pass}`;
  });
  const several = one.several ? "; several may apply" : "";
  const fills = one.fills.map((name) => `\`${name}\``).join(", ");
  return [
    `${index}. **${one.question}** ${one.why} (fills ${fills}${several})`,
    ...options,
  ].join("\n");
}

function interview(): string {
  const rounds = ([1, 2, 3] as const).map((round) => {
    const lines = AI_QUESTIONS.flatMap((one, index) =>
      one.round === round ? [question(one, index + 1)] : [],
    );
    return `### Round ${round}: ${AI_ROUNDS[round]}\n\n${lines.join("\n")}`;
  });
  return rounds.join("\n\n");
}

/** What `mapo_ai_setup` answers before the developer answered anything. */
export function renderAiSetupQuestions(
  answers: AiSetupAnswers,
  manifest: MapoAppManifest | null,
): string {
  const need = answers.need?.trim();
  const asked = need
    ? `## The need\n\n> ${need.replace(/\n+/g, " ")}\n\nMap it to the needs below (\`wants\`) and ask the questions: the plan then says what the module can do about it.\n\n`
    : "";
  return (
    "# Set up the AI and Magic Fill\n\n" +
    "`@mapomodule/ai` is experimental and opt-in: setting `mapo.ai` in `nuxt.config.ts` installs it. It fills records from a source (a pasted text, a web page, a sheet) through a gateway on the app's server, and the operator checks every value: the AI never saves anything by itself.\n\n" +
    `## This app\n\n${appNotes(manifest)
      .map((note) => `- ${note}`)
      .join("\n")}\n\n` +
    asked +
    "## Questions for the developer\n\n" +
    "Ask one round at a time, at most three questions, the recommended answer first, and wait for the answers. Then call `mapo_ai_setup` again with them: it says whether the module can do what is needed, and gives the configuration, the keys, the files and the checks.\n\n" +
    `${interview()}\n\n` +
    `## What the module can do\n\n${needsTable()}\n\n` +
    `## Everything it offers\n\n${catalog()}\n`
  );
}

// ─── The plan ─────────────────────────────────────────────────────────────

/** Can the module do what the developer needs? */
function fit(answers: AiSetupAnswers): string {
  const wants = [...new Set(answers.wants ?? [])];
  if (!wants.length) {
    return "No need was mapped to `wants` yet: ask the first round, then call again with them.";
  }
  const needs = AI_NEEDS.filter((need) => wants.includes(need.id));
  const rows = needs.map((need) => {
    const docs = need.topics
      .map((topic) => aiTopic(topic))
      .filter((topic) => topic !== undefined)
      .map(topicLink)
      .join("; ");
    return `| ${need.need} | **${AI_VERDICTS[need.verdict]}** | ${need.how} Docs: ${docs} |`;
  });
  return ["| Need | The module | How |", "| --- | --- | --- |", ...rows].join(
    "\n",
  );
}

/** What does not add up in the answers. */
function warnings(
  answers: AiSetupAnswers,
  manifest: MapoAppManifest | null,
): string[] {
  const providers = answers.providers ?? [];
  const keys = answers.keys ?? [];
  const found: string[] = [];
  const cloud = providers.filter((one) => CLOUD.includes(one));
  if (answers.dataMayLeave === false && cloud.length) {
    found.push(
      `The data must stay on the company's servers, but ${cloud.map((one) => `\`${one}\``).join(" and ")} sends it to a cloud: choose \`ollama\` or \`openai-compatible\` instead.`,
    );
  }
  const onlyLocal =
    providers.length > 0 &&
    providers.every((one) => LOCAL.includes(one) || one === "mock");
  if (onlyLocal && keys.some((one) => one !== "project")) {
    found.push(
      "Models on the company's servers need no key: an assignment of the admins still narrows the models each user gets, but personal tokens have nothing to pay for.",
    );
  }
  const names = manifest?.modules.map((entry) => entry.name) ?? [];
  const wantsMagicFill = answers.magicFill !== "own-panel";
  if (manifest && wantsMagicFill && !names.includes("@mapomodule/uikit")) {
    found.push(
      "Magic Fill needs `@mapomodule/uikit`, which this app does not install: build a panel of the app's own with `useMapoAiFill()` instead.",
    );
  }
  const flag = answers.allowedFlag?.trim();
  if (flag && !FIELD_NAME.test(flag)) {
    found.push(
      `\`${quoted(flag)}\` is not a field name (letters, digits and \`_\`): no hook was drafted.`,
    );
  }
  const format = formatOf(answers);
  if (format && !EXTENSION.test(format)) {
    found.push(
      `\`${quoted(answers.ownFormat ?? "")}\` is not a file extension (letters and digits): no reader was drafted.`,
    );
  } else if (format && MAPO_EXTENSIONS.includes(format)) {
    found.push(
      `Mapo reads \`.${format}\` files already: a reader of the app would take the place of Mapo's, so none was drafted. The \`mapo-ai:read\` hook touches up what Mapo's reader reads.`,
    );
  }
  return found;
}

/** The `providers` block, one line per provider. */
function providerLines(providers: readonly AiProviderChoice[]): string[] {
  return providers.map((provider) => {
    switch (provider) {
      case "openai":
        return "        openai: {}, // its default models; `models` narrows them, the default first";
      case "anthropic":
        return "        anthropic: {}, // its default models; `models` narrows them, the default first";
      case "ollama":
        return '        ollama: { models: ["gemma4:12b"] }, // the models you pulled (`ollama list`), the default first';
      case "openai-compatible":
        return '        "openai-compatible": { baseURL: "http://localhost:1234/v1", models: ["qwen3-32b"] }, // your server\'s address and model ids';
      case "own":
        return `        "${OWN_PROVIDER}": {}, // registered with registerMapoAiProvider() in a Nitro plugin`;
      case "mock":
        return "        mock: {}, // development and tests: no key, no network, no cost";
    }
  });
}

/** A list of strings, as TypeScript writes it. */
function list(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

/** The `mapo.ai` block of `nuxt.config.ts`. */
function configBlock(answers: AiSetupAnswers): string {
  const providers = answers.providers ?? [];
  const keys = answers.keys ?? [];
  const lines: string[] = [];
  if (providers.length) {
    lines.push("      providers: {", ...providerLines(providers), "      },");
  } else {
    lines.push(
      "      providers: {}, // none yet: `run` answers 503 until one is enabled",
    );
  }
  const users = [
    ...(answers.userGroups?.length
      ? [`groups: ${list(answers.userGroups)}`]
      : []),
    ...(answers.userPermissions?.length
      ? [`permissions: ${list(answers.userPermissions)}`]
      : []),
  ];
  if (users.length) lines.push(`      users: { ${users.join(", ")} },`);
  if (answers.adminGroups?.length) {
    lines.push(`      admin: { groups: ${list(answers.adminGroups)} },`);
  }
  const rules = answers.instructions?.trim();
  if (rules) {
    lines.push(`      instructions: { all: ${JSON.stringify(rules)} },`);
  }
  if (answers.perUserPerMinute !== undefined) {
    lines.push(
      `      limits: { perUserPerMinute: ${answers.perUserPerMinute} },`,
    );
  }
  const assigns = keys.includes("assigned") || keys.includes("personal");
  if (assigns) {
    lines.push(
      '      settings: { usersApi: "/api/users/", groupsApi: "/api/groups/" }, // adjust: your backend\'s users and groups, which the admins search',
    );
  }
  if (answers.magicFill === "own-panel") {
    lines.push("      magicFill: false, // the app's own panel instead");
  }
  return [
    "```ts",
    "// nuxt.config.ts",
    "export default defineNuxtConfig({",
    '  modules: ["@nuxt/ui", "mapomodule"], // @nuxt/ui first',
    "  mapo: {",
    "    ai: {",
    ...lines,
    "    },",
    "  },",
    "});",
    "```",
  ].join("\n");
}

/** The environment's variables: their names, never a value. */
function environmentBlock(answers: AiSetupAnswers): string {
  const providers = answers.providers ?? [];
  const keys = answers.keys ?? [];
  const lines = [
    "# .env in development, the server's environment in production; never in nuxt.config.ts",
    "NUXT_MAPO_AI_SECRET=        # openssl rand -base64 32: the same on every instance",
  ];
  const projectKeys = keys.length === 0 || keys.includes("project");
  for (const provider of providers) {
    if (CLOUD.includes(provider) && projectKeys) {
      lines.push(`${keyVariable(provider)}=  # the project's key`);
    }
    if (provider === "own") {
      lines.push(
        `${keyVariable(OWN_PROVIDER)}=  # its key, if it declares one`,
      );
    }
  }
  if (providers.includes("ollama")) {
    lines.push(
      "# NUXT_MAPO_AI_PROVIDERS_OLLAMA_BASE_URL=  # when Ollama is not at http://localhost:11434",
    );
  }
  if (providers.includes("openai-compatible")) {
    lines.push(
      "# NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_BASE_URL=  # the server's address in production",
    );
  }
  return ["```bash", ...lines, "```"].join("\n");
}

/** Where the key of each call comes from, for these answers. */
function keysSection(answers: AiSetupAnswers): string {
  const providers = answers.providers ?? [];
  const keys = answers.keys ?? [];
  const lines = [
    "A call uses the key nearest its user: their own token where an assignment allows it, else the key the admins assigned to them, to their group (in the order the admins set) or to everyone, else the project's key. `status` tells each user which level their key comes from and its last four characters, never the key.",
  ];
  if (keys.length === 0 || keys.includes("project")) {
    lines.push(
      "- **The project's key** goes in the server's environment only. A key written in `nuxt.config.ts` is copied into the server bundle: the module warns about it.",
    );
  }
  if (keys.includes("assigned")) {
    lines.push(
      "- **The admins' keys**: on the AI settings page (`/ai-settings`, Keys) an admin assigns a key and the models to everyone, a group or a user, and orders the groups; a user in two groups gets the higher one's. Nothing to deploy.",
    );
  }
  if (keys.includes("personal")) {
    lines.push(
      "- **Personal tokens** are off until an assignment allows them; then each user saves theirs on the AI settings page, and pays for their own calls.",
    );
  }
  if (providers.some((one) => LOCAL.includes(one))) {
    lines.push(
      "- **Models on the company's servers** need no key; the token of a proxy in front of them is their project key (`NUXT_MAPO_AI_PROVIDERS_OLLAMA_API_KEY`, `NUXT_MAPO_AI_PROVIDERS_OPENAI_COMPATIBLE_API_KEY`).",
    );
  }
  lines.push(
    "- **The secret** seals every key, token and setting the admins save: without `NUXT_MAPO_AI_SECRET` in production the storage stays closed and `run` answers 503. Changing it makes what was saved unreadable.",
  );
  const [intro, ...rest] = lines;
  return `${intro}\n\n${rest.join("\n")}`;
}

/** How to keep the tokens a call spends, and their cost, in check. */
function tokensSection(answers: AiSetupAnswers): string {
  const providers = answers.providers ?? [];
  const lines = [
    "Every call is audited with its tokens. What a call spends grows with the form (the fields the AI may fill), the source and the instructions, and with the model.",
    "- **The usage**: the AI settings page sums it by user, model and day; the admins read everyone's, each user their own.",
  ];
  if (answers.costs !== false) {
    const priced = providers.filter((one) => CLOUD.includes(one));
    const example = priced.length ? priced[0] : "openai";
    lines.push(
      `- **The costs**: \`mapo.ai.prices\` turns tokens into money, with your contract's prices per million tokens; Mapo keeps no price list:\n\n  \`\`\`ts\n  prices: {\n    currency: "USD",\n    providers: {\n      ${example}: {\n        // "<model>": { input: …, output: … }, your prices per million tokens,\n        // with cacheRead and cacheWrite where the prompt cache is on\n      },\n    },\n  },\n  \`\`\``,
    );
  }
  lines.push(
    `- **The limits**: \`limits.perUserPerMinute\` (${answers.perUserPerMinute ?? 20} calls), \`maxSourceChars\` (100,000) and \`maxFileBytes\` (10 MB). Each server process counts its own calls. There is no spending cap per month yet.`,
  );
  if (providers.some((one) => CLOUD.includes(one))) {
    lines.push(
      '- **Spend less**: an efficient model for everyday forms, listed first in `models`; `effort` stays `"low"`, since the reasoning is paid as written tokens; `promptCache: true` pays less for the part of the prompt that repeats; keep the forms\' fields that need no AI out with `ai: { exclude: true }`.',
    );
  }
  if (providers.some((one) => LOCAL.includes(one))) {
    lines.push(
      "- **Models on the company's servers** cost nothing per token: the usage still counts their tokens, and the hardware decides how long a call takes.",
    );
  }
  const [intro, ...rest] = lines;
  return `${intro}\n\n${rest.join("\n")}`;
}

/** What the forms need, for these answers. */
function formsSection(answers: AiSetupAnswers): string {
  const lines: string[] = [];
  if (answers.magicFill === "own-panel") {
    lines.push(
      "- **A panel of the app's own**: `mapo.ai.magicFill: false`, then `useMapoAiFill(detail)` in a detail extension sends the form and the source to `run` and marks every value for the operator; `useMapoAiRead()` reads a file.",
    );
  } else {
    lines.push(
      '- **Magic Fill** shows on every `MapoDetail`: "Fill with AI" in the sidebar card, and a banner above the form that previews every value; "Next to check" takes the operator to each one that waits.',
    );
  }
  if (answers.magicFill === "some-pages") {
    lines.push(
      "- **Pages without it**: `definePageMeta({ magicFill: false })`; `{ magicFill: { evidence: false } }` asks the AI for no quotes, so every value waits.",
    );
  }
  lines.push(
    "- **Drafts**: on a `MapoDetail` with `draft`, the session comes back after a reload, with Restore.",
    '- **The fields** take an `ai` option:\n\n  ```ts\n  { key: "excerpt", type: "textarea", label: "Excerpt", ai: { hint: "One or two sentences, in the source\'s own words." } },\n  { key: "internal_notes", type: "textarea", label: "Internal notes", ai: { exclude: true } },\n  { key: "contact", type: "fks", label: "Contact", attrs: { endpoint: "/api/users/", itemText: "email" }, ai: { list: false } },\n  ```\n\n  `hint` guides the model; `exclude` keeps the field from the AI; `list: false` never lists a relation\'s records for it, which then searches the name it reads. Fields named as secrets, read-only fields and media stay out by themselves.',
  );
  return lines.join("\n");
}

/** The files of the app the answers call for. */
export function aiSetupFiles(answers: AiSetupAnswers): WriteRequest[] {
  const files: WriteRequest[] = [];
  const flag = answers.allowedFlag?.trim();
  if (flag && FIELD_NAME.test(flag)) {
    files.push({
      path: "server/plugins/mapo-ai-access.ts",
      content: `// The AI only for the users the backend marks with \`${flag}\`: the gateway
// asks the backend who is signed in, and this hook refuses the others, after
// mapo.ai.users. A hook can only refuse: it never lets a user in.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("mapo-ai:user", (context) => {
    if (context.payload[${JSON.stringify(flag)}] !== true) context.allowed = false;
  });
});
`,
    });
  }
  const format = formatOf(answers);
  if (format && isDraftable(format)) {
    files.push({
      path: "server/plugins/mapo-ai-readers.ts",
      content: `// A reader of .${format} files for the AI: read() turns a file into the text
// the AI gets. Decoding the bytes as text is a start: write what your format
// needs. Return [] for a file that holds no text.
export default defineNitroPlugin(() => {
  registerMapoAiReader({
    id: ${JSON.stringify(readerIdOf(format))},
    label: ${JSON.stringify(`${format.toUpperCase()} file`)},
    extensions: [${JSON.stringify(format)}],
    read(file) {
      const text = new TextDecoder().decode(file.bytes).trim();
      return text ? [{ kind: "text", text, name: file.name }] : [];
    },
  });
});
`,
    });
  }
  const shared =
    answers.deploy === "several-instances" || answers.deploy === "serverless";
  if (shared) {
    files.push({
      path: "server/plugins/mapo-ai-storage.ts",
      content: `// The AI's sealed state in Redis, shared by every instance, which need the
// same NUXT_MAPO_AI_SECRET too. The address comes from the environment, so
// the driver is mounted when the server starts, in place of the module's
// file-system default, which stays in development without REDIS_URL. The
// redis driver of unstorage needs \`ioredis\` in the app.
import redisDriver from "unstorage/drivers/redis";

export default defineNitroPlugin(async () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (import.meta.dev) return;
    throw new Error("REDIS_URL is not set: the AI's state needs the shared store");
  }
  const storage = useStorage();
  await storage.unmount("mapo-ai");
  storage.mount("mapo-ai", redisDriver({ url }));
});
`,
    });
  }
  return files;
}

/** Where the state lives in production, for these answers. */
function productionSection(answers: AiSetupAnswers): string {
  const lines = [
    "- **The secret** in the server's environment, 32 characters or more, made by a generator: the storage never keeps anything in clear.",
  ];
  switch (answers.deploy) {
    case "several-instances":
      lines.push(
        "- **Several instances** share one store, here Redis: the plugin above, `REDIS_URL` in the environment and `ioredis` installed in the app. In development without `REDIS_URL` the file system stays; in production the server does not start without it. They share the secret too, and each process counts the calls per minute for itself.",
      );
      break;
    case "serverless":
      lines.push(
        "- **Serverless**: a function's file system does not last, so the state goes to a driver. On functions that run Node (the `vercel`, `netlify` and `aws-lambda` presets) the Redis plugin above does it, with `REDIS_URL` and `ioredis` installed. An edge runtime (Cloudflare Workers and the like) has no TCP for Redis: mount a driver that works over HTTP instead, such as Upstash's or Cloudflare KV, the same way.",
      );
      break;
    default:
      lines.push(
        "- **One Node server**: the state goes to `.data/mapo-ai` where the server starts; in a container, put it on a persistent volume, or every deploy loses the keys and the usage.",
      );
  }
  lines.push(
    "- **The audit** keeps each call's metadata for 90 days (`audit.retentionDays`), never the source, the instructions or the values.",
  );
  return lines.join("\n");
}

/** The questions still unanswered, and what the plan assumed for each. */
function stillToAsk(answers: AiSetupAnswers): string[] {
  const missing: [boolean, string, string][] = [
    [!answers.wants?.length, "task", "no need mapped yet"],
    [
      answers.dataMayLeave === undefined,
      "data",
      "nothing about where the data may go",
    ],
    [
      !answers.providers?.length,
      "providers",
      "no provider, so `run` answers 503",
    ],
    [!answers.keys?.length, "keys", "the project's key"],
    [
      answers.costs === undefined && answers.perUserPerMinute === undefined,
      "tokens",
      "the usage with costs, 20 calls per minute",
    ],
    [
      answers.magicFill === undefined,
      "forms",
      "Magic Fill on every detail page",
    ],
    [
      answers.deploy === undefined,
      "deploy",
      "one Node server with a lasting disk",
    ],
  ];
  return missing.flatMap(([isMissing, id, assumed]) => {
    const one = AI_QUESTIONS.find((asked) => asked.id === id);
    if (!isMissing || !one) return [];
    return [`- Round ${one.round}: "${one.question}" (assumed: ${assumed})`];
  });
}

/** What `mapo_ai_setup` answers once the developer answered. */
export function renderAiSetupPlan(
  answers: AiSetupAnswers,
  manifest: MapoAppManifest | null,
  files: string,
): string {
  const need = answers.need?.trim();
  const found = warnings(answers, manifest);
  const missing = stillToAsk(answers);
  return (
    "# The AI for this backoffice: the plan\n\n" +
    (need ? `> ${need.replace(/\n+/g, " ")}\n\n` : "") +
    `## Can the module do it?\n\n${fit(answers)}\n\n` +
    (found.length
      ? `## Check these first\n\n${found.map((one) => `- ${one}`).join("\n")}\n\n`
      : "") +
    `## This app\n\n${appNotes(manifest)
      .map((note) => `- ${note}`)
      .join("\n")}\n\n` +
    `## 1. The configuration\n\nMerge it into the app's \`nuxt.config.ts\` (this tool never edits it):\n\n${configBlock(answers)}\n\n` +
    `## 2. The environment\n\nThe names only: the values never go in a file of the repository.\n\n${environmentBlock(answers)}\n\n` +
    `## 3. Keys and tokens\n\n### Where each call's key comes from\n\n${keysSection(answers)}\n\n### The tokens a call spends\n\n${tokensSection(answers)}\n\n` +
    `## 4. The forms\n\n${formsSection(answers)}\n\n` +
    `## 5. Files of the app\n\n${files}\n\n` +
    `## 6. Production\n\n${productionSection(answers)}\n\n` +
    "## 7. Check it\n\n" +
    "1. Restart the dev server: a new module and new server plugins need it.\n" +
    "2. Signed in, `GET /_mapo/ai/status`: `allowed`, the providers and models each user gets, and where their key comes from.\n" +
    "3. Open `/ai-settings`: the preference, the connection check, and for the admins the keys, how the AI works and the usage.\n" +
    '4. On a detail page, "Fill with AI": paste a text, Extract, check the values in the banner, Save.\n' +
    "5. `mapo_doctor` for anything that looks misconfigured.\n" +
    (missing.length ? `\n## Still to ask\n\n${missing.join("\n")}\n` : "")
  );
}
