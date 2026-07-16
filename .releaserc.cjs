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
      // Only the changelog is committed back. package.json is deliberately
      // NOT committed: during a release multi-semantic-release rewrites the
      // version field and replaces `workspace:*` deps with concrete versions
      // (npm publish can't handle the workspace protocol). Committing that
      // rewrite would break local workspace linking and desync pnpm-lock.yaml.
      // Git tags are the source of truth for released versions.
      assets: ["CHANGELOG.md"],
      message:
        "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
    },
  ],
  "@semantic-release/github",
];

module.exports = {
  branches: ["main", { name: "beta", prerelease: true, channel: "next" }],
  plugins: isDryRun
    ? analysisPlugins
    : [...analysisPlugins, ...publishPlugins],
};
