# Azure Boards integration

## Credentials

Resolved per team with an env fallback, in `creds()` in
[`src/lib/azure.ts`](../src/lib/azure.ts):

| Setting | Team field | Fallback |
|---|---|---|
| Org URL | `azure.orgUrl` | `AZDO_ORG_URL` |
| Project | `azure.project` | `AZDO_PROJECT` |
| PAT | `azure.pat` | `AZDO_PAT` |

The PAT needs **Work Items (Read)** only. Auth is Basic with an empty username:
`Basic base64(":" + PAT)`.

Missing credentials throw `AzureError` naming the team, which surfaces verbatim
in the UI toast.

## The two calls

API version `7.1`.

**1. WIQL** — `POST {org}/{project}/_apis/wit/wiql`

```sql
SELECT [System.Id] FROM WorkItems
WHERE [System.TeamProject] = '…'
  AND [System.WorkItemType] IN ('Bug', 'Issue', 'Task', 'User Story')
  AND [System.ChangedDate] >= '2026-08-01T00:00:00Z'
  AND [System.AreaPath] UNDER '…'        -- only when the POD sets one
ORDER BY [System.ChangedDate] ASC
```

Oldest first, so a run that dies part-way still advances the watermark safely.

**2. Batch** — `POST {org}/_apis/wit/workitemsbatch` with `$expand: "links"`,
**200 ids maximum** per call. `fetchWorkItems()` chunks.

### Quirks worth knowing

- WIQL rejects millisecond ISO timestamps. Use `yyyy-MM-ddTHH:mm:ssZ`
  (`wiqlDate()`).
- Single quotes in values are escaped by doubling (`escapeWiql()`).
- An expired or under-scoped PAT returns **HTTP 203 with an HTML sign-in page**,
  not a 401. `call()` sniffs for it and returns a clear message instead of a
  confusing parse error.

`testConnection()` hits `_apis/projects/{project}` and backs the **Test** button
in Admin — it verifies credentials without importing anything.

## Field mapping

Every board is customised differently, so mapping is per-POD.

**Which field** — `team.fieldMap`, holding Azure reference names. Defaults:

| Dimension | Default reference name |
|---|---|
| severity | `Microsoft.VSTS.Common.Severity` |
| environment | `Custom.Environment` |
| status | `System.State` |

**Which value** — `resolve()` in [`src/lib/normalize.ts`](../src/lib/normalize.ts):

