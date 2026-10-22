# QA rounds, verification and debugging

How to run a round of fixes, how to verify without a browser, and how to find causes
fast. Read it for QA feedback, bug reports and "it doesn't work on X", and before you
call anything verified.

## Contents

1. QA rounds
2. Verifying without a browser
3. Debugging order
4. Symptom → cause catalogue
5. Bugs the frontend can't fix

---

## 1. QA rounds

QA feedback often arrives as a numbered list, pasted by the user after testing on
staging.

- Triage it first. Classify each point as frontend, backend, data entry or environment,
  and ask for the URL when a point doesn't reproduce.
- Keep a map of point → files → state (committed, staged, working tree) in memory. The
  user may commit one point at a time between sessions, so check `git log` and
  `git status` every time you resume.
- Stage one point (or one coherent group) per step, unless the user wants the whole round
  as one diff.
- Fix each problem in its own layer. A payload mismatch is fixed in the types or the
  mapper. A content problem is reported as data entry. An environment key is
  configuration.
- A point that is really a product decision (keep the legacy logic or not) gets a
  question, and the answer goes into the feature doc.
- Put a test checklist for each fixed point in the closing report: the page, the
  breakpoint, the interaction, reduced motion.

## 2. Verifying without a browser

- The project's gates must be clean: type-check, lint, tests, build.
- Then run static checks on the build output, aimed at the change's risk:
  - every asset a chunk references exists in the output;
  - the client bundle doesn't include a large data file by accident;
  - the server-rendered HTML contains the expected sections. This check needs a running
    server, which by default you don't start.
- A 200 on a page proves that the server rendered it, not that the client scripts run.
  One failed transitive import kills every script on the page and leaves the HTML
  intact.
- Put what you couldn't verify, and why, in the report.

## 3. Debugging order

1. Reproduce the problem, or get the exact URL, device and settings.
2. Classify it: frontend code, backend contract, data, environment or configuration,
   user settings.
3. If "nothing works on some devices" and the console is clean, check accessibility and
   power settings first (reduced motion), then dependencies that failed to load, and only
   then the code.
4. If it works locally and fails when deployed, check build-time vs runtime
   configuration, trusted hosts, the build output and environment-specific keys.
5. If it works in dev and fails in the build, look at what the dev server does that the
   build doesn't, such as assets imported only dynamically.
6. Read before you change anything. Find the mechanism and its doc: the fix usually
   belongs to the mechanism, not to one page.

## 4. Symptom → cause catalogue

Each of these has cost real time somewhere.

| Symptom | Usual cause |
|---|---|
| The site "doesn't load" on some machines, with a clean console | Reduced motion is on and a fallback hides media or text; or lazy videos without a poster show as black boxes |
| Every client script dies after a config change, but the HTML is fine | The dev server's pre-bundled dependencies went stale (it answers 504 for them). Restart it. Running checks on the host against a container that mounts the source can cause this |
| Media or canonical URLs point at `localhost` in staging or production | The SSR adapter doesn't trust the host (the allowed-hosts list was missing at build), or the proxy doesn't forward the host. The backend builds absolute URLs from the forwarded host |
| Every form submission is rejected, but only in deployed environments | A public build-time variable (a captcha site key) was missing at build, so `undefined` was baked in |
| Works in dev, dead in the build: a chunk preloads a file that doesn't exist | An asset (often CSS) imported only through a client-side dynamic `import()` isn't emitted. Import it statically and keep only the JS lazy |
| A fixed bottom bar "disappears" on mobile | Horizontal overflow zooms the viewport out and pushes fixed elements off the screen |
| A nested scroller or an overlay won't scroll | The smooth-scroll exemption is missing on the overlay's root |
| The page stays frozen after an overlay closes | The scroll lock is unbalanced: a per-frame close unlocks twice, or never |
| A `hidden` element still shows | An authored `display` beats the user-agent rule |
| A dropdown paints under the next field | An ancestor creates a stacking context (`backdrop-filter`, `transform`) |
| A decoration disappears behind its section | Its host has no stacking context (`isolation: isolate`) |
| A scoped style is silently not applied | The class was handed to a child component, or the content is injected HTML |
| Measurements of a pinned section are wrong | Pin spacers shift them. Read the cached, pin-aware geometry |
| A page frame or hint takes the wrong theme over grouped sections | The wrapper counts as one block to the page geometry. Mark it as a group |
| A covered screen shows through later sections | The covering blocks aren't opaque and positioned from edge to edge |
| A carousel inside a modal measures 0 | It measured while the dialog was closed. Measure again on open |
| A route is never reached | The reverse proxy sends that path prefix elsewhere (`/api`, for example) |
| The client bundle is huge | A large JSON file is imported in client code. Serve it from an endpoint |
| Titles break lines in odd places | Editors typed a literal `\n` or a `<br>`. Normalize them in the title helper |
| A label shows `&#x27;` | A translation value skipped the single decode point |
| Several videos decode inside a pinned screen | The generic video observer doesn't skip the videos that the sequence owns |
| Two texts are frozen half-blended | A scrubbed text cross-fade. Switch to discrete stages |
| The wheel over a row stops the page | Wheel ownership isn't decided per gesture |
| A heavy image is fine locally and slow on staging | The image optimization proxy is bypassed in development, or the other way around |
| A third-party API works in one environment only | Its keys are restricted by IP or referrer, differently per environment. That is configuration, not frontend |
| An endpoint answers 403 on one host only | It checks the `Referer` or a site-URL setting that doesn't match that host |
| A fixed element is off screen only in headless mobile emulation | The emulation inflates the inner height. Check with a real device profile |
| Local pages show broken media while staging is fine | The local media store lacks the files (database rows without files). That is the environment, not a bug |
| A tool can't reach the containers from your session | Your session lacks access (socket, network). Don't conclude that the services are down; say what you couldn't check |

## 5. Bugs the frontend can't fix

Write down what you observed, the request and the response that prove it, the layer that
owns the problem, and a proposal. Put this in the closing report, and in the handoff note
when the feature is done. Don't hide it behind a frontend workaround unless the user asks
for one. If they do, mark it `TEMP(...)` and list it.
