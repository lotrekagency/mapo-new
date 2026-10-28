# AGENTS.md — Mapo monorepo

The operating manual for AI agents (and people) working on this repository: what it is, what you may touch, the hard stops, the map and the working loop. Procedures live in [`docs/contributing/`](docs/contributing/index.md), which this file links to: they are the single source. Module manuals add local rules (§4).

Code, comments, docs and READMEs are written in English. Reply to the user, closing report included, in the language they write in.

---

## 1. What this repository is

Mapo v2 is a Nuxt 4 admin framework: a set of Nuxt modules (`@mapomodule/*` plus the `mapomodule` meta-module) that turn a REST backend into a backoffice declaratively. Apps describe endpoints, list columns, form field descriptors and route permissions, and Mapo renders list and detail pages, forms, auth, navigation, media and menus. It is built on Nuxt 4, Vue 3, Nuxt UI v4, Tailwind CSS v4, Pinia and `@nuxtjs/i18n`, and follows Django REST Framework conventions; the Camomilla CMS integration ships from its own repository. `@mapomodule/mcp` serves the docs and the real APIs to AI assistants in consumer apps.

Read [`docs/guide/concepts.md`](docs/guide/concepts.md) first: packages, backend contract, the form engine and the customization layers, in one page.

### The working method

Follow the project skill [`headless-frontend-dev`](.claude/skills/headless-frontend-dev/SKILL.md): contract first, one typed boundary, reuse before you build, fail-soft, docs in the same step, staged hand-over with a closing report. Its defaults apply, except where this table says otherwise:

