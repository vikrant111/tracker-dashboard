# POD Tracker

Ageing bugs, tickets and CRs across every POD — live from Azure Boards, or from
an Excel export when you just need something on screen.

Next.js (frontend **and** backend) · OpenSearch · Azure DevOps REST + Service Hooks.

> 🚀 **New here? Read [START-HERE.md](START-HERE.md)** — the whole project
> explained from scratch, with the setup walked through step by step.

> Working on the code? Start at [`docs/`](docs/README.md) — architecture, data
> model, metrics, integration, design system, operations, troubleshooting and
> the reasoning behind the non-obvious choices.

---

## Run it

**1. Start OpenSearch**

```bash
brew install opensearch && brew services start opensearch
# or, if you prefer containers
docker compose up -d
```

**2. Configure**

`.env.local` is already written with generated secrets. Fill in the Azure block
when you have a PAT — everything else works without it.

**3. Seed and start**

```bash
pnpm install
pnpm seed      # indices + first admin + two demo PODs with 360 work items
pnpm dev
```

Open http://localhost:3000 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
from `.env.local` (defaults: `admin@example.com` / `changeme`).

Run every check with `pnpm test` — it starts a dev server if one is not already
listening, and shuts down only the server it started.

Seed variants: `pnpm seed --no-demo` (indices and admin only),
`pnpm seed --reset` (drop the indices first).

---

## What is on the dashboard

| Panel | Reads |
|---|---|
| **Board health** | a 0–100 score: aged criticals, average age, share of the board still open. Drag the ring to find where each band begins; it springs back to the real score on release |
| **Top assignees** | who holds what, sortable by volume, ageing or criticals; the bar splits their open items by severity. Searchable and scrollable, showing the true board rank even when filtered |
| **Headline tiles** | Total · Active · Average ageing · Critical aged · Environments |
| **Severity** | Critical / Major / Minor / Unknown |
| **Bug status** | Open / Commented / For QA Validation / Not a Bug / Closed / Unknown |
| **Environment** | IT-UAT / BIZ-UAT / CUG / Production |
| **Ageing** | open items bucketed 0–3, 4–7, 8–14, 15–30, 30+ days |
| **Closure trend** | raised vs closed, daily over 30 days or weekly over 12 |
| **Leadership roll-up** | every POD side by side (admins only) |

**Everything is expandable.** Every tile, row and bar opens a drawer with the
matching work items — title, id, severity, status, environment, assignee, days
open — each linking straight to the work item in Azure DevOps.

**Every expanded list filters.** Inside the drawer, narrow further by severity,
status, environment, assignee, free text or open/closed, and sort by oldest,
newest or most severe. Whatever the panel already pinned shows as a locked chip,
so a filtered list can never contradict the number you clicked. Filtering runs
against the whole slice, not just the loaded page, and the header shows the true
count.

The dashboard re-reads its aggregations every 30 seconds, so a board change
appears without a refresh.

**Light and dark, in Bajaj Finserv blue.** The palette is inspired by the
brand's blue-and-white identity, anchored on `#0071BB`: white-leaning in light
mode, deep navy in dark. The toggle in the top bar offers light, dark, or match
your system; the choice is remembered and applied before first paint, so there is
no flash of the wrong theme. Both palettes were validated independently against
their own surface — the light theme is not a washed-out dark theme.

---

## Connecting Azure Boards

Admin → pick a POD → **Azure Boards**:

| Field | Notes |
|---|---|
| Organisation URL | `https://dev.azure.com/your-org`. Blank falls back to `AZDO_ORG_URL`. |
| Project | Blank falls back to `AZDO_PROJECT`. |
| Personal access token | Needs **Work Items (Read)**. Blank falls back to `AZDO_PAT`. Never sent back to the browser. |
| Area path | Scopes this POD's items, and routes incoming webhooks to it. |
| Work item types | Defaults to Bug, Issue, Task, User Story. |

**Test** checks the connection, **Sync** pulls changes since the last run,
**Full resync** re-imports the last year.

### Field mapping

Boards differ, so severity, environment and status are mapped per POD.
Defaults: `Microsoft.VSTS.Common.Severity`, `Custom.Environment`, `System.State`.

Values are matched case-insensitively against a built-in table (`1 - Critical` →
Critical, `Resolved` → For QA Validation, `prod` → Production, and so on), then
by longest substring. **Environment falls back to tags, then to the area path**
when the field is absent — which is where most teams actually record it.

