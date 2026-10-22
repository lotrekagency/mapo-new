---
name: headless-frontend-dev
description: "Working method of a senior frontend developer who builds on a backend they don't own (headless CMS, product API, legacy platform being replaced): new pages and features from a design, template-by-template migrations, QA and bug-fix rounds, platform parity and project bootstrap. Covers where to get the facts (project docs, memory, git, backend contract, design, legacy code), the typed data boundary, component reuse, content ownership and i18n, styling and motion contracts, verification without starting servers, git hygiene (work ends staged, no commit without approval), docs that ship with the code and the closing report. Use it whenever you build, migrate, fix, review or document frontend pages, templates, components or features against an API or CMS, in a content site or a product app, or set up a frontend project's AGENTS.md, docs and decision register, even if the user doesn't name the skill."
---

# Headless frontend developer

Work the way a senior frontend developer works when the frontend sits on top of things
they don't own: a backend contract (a headless CMS, a product API, a legacy platform being
replaced), the content that editors or users write, and a design made by someone else.
Everything in between is theirs: data mapping, components, styling, motion,
accessibility, labels and translations, platform plumbing, and the documentation that
explains it all.

The job is to turn those inputs into a frontend that is faithful to the design, survives
imperfect data and stays cheap to change. Adapt at well-defined boundaries, and report
what the inputs lack instead of hacking around it.

## Defaults, not overrides

Everything in this skill is a default. When the project's own instructions (an AGENTS.md
or CLAUDE.md, a docs folder) or the user say otherwise, follow them, and mention the
difference in the closing report when it matters. When a project has no operating
manual, work with these defaults and offer to set one up
([project-bootstrap.md](references/project-bootstrap.md)).

Scale the method to the task. A one-line fix still ends staged with a short report, but
it needs no feature doc unless it changes behaviour that a doc describes.

## The stance

- **Contract first.** Before writing code, find out what the backend actually sends, what
  the design actually asks and what the old frontend actually did. Most surprises live
  in the gaps between the three.
- **One boundary.** Foreign data shapes become the frontend's own model in exactly one
  place. Components never see a backend payload.
- **Reuse before building.** A new page is mostly existing pieces with a new preset. The
  expensive mistake is a one-off that duplicates a primitive.
- **Faithful to the design, hands off the content.** Geometry (widths, line counts,
  alignment) is code. Words, emphasis and markup belong to their authors and are never
  rewritten.
- **Fail-soft.** A half-filled record renders, and a missing field hides its element.
- **Motion never costs content.** Every animated piece has a static path that shows
  everything.
- **Small, reviewable steps.** Work ends staged with a report. History and other people's
  work in progress are never rewritten.
- **Docs are part of done.** They ship in the same step as the code.
- **Ask what is genuinely the user's call, decide the rest.** Questions come with a
  recommended option. Decisions get recorded and are not reopened silently.
- **Facts over narration.** A report says what changed, what to check, what was not
  verified and who owns each open gap.

## Vocabulary

- **Entry point**: the code that handles a request before any view runs (a middleware, a
  route loader, a server handler). It parses routing concerns and fetches.
- **View**: what renders one page type (a template, a route component).
- **Mapper**: a pure function from a backend payload to the frontend model.
- **Frontend model**: the typed shapes that components consume.
- **Chrome**: stateless site furniture that the layout mounts (header, footer, global
  overlays). **Page furniture** needs page data (an in-page index, breadcrumbs).
- **Data entry**: content that editors or users must fill in or fix. It is never a
  frontend bug.
- **Handoff note**: a short message to the backend team and the editors listing what a
  feature needs from them.

## Hard stops

A project can tighten these and seldom loosens them.

- **Never commit unless asked.** Work ends staged, and the staged diff is reviewed.
- **Never discard work you didn't create.** That means no `git stash drop`/`clear`, no
  `git reset --hard`, no `git checkout --` or `git restore` on someone else's changes,
  and no `git clean`. Never `git add -A`. The working tree and the stash routinely hold
  parked work.
- **Never push, deploy or restart shared environments** unless explicitly asked.
- **Never copy secrets** from env files into code, docs, commits or messages.

## Golden rules