| The skill says                     | In Mapo                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The backend contract               | DRF conventions ([Concepts § backend](docs/guide/concepts.md#what-mapo-expects-from-your-backend)), the mock API in `apps/example-e2e/server/api/**` and its `api-schema.json` |
| Entry point → view → mapper        | Inside packages: `src/module.ts` (build time) → `src/runtime/` plugins and composables → components. Inside apps: route meta + one Mapo component per page                     |
| The component catalogue            | `docs/uikit/api.md`, `docs/uikit/form/api.md`, and `mapo_component_api` on the `mapo` MCP server                                                                               |
| The decision register              | None is kept. The why lives in code comments, docs and commit messages; `docs/DECISIONS.md` is a local, historical log                                                         |
| Translations                       | The `mapo.*` keys in `packages/@mapomodule/i18n/src/runtime/locales/mapo.{en,it}.json`                                                                                         |
| Verify without starting servers    | Run the gates always; for UI and runtime changes also do the live check in `apps/example-e2e` (§6)                                                                             |
| Design intake, motion, editor copy | Apply them only when a task brings a design                                                                                                                                    |

---

## 2. Hard stops

1. **Never commit unless explicitly asked.** Work ends staged, with the closing report (§9).
2. **Never push, open a pull request, release or publish** unless asked explicitly at that moment: no `git push`, no `gh pr create`, no `pnpm release`, `pnpm release:dry`, `pnpm publish:packages` or `npm publish`, no `CD` workflow dispatch. Releases are the maintainers' call.
3. **Never discard work you did not create.** The working tree and the stash hold parked work. No `git stash drop`, `clear` or `pop` of someone else's entry, no `git reset --hard`, no `git checkout --` or `git restore` on changes you did not make, no `git clean`. Never `git add -A` or `git add .`: stage paths one by one.
4. **Never copy secrets.** Do not read `.env*` values into code, docs, commits or messages, and never print a token. Do not read database data or dumps.
5. **Never edit local-only material**: `testing/`, `docs/roadmap/`, `docs/DECISIONS.md`, `e2e/`, and the gitignored notes at the root (`CODE_REVIEW_*.md`, `DEV_*.md`, `*_ROADMAP.md`, …). Never force-add a gitignored file.
6. **Stay inside this repository.** Ask before reading or changing anything outside it.
7. **Do not change dependencies or `pnpm-lock.yaml`** unless the task is about them.

---

## 3. Scope

| Path                                                                                                                                              | Access                        | Why                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `packages/@mapomodule/*`, `packages/mapomodule`                                                                                                   | Owned                         | The published framework                                                      |
| `apps/*`                                                                                                                                          | Owned                         | Demo and reference apps; `example-e2e` is the test bed                       |
| `docs/`                                                                                                                                           | Owned                         | The public site **and** the MCP knowledge base                               |
| `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.mcp.json`, `.vscode/mcp.json`                                                                             | Owned                         | The AI setup ([ai-workflow](docs/contributing/ai-workflow.md)); keep it thin |
| `scripts/`                                                                                                                                        | Change with care              | Build helpers every SFC package runs; `dev:link`; the release announcement   |
| Root configs (`package.json`, `turbo.json`, `tsconfig*.json`, `eslint.config.mjs`, `vitest.config.ts`, `commitlint.config.mjs`, `.releaserc.cjs`) | Change with care              | They affect every package, CI and releases                                   |
| `.github/workflows/`                                                                                                                              | Change with care              | `CD` publishes to npm                                                        |
| `pnpm-lock.yaml`                                                                                                                                  | Only with a dependency change | Every install reads it                                                       |
| `docs/roadmap/`, `docs/DECISIONS.md`, `e2e/`, root notes                                                                                          | Read-only, local              | Gitignored planning, history and test plans; not a source of truth           |
| `testing/`                                                                                                                                        | Never touch                   | A local consumer app outside the workspace                                   |
| `node_modules/`, `dist/`, `.nuxt/`, `.output/`, `.turbo/`                                                                                         | Generated                     | Never edit; rebuild instead                                                  |

---

## 4. Repository map

```text
packages/
  @mapomodule/core      service layer: $mapoFetch, useCrud, useMapoAuth, auth/permissions/roles middleware, SSR init
  @mapomodule/store     Pinia stores: auth, snack, confirm, sidebar; usePermissions
  @mapomodule/uikit     shell (layouts, sidebar, topbar, login), MapoList, MapoDetail, media, menus, theming, MapoOverride
  @mapomodule/form      form engine: FieldDescriptor, registry, MapoForm, useMapoForm, JSON Schema bridge
  @mapomodule/i18n      @nuxtjs/i18n wrapper, mapo.en/it catalogs, useMapoT
  @mapomodule/utils     plain TypeScript helpers (no Nuxt), explicit imports
  @mapomodule/mcp       MCP server for AI assistants: dev-only Nuxt module + mapo-mcp stdio CLI
  mapomodule            meta-module: `mapo` config key, installs everything, mapomodule/types aggregator
apps/
  example-e2e           reference app: one page per scenario, in-memory mock API, MCP test bed
  example               core demo against a real Camomilla backend (needs one on :8000)
  example-theme         theming and MapoOverride demo, no backend (:3001)
  example-custom-form   custom field registry demo with Vuetify fields
docs/                   VitePress site (GitHub Pages) and the MCP knowledge source
scripts/                clean-empty-vue-dts.mjs (form and uikit builds); dev-link*.mjs (pnpm dev:link); release/ (Slack announcement, run by CD)
.claude/                skills, subagents, shared permissions
```

### Module manuals

Read the manual of a folder before editing files in it:

| Before editing                         | Read                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/@mapomodule/mcp/`            | [`packages/@mapomodule/mcp/AGENTS.md`](packages/@mapomodule/mcp/AGENTS.md)     |
| `packages/@mapomodule/form/`           | [`packages/@mapomodule/form/AGENTS.md`](packages/@mapomodule/form/AGENTS.md)   |
| `packages/@mapomodule/uikit/`          | [`packages/@mapomodule/uikit/AGENTS.md`](packages/@mapomodule/uikit/AGENTS.md) |
| `packages/@mapomodule/core/`           | [`packages/@mapomodule/core/AGENTS.md`](packages/@mapomodule/core/AGENTS.md)   |
| `docs/`                                | [`docs/AGENTS.md`](docs/AGENTS.md)                                             |
| `apps/`                                | [`apps/AGENTS.md`](apps/AGENTS.md)                                             |
| `store`, `utils`, `i18n`, `mapomodule` | This file and [add-composable](docs/contributing/add-composable.md)            |

### Easy to break

- **Public API.** Package `exports` (types first, `src/` shipped for `./runtime/*`), component props, events and slots (apps copy them into MapoOverride files), and the `mapomodule/types` aggregator. A breaking change needs `feat!:` or a `BREAKING CHANGE` footer.
- **Commit titles release packages.** `fix` → patch, `feat` → minor, `!` → major, per affected package.
- **Module order.** Apps register `@nuxt/ui` before `mapomodule`.
- **Docs headings.** The MCP recipes point at them; renaming one fails the MCP tests until the recipe follows.
- **Explicit registration.** UIKit components are listed in `uikit/src/module.ts`, composables in each module's `addImports`. An unlisted one does not exist for apps or for the MCP server.
- **`apps/example-e2e/api-schema.json`** must describe `server/api/**`, or the MCP maps a shape the mock API no longer serves.

---

## 5. How we work

The loop: **orient → contract → shape → implement → test → document → verify → stage → report → remember.**

1. **Orient.** Read this file, the module manual and the doc of the area. Run `git status`, `git log --oneline -15` and `git stash list`: look, do not touch. Staged work you did not create is a pending review: keep yours separate.
2. **Contract.** Find what the code, the docs and the consumers actually do before changing it: the component source, the API reference, `apps/example-e2e`, the backend schema.
3. **Shape.** Pick the smallest reviewable step. Ask the user what only they can decide, with a recommended option; state the defaults you picked for the rest.
4. **Implement**, following the procedure for what you add: [field type](docs/contributing/add-field-type.md), [component](docs/contributing/add-component.md), [composable or utility](docs/contributing/add-composable.md), [MCP server](docs/contributing/mcp-server.md). Reuse before you build.
5. **Test.** New logic leaves a Vitest test; a bug fix leaves a regression test ([testing](docs/contributing/testing.md#what-needs-a-test)).
6. **Document** in the same step: narrative page, API reference, sidebar, MCP recipes ([documentation](docs/contributing/documentation.md)).
7. **Verify** (§6).
8. **Stage** only this task's files, with explicit paths; stage hunks when a file mixes your work with someone else's. Check `git diff --cached --stat`.
9. **Report** (§9).
10. **Remember.** Save what the repository cannot hold: a correction from the user and its reason, a decision taken in conversation, where unfinished work stands.

The full checklist is the [definition of done](docs/contributing/index.md#definition-of-done).

---

## 6. Gates and verification

Run from the repository root; all must pass with no new errors or warnings:

```bash
pnpm build && pnpm lint && pnpm typecheck && pnpm test
pnpm exec vitest run        # also runs the core, store and uikit tests that `pnpm test` skips
pnpm docs:build             # when docs or the sidebar changed
```

The warnings already present on a clean checkout are listed in [testing § known warnings](docs/contributing/testing.md#known-warnings).

**Live check.** When a change affects rendering, routing, middleware, SSR or the MCP live tools, you may start `pnpm dev:example-e2e` in the background, verify (pages, status codes, the `/mcp/mapo` endpoint, `mapo_doctor`), and **stop the server afterwards**. Log in as `admin` / `admin`. Do not start `apps/example`: it needs a real backend. Visual checks you cannot do (breakpoints, dark mode, interactions) go in the closing report for the reviewer. Commands: [testing § live verification](docs/contributing/testing.md#live-verification-in-the-reference-app).

**Consumer app check.** `pnpm dev:link <app>` runs the local sources inside a project that installed Mapo from npm ([testing § consumer app](docs/contributing/testing.md#testing-changes-in-a-consumer-app)). It writes into that project's `node_modules`, outside this repository: run it only when the user asks, and restore the app with `--restore` when done.

The `mapo` MCP server in `.mcp.json` runs from this repository's build: after `pnpm build`, use it to check what an assistant in a consumer app would be told.

---

## 7. Conventions

- **TypeScript** strict everywhere. Vue SFCs use `<script setup lang="ts">` and the Composition API.
- **Nuxt modules**: build-time code in `src/module.ts`, runtime code in `src/runtime/`. Components are registered by name, composables with `addImports`.
- **Runtime imports**: never a package's root entry (it is the Nuxt module and pulls `@nuxt/kit` into the browser); use subpaths such as `@mapomodule/store/runtime/stores/auth`. Import from `vue`, `vue-router` and `#app` explicitly where a component needs it.
- **Types** are exported from each package's `src/index.ts` (resolved as `@mapomodule/<pkg>/types` and through `mapomodule/types`).
- **Labels** come from the i18n catalogs, both `en` and `it`; nothing user-facing is hardcoded, `aria-label` included.
- **Styling** uses Nuxt UI components, Tailwind utilities and semantic tokens. A class built at runtime must be safelisted in `packages/@mapomodule/uikit/src/runtime/assets/main.css`.
- **JSDoc** on exported functions, component props and descriptor `attrs`: the MCP server turns it into the API answers it gives assistants.
- **Comments** explain the mechanism and the reason in a few lines; no dates, no people's names.
- **Markers**: `TEMP(<area>-<purpose>)` for temporary code (listed in the closing report), `Legacy:` for behaviour ported from Mapo v1, `REMOVAL CANDIDATE` for code kept only until a decision.
- **Dependencies**: reuse what is installed; never add a package for a few lines. Shared versions are pinned through the root `pnpm.overrides`.

---

## 8. Docs and the MCP server

`docs/` is published as the site **and** indexed by `@mapomodule/mcp` for AI assistants in consumer apps, so a wrong page becomes a wrong answer in someone's editor.

- Docs ship in the same step as the code ([documentation](docs/contributing/documentation.md)).
- A new task-level feature gets a recipe in `packages/@mapomodule/mcp/src/runtime/core/recipes.ts`; a renamed page or heading updates the recipes that point at it.
- `docs/guide/concepts.md` and `packages/@mapomodule/mcp/src/runtime/core/instructions.ts` are how the server describes Mapo: keep them true when the architecture, the packages or the config keys change.
- After a docs or API change: `pnpm --filter @mapomodule/mcp build && pnpm --filter @mapomodule/mcp test`.
- `docs/contributing/`, `docs/roadmap/`, `DECISIONS.md` and the agent manuals are not indexed.

The sync table is in [mcp-server § what to update](docs/contributing/mcp-server.md#what-to-update-when-mapo-changes).

---

## 9. Commits and the closing report

**Commits** (only when asked): a Conventional Commit title, `type(scope): summary`, validated by commitlint. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style`. Scopes: `core`, `store`, `uikit`, `form`, `utils`, `i18n`, `mcp`, `mapomodule`, `docs`, `example`, `example-e2e`, `example-theme`, `deps`, `ci`. A sweeping mechanical change is its own commit.

**Closing report**, in the user's language:

1. **Proposed commit title(s)**, one line each; say how to split the staged work if it should be several commits.
2. **What to review**: what changed and where; what needs a visual or behavioural check (page, breakpoint, colour mode); what was **not** verified, and why.
3. **To confirm**: the interpretations you made where the code, the docs or the request were ambiguous.
4. **Open gaps**, by owner: follow-ups found out of scope (they go to §11, not into the diff); consumer impact (breaking changes, migration notes); configuration (CI, release, environment).
5. **Temporary code**: every `TEMP(...)` marker added and what removes it.

---

## 10. Tools for agents

- **MCP servers** (`.mcp.json` for Claude Code, `.vscode/mcp.json` for Copilot): `mapo`, this repository's own server rooted on `apps/example-e2e`; `nuxt-ui`, the Nuxt UI component docs. Prefer them over memory for Mapo and Nuxt UI APIs.
- **Skills** (`.claude/skills/`): `headless-frontend-dev` (the method), `nuxt-modules`, `nuxt`, `vue`, `pinia`, `nuxt-i18n`, `nuxt-ui`, `vitest`, `vue-testing-best-practices`, `mcp-builder`, `vitepress`. Third-party skills are pinned in `skills-lock.json`; this manual wins over them.
- **Subagents** (`.claude/agents/`): `mapo-verifier` runs the gates and the live check; `mapo-docs-curator` aligns docs and MCP recipes with a change; `mapo-reviewer` reviews the staged diff. Details: [ai-workflow](docs/contributing/ai-workflow.md).

---

## 11. Gotchas

Symptom → cause.

- **A new page returns 404 in dev** → Nuxt's server-side router keeps its route table; restart the dev server.
- **`@nuxt/kit` or Node built-ins end up in the browser bundle** → runtime code imported a package root; use a subpath import.
- **An app's types collapse to `any`** → empty `.vue.d.ts` stubs in `dist/`; the form and uikit builds remove them with `scripts/clean-empty-vue-dts.mjs`, keep that step.
- **`vue-tsc` passes but the code is broken** → `vue-tsc` 2 silently drops errors with TypeScript 6; the repo pins `vue-tsc` 3.
- **`TS2307: Cannot find module '@mapomodule/form/types'` in an app** → pnpm strict layout; declare the package or import from `mapomodule/types`.
- **The Nitro build breaks after adding a file to `mcp/src/runtime/mcp/`** → the toolkit loads every top-level file there as a handler; only `handlers/` may live there.
- **A Tailwind class has no effect in a Mapo component** → it is built at runtime; safelist it in uikit `main.css`.
- **"Mapo knowledge base not found" from the MCP server** → the package was not built; run `pnpm --filter @mapomodule/mcp build`.
- **A VitePress page fails to build** → a bare `<word>` in prose or a heading; wrap it in backticks.
- **pnpm warns that the `pnpm` field in `package.json` is no longer read** → a newer global pnpm prints it before handing over to the pinned 8.15.6, which applies the overrides (they are in `pnpm-lock.yaml`).

---

## 12. Status and open threads

What exists: [`docs/guide/feature-status.md`](docs/guide/feature-status.md). Known limitations and workarounds: [`docs/guide/known-limitations.md`](docs/guide/known-limitations.md).

### Code

1. `MapoWygEditor` never marks editor fields as touched: the `blur` listener from `MapoFormField` lands on its root `div`, which never has the focus (the Tiptap content does).
2. `MapoConfirmDialog` has no accessible name: its title is a plain heading inside the modal content.
3. `@mapomodule/uikit` registers `MapoMediaManagerDialog` twice (by name and as global), so every app build prints an override warning.
4. Lint reports a few hundred warnings in `form` and `uikit` (no errors).

### Testing and CI

1. `core`, `store` and `uikit` have tests but no `test` script, and the `form` config skips its `*.component.test.ts` files, so `pnpm test` and CI do not run them.
2. The apps have no `typecheck` script, so `pnpm typecheck` and CI cover the packages only; type-check an app by hand ([apps manual](apps/AGENTS.md)).
3. There is no browser end-to-end suite; `apps/example-e2e` is shaped as its target.
4. CI runs on pull requests to `main` only; the push trigger is commented out in `.github/workflows/ci.yml`.

---

## 13. Documentation map

| Doc                                                                   | Read it when                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Concepts](docs/guide/concepts.md)                                    | You start: how Mapo fits together                                  |
| [Contributing](docs/contributing/index.md)                            | Before any change: the loop and the definition of done             |
| [Testing and verification](docs/contributing/testing.md)              | You run the gates, write tests or check the app live               |
| [Writing documentation](docs/contributing/documentation.md)           | You write, move or rename docs                                     |
| [Adding a field type](docs/contributing/add-field-type.md)            | You touch the field registry or the descriptor types               |
| [Adding a UIKit component](docs/contributing/add-component.md)        | You add or change a `Mapo*` component                              |
| [Adding a composable or utility](docs/contributing/add-composable.md) | You add to a package's public surface                              |
| [Working on the MCP server](docs/contributing/mcp-server.md)          | You change the MCP server or anything it describes                 |
| [Working with AI agents](docs/contributing/ai-workflow.md)            | You change this file, the skills, the subagents or the MCP configs |
| [Architecture & Flows](docs/guide/architecture-flows.md)              | You touch fetch, auth, SSR hydration or middleware                 |
| [Known limitations](docs/guide/known-limitations.md)                  | Something looks odd: it may be a documented workaround             |
| [Import Guide](docs/guide/imports.md)                                 | You wire imports in an app or a package                            |
| [Release Process](docs/guide/release-process.md)                      | Anything near versions (releases are not an agent's job)           |
| [Migration v1 → v2](docs/migration/v1-to-v2.md)                       | You port v1 code or behaviour                                      |