### Keeping it live

Two paths, both wired:

1. **Polling** — the server polls every `SYNC_POLL_SECONDS` (default 120) using a
   WIQL query on `System.ChangedDate` with a stored watermark, so each run only
   fetches what moved. Set to `0` to turn it off.
2. **Webhooks** — instant. In Azure DevOps: *Project settings → Service hooks →
   Web Hooks*, one subscription each for **work item created / updated /
   deleted**, pointing at:

   ```
   https://your-host/api/webhooks/azure?token=<AZDO_WEBHOOK_TOKEN>
   ```

   The token is compared in constant time; requests without it are rejected.
   Locally, expose port 3000 with a tunnel first. The webhook only reads the id
   and area path from the payload, then re-fetches the canonical work item.

Run both: the webhook gives instant updates, the poller catches anything missed
while the app was down.

---

## Excel and CSV upload

Pick a POD, click **Upload**, choose an `.xlsx` or `.csv`. Headers are matched
case-insensitively against these aliases:

| Field | Accepted headers |
|---|---|
| Title *(required)* | title, summary, subject, name |
| Id | id, work item id, bug id, ticket id, key |
| Url | url, link, work item url |
| Assignee | assignee, assigned to, owner, developer |
| Severity | severity, sev, criticality |
| Environment | environment, env, raised in, found in |
| Status | status, state, bug status |
| Created | created date, created, raised on, reported date |
| Closed | closed date, closed, resolved date |

Also read when present: assignee email, type, priority, tags. Unknown columns are
ignored and reported back. Rows are keyed by id, so re-uploading updates rather
than duplicates.

---

## Access

`AUTH_MODE` in `.env.local`:

| Mode | Behaviour |
|---|---|
| `off` | no login, everyone is a local admin — local development only |
| `password` | email + password, bcrypt hashed, stored in OpenSearch |
| `entra` | Microsoft Entra ID (Azure AD) SSO |
| `both` | both offered on the sign-in screen |

**Admins** onboard PODs and see every one of them. **Members** see only the PODs
ticked against their name in Admin → Dashboard access; the scoping is applied
server-side in `filtersFromRequest`, not in the UI. With SSO, the first person to
sign in becomes admin and everyone after joins as a member with no PODs.

---

## Onboarding a POD

Admin → **New POD**. Name it (e.g. `AMC POD`), set the ageing threshold, add each
member with their designation, then connect Azure.

> Member **names must match the Azure Boards display name** — that is what work
> items are attributed by, and what the leaderboard groups on.

---

## Layout

```
src/
  lib/
    opensearch.ts   client, index bootstrap, bulk upsert
    mappings.json   index mappings — shared with scripts/seed.mjs
    metrics.ts      every tile and chart, in one aggregation query
    azure.ts        WIQL + workitemsbatch REST calls
    normalize.ts    Azure work item / spreadsheet row -> our shape
    sync.ts         watermarked incremental sync, webhook routing
    poller.ts       background poll timer, armed by the metrics route
    teams.ts users.ts session.ts api.ts http-error.ts
    palette.ts      validated data colours (CSS variables, theme-aware)
  app/
    page.tsx        dashboard      admin/   onboarding      login/
    api/            metrics items teams sync upload users webhooks/azure
  components/       dashboard-client, leaderboard, breakdown-card,
                    trend-chart, stat-rail, health-ring, team-rollup,
                    drill-drawer + drill-filters, parallax-backdrop,
                    theme-toggle, topbar, ui
```

### Notes on the data model

- Item age is computed **at query time** from `createdDate`, never stored, so it
  cannot go stale between syncs.
- Item ids are `<teamId>:<workItemId>`, so every sync upserts.
- Deleting a POD deletes its work items too — orphans would skew global counts.

### Charts

Colours are the validated categorical, status and sequential sets from the
data-viz method, checked against each theme's own chart surface (light
`#f6f9fc`, dark `#172533`):
lightness band, chroma floor, CVD separation, normal-vision floor and 3:1
contrast all pass. Slot order is the colourblind-safety mechanism — reordering
`SERIES` in `src/lib/palette.ts` invalidates it. Severity uses the reserved
status palette and always ships colour **plus** a label. The trend chart has one
y-axis by design; raised and closed are directly comparable counts.
# tracker-dashboard
