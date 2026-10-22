# Contributing

How to change Mapo itself: set up the monorepo, make a change, verify it and hand it over for review. It is written for people and for AI agents alike. Agents also read the `AGENTS.md` files in the repository, which hold the rules and link back to these pages.

Building an app _with_ Mapo is a different job: start from [Getting Started](/guide/getting-started) instead.

## Prerequisites

- Node.js ^22.19 || ^24.11 || >=26. The repo ships an `.nvmrc`: run `nvm use`.
- pnpm 8. `package.json` pins `pnpm@8.15.6` through `packageManager`.

## Initial setup

```bash
pnpm install
pnpm build
```

`pnpm build` builds every package and app through Turborepo. Run it once after cloning: downstream packages resolve each other from `dist/`, and the MCP server needs its generated knowledge base.

## Dev setup (after the initial build)

When you work on packages, switch them to **stub mode** instead of rebuilding after every change:

```bash
# Stub and watch all packages at once (from the monorepo root)
pnpm dev:packages

# Or stub a single package
pnpm --filter @mapomodule/store dev:prepare
```

Stub mode replaces `dist/` with files that re-export from `src/`, so the IDE resolves types immediately and source changes need no rebuild. After stubbing, regenerate the app's auto-import types:

```bash
cd apps/example-e2e   # or whichever app you use
pnpm nuxt prepare
```

If you run `pnpm build` on a package during development, re-run its `dev:prepare` and then `nuxt prepare` on the app.

## Where things live

| Path                        | What it holds                                                                     |
| --------------------------- | --------------------------------------------------------------------------------- |
| `packages/@mapomodule/`     | The published `@mapomodule/*` packages                                            |
| `packages/mapomodule/`      | The `mapomodule` meta-module                                                      |
| `apps/example-e2e/`         | The reference app: one page per scenario, an in-memory mock API, the MCP test bed |
| `apps/example/`             | Core demo against a real Camomilla backend                                        |
| `apps/example-theme/`       | Theming and MapoOverride demo, no backend                                         |
| `apps/example-custom-form/` | Custom field registry demo (Vuetify fields)                                       |
| `docs/`                     | This site, and the knowledge base of the MCP server                               |
| `scripts/`                  | Build helpers shared by the packages, and the release announcement on Slack       |

How the packages relate is explained in [Concepts](/guide/concepts#the-packages).

## How a change is made

Every change, from a one-line fix to a new feature, goes through the same steps:

1. **Orient.** Read the doc of the area you touch and check `git status`: work in progress in the tree or in the stash belongs to someone, so leave it alone.
2. **Reuse before you build.** Look for an existing component, composable, field type, slot or Nuxt UI component first. A new shared piece needs a second user.
3. **Implement**, following the procedure for what you add:
   - [Adding a built-in field type](./add-field-type)
   - [Adding a UIKit component](./add-component)
   - [Adding a composable, store or utility](./add-composable)
   - [Working on the MCP server](./mcp-server)
4. **Test.** New logic leaves a Vitest test behind, and a bug fix leaves a regression test. → [Testing and verification](./testing)
5. **Document** in the same change: the narrative page, the API reference, the sidebar, and the MCP recipes when a new task becomes possible. → [Writing documentation](./documentation)
6. **Verify.** Run the gates; for UI or runtime changes, also check the reference app. → [Testing and verification](./testing#the-gates)
7. **Hand over.** Stage only the files of this change and describe what to review, what you could not verify, and what is still open.

### Definition of done

- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm docs:build` pass, with no new errors or warnings.
- [ ] New logic has tests; root `pnpm exec vitest run` passes too (it also covers core, store and uikit).
- [ ] The docs describe the new behaviour: narrative page, API reference, sidebar entry.
- [ ] Public APIs are reflected in the MCP server: recipes, and a rebuilt knowledge base whose tests pass.
- [ ] UI or runtime changes are checked in `apps/example-e2e`, or the check is listed for the reviewer.
- [ ] The diff contains only this change.

## Git hooks

Two Husky hooks run on every commit.

**pre-commit** runs lint-staged on the staged files:

1. `prettier --write` formats `.ts`, `.tsx`, `.vue`, `.json` and `.md` files.
2. `vitest related --run` runs the tests that import the staged `.ts`, `.tsx` and `.vue` files, directly or transitively.

**commit-msg** validates the message against [Conventional Commits](https://www.conventionalcommits.org/) with commitlint:

```
feat(core): add useMapoAuth composable      ✔
fix(form): correct nested accessor path     ✔
wip: stuff                                  ✘
```

## Commits

The commit type drives the version bump of the affected packages (see [Release Process](/guide/release-process)): `fix` is a patch, `feat` a minor, `feat!` or a `BREAKING CHANGE` footer a major. Choose it for what the change means to consumers.

- Types in use: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style`.
- The scope is the package or area: `core`, `store`, `uikit`, `form`, `utils`, `i18n`, `mcp`, `mapomodule`, `docs`, `example`, `example-e2e`, `example-theme`, `deps`, `ci`.
- A sweeping mechanical change (formatting, renames across packages) is its own commit.

## CI and releases

| Workflow     | Trigger                          | What it runs                                                                                                   |
| ------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `CI`         | Pull request to `main`           | `build` + `lint` + `typecheck`, then `build` + `test`                                                          |
| `Docs Pages` | Push to `main`                   | Builds this site and deploys it to GitHub Pages                                                                |
| `CD`         | Manual dispatch, never on `main` | `pnpm release` or `pnpm release:dry` through multi-semantic-release; a real release is then announced on Slack |

Releases are cut by maintainers. The details are in [Release Process](/guide/release-process).

## More

- [Testing and verification](./testing)
- [Writing documentation](./documentation)
- [Working with AI agents](./ai-workflow)
