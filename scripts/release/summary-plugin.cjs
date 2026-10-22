/**
 * semantic-release plugin: records each published package as one JSON line in
 * $RELEASE_SUMMARY_FILE, which scripts/release/notify-slack.mjs announces after
 * `pnpm release`. multi-semantic-release runs `success` once per released
 * package, from that package's directory and with that package's notes.
 * The release is already published by then, so a failure is logged, never thrown.
 */
const { appendFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

async function success(_pluginConfig, context) {
  const file = context.env && context.env.RELEASE_SUMMARY_FILE;
  if (!file) return;

  try {
    const { name } = JSON.parse(
      readFileSync(join(context.cwd, "package.json"), "utf8"),
    );
    const { version, gitTag, channel, notes } = context.nextRelease;
    const entry = {
      name,
      version,
      gitTag,
      channel: channel ?? null,
      notes: notes ?? "",
    };
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    context.logger.error(
      `Could not record the release for the Slack announcement: ${error.message}`,
    );
  }
}

module.exports = { success };
