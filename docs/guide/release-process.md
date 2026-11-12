# Release Process

Mapo uses **[multi-semantic-release](https://github.com/qiwi/multi-semantic-release)** to automate versioning, changelog generation, GitHub tagging, and npm publishing across all packages in the monorepo.

A release is started by hand from the `CD` workflow; everything after that is automatic. No manual version bumping or publishing is ever required.

---

## How It Works

### 1. Conventional Commits

Every commit must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification, enforced by commitlint + husky on every `git commit`.

```
<type>(<scope>): <description>

feat(core): add useMapoAuth composable
fix(form): correct accessor path for nested fields
docs(uikit): add MapoSidebar slot reference
chore(deps): update nuxt to 4.5.0
```

The `type` determines the version bump:

| Commit type                           | Version bump    |
| ------------------------------------- | --------------- |
| `fix:`                                | `patch` (0.0.x) |
| `feat:`                               | `minor` (0.x.0) |
| `feat!:` or `BREAKING CHANGE:` footer | `major` (x.0.0) |
| `chore:`, `docs:`, `test:`, `ci:`     | no release      |

### 2. Per-Package Analysis

`multi-semantic-release` analyzes commits for each package independently. Only packages with relevant commits since their last release are versioned and published.

For example, a `feat(form):` commit triggers a release only for `@mapomodule/form` — not for `@mapomodule/core`, `@mapomodule/store`, or any other unrelated package.

### 3. Cascade Bumping

`mapomodule` (the meta-package) depends on all `@mapomodule/*` packages via `workspace:*`. When any dependency receives a release, `mapomodule` is automatically bumped using the `inherit` strategy — it inherits the highest bump level among its updated dependencies.

```
feat(core): add new composable
  → @mapomodule/core: minor bump (0.1.0 → 0.2.0)
  → mapomodule: minor bump (0.1.0 → 0.2.0)  ← cascaded
```

### 4. CI Pipeline

Three GitHub Actions workflows are involved:

| Workflow     | Trigger                                                   | Jobs                                                                                 |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `CI`         | Pull request to `main`                                    | `lint` (build, lint, typecheck), then `test` (build, Vitest)                         |
| `Docs Pages` | Push to `main`                                            | Builds and deploys the documentation site                                            |
| `CD`         | Manual dispatch with `release_mode` `normal` or `dry-run` | A guard that refuses to run from `main`, then the release and its Slack announcement |

The release itself:

```
CD (manual dispatch, from beta, experimental or another release branch)
  │
  └── release    release_mode: normal (dry-run runs pnpm release:dry instead)
        │
        ├── pnpm release
        │     │
        │     ├── pnpm build           (turbo build all packages)
        │     └── multi-semantic-release
        │           │
        │           ├── Analyze commits per package
        │           ├── Determine version bumps
        │           ├── Update CHANGELOG.md per package
        │           ├── Bump version in package.json
        │           ├── Create Git tag  (e.g. @mapomodule/core@0.2.0)
        │           ├── Create GitHub Release with notes
        │           ├── Publish to npm  (@semantic-release/npm)
        │           └── Record the package for the announcement (scripts/release/summary-plugin.cjs)
        │
        └── node scripts/release/notify-slack.mjs   (Slack: "Mapo <version> released" + the new changes)
```

Pull requests never release: `.releaserc.cjs` releases only from the branches listed under Channels, below.

TODO: extend the validation stage in the future with a test matrix across multiple supported Node.js versions, Nuxt versions, and other compatibility dimensions so releases are validated against more than one environment.

### 5. Channels

`.releaserc.cjs` releases from three branches, each on its own npm dist-tag:

| Branch         | Versions               | npm dist-tag   |
| -------------- | ---------------------- | -------------- |
| `main`         | stable, `X.Y.Z`        | `latest`       |
| `beta`         | `2.0.0-beta.N`         | `next`         |
| `experimental` | `2.0.0-experimental.N` | `experimental` |

An app picks a channel by its tag: `pnpm add mapomodule@next`, `pnpm add mapomodule@experimental` ([Getting Started](/guide/getting-started#the-next-channel)). `experimental` carries the AI module ahead of `beta`: it takes in `beta` with a merge and adds the work on the AI module. A release from it never moves `next`.

Each prerelease channel counts its own versions from a package's last stable release, the last version without a suffix. The first release from `experimental` is therefore `2.0.0-experimental.1` for the packages released as `1.0.0`, since the commits after it hold the breaking change that opened v2, and `1.0.0-experimental.1` for `@mapomodule/ai` and `@mapomodule/mcp`, which have no stable release.

Semver puts `experimental` after `beta`, so a range such as `^2.0.0-beta.21` also accepts `2.0.0-experimental.1`: an app on `next` upgrades with `pnpm add mapomodule@next`, never with `pnpm update`.

---

## Cutting a release

A maintainer releases from `beta` or `experimental`:

1. **Bring the branch up to date.** `experimental` takes in `beta` first (`git merge origin/beta`), so it carries everything `next` has. Both branches commit their `CHANGELOG.md` files, so once both have released, such a merge conflicts at the top of them: keep both entries.
2. **Push the branch.** semantic-release releases only from a branch the remote has, and reads the tags from there.
3. **Preview.** Run the `CD` workflow from the branch with `release_mode: dry-run` (Actions → CD → Run workflow, or `gh workflow run CD --ref experimental -f release_mode=dry-run`): the log of each package says the version it would release, `The next release version is …`.
4. **Release.** Run it again with `release_mode: normal`.
5. **Check.** `npm view mapomodule dist-tags` shows the new version on the channel's tag and the other tags where they were; the [Slack announcement](#slack-announcement) follows.

The first release from `experimental` also:

- publishes `@mapomodule/ai` for the first time, with `NPM_TOKEN` ([Required Secrets](#required-secrets)). npm points the new package's `latest` at that version too, as it did for `@mapomodule/mcp` (`latest` is `1.0.0-beta.1`): harmless for apps, which get the package through `mapomodule` and its exact versions;
- spans every commit since the `1.0.0` releases: its notes are long, and `@semantic-release/github` comments on each pull request merged since then, once per package released.

---

## Scripts

| Script                  | Description                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm release`          | Full release: build all packages then run multi-semantic-release. Used by CI.                                                                          |
| `pnpm release:dry`      | Dry-run: simulates the full release without writing tags, changelogs, or publishing to npm. Use this locally to preview what would be released.        |
| `pnpm publish:packages` | Emergency manual publish: publishes all packages under `packages/` directly via pnpm without going through semantic-release. Use only if CI is broken. |

`pnpm publish:packages` publishes on the dist-tag of each package's `publishConfig`, `next`: never run it from `experimental`. A release always passes its channel's tag to npm, which takes it over `publishConfig`.

---

## Running a Dry-Run Locally

Before pushing to `main`, you can preview the release output without publishing anything:

```bash
# Requires GITHUB_TOKEN to be set (read-only token is enough for dry-run)
GITHUB_TOKEN=<your-token> NPM_TOKEN=<your-token> pnpm release:dry
```

The dry-run output shows:

- Which packages would be released
- What version bump would be applied to each
- The generated changelog entries
- The npm publish command that would run (without executing it)

---

## Slack announcement

When a real release finishes, the `CD` workflow posts one message on Slack:

- **Title**: `Mapo <version> released`, with the version of `mapomodule`, the package apps install. When a run does not release `mapomodule`, the title is `Mapo packages released`.
- **Body**: only the changes of this release — breaking changes, features and bug fixes — merged across every package released in the run. A commit that touches several packages is listed once. The `Dependencies` sections that multi-semantic-release adds (version bumps between Mapo packages) are left out, and so is every older entry of the changelogs.
- **On the `experimental` channel** the body is not the changes, which since a package's last stable release run to hundreds of lines, but a summary of a few lines of what the channel offers, today Magic Fill, with the install command. It is `CHANNEL_SUMMARIES` in `scripts/release/notify-slack.mjs`: update it when the offer changes.
- **Footer**: the released packages and their versions, each linked to its GitHub release.

How it works:

1. During `pnpm release`, the local plugin `scripts/release/summary-plugin.cjs` (registered in `.releaserc.cjs` for real releases only) appends each published package's name, version, tag and notes to a JSON-lines file in the runner's temp folder.
2. The `Announce on Slack` step runs `scripts/release/notify-slack.mjs`, which builds the message from that file and sends it with `chat.postMessage`.

Setup:

1. Create a Slack app with a bot user and the `chat:write` scope, install it in the workspace and invite the bot to the channel (or add `chat:write.public` to post in public channels without joining).
2. Add its bot token as the `SLACK_BOT_TOKEN` secret, and the channel ID as the `SLACK_RELEASE_CHANNEL` variable. To announce in several channels, list their IDs separated by commas (`C0123456789,C0987654321`): the message is posted once in each, and a channel that rejects it does not stop the others.

Until both are set, the step only prints a notice. If Slack rejects the message, the step is marked as failed but the job is not: the packages are already published. Dry runs post nothing.

To preview the message locally from a summary file:

```bash
RELEASE_SUMMARY_FILE=release-summary.jsonl node scripts/release/notify-slack.mjs --dry-run
```

---

## Required Secrets

Configure these in the GitHub repository (`Settings → Secrets and variables → Actions`):

| Name                    | Kind                 | Description                                                                                                                                      |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`          | Secret               | Automatically provided by GitHub Actions. No setup needed.                                                                                       |
| `NPM_TOKEN`             | Secret               | An npm automation token with publish rights. Generate at [npmjs.com](https://www.npmjs.com) → `Access Tokens → Generate New Token → Automation`. |
| `SLACK_BOT_TOKEN`       | Secret               | The bot token (`xoxb-…`) of the Slack app that announces releases. See [Slack announcement](#slack-announcement).                                |
| `SLACK_RELEASE_CHANNEL` | Variable (or secret) | The ID of the Slack channel to post in (for example `C0123456789`), or several IDs separated by commas.                                          |

The `CD` workflow publishes through npm's trusted publishing (OIDC) and falls back to `NPM_TOKEN` for a package without a Trusted Publisher, which npm lets you configure only on a package that already exists. The first release from `experimental` publishes `@mapomodule/ai` for the first time, so it needs `NPM_TOKEN`; then register the Trusted Publisher on the new package.

---

## Scoped Packages and npm Access

All `@mapomodule/*` packages and `mapomodule` are published with `--access public` since they live under a scoped namespace. This is configured in `.releaserc.cjs` via `@semantic-release/npm`.

Private packages (`@mapomodule/docs`, `@mapomodule/example`) have `"private": true` in their `package.json` and are automatically skipped by `@semantic-release/npm` — they are never published to npm.

---

## Changelog

Each package gets its own `CHANGELOG.md` at the package root, generated and updated automatically by `@semantic-release/changelog` on every release. The changelog follows the [Keep a Changelog](https://keepachangelog.com/) format grouped by release version.

---

## Git Tags

`multi-semantic-release` creates one tag per released package using the format:

```
@mapomodule/core@0.2.0
@mapomodule/form@1.0.0
mapomodule@0.2.0
```

Tags are pushed to `origin` by `@semantic-release/git` as part of the release step.
