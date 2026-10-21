# Approach and technical decisions

**Purpose.** This doc explains how the frontend is built and records the technical
decisions taken along the way. Each decision comes with its reason and a pointer to the
doc that holds the detail.

**Audience.** Anyone who needs the *why* before changing something, and anyone about to
reopen a decision that is already settled.

**How to use it.**

- Part 1 describes the approach: read it once.
- Part 2 is the register, grouped by area. Find the area you are touching, read the
  entry and follow its reference.
- A decision is reopened on purpose, by updating its entry in the same change. Code that
  quietly does something else is not a reopening.

<!--
Rules: stable IDs (never renumber), no dates, no people's names, no design-tool
references. When a choice is replaced, rewrite its row; don't append a contradicting one.
-->

---

## Part 1 — The approach

### 1.1 Starting point

<What exists: the backend, the legacy frontend if any, the editors' tool, the goal.>

### 1.2 Strategy

<Big-bang or gradual; how the site stays usable during the work; what parity means.>

### 1.3 Runtime model

<The rendering mode, and why. Where data is fetched, and why there is no second
mechanism.>

### 1.4 The boundary

<Transport, mappers, components: three layers, three concerns.>

### 1.5 Delivery method

<Mock-first or straight to live; the skeleton stage; the review gate; gaps reported by
owner.>

### 1.6 Presentation

<Component strategy, reuse ladder, styling system.>

### 1.7 Motion

<Mechanisms and the contracts that came out of incidents.>

### 1.8 Content ownership

<What the editors own, what the frontend owns, the trusted-HTML policy, translations.>

### 1.9 Milestones

In the order they landed:

1. <milestone>

---

## Part 2 — Decision register

Each entry reads: **decision** · **why** · **where the detail lives**.

### A. Architecture and integration

| # | Decision | Why | Detail |
|---|---|---|---|
| A1 | <decision> | <reason> | <doc § section> |

### B. Workflow and conventions

| # | Decision | Why | Detail |
|---|---|---|---|
| B1 | Work ends staged; commit only after review | A review gate between work and history | AGENTS.md §3 |
| B2 | Commits are a single conventional-commit title | Terse, scannable history | AGENTS.md §3.3 |
| B3 | Docs are updated in the same step as the code | Docs never lag the code | doc_guide.md |
| B4 | Comments explain mechanism and reason, with no design-tool references and no names | Design references rot; names tie docs to a person | AGENTS.md §3.5 |
| B5 | Sweeping clean-ups ship as separate commits | Feature diffs stay reviewable | AGENTS.md §3.3 |
| B6 | Gaps are split into backend fields and data entry | Two owners, two different fixes | docs/new_page.md |
| B7 | Legacy rules ported into mappers are tagged `Legacy:` | They are what silently gets lost in a rewrite | docs/new_page.md |
| B8 | The agent verifies with the gates and static checks and starts no servers; the browser test happens at review | The reviewer runs and tests the app | AGENTS.md §3.1 |

### C. Components and layout

| # | Decision | Why | Detail |
|---|---|---|---|
| C1 | <decision> | <reason> | <doc> |

### D. Content, copy and translations

| # | Decision | Why | Detail |
|---|---|---|---|
| D1 | Titles wrap by width and target line count, never by fixed breaks | Copy changes per locale and per edit | <doc> |
| D2 | Editor HTML is printed as saved; the frontend may measure it but never rewrites it | A parser breaks silently on copy written slightly differently | <doc> |

### E. Media

| # | Decision | Why | Detail |
|---|---|---|---|
| E1 | Media come as desktop + mobile slots (mobile falls back to desktop) and render through one component | Crops differ per breakpoint; both slots are ready before the backend fills them | <doc> |

### F. Motion and scroll

| # | Decision | Why | Detail |
|---|---|---|---|
| F1 | Reduced motion removes motion, never content | A hiding fallback makes the site look broken for users with the setting on | <doc> |

### G. Styling

| # | Decision | Why | Detail |
|---|---|---|---|
| G1 | <decision> | <reason> | <doc> |

### H. Forms

| # | Decision | Why | Detail |
|---|---|---|---|
| H1 | <decision> | <reason> | <doc> |

### I. Navigation

| # | Decision | Why | Detail |
|---|---|---|---|
| I1 | <decision> | <reason> | <doc> |

### J. Per-feature decisions

**<Feature>**

| # | Decision | Why | Detail |
|---|---|---|---|
| J1 | <decision> | <reason> | <doc> |

### K. Platform and deployment

| # | Decision | Why | Detail |
|---|---|---|---|
| K1 | An explicit environment name gates integrations; nothing gates on the build mode | Staging runs production builds | <doc> |

### L. Reversible on purpose

These choices were made knowing they might be undone. The way back is recorded, so that
reverting stays a small change.

| Choice | Way back |
|---|---|
| <choice (register ID)> | <the steps; warn about later commits on the same files> |
