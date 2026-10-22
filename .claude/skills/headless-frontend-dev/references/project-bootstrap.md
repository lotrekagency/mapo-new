# Bootstrapping a project

How to set up the operating manual, the docs and the memory for a frontend project that
has none, or that you are seeing for the first time. Read it when there is no AGENTS.md
(or equivalent), or when the user asks you to set one up.

## Contents

1. Read before you write
2. The files to create
3. The root agent file
4. The frontend operating manual
5. The docs folder
6. Memory
7. The first feature

---

## 1. Read before you write

- Map the repository: the frontend you own, the references (the backend, a legacy
  frontend, the editors' tool), and what is out of scope (other sites, database dumps).
- Read the build scripts, the env files (variable names only; never copy values), the
  proxy configs and the deployment files to learn the environments.
- Read the backend's schemas and the views of two or three page types to learn the shape
  of the contract.
- Ask the user what you can't learn from the repo: who reviews, the commit policy, the
  doc language, where the design lives, and which environments you may touch.

## 2. The files to create

- `AGENTS.md` at the root, with the scope, the hard stops and the repository map.
  `CLAUDE.md` and any tool-specific agent file contain only a pointer to it.
- `<frontend>/AGENTS.md`: the operating manual. Start from the skeleton in
  [`assets/AGENTS.template.md`](../assets/AGENTS.template.md).
- `<frontend>/doc_guide.md`: the writing rules ([documentation.md](documentation.md) §3,
  adapted to the project).
- `<frontend>/docs/`:
  - `README.md`, the index;
  - `decisions.md`, the register, from
    [`assets/decision-register.template.md`](../assets/decision-register.template.md);
  - `feature_development.md` and `new_page.md`, the method and the recipe;
  - `components.md`, the catalogue, even if it starts short.

Stage them as one `docs:` step for review.

## 3. The root agent file

- **Introduction**: one paragraph on what the frontend is, what it replaces (if
  anything) and the backend it sits on.
- **Scope table**: path → access (owned, change with care, read-only reference, out of
  scope, never touch) → why.
- **Hard stops**: never commit; never discard work in progress you didn't create; never
  deploy or restart shared environments unless asked; never copy secrets.
- **Repository map**, and **the things that are easy to break from the frontend**: paths
  other services mount, container names other services call, routes the proxy sends
  elsewhere.
- **Agent entry points**: the AGENTS.md files are the source of truth, and every other
  file only points to them.

## 4. The frontend operating manual

The skeleton has these sections:

1. golden rules
2. context and stack
3. how we work: the loop, the checklist, commits, the closing report, comments and docs
4. architecture: the request flow, the registry, the transport, the integration layer,
   what the backend merges into payloads, the layouts
5. where things live
6. building a page or feature
7. components and reuse
8. content, copy, links and media
9. styling
10. motion and the reduced-motion contract
11. forms
12. navigation
13. environments, build and deploy
14. running and verifying
15. gotchas (symptom → cause)
16. status
17. open threads
18. the documentation map

Fill in only what is true today. Mark a section "not decided yet" rather than inventing
rules for it.

## 5. The docs folder

Start small: the index, the register, the method, the recipe, the catalogue. Add a
cross-cutting doc when a second feature needs the same explanation, and a feature doc
for every page type that lands.

## 6. Memory

Seed memory with what the repo can't hold: the user's preferences and the reasons behind
them, the design file and its node ids, environment facts and access limits. Keep one
fact per note, and link related notes.

## 7. The first feature

Pick a page type with an existing contract and real data. Build it straight to live (or
mock-first if the backend isn't ready), and let it establish the patterns: the mapper
shape, the section component and its presets, the media and link components, the label
system, the closing report. Document each pattern as it lands. The second feature should
then be mostly reuse.
