# <Feature or page type>

<!--
One doc per page type or feature. Facts from the current code, the happy and the failure
paths, no dates, no design-tool references, no people's names. List the doc in
docs/README.md in the same step.
-->

**Purpose.** <What this page type or feature is, and who uses it.>
**Audience.** Whoever changes it.

| | |
|---|---|
| Record type / code | `<type>` / `<code>` |
| View | `<path>` |
| Mapper | `<path>` |
| Components | `<folder>` |
| Translations | `<dictionary>` |

---

## 1. Data flow

```text
GET /<locale>/<path>
  → entry point: fetch <record> (+ chrome data, labels)
  → <view>: map<Page>(record, t, locale)
  → sections: <list, in render order>
```

<Query-driven lists fetched by the view, if any, and their fail-soft path.>

## 2. Sections

### 2.1 <Section>

| Backend field | Frontend model | Rendered by | Fallback / fail-soft |
|---|---|---|---|
| `<field>` | `<prop>` | `<Component>` | <what happens when it is absent> |

- **Decisions:** <register IDs, and page-specific choices with their reasons>.
- **Motion:** <mechanism, and the reduced-motion fallback>.
- **Legacy rules:** <rules ported, also tagged `Legacy:` in the mapper>.

### 2.2 <Section>

<Same structure.>

## 3. Components

- **Reused:** <component (rung of the ladder: as-is, preset, wrapper, extended)>.
- **New:** <component, and why no existing one fitted; catalogue entry added>.

## 4. Behaviour

<Interactions, state in the URL, overlays and their hashes, analytics events.>

## 5. Failure paths

<An empty record, missing media, disabled blocks, backend errors, missing configuration.>

## 6. Open points

### Backend fields

1. <What is missing, a concrete case, the proposal.>

### Data entry

1. <Where, which records or locales, what to fix.>

### Configuration

- <Keys, env values, third-party settings.>

### Removal candidates

- `<field>`: <why nothing reads it.>
