# Rebuilding this project

The specification, in build order. Hand this file to an LLM and it has enough to
construct POD Tracker from an empty directory, or to find its way around this one
well enough to fix something.

The other pages in this folder are the *detail*; this one is the **spine**. Where
it says "see X", that page is the authority and this file will not repeat it.

> **How to use this with an LLM.** Give it this file plus the linked page for
> whatever it is touching. Do not paste all eleven documents — the useful context
> is this spine plus one branch. Every phase below ends in a runnable check, so
> tell it to run that before moving on.

---

## 0. What it is

A dashboard for tracking **ageing bugs, tickets and change requests** across
several teams — called **PODs** — with the data coming from Azure DevOps Boards,
a spreadsheet upload, or both.

The product has one idea behind it: **every number is clickable through to the
work items behind it**, and every number agrees with every other number. A count
on a tile, the same count on a bar, and the length of the list you get when you
click either — all one query.

Who uses it:

| Role | Sees |
|---|---|
| **Admin** | every POD, plus `/admin` to onboard PODs and people |
| **Member** | only the PODs assigned to them, enforced server-side |

### The five rules that decide arguments

Everything below follows from these. When an implementation choice is unclear,
the one that satisfies these wins.

1. **Never invent data.** If the weather is not configured, no weather is drawn.
   If a severity is unrecognised, it becomes `Unknown` — never a guess at which
   real category was meant.
2. **One query fills the dashboard.** Separate queries drift apart when data
   changes between them, and then two tiles disagree on screen.
3. **Content decides, filenames are a hint.** An upload is read by sniffing its
   bytes, because the person exporting it was not thinking about this parser.
4. **A check that reimplements what it checks tests only its own copy.** Suites
   import the real modules; every check is mutation-tested.
5. **Refuse rather than mislead.** A file that cannot be parsed with confidence
   gets a message naming the way out. A wrong value imported silently is worse
   than a file politely rejected.

---

## 1. Stack

| | |
|---|---|
| Framework | **Next.js 15**, App Router, React 19 |
| Language | **TypeScript**, strict |
| Styling | **Tailwind v4** (`@tailwindcss/postcss`), tokens in `globals.css` |
| Store | **OpenSearch** |
| Auth | **NextAuth v5 beta** — credentials and/or Entra ID |
| Motion | **framer-motion** |
| Icons | **lucide-react** |
| Fetching | **SWR** |
| Spreadsheets | **exceljs**, plus a hand-written Apple Numbers reader |
| Package manager | **pnpm**, pinned by `packageManager` |

**JavaScript only — there is no Python anywhere, including in the tooling.** The
check suites are `.mjs` and import the real `.ts` modules directly using Node's
type stripping, which is why relative imports inside a module the suites load
must carry an explicit `.ts` extension.

```
pnpm add next react react-dom @opensearch-project/opensearch next-auth \
         bcryptjs exceljs framer-motion lucide-react swr
pnpm add -D typescript @types/node @types/react @types/react-dom \
            tailwindcss @tailwindcss/postcss
```

`pnpm-lock.yaml` is committed and `package-lock.json` must not exist. Install
scripts are refused unless allow-listed in `pnpm-workspace.yaml`.

---

## 2. Environment

Only what genuinely differs between deployments, or must never be committed.
Everything else is a product decision and belongs in `src/lib/constants.ts`.

| Variable | Default | Notes |
|---|---|---|
| `OPENSEARCH_URL` | `http://localhost:9200` | |
| `OPENSEARCH_USERNAME` / `_PASSWORD` | blank | blank when the security plugin is off |
| `OPENSEARCH_INDEX_PREFIX` | `tracker` | lets environments share a cluster |
| `AUTH_MODE` | `password` | `off` \| `password` \| `entra` \| `both` |
| `AUTH_SECRET` | — | `openssl rand -base64 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@example.com` / `changeme` | used by `pnpm seed` |
| `AZDO_ORG_URL` / `AZDO_PROJECT` / `AZDO_PAT` | — | fallback when a POD sets none |
| `SYNC_POLL_SECONDS` | `120` | `0` disables the poller |
| `AZDO_WEBHOOK_TOKEN` | — | unset rejects every webhook call |
| `WEATHER_LAT` / `WEATHER_LON` | blank | optional; blank means no weather at all |

