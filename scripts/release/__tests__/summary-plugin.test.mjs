import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { success } = require("../summary-plugin.cjs");

/** A package directory and a summary file path, both in a fresh temp folder. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "mapo-summary-"));
  const cwd = join(root, "packages", "mapomodule");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "mapomodule" }),
  );
  return { cwd, file: join(root, "summary.jsonl") };
}

const nextRelease = {
  version: "2.0.0-beta.17",
  gitTag: "mapomodule@2.0.0-beta.17",
  channel: "next",
  notes: "### Features\n\n* something new",
};

describe("summary plugin", () => {
  it("appends one JSON line per released package", async () => {
    const { cwd, file } = setup();
    const context = {
      cwd,
      env: { RELEASE_SUMMARY_FILE: file },
      nextRelease,
      logger: { error: vi.fn() },
    };

    await success({}, context);
    await success(
      {},
      { ...context, nextRelease: { ...nextRelease, version: "2.0.0-beta.18" } },
    );

    const lines = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { name: "mapomodule", ...nextRelease },
      { name: "mapomodule", ...nextRelease, version: "2.0.0-beta.18" },
    ]);
  });

  it("does nothing outside the CD workflow", async () => {
    const { cwd } = setup();
    const logger = { error: vi.fn() };
    await success({}, { cwd, env: {}, nextRelease, logger });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs instead of failing a release that is already published", async () => {
    const { file } = setup();
    const logger = { error: vi.fn() };

    await expect(
      success(
        {},
        {
          cwd: "/nonexistent",
          env: { RELEASE_SUMMARY_FILE: file },
          nextRelease,
          logger,
        },
      ),
    ).resolves.toBeUndefined();
    expect(logger.error.mock.calls[0][0]).toContain("Slack announcement");
  });
});
