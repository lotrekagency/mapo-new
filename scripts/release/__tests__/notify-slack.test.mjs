import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildSlackMessage,
  parseNotes,
  run,
  toMrkdwn,
} from "../notify-slack.mjs";

const COMMIT = "https://github.com/lotrekagency/mapo-new/commit";

const MCP_NOTES = `# @mapomodule/mcp [1.1.0-beta.1](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/mcp@1.0.0-beta.1...@mapomodule/mcp@1.1.0-beta.1) (2026-10-21)


### Features

* **mcp:** describe Mapo through a shared overview and instructions ([a942208](${COMMIT}/a942208))

### Bug Fixes

* **mcp:** keep the CLI on stdio ([b1c2d3e](${COMMIT}/b1c2d3e))
`;

const MAPOMODULE_NOTES = `# mapomodule [2.0.0-beta.17](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.16...mapomodule@2.0.0-beta.17) (2026-10-21)


### Features

* **mcp:** describe Mapo through a shared overview and instructions ([a942208](${COMMIT}/a942208))

### BREAKING CHANGES

* **core:** \`useCrud\` now requires an endpoint & a model

### Dependencies

* **@mapomodule/mcp:** upgraded to 1.1.0-beta.1`;

const releases = [
  {
    name: "@mapomodule/mcp",
    version: "1.1.0-beta.1",
    gitTag: "@mapomodule/mcp@1.1.0-beta.1",
    notes: MCP_NOTES,
  },
  {
    name: "mapomodule",
    version: "2.0.0-beta.17",
    gitTag: "mapomodule@2.0.0-beta.17",
    notes: MAPOMODULE_NOTES,
  },
];

const textOf = (block) => block.text?.text ?? block.elements?.[0]?.text;

describe("parseNotes", () => {
  it("groups bullets by section and ignores the version heading", () => {
    const sections = parseNotes(MCP_NOTES);
    expect([...sections.keys()]).toEqual(["Features", "Bug Fixes"]);
    expect(sections.get("Bug Fixes")).toEqual([
      `**mcp:** keep the CLI on stdio ([b1c2d3e](${COMMIT}/b1c2d3e))`,
    ]);
  });

  it("reads dash bullets, emoji-prefixed headings and continuation lines", () => {
    const sections = parseNotes(
      "## [1.0.0](x)\n\n### ⚠ BREAKING CHANGES\n\n- first\n  more of the first\n- second",
    );
    expect(sections.get("BREAKING CHANGES")).toEqual([
      "first\nmore of the first",
      "second",
    ]);
  });
});

describe("toMrkdwn", () => {
  it("converts bold and links, and escapes Slack control characters", () => {
    expect(toMrkdwn("**core:** a & b < c ([abc](https://x.y/z))")).toBe(
      "*core:* a &amp; b &lt; c (<https://x.y/z|abc>)",
    );
  });
});