**The Azure variables alone are enough to get a working dashboard.** With them
set and no POD yet in the store, a default POD is created on first run so a
fresh install connects without a visit to `/admin`.

Full table with commentary: [operations.md](operations.md).

---

## 3. The data model

One flat document per work item. Flat on purpose: every aggregation the
dashboard needs is a `terms` or `filter` on a top-level keyword field.

```ts
type Item = {
  id: string;              // `${teamId}:${workItemId}` or `${teamId}:xlsx:${workItemId}`
  workItemId: string;
  teamId: string;
  source: "azure" | "excel";
  kind: "bug" | "ticket" | "cr";   // derived, never stored upstream
  type: string;            // the board's own word: "Bug", "User Story"…
  title: string;
  url: string;
  assignee: string;
  assigneeEmail: string;
  severity: "Critical" | "Major" | "Minor" | "Unknown";
  environment: "IT-UAT" | "BIZ-UAT" | "CUG" | "Production" | "Unknown";
  status: "Open" | "Commented" | "For QA Validation" | "Not a Bug" | "Closed" | "Unknown";
  state: string;           // the board's own state text, kept for display
  priority: number | null;
  tags: string[];
  createdDate: string;     // ISO
  changedDate: string;     // ISO — the sync watermark reads this
  closedDate: string | null;
  isActive: boolean;
};
```

Three indices, all prefixed: `<prefix>-items`, `<prefix>-teams`,
`<prefix>-users`.

**The id scheme is the whole re-import story.** Rows collide on id, so uploading
the same sheet twice updates rather than duplicates. Azure and spreadsheet items
use different prefixes deliberately, so a synced POD and an uploaded sheet cannot
overwrite each other.

`isActive` is computed, not trusted: an item is closed when it has a
`closedDate` **or** its status is terminal (`Closed`, `Not a Bug`). A close date
beats whatever the status text says.

Detail, including the mappings: [data-model.md](data-model.md).

---

## 4. Build order

Each phase leaves something runnable. Do not skip the checks — they are how the
next phase knows the last one held.

### Phase 1 — the store

`src/lib/opensearch.ts`: client, index bootstrap (`ensureIndices`), a narrowed
`search`, and `bulkIndex`. Mappings live in `src/lib/mappings.json` so
`scripts/seed.mjs` can create identical indices without importing TypeScript.

`scripts/seed.mjs`: indices, an admin user, and demo data from a **fixed PRNG
seed** so every run produces the same board.

→ `pnpm seed` then query the index directly.

### Phase 2 — normalising

`src/lib/types.ts` — the vocabulary and `Item`.
`src/lib/normalize.ts` — `fromAzure()` and `fromRow()`, both landing on `Item`.

Value resolution runs in three passes, and the order matters: the POD's own
overrides, then the shipped defaults, then a **substring** pass with the longest
key first — so `3 - Medium (UI)` reaches `Minor`, `Deployed to Prod` reaches
`Production`, and `Not a Bug` beats `Bug`.

Environment is the field most boards do not have, so it falls back to tags, then
to the Azure area path, before giving up.

### Phase 3 — metrics

`src/lib/metrics.ts` — `dashboard(filters)`, one `size: 0` search carrying every
aggregation, and `listItems()` for the drill-downs. Both build their query with
the same `buildQuery()`, which is what keeps a bar and its drawer agreeing.

Two traps, both of which have bitten this codebase:

- **Date windows are absolute epoch millis, never `now-7d` date math.**
  OpenSearch wraps a range containing `now` in a query that throws inside a
  filter aggregation, intermittently, depending on segment state.
- **Ageing buckets are lower-inclusive, upper-exclusive**, and the drill-down
  must mirror that with `gte`/`lt`. Using `lte` returns one extra item and the
  drawer disagrees with the bar.

