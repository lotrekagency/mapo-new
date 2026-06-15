# Progressive Disclosure

A declarative DSL for conditional field visibility — a more readable alternative to imperative `visible` / `show` callbacks.

## TL;DR

```ts
// when, matchesField, isOneOf are Nuxt auto-imports — no explicit import needed
{
  key: 'seo_description',
  visible: when(
    matchesField('seo_enabled', true),
    matchesField('type', isOneOf(['published', 'scheduled'])),
  ),
}
```

The DSL produces the same `visible(ctx) => boolean` callback that `MapoFormField` already understands. Pure functions, fully composable.

Every helper (`when`, `whenAny`, `whenNot`, `matchesField`, `isOneOf`, `isNoneOf`, `isNotEmpty`, `isEmpty`, `greaterThan`, `lessThan`, `matches`) is auto-imported — no explicit `import` needed in pages and plugins.

---

## The problem it solves

```ts
// Before — imperative, hard to scan
{
  key: 'seo_description',
  visible: (ctx) =>
    ctx.model.seo_enabled === true && ctx.model.type !== 'draft',
}
```

A complex form with 10 conditional fields turns into 10 small functions doing similar lookups. The DSL makes the intent obvious at a glance.

## API

### `when(...conditions)` — AND

All conditions must be true.

```ts
visible: when(
  matchesField("enabled", true),
  matchesField("role", isOneOf(["admin", "editor"])),
);
```

### `whenAny(...conditions)` — OR

At least one condition must be true.

```ts
visible: whenAny(matchesField("type", "video"), matchesField("type", "audio"));
```

### `whenNot(condition)` — NOT

```ts
visible: whenNot(matchesField("is_draft", true));
```

### `matchesField(key, matcher)` — read a field

`key` accepts dotted paths (`"meta.status"`, `"translations.it.title"`). `matcher` is either a literal value or a helper:

```ts
matchesField("count", greaterThan(0));
matchesField("slug", matches(/^[a-z]/));
matchesField("tags", isNotEmpty());
```

## Matcher helpers

| Helper                | Description                                      |
| --------------------- | ------------------------------------------------ |
| `isOneOf(options[])`  | Value is in the array                            |
| `isNoneOf(options[])` | Value is **not** in the array                    |
| `isNotEmpty()`        | Not null, not `''`, not `false`, non-empty array |
| `isEmpty()`           | Inverse of `isNotEmpty`                          |
| `greaterThan(n)`      | Numeric value `> n`                              |
| `lessThan(n)`         | Numeric value `< n`                              |
| `matches(regex)`      | String passes the regex                          |

## How to: extract reusable predicates

Conditions are plain functions — give them names:

```ts
const isPublished = matchesField("status", "published");
const hasTranslations = matchesField("languages", isNotEmpty());
const isAdmin = matchesField("role", isOneOf(["admin", "superuser"]));

const fields = [
  { key: "publish_date", visible: isPublished },
  { key: "lang_switcher", visible: when(isPublished, hasTranslations) },
  {
    key: "admin_notes",
    visible: isAdmin,
    show: when(isAdmin, isPublished), // v-show, separate from v-if
  },
];
```

## How to: choose between `visible` and `show`

| Prop      | Renders as | Use when…                                                   |
| --------- | ---------- | ----------------------------------------------------------- |
| `visible` | `v-if`     | the field must NOT be sent if the user cannot see it        |
| `show`    | `v-show`   | you only want to hide UI; the value should still be tracked |

```ts
{
  key: 'discount_code',
  visible: matchesField('has_discount', true),         // removed from DOM when false
  show: when(
    matchesField('has_discount', true),
    matchesField('cart_total', greaterThan(0)),         // hidden if cart empty
  ),
}
```

## How to: make a field visible only when another is dirty

The DSL passes the form context, so anything reachable from `ctx` is fair game — including `isDirty` flags. You can also fall back to a one-liner predicate when the helpers do not cover your case:

```ts
{
  key: 'changelog_note',
  visible: (ctx) => ctx.model.title !== ctx.backup?.title,
}
```

The DSL is meant for _most_ cases — drop to a regular function any time it is clearer.

## Pitfalls

- **Closures over stale values** — never read from `useState` / module-level refs inside a predicate. Always reach into `ctx` so the form re-evaluates correctly.
- **Conditional + `required`** — a hidden `required` field still fails `validateClient()` if the rule is not gated. Combine: `required: !someCondition()` or move the `required` check into a manual `validate`.
- **Path strings are not type-checked** — `matchesField('typoed_key', …)` compiles. Use a `keyof Model` constant when the cost is worth it.
