# POD Tracker — working instructions

Ageing bugs, tickets and CRs across multiple PODs (teams). Data comes from Azure
DevOps Boards or a spreadsheet upload, lands in MongoDB, and is read back
through aggregations.

**Stack:** Next.js 15 App Router (frontend *and* backend) · React 19 · TypeScript
strict · Tailwind v4 · MongoDB + Mongoose · NextAuth v5 · framer-motion · exceljs.
No chart library — charts are hand-written SVG. **pnpm, never npm.**

Detailed reference lives in [`docs/`](../docs/README.md). Read the page that
matches the task before making non-trivial changes. For changing what the
dashboard fetches, maps or shows, [`docs/changing-the-data.md`](../docs/changing-the-data.md)
is a recipe book: which files, in what order, and what breaks if you skip one.

---

## The one habit that matters here

**Every non-trivial change leaves a runnable check, and you break the code on
purpose to prove the check fails.**

This is not ceremony. The suites in `scripts/` exist because each rule in them
was broken once, and most were broken *while a check was passing*. Three
knowingly-broken builds shipped past a suite that was testing its own copy of
the logic rather than importing the real module.

Two traps that have caught people repeatedly:

- **A check that reimplements what it checks** tests only its copy. Import the
  real module; the suites run under Node's type stripping, which is why relative
  imports inside those modules carry an explicit `.ts`.
- **A comment quoting the string its own rule forbids** will trip that rule.
  Anchor source rules to code, not prose.
- **`indexOf(a) < indexOf(b)`** is true when `a` is missing, because `indexOf`
  returns `-1`. Check both are present first.

```bash
pnpm exec tsc --noEmit    # fastest way to find what a change missed
pnpm test                 # every suite; manages the dev server itself
pnpm check invariants     # after touching anything that reads or writes items
```

---

## Golden rules

1. **Never widen a query's team scope.** Everything user-facing goes through
   `filtersFromRequest()` in `src/lib/api.ts`, which rejects a POD the caller
   cannot see. A member with no PODs gets a 403, never an unscoped query. **This
   is the security boundary** — a route that builds its own filters has bypassed
   tenancy.
2. **Never store a computed age.** Item age is derived at query time from
   `createdDate`. Storing it makes it wrong the next day.
3. **Never reorder `SERIES` in `src/lib/palette.ts`.** Slot order is the
   colourblind-safety mechanism, validated against the chart surface. Palette
   exports resolve to CSS variables — never hardcode a colour in a component,
   and never write `white/10` or `black/50`, which are dark-mode assumptions.
4. **Never add a second y-axis to a chart.** Two measures of different scale get
   two charts, not two scales.
5. **Aggregation fields must be `keyword`.** A field you will group or filter on
   goes into `src/lib/mappings.json` first — dynamic mapping makes it `text` and
   every terms agg on it fails, silently.
6. **One query fills the dashboard.** `dashboard()` issues a single `size: 0`
   search carrying every aggregation. Separate queries drift apart between
   moments, and then two tiles disagree on screen about the same number.
7. **PATs and password hashes never reach the browser.** `/api/teams` redacts
   PATs; a masked value coming back means "leave unchanged". `/api/users` sends
   `hasPassword: boolean` and never the hash.
8. **The webhook never returns 5xx.** Azure disables a subscription after
   repeated failures, so errors return 200 with `ok: false`.
9. **Never invent data.** No weather provider configured means no weather drawn.
   An unrecognised severity becomes `Unknown`, never a guess at which real one
   was meant.
10. **Nothing is wider than the viewport.** No `w-screen`, no negative inset in
    `vw`, and any `min-w` past 320px lives inside `overflow-x-auto`.

---

## Repo shape

