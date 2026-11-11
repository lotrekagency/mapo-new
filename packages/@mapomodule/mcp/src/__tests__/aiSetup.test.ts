/**
 * `mapo_ai_setup`: the interview while nothing is answered, then the plan.
 * The plan proposes code a developer may paste into a project, so these
 * tests read it as they would: what it says the module can do, the
 * configuration it builds, the variables it names without a value, and the
 * files it writes only when asked.
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_AREAS,
  AI_NEEDS,
  AI_QUESTIONS,
  AI_TOPICS,
} from "../runtime/core/ai-setup/index.js";
import { aiSetupTool, aiTools } from "../runtime/core/tools/ai.js";
import { makeContext, makeManifest } from "./fixtures.js";

const context = makeContext();
const run = (args: Parameters<typeof aiSetupTool.run>[0]) =>
  aiSetupTool.run(args, context) as string;

describe("mapo_ai_setup: the tool", () => {
  it("is namespaced, may write and never destroys", () => {
    expect(aiTools.map((tool) => tool.name)).toEqual(["mapo_ai_setup"]);
    expect(aiSetupTool.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });

  it("declares input examples that its schema takes", async () => {
    const { z } = await import("zod");
    const schema = z.object(aiSetupTool.inputSchema);
    for (const example of aiSetupTool.inputExamples ?? []) {
      expect(schema.safeParse(example).success, JSON.stringify(example)).toBe(
        true,
      );
    }
  });
});

describe("mapo_ai_setup: the interview", () => {
  it("asks every question, in three rounds, while nothing is answered", () => {
    const output = run({});

    expect(output).toContain("# Set up the AI and Magic Fill");
    for (const round of [1, 2, 3])
      expect(output).toContain(`### Round ${round}`);
    for (const question of AI_QUESTIONS) {
      expect(output).toContain(question.question);
    }
    // The recommended answer is marked, and the argument it fills named.
    expect(output).toContain("(recommended)");
    expect(output).toContain('`wants: ["fill-record"]`');
  });

  it("lists every need the module answers, and everything it offers", () => {
    const output = run({});

    for (const need of AI_NEEDS) expect(output).toContain(`\`${need.id}\``);
    for (const area of AI_AREAS) expect(output).toContain(`### ${area}`);
    for (const topic of AI_TOPICS) expect(output).toContain(topic.title);
  });

  it("echoes the developer's need, and still asks", () => {
    const output = run({ need: "Fill events from the press releases" });

    expect(output).toContain("> Fill events from the press releases");
    expect(output).toContain("## Questions for the developer");
  });
});

describe("mapo_ai_setup: the plan", () => {
  it("says what the module can do, with app code, not yet, or not at all", () => {
    const output = run({
      wants: [
        "fill-record",
        "extract-records",
        "pdf-images",
        "save-without-review",
      ],
    });

    expect(output).toContain("## Can the module do it?");
    expect(output).toMatch(/Fill the record .*\*\*Yes, out of the box\*\*/);
    expect(output).toMatch(
      /several records .*\*\*Yes, with code of the app\*\*/,
    );
    expect(output).toMatch(/PDFs, scans or images \| \*\*Not yet\*\*/);
    expect(output).toMatch(/without an operator \| \*\*No\*\*/);
    // Each answer points at the docs that explain it.
    expect(output).toContain("`howto/magic-fill.md`");
  });

  it("builds the `mapo.ai` block from the answers", () => {
    const output = run({
      providers: ["openai", "ollama"],
      keys: ["project", "assigned"],
      userGroups: ["editors"],
      adminGroups: ["ai-admins"],
      instructions: 'The records are the city\'s "culture" events.',
      perUserPerMinute: 10,
      magicFill: "own-panel",
    });

    expect(output).toContain('modules: ["@nuxt/ui", "mapomodule"]');
    expect(output).toContain("openai: {}");
    expect(output).toContain('ollama: { models: ["gemma4:12b"] }');
    expect(output).toContain('users: { groups: ["editors"] }');
    expect(output).toContain('admin: { groups: ["ai-admins"] }');
    expect(output).toContain(
      'instructions: { all: "The records are the city\'s \\"culture\\" events." }',
    );
    expect(output).toContain("limits: { perUserPerMinute: 10 }");
    expect(output).toContain('settings: { usersApi: "/api/users/"');
    expect(output).toContain("magicFill: false");
  });

  it("names the environment's variables, never with a value", () => {
    const output = run({ providers: ["openai", "anthropic", "own"] });

    expect(output).toContain("NUXT_MAPO_AI_SECRET=");
    expect(output).toContain("NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY=");
    expect(output).toContain("NUXT_MAPO_AI_PROVIDERS_ANTHROPIC_API_KEY=");
    expect(output).toContain("NUXT_MAPO_AI_PROVIDERS_MY_AI_API_KEY=");
    // A variable is followed by spaces and a comment, never by a value.
    expect(output).not.toMatch(/^#? ?NUXT_[A-Z_]+=[^\s]/m);
  });

  it("leaves the project's key out when every key comes from the admins", () => {
    const output = run({ providers: ["openai"], keys: ["assigned"] });

    expect(output).not.toContain("NUXT_MAPO_AI_PROVIDERS_OPENAI_API_KEY=");
    expect(output).toContain("**The admins' keys**");
  });

  it("explains the tokens: usage, costs, limits and how to spend less", () => {
    const output = run({ providers: ["anthropic"], costs: true });

    expect(output).toContain("### The tokens a call spends");
    expect(output).toContain("`mapo.ai.prices`");
    // A price the developer must write: no number that would read as free.
    expect(output).toContain('// "<model>": { input: …, output: … }');
    expect(output).not.toContain("input: 0");
    expect(output).toContain("perUserPerMinute");
    expect(output).toContain("promptCache: true");
    expect(output).toContain("no spending cap per month");
  });

  it("warns when the data must stay home but a cloud provider is chosen", () => {
    const output = run({ dataMayLeave: false, providers: ["openai"] });

    expect(output).toContain("## Check these first");
    expect(output).toContain("choose `ollama` or `openai-compatible` instead");
  });

  it("takes no limit of 0, which would take no call at all", async () => {
    const { z } = await import("zod");
    const schema = z.object(aiSetupTool.inputSchema);

    expect(schema.safeParse({ perUserPerMinute: 0 }).success).toBe(false);
    expect(schema.safeParse({ perUserPerMinute: 1 }).success).toBe(true);
  });

  it("asks the questions when the answers are blank, and writes nothing", () => {
    const output = run({ instructions: "  ", allowedFlag: "", write: true });

    expect(output).toContain("Nothing was written: the answers decide");
    expect(output).toContain("## Questions for the developer");
  });

  it("lists what is still to ask, with what the plan assumed", () => {
    const output = run({ wants: ["fill-record"] });

    expect(output).toContain("## Still to ask");
    expect(output).toContain('"Which models?" (assumed: no provider');
    expect(output).not.toContain('"What should the AI do for the operators?"');
  });
});

