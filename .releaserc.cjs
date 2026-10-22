// semantic-release config, shared by `pnpm release` and `pnpm release:dry`
// (both run it through multi-semantic-release).
//
// In a dry run we deliberately load ONLY the analysis plugins, so the preview
// computes the next version + notes WITHOUT touching npm or GitHub and without
// needing NPM_TOKEN. The publishing plugins (changelog, npm, git, github) are
// added only for a real release.
//
// Dry-run is detected from the multi-semantic-release CLI flag (`--dry-run`),
// with an explicit env override (`DRY_RUN=true`) as a fallback.
const path = require("node:path");

const isDryRun =
  process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

const analysisPlugins = [
  "@semantic-release/commit-analyzer",
  "@semantic-release/release-notes-generator",
];

const publishPlugins = [
  ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
  "@semantic-release/npm",
  [
    "@semantic-release/git",
    {
      assets: ["CHANGELOG.md", "package.json"],
      message:
        "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
    },
  ],
  "@semantic-release/github",
  // Records each published package for the Slack announcement of the CD
  // workflow (scripts/release/notify-slack.mjs). The path is absolute because
  // multi-semantic-release resolves plugins from each package's directory.
  path.join(__dirname, "scripts/release/summary-plugin.cjs"),
];

module.exports = {
  branches: ["main", { name: "beta", prerelease: true, channel: "next" }],
  plugins: isDryRun
    ? analysisPlugins
    : [...analysisPlugins, ...publishPlugins],
};