`src/lib/health.ts` — the board score. See [metrics.md](metrics.md#health-score).

### Phase 4 — the API

Every route is Node runtime, `force-dynamic`.

| Route | Does |
|---|---|
| `GET /api/metrics` | the whole dashboard in one response |
| `GET /api/items` | drill-down list plus the true total |
| `GET /api/export` | `.xlsx`, or `?format=csv` |
| `POST /api/upload` | spreadsheet import |
| `GET POST /api/teams`, `/api/teams/[id]` | POD CRUD |
| `POST /api/teams/[id]/test` | check an Azure connection |
| `GET POST /api/users` | people |
| `POST /api/sync` | manual sync |
| `POST /api/webhooks/azure` | Azure service hook |
| `/api/auth/[...nextauth]` | NextAuth |

**`src/lib/api.ts` is the security boundary.** It turns a request into a
`Filters` object already scoped to what the caller may see. A route that builds
filters itself has bypassed tenancy — this is the single most important
invariant in the codebase.

### Phase 5 — the dashboard

`src/app/page.tsx` renders `dashboard-client.tsx`, which owns filter state and
fetches `/api/metrics` through SWR.

| Component | Shows |
|---|---|
| `health-ring` + `health-dial` | the score, its drivers, the greeting |
| `stat-rail` | the five headline numbers |
| `breakdown-card` | severity / environment / status / ageing bars |
| `trend-chart` | raised vs closed, daily or weekly |
| `leaderboard` | who is holding the board |
| `team-rollup` | every POD, one row each |
| `drill-drawer` | the one detail surface every panel opens |

Every one of those drills. That is the product.

### Phase 6 — ingestion

Azure (`azure.ts`, `sync.ts`, `poller.ts`) and spreadsheets (`upload/route.ts`,
`spreadsheet.ts`, `numbers.ts`).

Sync is **watermarked and incremental**, reading `changedDate`, with a minute of
overlap subtracted so nothing falls through the gap between runs. A failed sync
must not advance the watermark.

Upload sniffs the bytes: `.xlsx`, `.csv` and `.numbers` are read; `.ods` and the
old binary `.xls` are refused with the exact menu path out of that app.

See [azure-integration.md](azure-integration.md) and
[excel-upload.md](excel-upload.md).

### Phase 7 — auth

`auth-and-tenancy.md` is the authority. The rule: **members are confined
server-side**, and a member id that is a substring of another POD's id must not
grant access to it.

### Phase 8 — the checks

Four suites, and they are not optional decoration — this project's history is a
list of checks that passed while the code was broken.

```
pnpm exec tsc --noEmit
pnpm check:ui       # pure logic, imports the real modules
pnpm check:theme    # tokens, contrast, source rules
pnpm check:docs     # these pages still match the code
pnpm check          # end-to-end, needs a running server
pnpm test           # all of the above, managing the server itself
```

---

## 5. Invariants a rebuild must satisfy

If an implementation breaks one of these, it is wrong regardless of how it
looks. Every one is enforced by a check, and every one corresponds to a bug that
was real.

**Numbers**

- `total = active + closed`, and every breakdown sums to `total`.
- Every bar returns exactly its own count when clicked.
- The ageing buckets sum to `active`, not to `total`.
- Adjacent date windows do not double-count: an item at an exact bucket edge
  belongs to the later bucket only.
- The health score equals `closed / total` rounded — checkable by hand off the
  card.

**Behaviour**

- A member never sees another POD's items, through any route or query string.
- A malformed upload is a 400 that names the problem, never a 500.
- A failed sync leaves the watermark where it was.
- Re-uploading a file updates items rather than duplicating them.
- Weather is real or absent, never invented.

**Interface**

- Every token exists in all three theme blocks, and the two dark blocks match.
- The greeting scene is **not** in any theme block — it follows the clock, not
  the theme.
- No component writes `white/N`, `black/N` or a raw hex.
- Text clears its contrast floor against the whole panel gradient.
- Every panel is fluid to 320px.
- Reduced motion is respected everywhere.

---

## 6. How to work on it

**Fix the root cause, not the path in the report.** Grep every caller of a
function before editing it; one guard in the shared function beats a guard in
each caller and leaves no sibling still broken.

**Every non-trivial change leaves a runnable check.** Then *mutate the code* to
prove the check fails — a check that passes against broken code is worse than no
check, because it is trusted.

Two traps this codebase has fallen into repeatedly, both worth stating plainly:

- **A check that mirrors the logic it checks tests only its own copy.** Import
  the real module.
- **A comment quoting the string its own rule forbids will trip that rule.**
  Anchor source rules to the JSX, or strip comments before running them.

**Comments say why, never what.** The code already says what.

Where things live, file by file: [README.md](README.md).
Symptoms and their causes, including bugs already fixed:
[troubleshooting.md](troubleshooting.md).
Why the non-obvious choices were made: [decisions.md](decisions.md).