describe("mapo_ai_setup: the files of the app", () => {
  const answers = {
    providers: ["openai" as const],
    allowedFlag: "is_internal",
    ownFormat: ".ics",
    deploy: "several-instances" as const,
  };

  it("shows the plugins the answers call for, and writes nothing", () => {
    const output = run(answers);

    expect(output).toContain("### `server/plugins/mapo-ai-access.ts`");
    expect(output).toContain('context.payload["is_internal"] !== true');
    expect(output).toContain("### `server/plugins/mapo-ai-readers.ts`");
    expect(output).toContain('extensions: ["ics"]');
    expect(output).toContain("### `server/plugins/mapo-ai-storage.ts`");
    expect(output).toContain("Nothing was written");
  });

  it("drafts no hook for a field name that would break out of its comment", () => {
    const output = run({
      providers: ["openai"],
      allowedFlag: "is_internal\nprocess.exit(1)",
    });

    expect(output).not.toContain("mapo-ai-access.ts");
    expect(output).not.toContain("process.exit(1)\n");
    expect(output).toContain("is not a field name");
  });

  it("gives a reader an id that starts with a letter and is none of Mapo's", () => {
    const digits = run({ providers: ["openai"], ownFormat: "7z" });
    const named = run({ providers: ["openai"], ownFormat: "text" });

    expect(digits).toContain('id: "format-7z"');
    expect(digits).toContain('extensions: ["7z"]');
    expect(named).toContain('id: "format-text"');
  });

  it("drafts no reader for a format Mapo reads, which it would replace", () => {
    const output = run({ providers: ["openai"], ownFormat: "XLSX" });

    expect(output).not.toContain("mapo-ai-readers.ts");
    expect(output).toContain("Mapo reads `.xlsx` files already");
  });

  it("keeps the file system in development, and needs REDIS_URL in production", () => {
    const output = run({ providers: ["openai"], deploy: "several-instances" });

    expect(output).toContain("if (import.meta.dev) return;");
    expect(output).toContain('throw new Error("REDIS_URL is not set');
    expect(output).toContain("`ioredis` installed in the app");
  });

  it("sends an edge runtime to a driver over HTTP", () => {
    const output = run({ providers: ["openai"], deploy: "serverless" });

    expect(output).toContain("An edge runtime");
    expect(output).toContain("over HTTP");
  });

  it("drafts no reader for an extension it cannot use", () => {
    const output = run({ providers: ["openai"], ownFormat: "../x" });

    expect(output).not.toContain("mapo-ai-readers.ts");
    expect(output).toContain("is not a file extension");
  });

  it("writes them only when asked, inside the project, never over a file", async () => {
    const root = mkdtempSync(join(tmpdir(), "mapo-ai-setup-"));
    const writing = makeContext(undefined, makeManifest({ rootDir: root }));

    const first = (await aiSetupTool.run(
      { ...answers, write: true },
      writing,
    )) as string;
    const second = (await aiSetupTool.run(
      { ...answers, write: true },
      writing,
    )) as string;

    const access = join(root, "server/plugins/mapo-ai-access.ts");
    expect(existsSync(access)).toBe(true);
    expect(readFileSync(access, "utf8")).toContain('hook("mapo-ai:user"');
    expect(first).toContain("(written)");
    expect(second).toContain("(exists)");
    // The configuration is never written: only shown.
    expect(existsSync(join(root, "nuxt.config.ts"))).toBe(false);
  });

  it("writes nothing outside development", async () => {
    const root = mkdtempSync(join(tmpdir(), "mapo-ai-setup-"));
    const production = makeContext(
      undefined,
      makeManifest({ rootDir: root, dev: false }),
    );

    const output = (await aiSetupTool.run(
      { ...answers, write: true },
      production,
    )) as string;

    expect(output).toContain("(not-allowed)");
    expect(existsSync(join(root, "server/plugins/mapo-ai-access.ts"))).toBe(
      false,
    );
  });
});

