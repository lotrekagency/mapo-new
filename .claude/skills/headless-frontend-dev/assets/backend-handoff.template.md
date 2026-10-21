<!--
Handoff note for the backend team and the editors. Write it in the recipient's language
(translate these headings too). Save it untracked at the repository root as
backend_<feature>.<lang>.md, unless the team keeps such notes elsewhere. The repo docs
don't link to it. If there is nothing to ask, write no note and say so in the closing
report.
-->

# <Feature>: notes for the backend and data entry

<One or two sentences: what was built, and whether it needed backend or editor-tool
changes.>

## How the design maps onto the data

<Use the labels the editors see in their forms, not code names.>

- <Design element> → <form field or block> (<rule: order, fallback, limits>).

## Backend

1. **<The problem, in one line>.** <What happens, with a concrete case: the record, the
   locale, the request.> Proposal: <the change>.

## Data entry

1. **<Where>.** <What is missing or wrong, in which records or locales.>

## Configuration

- <Keys, env values, third-party settings, and who owns them.>

## Fields to remove (candidates)

- `<field>`: <why nothing reads it anymore.>
