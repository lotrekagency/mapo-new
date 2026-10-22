# Sources of truth

Where the facts come from, in what order to read them, and which one wins when they
disagree. Read it when you open a project for the first time, when you start a feature
and when you resume work from an earlier session.

## Contents

1. The project's own instructions
2. Memory
3. Git
4. The backend contract
5. The design
6. The legacy frontend
7. The people
8. Running environments
9. When sources disagree

---

## 1. The project's own instructions

Read them in this order:

1. **The root agent file** (AGENTS.md, or a CLAUDE.md that points to it). It sets the
   scope: which folders you own, which are read-only references, which you never touch.
   It also lists the hard stops, the repository map and the things that are easy to
   break from the frontend (paths other services mount, container names other services
   call, routes a proxy sends elsewhere).
2. **The frontend's operating manual**: golden rules, workflow, architecture, where
   things live, gotchas, status, open threads, and the documentation map that says which
   doc to read before touching what.
3. **The doc the map points to for your area**, and the decision register entries for
   it. The register holds the *why*: read it before doing something differently.
4. **The component catalogue**, before writing any component.

Agent entry points (CLAUDE.md, tool-specific agent definitions) only point to AGENTS.md.
They never copy it, because copies drift. Flag a copy if you find one.

If the manual says folders were renamed, read old paths in notes, memories and commits
through that mapping.

## 2. Memory

Memory holds what neither the code nor git records. That includes the user's corrections
and preferences with their reasons, decisions settled in conversation, environment facts
and access limits, where an unfinished feature stands, and references into the design
file.

- Read the memory index at the start of a session and open the notes that match the
  task.
- A memory is a snapshot from when it was written. Before acting on a note that names a
  file, a function, a flag or a state ("staged", "pending review"), check it against the
  repo and `git log`.
- When two notes disagree, the more specific and more recent one usually wins. Fix or
  delete the stale one.
- Save these: a correction and its reason; a decision you shouldn't re-invent; a gotcha
  that cost time; the state of an unfinished feature (what is committed, staged or left
  in the working tree, and what comes next); design references that would otherwise
  end up in code comments.
- Don't save what the repo already records: code structure, docs, git history.

## 3. Git

Before touching anything:

```bash
git status                  # what is staged, modified, untracked, and whose it is
git log --oneline -15       # was the work you remember committed by hand meanwhile?
git stash list              # parked work in progress: read-only for you
git branch --show-current
```

- Staged changes you didn't make are someone's pending review. Don't add to them or
  unstage them.
- Untracked files at the root are often deliberate: handoff notes, local summaries, tool
  configs. Leave them alone.
- A stash is someone's work in progress, often from another branch. Reading from it
  (`git show stash@{2}:path/to/file`) is fine when asked. Dropping or clearing it never
  is.

## 4. The backend contract

Whatever the backend is, its contract has the same layers. Read them in order of
authority:

1. **The schema of the resource**: the serializer, the API schema or the type definitions
   on the backend side. It gives every field, with nesting and nullability.
2. **Shared data merged into the payload**: defaults or global settings that the backend
   merges under every record of a type, or into every response. A block that carries
   only an `enabled` flag on the record usually has its content there.
3. **Related entities**: the serializers of the objects a record embeds or references.
4. **The legacy frontend**, if there is one: its visibility rules, fallback chains and
   derived values. Take its rules, not its markup (§6).
5. **The real payload**: fetch it (`curl -s "<api>/<resource>?lang=<locale>" | jq`) and
   diff it against your types. Check the `enabled` flags, list lengths, media types,
   color formats, links without a resolved target, and fields declared as one thing but
   stored as another.

Read the backend, and change it only when asked. When the design needs a field that the
backend lacks, that is a request in the handoff note, not a frontend workaround.

Build against one representative record: one locale, one product. Content differences
across locales or records are data entry, not frontend constraints. Survey across
records only when asked, or when a sample shows that editor markup differs in a way the
styling must absorb. Then show the user what you found: people often assume the
content is uniform.

## 5. The design

See [design-intake.md](design-intake.md). In short, the design tool's structured data
(sizes, type styles, colors, assets) is the source, and screenshots only help you find
your way around. When the design's declared values disagree with what it visibly shows,
follow what it shows.

## 6. The legacy frontend

When the project replaces an older frontend, that code is a read-only reference for what
users and stored content already rely on:

- visibility conditions, fallback chains and derived values;
- translation keys whose translations already exist;
- analytics event names that dashboards and tag triggers depend on;
- in-page anchors and URL fragments that stored content links to.

Port the rules and tag each one `Legacy:` in the mapper. Leave the markup behind.

## 7. The people

- The user decides product trade-offs, design ambiguities and anything that changes what
  reviewers will see.
- Pasted team specs and review notes are newer than your choices. Apply them, and
  rewrite the affected docs and register rows.
- A note meant for the user or for another team is written in their language. Repo docs
  follow the project's doc language.
- The reviewer usually runs and tests the app. Your job ends at a verified, staged diff
  and a report that says what to look at.

## 8. Running environments

- Know which environment serves what and which data each holds. Local media may be
  missing, staging usually has the real media, and production has the real traffic.
- Read-only probes (GET) against staging are fine when they settle a question. A request
  that writes is not a probe, and some endpoints register keys or log entries on POST.
- Never deploy, restart or reconfigure a shared environment unless asked.
- If a tool can't reach a service from your session (a container socket, a VPN), that
  doesn't mean the service is down. Say what you couldn't check.

## 9. When sources disagree

| Conflict | Default | Ask when |
|---|---|---|
| Design vs data | Build to the design; the data discrepancy is data entry | The data's shape can't express the design (that is a backend field) |
| Design vs legacy behaviour | The design decides the look; the legacy decides the rules users rely on | A legacy behaviour would visibly change, or a stored link would break |
| A declared design value vs the rendered design | Follow the render and state the constraint in a comment | Never |
| Desktop frame vs mobile frame | Each breakpoint follows its own frame | One frame drops content the other shows |
| A recorded decision vs a new request | Follow the request and update the register | The request seems unaware of the decision's reason |
| Memory vs repo | The repo | Never: fix the memory |
| Two docs disagree | The code decides which one is true; fix the other | The code itself looks wrong |