describe("mapo_ai_setup: the app it runs in", () => {
  it("says what the app lacks: the module, uikit, the order of the modules", () => {
    const manifest = makeManifest({
      modules: [{ name: "@mapomodule/core" }],
      moduleOrder: ["mapomodule", "@nuxt/ui"],
    });
    const output = aiSetupTool.run(
      { providers: ["openai"] },
      makeContext(undefined, manifest),
    ) as string;

    expect(output).toContain("`@mapomodule/ai` is not installed yet");
    expect(output).toContain("uikit is not installed: Magic Fill needs it");
    expect(output).toContain("Magic Fill needs `@mapomodule/uikit`");
    expect(output).toContain("Register `@nuxt/ui` before `mapomodule`");
  });

  it("says what is there already", () => {
    const manifest = makeManifest({
      modules: [{ name: "@mapomodule/ai" }, { name: "@mapomodule/uikit" }],
      routes: [{ path: "/ai-settings" }],
    });
    const output = aiSetupTool.run(
      {},
      makeContext(undefined, manifest),
    ) as string;

    expect(output).toContain("`@mapomodule/ai` is installed");
    expect(output).toContain("The AI settings page answers at `/ai-settings`");
  });

  it("points at mapo_inspect_app when no app is connected", () => {
    const output = aiSetupTool.run({}, makeContext(undefined, null)) as string;

    expect(output).toContain("No app is connected");
    expect(output).toContain("mapo_inspect_app");
  });
});
