# AGENTS.md — <Project> frontend (`<path>/`)

<!--
Skeleton of a frontend operating manual. Replace every <placeholder>, delete the
guidance comments, and mark a section "Not decided yet." rather than inventing rules.
The root AGENTS.md holds scope, hard stops and the repository map; this file holds
everything about working on the frontend.
-->

This is the operating manual for the frontend agent and for anyone working on the
<Project> frontend. It covers **how we work**, **the rules**, **where things live**,
**what is built** and **what is still open**.

- The *why* behind every technical choice: [`docs/decisions.md`](./docs/decisions.md).
- Deep dives per area: [`docs/`](./docs/README.md). The map in §18 says which one to read
  before touching what.

Everything in `<path>/` is written in <language> (see [`doc_guide.md`](./doc_guide.md)).

---

## 1. Golden rules

1. **Never commit.** The loop is implement → docs → `git add` (staged only) → the staged
   diff is reviewed → commit only after approval. A task ends staged, with the report in
   §3.4.
2. **A commit is one conventional-commit title**: `type(scope): summary`. No body, no
   trailers.
3. **Reuse before you build.** Read [`docs/components.md`](./docs/components.md) before
   creating a component.
4. **Lightest mechanism first.** <The default way to build a component, and when a
   reactive component is justified.>
5. **Views never fetch and never parse the route.** <The entry point> has already put the
   page, the chrome data and `t` on <where>. The exceptions are lists driven by the URL
   query: <list>.
6. **Components only see the typed frontend model.** Backend shapes stop at the mapper.
7. **No hardcoded copy.** Labels go through `t("Domain/Key")`; content comes from the
   data.
8. **Don't reshape content you don't own.** Constrain with CSS. Measure text, never
   rewrite it.
9. **Media render through `<MediaComponent>`** with desktop and mobile slots. **Data
   links render through `<LinkComponent>`.**
10. **Reduced motion removes motion, never content.** Check both modes.
11. **Docs ship with the code**, in the same staged step.
12. **Comments explain mechanisms**: concise, with no design-tool references and no
    people's names.
13. **Decisions are not reopened silently**: update the register in the same change.

---

## 2. Context

- **What it is**: <one paragraph: the frontend, what it replaces, the backend it sits
  on>.
- **Stack**: <runtime, rendering mode, styling, motion, the reactive framework if any>.

|  | Develop | Preview | Staging | Production |
|---|---|---|---|---|
| Frontend | <host> | <host> | <host> | <host> |
| Legacy frontend | <host or "not served"> | | | |
| Backend APIs | <host> | | | |
| Environment name | `development` | `preview` | `staging` | `production` |

---

## 3. How we work

### 3.1 The loop

1. **Implement.**
2. **Update the docs** the change touches (§18), in the same step.
3. **Verify without starting servers**: <gate commands>, then static checks on the
   build output. The browser test happens at review.
4. **`git add` only this task's files.** Never `git add -A`.
5. **Stop and report** (§3.4).

### 3.2 Before staging: checklist

- [ ] <gate commands> are clean, and the build prints no new warnings.
- [ ] Styles and types are in their homes (§9, <shared types module>).
- [ ] No hardcoded copy. New labels are in `<translations path>`, and existing keys are
      reused.
- [ ] Media wire both slots and render through `<MediaComponent>`.
- [ ] Every animated section is checked in both reduced-motion modes.
- [ ] No horizontal overflow on a mobile device emulation.
- [ ] The mapper is fail-soft on every optional field.
- [ ] Docs are updated. Every new `TEMP(...)` marker is listed in the report.

### 3.3 Commits

- Types: `feat`, `fix`, `perf`, `refactor`, `style`, `docs`, `chore`.
- Scopes in use: <list>.
- Sweeping mechanical passes get their own commit.

### 3.4 Closing a task

Leave the work staged, then report in the language you were addressed in:

1. **Proposed commit title**, on one line.
2. **What to review**: what changed, what needs a visual or behavioural check, and what
   was *not* verified and why.
3. **Open gaps**, split into **backend fields** and **data entry**.

### 3.5 Comments and docs

- A comment explains the mechanism and the reason, in three or four lines at most.
- Markers: `Legacy:`, `TEMP(<feature>-<purpose>)`, `PLANNED (BE)`, `PLANNED (BO)`,
  `REMOVAL CANDIDATE`.
- Docs follow [`doc_guide.md`](./doc_guide.md): one language, facts from the current
  code, happy and failure paths, no dates.

---

## 4. Architecture

```text
GET /<locale>/<path>
  → <proxy>                 <paths routed elsewhere>
  → <entry point>           locale · fetch page + chrome data + labels
  → <catch-all route>       error view, or the registry
  → <registry>              <record type / template code> → view (else fallback view)
  → <view>                  map(page, t, locale) → sections
```

- **Entry point**: <what it parses, what it fetches, where it puts the result>.
- **Registry**: <table of record type / code → view>.
- **Transport**: <endpoints, headers forwarded, caching>.
- **Integration layer**: <mappers folder, shared types module, shared mapping
  primitives>.
- **What the backend merges into every payload**: <shared data, global settings>.
- **Layouts**: <the neutral shell, the layout with the site chrome, reduced variants>.

---

## 5. Where things live

```text
<tree of the source folder, one line per folder, with what it holds>
```

---

## 6. Building a page or feature

Recipe: [`docs/new_page.md`](./docs/new_page.md). Method:
[`docs/feature_development.md`](./docs/feature_development.md).

1. Find the contract: <schema location> → <shared data> → <related entities> →
   <legacy views> → the real payload.
2. Choose mock-first or straight to live.
3. Write the mapper: the frontend model, derived navigation, backend types, helpers, the
   exported `map<Page>`.
4. Write the view, which only maps and composes, and register it.
5. Integrate: diff the payload, purge `TEMP(`, run the gates, write the feature doc,
   update §16.

---

## 7. Components and reuse

<The reuse ladder, the main primitives with one line each, the rules that are easy to
miss. Details: docs/components.md.>

## 8. Content, copy, links and media

<Content vs labels, the trusted-HTML policy, translation key conventions, the link
resolver, the media slots and loading budget.>

## 9. Styling

<Layering, tokens, type roles, breakpoints, traps.>

## 10. Motion and the reduced-motion contract

<The mechanism table, the scroll orchestrator's rules, the transitions vocabulary, the
reduced-motion contract and how to test it.>

## 11. Forms

<How a form is described, validated, submitted and tracked.>

## 12. Navigation

<How the menus are fetched, rendered and driven.>

## 13. Environments, build and deploy

| Variable | Read by | Phase | Notes |
|---|---|---|---|
| `<NAME>` | <file> | build / runtime | <default, per-environment values, gotchas> |

<The deploy commands (run only when asked) and the rollback path.>

## 14. Running and verifying

```bash
<gate commands>     # must be clean
<run commands>      # at review, or when explicitly asked
```

<Payload recipes (curl + jq), pages worth knowing, screenshot and device-emulation
techniques for the reviewer.>

## 15. Gotchas

Symptom → cause. Each one has cost real time.

- **<Symptom>** → <cause and fix>.

## 16. Status

| Area | State |
|---|---|
| <area> | <done / in progress / not started: one line> |

## 17. Open threads

### Platform
1. <item>

### Code
1. <item>

### Backend fields
- <item>

### Data entry
- <item>

## 18. Documentation map

| Doc | Read it when |
|---|---|
| [Decisions](./docs/decisions.md) | You need the *why*, or you are about to contradict an earlier choice |
| [Components](./docs/components.md) | Before writing any component |
| [New page](./docs/new_page.md) | You add a page type |
| [Doc guide](./doc_guide.md) | You write or restructure docs |
