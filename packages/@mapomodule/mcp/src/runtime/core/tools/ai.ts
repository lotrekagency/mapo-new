/**
 * The guide to `@mapomodule/ai`: it asks the developer what the AI is for,
 * says what the module can and cannot do about it, and proposes the
 * configuration, the keys, the files and the checks.
 *
 * Without answers it returns the questions, in rounds; with them, the plan.
 * Like `mapo_scaffold`, it only shows the files of the app unless asked to
 * write them (`write: true`, through `../write.ts`), and it never edits
 * `nuxt.config.ts` nor writes a key anywhere.
 */
import { z } from "zod";
import {
  AI_DEPLOY_CHOICES,
  AI_KEY_CHOICES,
  AI_MAGIC_FILL_CHOICES,
  AI_NEED_IDS,
  AI_PROVIDER_CHOICES,
  aiSetupFiles,
  hasAiAnswers,
  renderAiSetupPlan,
  renderAiSetupQuestions,
} from "../ai-setup/index.js";
import type { AiSetupAnswers } from "../ai-setup/index.js";
import { defineMapoTool } from "../tool-spec.js";
import { writeScaffold } from "../write.js";
import type { WriteRequest } from "../write.js";
import type { AnyMapoToolSpec, MapoToolContext } from "../tool-spec.js";

interface AiSetupArgs extends AiSetupAnswers {
  write?: boolean;
  overwrite?: boolean;
}

/** The files, shown for review, or what became of them once written. */
function filesSection(
  files: WriteRequest[],
  args: AiSetupArgs,
  context: MapoToolContext,
): string {
  if (!files.length) return "None: the answers need no server code of the app.";
  if (!args.write) {
    const blocks = files.map(
      (file) => `### \`${file.path}\`\n\n\`\`\`ts\n${file.content}\`\`\``,
    );
    return `${blocks.join("\n\n")}\n\nNothing was written. Call again with \`write: true\` to create these files.`;
  }
  const root = context.rootDir();
  if (!root) {
    return "Cannot write: the project root is unknown. Connect to the app's endpoint (`/mcp/mapo`), or run `mapo-mcp serve --root <path>`.";
  }
  const outcomes = writeScaffold(files, {
    root,
    overwrite: args.overwrite ?? false,
    allowed: context.canWrite(),
  });
  const lines = outcomes.map((outcome) => {
    const icon = outcome.status === "written" ? "✔" : "✖";
    const detail = outcome.reason ? `: ${outcome.reason}` : "";
    return `- ${icon} \`${outcome.path}\` (${outcome.status})${detail}`;
  });
  return `Root: \`${root}\`\n\n${lines.join("\n")}`;
}

export const aiSetupTool = defineMapoTool({
  name: "mapo_ai_setup",
  title: "Set up the AI and Magic Fill",
  description:
    "Guide a developer through turning on @mapomodule/ai (experimental) and Magic Fill: without answers, " +
    "the questions to ask them, in rounds, with every need the module can meet and everything it offers; " +
    "with their answers, whether the module can do what they need, the `mapo.ai` configuration, the " +
    "environment's variables (names only), where each call's key comes from and how to keep the tokens " +
    "and their cost in check, the forms' options, the server plugins of the app and the checks. Shows " +
    "the files unless `write: true`; never edits nuxt.config.ts, never writes a key.",
  inputSchema: {
    need: z
      .string()
      .max(4000)
      .optional()
      .describe("The developer's need, in their own words"),
    wants: z
      .array(z.enum(AI_NEED_IDS))
      .optional()
      .describe(
        "The need mapped to the module's needs, such as `fill-record`, `extract-records`, `pdf-images`, `private-relations`, `team-keys`, `costs`: the questions list them all",
      ),
    dataMayLeave: z
      .boolean()
      .optional()
      .describe(
        "Whether the records and their sources may go to a cloud provider",
      ),
    providers: z
      .array(z.enum(AI_PROVIDER_CHOICES))
      .optional()
      .describe(
        "The providers to enable; `own` is a provider of the app's own",
      ),
    keys: z
      .array(z.enum(AI_KEY_CHOICES))
      .optional()
      .describe(
        "Where the keys come from: the project's (environment), the admins' assignments, users' own tokens",
      ),
    userGroups: z
      .array(z.string())
      .optional()
      .describe("The groups that may use the AI (`mapo.ai.users.groups`)"),
    userPermissions: z
      .array(z.string())
      .optional()
      .describe("The permissions that let a user use the AI"),
    allowedFlag: z
      .string()
      .max(64)
      .optional()
      .describe(
        "A field of the user the backend returns that must be `true` for the AI, such as `is_internal`",
      ),
    adminGroups: z
      .array(z.string())
      .optional()
      .describe("The groups that administer the AI (`mapo.ai.admin.groups`)"),
    costs: z
      .boolean()
      .optional()
      .describe("Whether the usage shows costs, with the models' prices"),
    perUserPerMinute: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("The calls to `run` one user may make in a minute"),
    magicFill: z
      .enum(AI_MAGIC_FILL_CHOICES)
      .optional()
      .describe("Where Magic Fill shows, or the app's own panel instead"),
    instructions: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "Rules the AI follows in every prompt (`mapo.ai.instructions.all`)",
      ),
    ownFormat: z
      .string()
      .max(16)
      .optional()
      .describe(
        "The extension of a file format the app reads itself, such as `ics`",
      ),
    deploy: z
      .enum(AI_DEPLOY_CHOICES)
      .optional()
      .describe("Where the server runs in production"),
    write: z
      .boolean()
      .optional()
      .describe(
        "Create the plugin files instead of only showing them (development only)",
      ),
    overwrite: z
      .boolean()
      .optional()
      .describe("Allow replacing files that already exist"),
  },
  annotations: {
    // Not read-only: with `write` it creates the plugins. Never destructive:
    // an existing file is refused unless `overwrite` is set.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [
    { need: "Our editors paste press releases into the event form" },
    {
      need: "Editors fill articles from press releases; no data may leave the company",
      wants: ["fill-record", "files", "local-only"],
      dataMayLeave: false,
      providers: ["ollama"],
      keys: ["project"],
      deploy: "single-node",
    },
    {
      wants: ["fill-record", "team-keys", "costs"],
      providers: ["openai"],
      keys: ["project", "assigned"],
      userGroups: ["editors"],
      costs: true,
      perUserPerMinute: 10,
      deploy: "several-instances",
    },
  ],
  run: (args: AiSetupArgs, context: MapoToolContext) => {
    const manifest = context.manifest();
    if (!hasAiAnswers(args)) {
      const questions = renderAiSetupQuestions(args, manifest);
      // Nothing to write before the answers say what the app needs.
      return args.write
        ? `Nothing was written: the answers decide which files the app needs.\n\n${questions}`
        : questions;
    }
    const files = filesSection(aiSetupFiles(args), args, context);
    return renderAiSetupPlan(args, manifest, files);
  },
});

export const aiTools: AnyMapoToolSpec[] = [aiSetupTool];
