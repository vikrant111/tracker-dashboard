---
applyTo: "scripts/**"
description: How the check suites are written, and the mistakes they exist to prevent
---

# The check suites

Four suites, ~2,900 assertions. **Every one exists because something was broken
once**, and most were broken *while a check was passing*.

| Suite | Runs | Covers |
|---|---|---|
| `check-ui.mjs` | no server | pure logic — imports the real modules |
| `check-theme.mjs` | no server | tokens, contrast, source rules |
| `check-docs.mjs` | no server | the docs still match the code |
| `check.mjs` | needs a dev server | end-to-end: aggregations, input, auth |

## Writing one

**Import the real module.** The suites run under Node's type stripping, so
`check-ui.mjs` can `import { healthScore } from "../src/lib/health.ts"`. A check
that reimplements the logic it checks tests only its own copy — this codebase
shipped three knowingly-broken builds that way.

Modules the suites import need explicit `.ts` on their own relative imports.
Node's type stripping does not resolve extensionless specifiers.

**Then break the code on purpose.** Change the source so the check *should*
fail, and confirm it does. A check that cannot fail is worse than no check,
because it is trusted. Every finding in this project's history came from doing
this.

## Mistakes that have been made in these files

| Mistake | Why it passed |
|---|---|
| `check("…", /preload/.test(config))` | the comment explaining the rule contained the word |
| `indexOf(a) < indexOf(b)` | `indexOf` returns `-1` when `a` is gone, and `-1 < anything` |
| `/HEALTHCHECK/.test(docker)` | a **commented-out** `# HEALTHCHECK` still matches |
| `/unmatched/.test(src)` | matched the word while the logic was bound to a dead variable |
| `valid === false` without the reason | a different branch caught it, so the guard could be deleted |
| Asserting an exact line count | went stale the moment prettier rewrapped |
| Reading one file after a split | the rule moved to a sibling and the check went quiet |

The pattern: **anchor to the behaviour, not to the text.** When a rule is about
source, anchor it to code rather than prose, and read whole surfaces rather than
single files — several checks read a directory so a future split cannot hide a
rule.

## Leaving the instance as you found it

`check.mjs` runs against real data. Anything it creates it deletes, and anything
it changes it changes back — a suite that leaves a test account behind is a
suite that will one day leave a *password* behind.
