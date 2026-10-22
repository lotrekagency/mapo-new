# Documentation

How docs, comments and handoff notes are written, and which ones a change must touch.
Read it before writing any doc, and at the document step of every task.

## Contents

1. Docs ship with the code
2. The doc set
3. Writing rules
4. The feature doc
5. The decision register
6. Status and open threads
7. Comments and markers
8. The backend handoff note
9. Notes for the user
10. Quality checklist

---

## 1. Docs ship with the code

Documentation parity is part of done. A change updates the docs it touches in the same
staged step, and a new doc goes into the docs index in that same step. A stale doc is
worse than no doc, because people trust it.

## 2. The doc set

A frontend that several people (and agents) work on keeps these docs:

- **README**: onboarding and quickstart (run, build, env vars).
- **AGENTS.md**: the operating manual. It holds the golden rules, how we work, the
  architecture, where things live, the recipes, the gotchas, the status, the open threads
  and the documentation map ("read X before touching Y"). Tool-specific agent files only
  point to it.
- **The decision register**: every decision with long-term impact, its reason and a link
  to the detail.
- **Architecture** and **integration contract**: the runtime model, the boundaries, the
  backend contract, headers, caching.
- **Method docs**: the feature method (mock → data layer → components) and the new-page
  recipe.
- **The component catalogue**: every reusable piece, with its props, its users, its pros
  and cons, and how-tos.
- **Cross-cutting docs**: styling, motion, i18n, forms, navigation, platform and
  environments, workflows.
- **One doc per page type or feature.**
- **A doc guide**: these writing rules, adapted to the project.

## 3. Writing rules

1. All repo docs use one language: English, unless the project says otherwise.
2. Document facts from the current code, not intentions. Check paths, commands, env vars
   and endpoints against the repo.
3. Explain behaviour and trade-offs, not only file locations. Describe the happy path
   *and* the failure path.
4. Call out temporary decisions and migration-only patterns as such.
5. No dates: not in status tables, decisions, checks or incidents. Write "when last
   checked" or "staging once looked broken" instead. The history lives in git, and dates
   rot.
6. No design-tool references and no people's names. State the constraint, not where it
   came from, and describe the workflow impersonally ("the staged diff is reviewed").
7. Use the present tense for current behaviour and the future tense for planned work.
   Never write "soon" or "later" without context.
8. Use direct, technical language, with no marketing words.
9. Write short sections under clear headings, and open each doc with its purpose and
   audience.
10. Use the same domain terms across all docs. Pick them once, in the doc guide.

## 4. The feature doc

Write or refresh it when a page type or a feature lands. It has these parts:

1. **Purpose and audience.**
2. **Data flow**: request → fetch → mapper → view → components.
3. **A mapping table per section**: backend field → frontend model → component, with the
   fallbacks and the fail-soft behaviour.
4. **Decisions**: the register IDs that apply, plus page-specific choices and their
   reasons.
5. **Components**, reused and new.
6. **Motion**, with its reduced-motion fallback, if any.
7. **Open points**, split into **backend fields** and **data entry**, plus configuration
   and removal candidates. The backend team and the editors act on this list.

A skeleton is in [`assets/feature-doc.template.md`](../assets/feature-doc.template.md).

## 5. The decision register

- Each decision is one row: **decision · why · where the detail lives**. Rows are grouped
  by area and have stable IDs (`A6`, `F3`) that reviews and comments can cite.
- A decision is reopened on purpose: update its row in the same change that contradicts
  it. Code that quietly does something else is not a reopening.
- When the team replaces a choice (a pasted spec, review feedback), rewrite the row
  instead of appending a contradicting one.
- A "reversible on purpose" table records the choices made knowing they might be undone,
  each with the way back.
- If you keep milestones, keep them as an ordered list without dates.

A skeleton is in
[`assets/decision-register.template.md`](../assets/decision-register.template.md).

## 6. Status and open threads

- The operating manual keeps a status table (one line per area and its state) and a
  numbered list of open threads: platform, code debts, backend fields, data entry. Update
  both when a feature lands.
- A debt you find during a task that is out of its scope goes into the open threads, not
  into the diff.

## 7. Comments and markers

- A comment explains the **mechanism** and the **reason**: which mechanism is reused,
  which backend constraint forces the code, what breaks if it changes. Don't restate the
  code.
- A docblock is three or four lines: one for *what*, one for the non-obvious constraint,
  and a pointer to the doc for the rest.
- Rewrite design references as constraints. `// Mockup: 24px, frame "Card / Hover"`
  becomes `// 24px keeps the label clear of the card's folded corner.`
- Each marker has one spelling, so that it greps:
  - `Legacy:` marks a rule ported from the old frontend;
  - `TEMP(<feature>-<purpose>)` marks temporary code, and every new one goes in the
    closing report;
  - `PLANNED (BE)` and `PLANNED (BO)` mark fields read optimistically, waiting for a
    backend field or an editor input;
  - `REMOVAL CANDIDATE` marks a field mapped or present in the data that the design
    doesn't use.
- A clean-up of old comments (dates, names, design references) is its own commit.

## 8. The backend handoff note

When a feature is done and the backend team or the editors need to act on something,
write them a short note:

- write it in the recipient's language, which is often the user's language rather than
  the repo's;
- save it as an untracked file at the repository root (`backend_<feature>.<lang>.md`),
  unless the team keeps such notes elsewhere. It is a message, not documentation, so the
  repo docs don't link to it;
- structure it like this:
  - what was built, and whether it needed backend changes;
  - how the design maps onto the data, in the editors' terms (the field labels they see);
  - numbered backend requests, each with the problem, a concrete case and a proposal;
  - data entry fixes, configuration, removal candidates;
- if there is nothing to ask, say so in the closing report instead of writing an empty
  note.

A skeleton is in
[`assets/backend-handoff.template.md`](../assets/backend-handoff.template.md).

## 9. Notes for the user

When the user asks for a summary for themselves (an audit, a list of changes, a
comparison of locales), write it in their language as an untracked file and don't stage
it, unless they ask otherwise.

## 10. Quality checklist

1. Is one language used throughout?
2. Do paths, commands, env vars and endpoints match the repo?
3. Are the happy and the failure paths described?
4. Are limitations and gaps explicit, and split by owner?
5. Is a new doc listed in the index, and are the links valid?
6. Are dates, design-tool references and people's names absent?