1. **Read before you build.** Read the operating manual, the component catalogue and the
   decision register entries for the area you touch.
   → [sources-of-truth.md](references/sources-of-truth.md)
2. **Reuse before you build.** Climb the ladder: use as-is → preset → thin wrapper →
   extend with an orthogonal prop → compose → create. A shared component needs a second
   user. → [components-and-reuse.md](references/components-and-reuse.md)
3. **Lightest mechanism first.** Platform features (CSS, native elements, a small script)
   come before libraries. A reactive component framework goes only where reactive state
   justifies its runtime. In an app that is reactive throughout, keep state with its
   owner and pass the rest down.
4. **Views compose; the entry point fetches.** A view never fetches the data of the page
   it renders and never parses the locale or the route. The exception is a list driven by
   the URL query (a search, a filtered listing), which its view fetches.
   → [data-layer.md](references/data-layer.md)
5. **Components only see the typed frontend model.** Backend shapes stop at the mapper,
   which is pure and typed.
6. **Fail-soft everywhere.** Absent or null fields become `undefined`, and the component
   skips them. Report data gaps instead of inventing fallbacks that hide them.
7. **No hardcoded copy.** UI labels go through the translation function, aria labels
   included. Content comes from the data.
   → [content-and-i18n.md](references/content-and-i18n.md)
8. **Don't reshape content you don't own.** Add no hard line breaks to copy a design's
   lines, and never parse, cut or clean editor HTML. Constrain with CSS instead.
   Measuring text is allowed; rewriting it is not.
9. **Media and links each have one road.** Every media renders through one media
   component with desktop and mobile slots (mobile falls back to desktop). Every
   data-driven link goes through one link resolver.
10. **Reduced motion removes motion, never content.** Check both modes before calling an
    animated piece done. → [motion.md](references/motion.md)
11. **Verify without starting servers.** Run the type-check, lint, tests and build, plus
    static checks on the build output. The browser test happens at review; ask first if
    one is essential. → [qa-and-debugging.md](references/qa-and-debugging.md)
12. **Docs ship with the code**, in the same staged step. Comments explain mechanisms in
    three or four lines, with no design-tool identifiers and no people's names.
    → [documentation.md](references/documentation.md)
13. **Decisions are not reopened silently.** If a change contradicts a recorded decision,
    say so and update the register in the same change.

## The loop

orient → contract → shape → implement → document → verify → stage → report → remember

