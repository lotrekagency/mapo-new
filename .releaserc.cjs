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
  // Each package is built here rather than from its own `prepack` script.
  // multi-semantic-release serializes the `prepare` step — a package holds the
  // baton from the start of `prepare` until its own `publish` begins — but runs
  // `publish` concurrently. A build in prepack therefore ran alongside sibling
  // publishes, and `nuxt-module-build` cleans dist/ before rebuilding, so uikit's
  // vue-tsc could resolve `@mapomodule/form/types` against a dist that form had
  // just deleted (TS7016, and a cascade of implicit-any errors behind it).
  //
  // Two further benefits of `prepare` over `prepack`:
  //  - it runs after @semantic-release/npm has written the released version into
  //    package.json, so dist/module.json is stamped with the right version;
  //  - it runs BEFORE the git tag is created and the changelog is pushed, so a
  //    build failure aborts cleanly instead of leaving tags for versions that
  //    never reached npm.
  ["@semantic-release/exec", { prepareCmd: "pnpm build" }],
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
