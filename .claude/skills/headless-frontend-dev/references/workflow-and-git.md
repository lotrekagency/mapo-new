# Workflow and git

The loop in detail, and every git rule that comes with it. Read it before you first stage
anything in a project, whenever a commit, a branch or a stash is involved, and when you
resume work.

## Contents

1. The loop
2. Staging
3. Committing (only after approval)
4. Branches and merges
5. What you never do
6. Reverting on purpose
7. Resuming work
8. Verification without servers

---

## 1. The loop

orient → contract → shape → implement → document → verify → stage → report → remember

- One task, one reviewable diff. A feature that takes several steps (a skeleton, then one
  section per step) is reviewed step by step. Each report says what the next step is.
- A sweeping mechanical change (a rename, a comment clean-up, a purge of references) is
  its own step and its own commit. Mixed into a feature, it would bury the review.
- The docs go in the same step as the code. A diff that changes behaviour without its
  doc is not done.
- A change to a shared component made for one page changes the other pages too. List
  them in the report so the reviewer looks at them.

## 2. Staging

- Run `git add <paths>` for this task's files only. Never `git add -A` or `git add .`,
  because the working tree routinely holds unrelated work in progress.
- If something else is already staged (someone's pending review, an approved chunk not
  yet committed), leave your changes unstaged and say so in the report. The two diffs
  then stay separate.
- If a file mixes your change with someone else's, stage only your hunks. Interactive
  staging (`git add -p`) may not be available to an agent, so write the staged version
  of the file into the index directly:

  ```bash
  tmp=$(mktemp -d)
  git show HEAD:src/foo.ts > "$tmp/foo.ts"        # start from the committed version
  # ...apply only your hunks to "$tmp/foo.ts"...
  blob=$(git hash-object -w "$tmp/foo.ts")
  git update-index --cacheinfo 100644,"$blob",src/foo.ts   # mode from `git ls-files -s`
  git checkout-index -a --prefix="$tmp/snapshot/"          # the staged tree on its own
  ```

  Then check that the staged snapshot passes the gates on its own: link the dependency
  folder into the snapshot and run the type-check and build there.
- After staging, read `git diff --cached --stat`. Every path must belong to the task.

## 3. Committing (only after approval)

By default you never commit. The reviewer does, sometimes by hand from your proposed
title. When you are asked to commit:

- Write one conventional-commit title and nothing else: `type(scope): summary`. No body,
  no `Co-Authored-By`, no trailers, unless the project says otherwise.
- Types: `feat`, `fix`, `perf`, `refactor`, `style`, `docs`, `chore`, plus `test`,
  `build` and `ci` where the project uses them.
- Scope: the feature or area (`menu`, `forms`, `checkout`, `i18n`, `env`), taken from
  the scopes the project already uses.
- Summary: what the change delivers, lower case, no final period.
  `feat(news): article page with location map and related articles`.
- Check `git log` first, because the work may already be committed.
- If you notice a commit with the wrong message, say so and suggest the amend. Don't
  rewrite history yourself.

## 4. Branches and merges

- Work on the current branch unless asked otherwise. When you create a branch, make it
  one per feature.
- Merging, rebasing and pushing are the user's decisions.
- Watch for values that live only in a mock or fixture (layout knobs, presentation
  constants) when one branch tuned them and another maps live data. A clean code merge
  drops them silently. Port them by hand and list them in the report. Keeping
  presentation constants in the mapper, in one place, is what makes this tractable.

## 5. What you never do

- Discard work you didn't create: no `git stash drop`/`clear`, `git reset --hard`,
  `git checkout --`/`git restore` on others' changes, or `git clean`.
- Push, deploy or restart shared environments, unless explicitly asked.
- Copy secrets from env files into code, docs, commit messages or chat. If you need to
  know whether two secrets differ, compare their hashes.
- Commit build output, local database dumps, or editor and tool configs that the
  project ignores.
- Rewrite published history.

## 6. Reverting on purpose

Some choices are made knowing they may be undone: a product request the team disagrees
with, an experimental tuning value. When you make one, record the way back in the
decision register's "reversible on purpose" table.

Never revert by blindly checking out an old commit's version of a file. Later commits
to the same files would be erased with it. Revert the behaviour by hand and keep the
later additions.

## 7. Resuming work

1. Run `git status`, `git log --oneline -20` and `git stash list`.
2. Read the memory note for the feature: what was committed, staged or left in the
   working tree, and what was next.
3. Read the feature doc's open points.
4. Check the note against git before acting, because the user may have committed,
   amended or merged in the meantime.

## 8. Verification without servers

By default the work is split this way: you verify statically, and whoever reviews runs
the app.

- Run the project's gates: type-check, lint, unit tests, build. They must be clean
  before staging. Tests that need a running server count as a browser check, so ask
  first.
- Check the build output when the risk is a build-only failure. Every asset a chunk
  references must exist, a route's bundle must not pull in a large data file, and the
  expected entries must be emitted.
- Don't start the dev server, the preview server or the built server to look at a page,
  and don't poll a container until it comes back after a restart. If a browser check is
  essential, ask.
- If the dev server runs in a container that mounts the source tree, running the gates on
  the host can invalidate its dependency cache. Restart it afterwards, or tell the user
  to, and say so in the report.
- What you didn't verify goes in the report, with the reason.
