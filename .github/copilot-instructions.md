# POD Tracker — working instructions

Ageing bugs, tickets and CRs across multiple PODs (teams). Data comes from Azure
DevOps Boards or an Excel/CSV upload, lands in OpenSearch, and is read back
through aggregations.

**Stack:** Next.js 15 App Router (frontend *and* backend) · React 19 · TypeScript
strict · Tailwind v4 · OpenSearch 3.x · NextAuth v5 · framer-motion · exceljs.
No chart library — charts are hand-written SVG.

Detailed reference lives in [`docs/`](../docs/README.md). Read the page that
matches your task before making non-trivial changes.

---

## Golden rules

1. **Never widen a query's team scope.** Everything user-facing goes through
   `filtersFromRequest()` in `src/lib/api.ts`, which rejects a POD the caller
   cannot see. A member with no PODs gets a 403, never an unscoped query.
2. **Never store a computed age.** Item age is derived at query time from
   `createdDate`. Storing it makes it wrong the next day.
3. **Never reorder `SERIES` in `src/lib/palette.ts`.** Slot order is the
   colourblind-safety mechanism, validated against the chart surface. Reordering
   silently invalidates it. Palette exports resolve to CSS variables — never
   hardcode a colour in a component, and never write `white/10` or `black/50`,
   which are dark-mode assumptions.
4. **Never add a second y-axis to a chart.** Two measures of different scale get
   two charts, not two scales.
5. **Aggregation fields must be `keyword`.** Adding a field you will group or
   filter on means adding it to `src/lib/mappings.json` first — dynamic mapping
   makes it `text` and every terms agg on it fails.
6. **PATs never reach the browser.** `/api/teams` redacts them; a masked value
   coming back means "leave unchanged".
7. **The webhook never returns 5xx.** Azure disables a subscription after
   repeated failures, so errors return 200 with `ok: false`.

## Repo shape

```
src/lib/       data + domain layer, no React
src/app/api/   route handlers (Node runtime — never Edge, OpenSearch needs node:https)
src/app/       pages: / (dashboard), /admin, /login
src/components/ client components; dashboard-client.tsx is the orchestrator
scripts/seed.mjs  bootstraps indices, admin user, demo data
```

Server/client split: `src/lib/*` is server-only apart from `palette.ts` and
`types.ts`, which are safe to import from components. Never import
`opensearch.ts`, `azure.ts`, `sync.ts`, `users.ts` or `session.ts` into a
`"use client"` file.

## Conventions

- **Imports** use the `@/` alias (`@/lib/metrics`), never deep relative paths.
- **Route handlers** follow one shape: `try { const user = await requireUser() … }
  catch (err) { return errorResponse(err) }`. Throw `HttpError(status, message)`
  for expected failures; `errorResponse` maps it and logs only real 500s.
- **Every route handler** sets `export const dynamic = "force-dynamic"`.
- **Error messages are user-facing prose** — "Pick the POD this file belongs to."
  not "teamId required". They render directly in a toast.
- **Comments explain why, not what**, and only where the reason is not obvious
  from the code. Do not narrate.
- **No new dependencies** without a strong reason. Charts, the drawer, count-up
  and the parallax layer are all hand-rolled on purpose.

## Vocabulary — do not invent new values

Defined once in `src/lib/types.ts`; the UI, palette and aggregations all key off
these exact strings.

| Dimension | Values |
|---|---|
| `severity` | `Critical` `Major` `Minor` `Unknown` |
| `environment` | `IT-UAT` `BIZ-UAT` `CUG` `Production` `Unknown` |
| `status` | `Open` `Commented` `For QA Validation` `Not a Bug` `Closed` `Unknown` |
| `kind` | `bug` `ticket` `cr` |

Board-specific values are mapped onto these in `src/lib/normalize.ts` — per-team
overrides first, then `DEFAULT_VALUE_MAP`, then longest-substring match. Adding a
value means updating `types.ts`, `palette.ts` (a colour slot) **and** the `ORDER`
table in `src/components/breakdown-card.tsx`.