```
src/lib/            data + domain, no React
  api.ts            request → scoped Filters   ← the security boundary
  (data access lives in src/db/ and src/controllers/ — see below)
  mappings.json     index mappings, shared with scripts/seed.mjs
  metrics.ts        one aggregation; metrics/ holds query, dates, list-items
  health.ts         the board score: closed ÷ total
  normalize.ts      Azure item / spreadsheet row → Item
    normalize/      vocabulary (a board's words → ours), columns
  value-map.ts      the word table itself; grows with every board that connects
  azure.ts          WIQL + workitemsbatch + testConnection
  sync.ts           watermarked incremental sync
  numbers.ts        Apple Numbers reader; numbers/ holds zip, snappy, protobuf
  auth-secret.ts    refuses to boot on a missing or placeholder AUTH_SECRET
  auth-cookies.ts   httpOnly / SameSite / Secure, stated so they are checkable
  session-policy.ts idle and absolute timeouts; what ends a session early
  login-throttle.ts per-account lockout, checked before the bcrypt
  constants.ts      a barrel over constants/ — every tunable literal
  types.ts          the vocabulary       palette.ts  validated data colours
src/app/api/        route handlers, Node runtime — never Edge
src/app/admin/      admin-client + panels/ (pod-list, pod-azure, people-panel…)
src/components/     client components; dashboard-client.tsx orchestrates
  ui.tsx            a barrel over ui/ (surfaces, controls, menu, tooltip…)
  greeting*.tsx     the card, its scene, its cast, its choreography
scripts/            seed + four check suites
```

**Server/client split.** `src/lib/*` is server-only apart from `palette.ts`,
`types.ts`, `health.ts`, `greeting.ts`, `sky.ts`, `takeover.ts`, `validation.ts`,
`suggest.ts`, `spreadsheet.ts` and `constants.ts`, which are safe to import from
components. Never import `db/`, `controllers/`, `azure.ts`, `sync.ts`, `users.ts` or
`session.ts` into a `"use client"` file.

**File size.** Modules stay under 200 lines. A handful of screens are over and
are listed as debt in `scripts/check-ui.mjs`; that list may shrink, never grow.

---

## Conventions

- **Imports** use the `@/` alias (`@/lib/metrics`), never deep relative paths.
  Exception: modules the check suites import directly need `.ts` on their own
  relative imports, because Node's type stripping does not resolve extensionless
  specifiers.
- **Route handlers** follow one shape:
  `try { const user = await requireUser() … } catch (err) { return errorResponse(err) }`.
  Throw `HttpError(status, message)` for expected failures.
- **Every route handler** sets `export const dynamic = "force-dynamic"`.
- **Error messages are user-facing prose** — "Pick the POD this file belongs to.",
  not "MISSING_TEAM_ID". If a file cannot be read, name the way out.
- **Comments say why, never what.** The code already says what. A comment that
  restates the line above it is noise; one that records the bug the line
  prevents is the most valuable thing in the file.
- **Hardcoded values** go in `src/lib/constants/`, not inline — unless they are
  only meaningful beside the equation that uses them (`sky.ts`, `takeover.ts`).

---

## Things that look right and are not

Each of these shipped, looked fine, and was wrong:

| Looked fine | Was |
|---|---|
| `AUTH_SECRET \|\| "dev-only-insecure-secret"` | anyone reading the repo could forge an admin session |
| A health check that returned 200 | it did not import the auth config, so a broken container was marked healthy while every page 500'd |
| `it → IT-UAT` matching by substring | matched inside "microsites", mislabelling a whole board |
| `tags.includes("cr")` | a task tagged "critical" became a change request |
| Dark glass at `0.11` opacity | 13.55:1 over the page plane, **1.44:1** over the greeting sky — invisible |
| `overflow-x: hidden` on `body` | forces `overflow-y: auto`, making it a scroll container that breaks sticky |
| `lte` on an ageing bucket's upper bound | one extra item, so the drawer disagreed with the bar |
| A 30-day default session | no absolute timeout, so a stolen token that was used never expired |

The pattern: **the failure was silent.** When in doubt, prefer the option that
fails loudly.

---

## Numbers and their drill-throughs

Every number on the dashboard is clickable and must return **exactly** the count
it displays. `pnpm check invariants` asserts that for every tile, bar and row.

Date windows are absolute epoch millis, never `$NOW` — every number on one
board must be measured from the same instant, or two panels straddle midnight
and disagree by a day. The previous store had a sharper version: it
wraps a range containing `now` in a query that throws inside a filter
aggregation, intermittently. Ageing buckets are lower-inclusive and
upper-exclusive, and the drill-down mirrors that with `gte`/`lt`.

---

## Before opening a PR

```bash
pnpm exec tsc --noEmit
pnpm test
```

`pnpm check:docs` is part of that and will fail if you add a source module
without mentioning it in `docs/README.md`, quote a hex that no longer exists, or
tell anybody to run `npm`.