describe("buildSlackMessage", () => {
  const message = buildSlackMessage(releases, {
    repoUrl: "https://github.com/lotrekagency/mapo-new",
  });

  it("titles the message with the mapomodule version", () => {
    expect(message.text).toBe("Mapo 2.0.0-beta.17 released");
    expect(message.blocks[0]).toEqual({
      type: "header",
      text: {
        type: "plain_text",
        text: "Mapo 2.0.0-beta.17 released",
        emoji: true,
      },
    });
  });

  it("merges the packages' changes, breaking changes first, without duplicates or dependency bumps", () => {
    const sections = message.blocks.filter((block) => block.type === "section");
    expect(sections.map((block) => textOf(block).split("\n")[0])).toEqual([
      "*BREAKING CHANGES*",
      "*Features*",
      "*Bug Fixes*",
    ]);

    const features = textOf(sections[1]);
    expect(features.match(/a942208/g)).toHaveLength(2); // one bullet: link text + URL
    expect(features).toContain(
      `• *mcp:* describe Mapo through a shared overview and instructions (<${COMMIT}/a942208|a942208>)`,
    );
    expect(JSON.stringify(message)).not.toContain("upgraded to");
  });

  it("lists the released packages, mapomodule first, linked to their GitHub releases", () => {
    const packages = textOf(message.blocks.at(-1));
    expect(packages).toBe(
      "Released: <https://github.com/lotrekagency/mapo-new/releases/tag/mapomodule%402.0.0-beta.17|mapomodule 2.0.0-beta.17>" +
        " · <https://github.com/lotrekagency/mapo-new/releases/tag/%40mapomodule%2Fmcp%401.1.0-beta.1|@mapomodule/mcp 1.1.0-beta.1>",
    );
  });

  it("falls back to a generic title and says when only dependencies changed", () => {
    const only = buildSlackMessage([
      {
        name: "@mapomodule/form",
        version: "2.0.0-beta.11",
        notes:
          "### Dependencies\n\n* **@mapomodule/utils:** upgraded to 2.0.0-beta.6",
      },
    ]);
    expect(only.text).toBe("Mapo packages released");
    expect(textOf(only.blocks[1])).toContain("only updates dependencies");
    expect(textOf(only.blocks.at(-1))).toBe(
      "Released: @mapomodule/form 2.0.0-beta.11",
    );
  });

  it("keeps a section under Slack's 3000-character limit", () => {
    const notes = `### Features\n\n${Array.from(
      { length: 200 },
      (_, index) =>
        `* feature number ${index} with a reasonably long description`,
    ).join("\n")}`;
    const block = buildSlackMessage([
      { name: "mapomodule", version: "3.0.0", notes },
    ]).blocks[1];

    expect(textOf(block).length).toBeLessThanOrEqual(3000);
    expect(textOf(block)).toMatch(/…and \d+ more in the release notes$/);
  });
});

describe("run", () => {
  const summaryWith = (entries) => {
    const file = join(
      mkdtempSync(join(tmpdir(), "mapo-release-")),
      "summary.jsonl",
    );
    writeFileSync(
      file,
      entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
    return file;
  };
  const quietLogger = () => ({ log: vi.fn(), error: vi.fn() });

  it("does nothing when nothing was released", async () => {
    const fetchImpl = vi.fn();
    const logger = quietLogger();
    expect(await run({ env: {}, argv: [], fetchImpl, logger })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips with a notice while the token or the channel is missing", async () => {
    const fetchImpl = vi.fn();
    const logger = quietLogger();
    const env = { RELEASE_SUMMARY_FILE: summaryWith(releases) };

    expect(await run({ env, argv: [], fetchImpl, logger })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logger.log.mock.calls[0][0]).toContain("::notice::");
  });

  it("posts the message to the channel with the bot token", async () => {
    const fetchImpl = vi.fn(async () => ({ json: async () => ({ ok: true }) }));
    const env = {
      RELEASE_SUMMARY_FILE: summaryWith(releases),
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_RELEASE_CHANNEL: "C0123",
    };

    expect(await run({ env, argv: [], fetchImpl, logger: quietLogger() })).toBe(
      0,
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init.headers.authorization).toBe("Bearer xoxb-test");
    const body = JSON.parse(init.body);
    expect(body.channel).toBe("C0123");
    expect(body.text).toBe("Mapo 2.0.0-beta.17 released");
  });

  it("reports a rejected message with a failing exit code", async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ ok: false, error: "not_in_channel" }),
    }));
    const logger = quietLogger();
    const env = {
      RELEASE_SUMMARY_FILE: summaryWith(releases),
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_RELEASE_CHANNEL: "C0123",
    };

    expect(await run({ env, argv: [], fetchImpl, logger })).toBe(1);
    expect(logger.error.mock.calls[0][0]).toContain("not_in_channel");
  });

  it("prints the message instead of sending it with --dry-run", async () => {
    const fetchImpl = vi.fn();
    const logger = quietLogger();
    const env = {
      RELEASE_SUMMARY_FILE: summaryWith(releases),
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_RELEASE_CHANNEL: "C0123",
    };

    expect(await run({ env, argv: ["--dry-run"], fetchImpl, logger })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.parse(logger.log.mock.calls[0][0]).text).toBe(
      "Mapo 2.0.0-beta.17 released",
    );
  });
});
