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

| Workflow     | Trigger                                                   | Jobs                                                         |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------ |
| `CI`         | Pull request to `main`                                    | `lint` (build, lint, typecheck), then `test` (build, Vitest) |
| `Docs Pages` | Push to `main`                                            | Builds and deploys the documentation site                    |
| `CD`         | Manual dispatch with `release_mode` `normal` or `dry-run` | A guard that refuses to run from `main`, then the release    |

The release itself:

```
CD (manual dispatch, from beta or another release branch)
  │
  └── release    release_mode: normal (dry-run runs pnpm release:dry instead)
        │
        └── pnpm release
              │
              ├── pnpm build           (turbo build all packages)
              └── multi-semantic-release
                    │
                    ├── Analyze commits per package
                    ├── Determine version bumps
                    ├── Update CHANGELOG.md per package
                    ├── Bump version in package.json
                    ├── Create Git tag  (e.g. @mapomodule/core@0.2.0)
                    ├── Create GitHub Release with notes
                    └── Publish to npm  (@semantic-release/npm)
```

`.releaserc.cjs` releases from `main` and from `beta`, where versions are prereleases published on the `next` dist-tag. Pull requests never release.

TODO: extend the validation stage in the future with a test matrix across multiple supported Node.js versions, Nuxt versions, and other compatibility dimensions so releases are validated against more than one environment.

---

## Scripts

| Script                  | Description                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm release`          | Full release: build all packages then run multi-semantic-release. Used by CI.                                                                          |
| `pnpm release:dry`      | Dry-run: simulates the full release without writing tags, changelogs, or publishing to npm. Use this locally to preview what would be released.        |
| `pnpm publish:packages` | Emergency manual publish: publishes all packages under `packages/` directly via pnpm without going through semantic-release. Use only if CI is broken. |

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

## Required Secrets

Two secrets must be configured in the GitHub repository (`Settings → Secrets and variables → Actions`):

| Secret         | Description                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN` | Automatically provided by GitHub Actions. No setup needed.                                                                                       |
| `NPM_TOKEN`    | An npm automation token with publish rights. Generate at [npmjs.com](https://www.npmjs.com) → `Access Tokens → Generate New Token → Automation`. |

---

## Scoped Packages and npm Access

All `@mapomodule/*` packages and `mapomodule` are published with `--access public` since they live under a scoped namespace. This is configured in `.releaserc.json` via `@semantic-release/npm`.

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
