# Working with AI agents

How the repository is set up for AI coding agents (Claude Code and GitHub Copilot), and the rules they follow. It is for contributors who use an agent on Mapo itself. To give an agent Mapo knowledge inside _your app_, see [AI assistant (MCP)](/howto/ai-assistant) instead.

## One source, thin entry points

Rules, procedures and facts live in one place each, and every tool-specific file only points to them:

| File                 | Read by                                                                            | Holds                                                                   |
| -------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `AGENTS.md` (root)   | Copilot directly; Claude Code through `CLAUDE.md`                                  | Scope, hard stops, repository map, the working loop, the module manuals |
| `<module>/AGENTS.md` | Claude Code through the sibling `CLAUDE.md`; Copilot when nested files are enabled | The rules of one package or folder                                      |
| `CLAUDE.md`          | Claude Code                                                                        | Only `@AGENTS.md`, which imports the manual next to it                  |
| `docs/contributing/` | Everyone                                                                           | The procedures: these pages                                             |

Module manuals exist where a folder has rules of its own: `packages/@mapomodule/mcp`, `form`, `uikit`, `core`, `docs/` and `apps/`. The root `AGENTS.md` lists them, so an agent that does not load nested files still knows to read them.

For Copilot in VS Code, turn on nested manuals in your settings:

```json
{
  "chat.useAgentsMdFile": true,
  "chat.useNestedAgentsMdFiles": true
}
```

## Skills

Skills are procedures an agent loads when a task needs them. Both agents read them from `.claude/skills/`.

| Skill                                          | Source            | Use it for                                                                      |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `headless-frontend-dev`                        | This repository   | The working method: contract first, reuse, docs with the code, staged hand-over |
| `nuxt-modules`                                 | onmax/nuxt-skills | Writing Nuxt modules: kit utilities, hooks, module tests                        |
| `nuxt`, `vue`, `pinia`, `nuxt-i18n`, `nuxt-ui` | onmax/nuxt-skills | The framework APIs Mapo builds on                                               |
| `vitest`                                       | onmax/nuxt-skills | Writing and debugging unit tests                                                |
| `vue-testing-best-practices`                   | vuejs-ai/skills   | Testing Vue components and composables                                          |
| `mcp-builder`                                  | anthropics/skills | Designing MCP tools for `@mapomodule/mcp`                                       |
| `vitepress`                                    | antfu/skills      | The docs site                                                                   |

The third-party skills are pinned in `skills-lock.json` and managed with the [skills CLI](https://skills.sh):

```bash
npx skills experimental_install                # restore the pinned skills
npx skills update -p                           # update the project skills, then review the diff
npx skills add <owner/repo> --skill <name> --agent claude-code --copy -y   # add one
```

The `AGENTS.md` files win over any skill: a skill is general advice, the manual is this project's decision. Skills that only change your personal style belong in your home folder (`npx skills add <owner/repo> -g`), not in the repository.

## Subagents

Subagents run a task in their own context and report back. They live in `.claude/agents/`, which both agents read.

| Subagent            | What it does                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mapo-verifier`     | Runs the gates and, when asked, the live check in `apps/example-e2e`; returns a compact pass/fail report. It changes nothing. |
| `mapo-docs-curator` | Brings the docs, the sidebar and the MCP recipes in line with a code change, then rebuilds and tests the knowledge base.      |
| `mapo-reviewer`     | Reviews the staged diff against the manuals and these pages; reports findings, most severe first. It changes nothing.         |

## MCP servers

| Config             | Client      |
| ------------------ | ----------- |
| `.mcp.json`        | Claude Code |
| `.vscode/mcp.json` | Copilot     |

Both declare the same two servers:

- **`mapo`**: this repository's own MCP server, run from `packages/@mapomodule/mcp/bin/mapo-mcp.mjs` with `apps/example-e2e` as its project root and that app's `api-schema.json` as the backend schema. It needs a build first (`pnpm build`). The live tools answer while `pnpm dev:example-e2e` runs.
- **`nuxt-ui`**: the Nuxt UI documentation server, for component APIs and examples.

Using the `mapo` server while working on Mapo is also its everyday test: if it gives an agent a wrong answer, fix the docs or the recipe that caused it.

## Permissions

`.claude/settings.json` is shared: it allows the read-only commands and the gates, and denies what an agent must never do on its own (pushing, releasing, publishing, discarding work). Personal permissions go in `.claude/settings.local.json`, which git ignores.

## The rules agents follow

The complete list is in the root `AGENTS.md`. In short:

- Work ends staged with a hand-over report; a commit happens only when someone asks for it.
- No push, pull request, release or publish without an explicit request at that moment.
- Work in progress that the agent did not create (the working tree, the stash) is never discarded.
- Every change runs the gates; UI and runtime changes are also checked live in `apps/example-e2e`, and the dev server is stopped afterwards.
- Docs and MCP recipes change in the same step as the code.

## Keeping this setup current

When a convention changes, update the root `AGENTS.md` or the module manual, the page here that explains it, and the subagent that applies it, in the same change. Keep the entry points thin: a rule written in two places drifts.