## Common tasks

| Task | Where |
|---|---|
| New dashboard metric | add an agg in `dashboard()` in `src/lib/metrics.ts`, extend the `Dashboard` type, render it |
| New drill-down filter | `Filters` + `buildQuery()` in `metrics.ts`, then parse it in `filtersFromRequest()` |
| New Azure field | `fromAzure()` in `normalize.ts` + a `keyword` entry in `mappings.json` |
| New spreadsheet column | `COLUMN_ALIASES` in `normalize.ts` |
| New page or panel | copy an existing `Panel` from `src/components/ui.tsx` |
| New expandable surface | call `useDrill()`, then add a check that its drill matches the number shown |
| New theme token | add it to **all three** blocks in `globals.css`; `pnpm check:theme` enforces it |

## Validation rules

User input reaches OpenSearch date math and `size`, where junk becomes a 500.

- Numeric query params go through `intParam()` in `src/lib/api.ts` — never
  `Number(p.get(...))` directly.
- Ageing thresholds go through `clampThreshold()` in `types.ts`, **on read as
  well as on write**, because stored documents predate the validation.
- Enum-ish params are checked against their allowlist (`KINDS`, `SORTS`, `ROLES`)
  and fall back to a default rather than being passed through.
- `teamIds` must be a real array in both `saveUser()` and `canSeeTeam()`. On a
  string, `.includes()` is a substring test and grants access nobody granted.
- Date params go through `isoParam()`; unparseable dates are dropped, not passed on.

## Numbers and their drill-throughs

Wherever the UI prints a number beside a drill, the drill must return **exactly
that number**. Add a case to `pnpm check invariants` for every new one — three
have already been wrong, and none was visible without comparing the two.

The single exception is the Environments tile, whose number is a cardinality
rather than an item count; its drawer is explicitly labelled to say so.

## Gotchas that have already bitten

- **Never put `now` in a range query.** OpenSearch wraps it in a query class that
  cannot produce a weight, and inside a filter aggregation it throws
  `unsupported_operation_exception` — intermittently, taking the whole dashboard
  down. Use `daysAgo()` / `floorDay()` / `floorWeek()` from `metrics.ts`.
- `date_range` buckets are **lower-inclusive, upper-exclusive**. Ageing
  drill-downs use `gte`/`lt` to match; using `lte` returns one item too many.
- OpenSearch `wildcard` with options needs the nested form:
  `{ wildcard: { field: { value: "*x*", case_insensitive: true } } }`.
- Azure's `ResolvedDate` is **not** a close date — an item can be resolved and
  still open for QA. Only `Microsoft.VSTS.Common.ClosedDate` closes an item.
- WIQL rejects millisecond ISO timestamps. Use `yyyy-MM-ddTHH:mm:ssZ`.
- The OpenSearch client types aggregations as a union of every possible shape.
  Read responses through `search<T>()` in `opensearch.ts`, which narrows once.
- The poller lives in `src/lib/poller.ts`, started from the metrics route — **not**
  in `instrumentation.ts`, which Next bundles for a runtime that cannot resolve
  `node:https`.

## Verifying a change

```bash
pnpm test                 # every suite in one command
pnpm exec tsc --noEmit          # must be clean
pnpm build             # must pass  (stop `pnpm dev` first — it overwrites .next)
pnpm check             # 316 end-to-end checks against a running dev server
pnpm check:theme       # 183 static checks on the light/dark token system
pnpm check:ui        # 1213 checks on client-side pure logic
pnpm check:docs        # docs still match the code (links, hexes, modules)
```

`pnpm check [invariants|input|auth]` is the real safety net. Every case in it
corresponds to a bug that was once real, so a failure means something regressed,
not that the check is fussy. Add a case whenever you fix a bug.

`pnpm seed --reset` rebuilds demo data if checks left the board dirty.