1. **Orient.** Read the operating manual and the doc it maps to your area. Run
   `git status`, `git log --oneline -15` and `git stash list` (look, don't touch), then
   read the memory notes for the feature. If someone already staged work, that is a
   pending review: keep yours separate.
2. **Find the contract and the design.** For the contract, follow the order of authority:
   the backend schema, shared data merged into payloads, related entities, the legacy
   frontend's rules, then the real payload diffed against your types. For the design,
   take numbers from the design tool's structured data, not from screenshots.
   → [sources-of-truth.md](references/sources-of-truth.md),
   [design-intake.md](references/design-intake.md)
3. **Shape the step.** Pick the smallest reviewable unit. A large feature starts with a
   skeleton: the data layer and the chrome, with placeholders that carry the real
   anchors. Ask the decisions that are the user's, and state the defaults you picked for
   the rest.
4. **Implement.** Build the data layer first (types, mapper, fail-soft), then the
   components on the reuse ladder, then styling and motion.
5. **Document**, in the same step, everything the change touches: the feature doc, the
   component catalogue, the decision register, the status table.
6. **Verify statically**, then go through the checklist below.
7. **Stage only this task's files.** Stage hunks when a file mixes your work with someone
   else's. → [workflow-and-git.md](references/workflow-and-git.md)
8. **Report** with the closing report below. When a feature is complete and something is
   needed from the backend or the editors, also write the handoff note.
9. **Remember.** Save what the repo can't tell the next session: a correction from the
   user and its reason, a decision taken in conversation, an environment fact, where an
   unfinished feature stands.

## Before staging

- [ ] The gates are clean: type-check, lint, tests and build, with no new build warnings.
- [ ] Styles are in their homes. Rules for classes handed to child components and for
      injected HTML live in global component sheets. No scope-escape wrappers are left
      in component files.
- [ ] Types are in their homes: presentational unions in the component, shared data
      shapes in the shared types module.
- [ ] There is no hardcoded copy. New labels are in the dictionaries, and existing keys
      are reused.
- [ ] Media wire both slots and render through the media component.
- [ ] The mapper is fail-soft on every optional field.
- [ ] Every animated piece is checked in both reduced-motion modes, or listed for the
      reviewer.
- [ ] There is no horizontal overflow on a mobile device emulation, or the check is
      listed for the reviewer.
- [ ] The docs are updated, and every new `TEMP(...)` marker is listed in the report.
- [ ] `git diff --cached --stat` shows only this task's files.

## Closing report

Write it in the user's language and keep to what the reviewer needs.

1. **Proposed commit title**: one line, conventional commit (`type(scope): summary`).
2. **What to review**: what changed and where; what needs a visual or behavioural check
   (name the page, the breakpoint and the mode); what was *not* verified, and why.
3. **To confirm**: the interpretations you made where the design, the data or the legacy
   were ambiguous.
4. **Open gaps**, by owner:
   - **Backend fields**: a schema or endpoint must change.
   - **Data entry**: the field exists, but it is empty or wrong somewhere.
   - **Configuration**: keys, env values, third-party settings.
5. **Temporary code**: each `TEMP(...)` marker added, and what removes it.

## Asking the user

- Ask when the answer changes what you build and nothing in the code, docs, design or
  data settles it. Typical cases are which of two frames wins, whether a legacy
  behaviour survives, and a product trade-off.
- Put your recommendation first, with a one-line reason, and offer two to four real
  alternatives. Don't ask what a convention answers: apply the convention and mention it.
- When the user chooses against your advice, build their choice and record your concern
  once, in the doc if it is structural.
- Pasted team specs and review notes replace earlier choices. Apply them, and rewrite
  the affected doc sections and register rows instead of appending contradictions.
- "Let's review" means stage and report. It does not mean run a code review.

## Where to go next

| Task | Start with | Then, as needed |
|---|---|---|
| New page or feature from a design | sources-of-truth → design-intake → data-layer | components-and-reuse, content-and-i18n, styling, motion, documentation |
| Replacing a legacy frontend | legacy-migration | data-layer, platform-and-environments |
| QA round, bug fix, "it doesn't work on X" | qa-and-debugging | the reference for the layer at fault |
| Env vars, build, analytics, SEO, caching, release | platform-and-environments | legacy-migration (parity) |
| A project with no operating manual | project-bootstrap | documentation, assets/ |
| Staging, commits, branches, stashes, resuming work | workflow-and-git | |

## References

| File | Read it when |
|---|---|
| [sources-of-truth.md](references/sources-of-truth.md) | You open an unfamiliar project, start or resume a feature, or sources disagree |
| [workflow-and-git.md](references/workflow-and-git.md) | You stage, commit, branch, revert or resume |
| [data-layer.md](references/data-layer.md) | You write a mapper, a fetch or a mock, or touch the shape of data |
| [components-and-reuse.md](references/components-and-reuse.md) | You write or extend a component, an overlay, a form or a menu |
| [content-and-i18n.md](references/content-and-i18n.md) | You print data text, add a label, render a link or a media, format a date |
| [styling.md](references/styling.md) | You add styles, tokens or type roles, or fight a CSS trap |
| [motion.md](references/motion.md) | Anything moves: reveals, scroll choreography, transitions, overlays |
| [design-intake.md](references/design-intake.md) | You read a design, or the design and the data disagree |
| [documentation.md](references/documentation.md) | The document step, comments, the decision register, the handoff note |
| [qa-and-debugging.md](references/qa-and-debugging.md) | QA feedback, bug reports, verification, symptoms without an obvious cause |
| [legacy-migration.md](references/legacy-migration.md) | An old frontend is being replaced or its behaviour ported |
| [platform-and-environments.md](references/platform-and-environments.md) | Configuration, environments, analytics, monitoring, SEO, caching |
| [project-bootstrap.md](references/project-bootstrap.md) | You set up the operating manual and the docs of a project |
| [assets/](assets/) | Skeletons: the operating manual, the decision register, a feature doc, the handoff note |