1. team `valueMap` override (keys lowercased),
2. `DEFAULT_VALUE_MAP` exact match,
3. direct match against the allowed values,
4. **longest word-bounded match** (see [below](#matching-is-word-bounded-not-substring)).

Longest-first is load-bearing: `not a bug` must win over `bug`, `biz-uat` over
`uat`. Sorting shorter-first silently mislabels items. So is the word boundary:
an unbounded `includes` matched the key `it` inside "microsites".

Shipped defaults cover the usual shapes — `1 - Critical` → `Critical`,
`Resolved` → `For QA Validation`, `prod` → `Production`, `CUG(stage)` → `CUG`.

### Environment fallback chain

Most boards have no environment field, so `resolveEnvironment()` tries, in order:

1. the mapped field,
2. each tag,
3. the area path.

This is where teams actually record it. Do not remove the fallback because a
particular board happens to have the field.

### Closing

Only `Microsoft.VSTS.Common.ClosedDate` closes an item. `ResolvedDate` is set
while an item still waits on QA; reading it as a close date overstates the
closure trend and moves items out of the ageing buckets early.

## Keeping data live

Three paths, all built, all safe to run together — deterministic ids mean
overlapping imports upsert rather than duplicate.

### Poller

`startPoller()` in [`src/lib/poller.ts`](../src/lib/poller.ts), armed by the
first `/api/metrics` request. Interval is `SYNC_POLL_SECONDS` (default 120,
`0` disables).

- A `running` flag stops a slow sync stacking behind itself.
- The timer is stashed on `globalThis` under a `Symbol.for` key so dev module
  reloading cannot start a second one.
- It lives here rather than in `instrumentation.ts` because Next bundles
  instrumentation for a runtime that cannot resolve `node:https`, which breaks
  the MongoDB driver in dev.

### Webhook

`POST /api/webhooks/azure?token=…`, for **work item created / updated / deleted**.

Set it up in Azure DevOps: *Project settings → Service hooks → Web Hooks*, one
subscription per event type.

- The token is compared with `timingSafeEqual`. An unset `AZDO_WEBHOOK_TOKEN`
  rejects everything — unset must never mean "allow".
- The payload shape varies by event (`resource.id` vs `resource.workItemId`,
  `resource.fields` vs `resource.revision.fields`), so only the id and area path
  are read from it and the canonical item is re-fetched over REST.
- `teamForAreaPath()` routes to a POD by longest area-path prefix, so a nested
  POD beats its parent; it falls back to the only team when there is one.
- Failures return `200 { ok: false }`. Azure disables a subscription that keeps
  receiving 5xx.

### Manual

The dashboard **Sync** button, or Admin → **Sync** / **Full resync**.
`full: true` ignores the watermark and re-imports the last 365 days.

## Watermark

`syncTeam()` reads `lastChangedDate` from `tracker-sync`, queries from there,
then advances to the newest indexed `changedDate` **minus 60 seconds**. Azure's
`ChangedDate` ordering is not strict enough to trust exactly; the overlap
re-imports a handful of items, which is free because ids are deterministic.

First run reaches back `FIRST_RUN_DAYS` (365).

`syncAllTeams()` captures errors per team into `SyncResult.error` — one team's
bad PAT must never stop the others.

## Spreadsheet import

`POST /api/upload` (multipart: `file`, `teamId`), `exceljs`, first worksheet,
row 1 is the header, 20 MB cap.

`mapHeaders()` matches headers against `COLUMN_ALIASES` case-insensitively after
collapsing `_ - .` to spaces. Only `Title` is required.

- Hyperlink cells carry the URL at `cell.value.hyperlink`, separate from display
  text.
- Date columns keep the `Date` object when Excel typed the cell as one;
  everything else reads `cell.text`.
- Rows without a title count as `skipped`, not failed.
- Unrecognised headers come back as `ignoredHeaders` and are shown to the user —
  a silently dropped column reads as data loss.

Adding a recognised column means one entry in `COLUMN_ALIASES`.

## Boards that do not use the default names

Two things bite on a real board, and both fail **quietly** — which is why Test
now reports on them rather than only proving the connection.

### Work item types are matched exactly

The WIQL clause is `[System.WorkItemType] IN ('Bug', 'Task', …)`. An exact
match. A project whose types are called `3IN1 TASK` and
`3IN1 AGILE USER STORY` matches none of the shipped defaults, syncs only its
bugs, and reports success — because the sync *did* succeed, it just found less
than you expected.

**Test lists the project's real types** and offers them as chips under the field.
Click one to add it. If a configured type does not exist in the project, Test
says so plainly: *"Connected, but X has no '3IN1 TASK'. Those items will not
sync."*

### The status field is often not `System.State`

Many boards carry a custom field — `Bug Status`, `Resolution`, `Sub-State` —
alongside the built-in state. A bug can be `Active` in `System.State` while its
Bug Status says `For PO Validation`, and only the second is the one the team
reads.

Point the **Status** mapping at that field's reference name. The shipped
vocabulary already covers the common spellings:

| The board says | Becomes |
|---|---|
| Active · New · Approved · Triaged · In Progress · Reopened | `Open` |
| For PO / BA / Business Validation · Fixed · Resolved · Ready for Test | `For QA Validation` |
| On Hold · Blocked · Deferred · Need More Info | `Commented` |
| Not a Bug · By Design · Duplicate · Cannot Reproduce · Rejected · Removed | `Not a Bug` |
| Closed · Done · Completed | `Closed` |

Anything else becomes `Unknown` rather than being guessed into a category. Add
your own under **Value mapping** on the POD; those win over everything above.

## Matching is word-bounded, not substring

Values resolve in three passes — the POD's own overrides, the shipped table,
then a **longest-match, word-bounded** pass. That last one is what lets
`3 - Medium (UI)` reach `Minor` and `Deployed to Prod` reach `Production`.

It used to match anywhere in the string, and a real board found the problem:
`it → IT-UAT` matched inside **"microsites"**, so every item under an area path
named *"…Investment Mall and microsites"* came back `IT-UAT`. So did
"monitoring", "credit", "editor" and "digital". A two-letter key is a substring
of an enormous number of ordinary words.

The same accident sat in the kind rule: a task tagged `critical` became a
**change request**, because "critical" contains "cr". The CR tag is matched
exactly now.

## Fields that are usually missing

**Environment.** Most boards have no such field. The importer falls back to
**tags**, then to the **area path**, before giving up — so an `AMC_POD` /
`Production` tag pair is enough, and the mapping row can stay at its default.

**Severity.** Tasks and user stories rarely have one. They land as `Unknown`,
which is honest — a task has no severity to report.

**Assignee.** "No one selected" becomes `Unassigned`, and that person appears on
the leaderboard like any other. Unassigned work is real work.

