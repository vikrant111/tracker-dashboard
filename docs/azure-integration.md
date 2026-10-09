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
4. **the same comparison with the punctuation removed**, so `IT_UAT`, `IT.UAT`
   and `IT - UAT` are all `IT-UAT`,
5. **longest word-bounded match** (see [below](#matching-is-word-bounded-not-substring)).

Step 4 is not cosmetic. Without it those spellings fell through to step 5, where
the longest matching key was `uat` — and every one came back **BIZ-UAT**. IT UAT
and BIZ-UAT are two different environments, and items moved between two real
boards' numbers with nothing on screen to show it. Step 5 also draws on the
vocabulary's own words, but only those of three characters or more: `DR` and
`CR` match exactly through the earlier steps, and letting two letters into a
substring pass is the `it`-inside-"microsites" accident again.

Word **order** is the one thing no comparison undoes, so `UAT IT` needs a key in
[`value-map.ts`](../src/lib/value-map.ts) and has one.

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


## Reading live, storing nothing

A POD can skip the store entirely: its items are fetched from Azure on the
request that needs them, filtered in memory, and never written down. Accounts,
PODs, permissions and tokens are the only durable records left.

Two files decide all of it, and no query-building code has to be touched again:

| File | Holds |
|---|---|
| [`contracts/azure-sources.ts`](../src/lib/contracts/azure-sources.ts) | which PODs read live, from which projects, under which field filters |
| [`contracts/item-filters.ts`](../src/lib/contracts/item-filters.ts) | the vocabulary, the allowlists, the window and the cache |

### What a source is

One POD can be made of several projects. Each source names a project, its work
item types, and its filters — `all` clauses are ANDed, `any` clauses are ORed
inside their own bracket:

```ts
{
  id: "amc-it-requests",
  pods: ["amc-pod", "AMC POD"],        // id or name, case-insensitive
  orgUrl: "https://dev.azure.com/BFLDevOpsOrg",
  project: "3in1 IT Requests",
  workItemTypes: ["Bug", "Issue", "Task", "User Story"],
  any: [
    { field: "Custom.PODName", values: ["AMC POD"] },
    { field: "Custom.BFLITSpoc", values: ["Aravind I", "Aravind.i@bajajfinserv.in"] },
  ],
  fieldMap: { status: "Custom.BugStatus" },
}
```

The bracket round the OR group is load-bearing. WIQL binds `a AND b OR c` as
`(a AND b) OR c`, so an unbracketed group lets an item through on the OR branch
alone — no project bound, no date bound, no type bound. That is the whole
project, which is the failure this design exists to prevent.

An **empty value list throws** rather than being dropped. `Custom.ModuleName IN
()` quietly removed is a filter on one module becoming every module.

### The window

365 days (`LIVE.windowDays`). What "the last 365 days" *means* is
`LIVE.windowMode`, overridable per source:

| Mode | Asks Azure for | Misses |
|---|---|---|
| `created` | raised inside the window | a bug raised two years ago that is **still open** |
| `touched` | raised **or** changed inside the window | an open bug nobody has touched in a year |
| `open-or-touched` | the above, plus anything with no close date at all | nothing |

`touched` is the default, and the default is deliberately not `created`: an
ageing board exists to show work that has waited, so the row it must never hide
is the oldest open one — and `created` hides exactly that. `open-or-touched`
closes the last gap but adds a blank `ClosedDate` clause, which a heavily
customised process can reject; it fails loudly if so, and one word in the
contract drops back to `touched`.

Every mode but `created` is an OR group and is **bracketed**. Unbracketed, WIQL
binds `a AND b OR c` as `(a AND b) OR c` and an item comes back on the date
branch alone — no project, no type, no filter.

The window is applied a second time after mapping, where the rule is *finished
long ago and raised long ago*:

| | |
|---|---|
| raised inside the window | kept, closed or not |
| **still open** | kept whatever its age |
| closed inside the window | kept, so the closure trend is complete |
| closed before the window **and** raised before it | dropped |

Keeping a two-year-old open bug is correct, not a leak: it lands in the `30+
days` ageing bucket, and the trend chart ignores a `createdDate` outside its own
range, so no number is distorted by its presence. What gets dropped is finished
history, which would otherwise inflate the closed totals with a year nobody
asked about.

### The filters, checked twice

Azure applies the filters, and then they are applied again to what came back —
`satisfiesSource()` in [`live/verify.ts`](../src/lib/live/verify.ts), the same
`all`/`any` shape the WIQL is built from so the two cannot drift.

This is not belt-and-braces for its own sake. Azure matches an **identity**
field generously: a clause naming an email can come back matched on a display
name, and a multi-select field holds several values in one string. An item can
arrive not carrying the value the contract asked for, and nothing downstream
would question it. One that fails is dropped before it reaches a number, and
counted in the server log.

What the check understands, because each one has broken a naive version:

| Payload shape | Compared as |
|---|---|
| `"Aravind I"` | trimmed, case-insensitive |
| `{ displayName, uniqueName }` | either one — a contract may name either |
| `"Someone Else; Aravind I"` | each part, not the whole string |
| field absent from the payload | **no match** — Azure cannot have matched a field the item lacks |

`LIVE.verifyFilters` turns it off, for finding out whether it is what is
emptying a board. `pnpm azure:probe --days 365` reports the count either way.

### The allowlists

**Off by default.** `ALLOWED.dropOutside` is `false`, so every value that maps
reaches the board in its own section and the lists only document what a board is
expected to say. A dropped item is in no total, in no drill-down, and nothing on
screen says it existed; a value nobody expected, sitting under its own heading,
is a question somebody can answer.

Turn `dropOutside` on and the lists are enforced. They are written in **the
dashboard's words**, not the board's: `1-Critical` is `Critical` by the time it
is tested, so the board's spelling belongs in
[`value-map.ts`](../src/lib/value-map.ts) and the mapped word belongs in the
contract. A word that is in neither could never match, so `pnpm check:ui`
refuses it rather than letting the board go quietly empty.

`keepUnknown` then decides what happens to a value that mapped to nothing.
Tasks have no severity and most boards have no environment field, so dropping
those would hide real work — `Unknown` is honest and stays visible.

### Picking a quarter

The board carries a date-range dropdown: the whole window, then each quarter it
touches. It changes **nothing about what is fetched** — one Azure read covers the
window and is cached per POD, so switching quarters narrows what is already in
hand. Instant, and it costs Azure nothing.

The range travels as `createdFrom` / `createdTo`, which the dashboard and every
drill-down behind it already share, so a tile and the list it opens cannot
disagree about which quarter they are showing. `pnpm check` runs the whole
invariant battery against a quarter for exactly that reason.

[`contracts/date-ranges.ts`](../src/lib/contracts/date-ranges.ts) holds the
settings: `FISCAL_START_MONTH` is **4**, so `Q1` is April–June and `FY26` is the
year ending March 2026 — set it to `1` for calendar quarters and the labels
follow. `QUARTERS_OFFERED` is 5, because a 365-day window touches parts of five
quarters whenever it does not start on a quarter boundary.

The first choice is the whole window and carries **no** date bound. That is
deliberate: a long-open bug is kept whatever its age, and a `createdFrom` of a
year ago would hide precisely those. A quarter reaching back past the window has
its start clamped and is marked `(part)`, so a cut-short quarter does not read
as a quiet one.

#### What the dropdown can and cannot hide

Measured by `pnpm check:ui`, with one item per day across the window plus the
three cases that sit at its edge:

| | |
|---|---|
| **Last 365 days** | everything the window kept — misses nothing |
| the quarters together | every day of the window, each day in **exactly one** quarter |
| in no quarter | an item **raised before** the window, kept because it is still open or was closed inside it |

The quarters tile the window by *raised* date with no gaps and no overlap — the
check asserts the sum, so a gap and a double-count cannot each hide behind a
looser test. The one thing a quarter cannot hold is an item raised before the
window: "raised in Q2" is the honest meaning of picking Q2, and those items are
precisely why the whole-window range carries no bound and is the default. They
are the oldest rows on an ageing board.

### The cache

One answer per POD, in this process's memory, for `LIVE.cacheSeconds` (60).
Concurrent callers share one in-flight request: a dashboard load fires the board
and its roster together and the drawer follows immediately, which without it is
three identical year-long fetches racing.

Nothing is written to disk. Restart and it is gone.

### Nothing is stored, and it is not a convention

`syncTeam` and the upload route both refuse a live POD before they fetch or
parse. The rule is also stated once where no caller can forget it: the store
wrapper's `bulkUpsert` **throws** on a document belonging to a live POD, so a
future importer cannot quietly add a write path. It throws rather than dropping
the rows, because a write accepted and discarded is a spreadsheet reported as
imported and invisible forever.

What is on disk under `DB_store/` is accounts, PODs, permissions, tokens and the
DevOps board's own records. **`items.json` is not created at all** when no POD
reads from the store: a missing collection already reads as empty, and the first
real write creates it like any other, so the file appears exactly when there is
something in it. An empty file named after the data somebody was told is not
stored is a fair thing to be suspicious of.

`storesAnyItems()` in [`json-store.ts`](../src/db/store/json-store.ts) is the
decision, and it takes its rows as an argument so the suite exercises it
directly. One POD outside the contract — or one inside it with no PAT, which
still reads the store — and the file is created as before.

Rows left in an existing `items.json` from a POD's syncing days are ignored
rather than merged, so the switch is safe to flip without clearing anything
first.

### What changes for a live POD

| | Stored POD | Live POD |
|---|---|---|
| **Sync** button | imports and writes | drops the cache, so the next read re-fetches |
| Webhook | re-fetches that item and upserts it | drops the cache |
| Spreadsheet upload | imports rows | **refused**, with the reason — an upload would be stored and never read again |
| Watermark | advanced each run | none; there is nothing incremental about it |

**There is no fallback to the store.** Being named in the contract is the whole
test. A POD there with no PAT shows a `503` naming the POD and the PAT, not
stored rows — those rows are whatever was seeded or synced once, which is
exactly the data the filters exist to exclude, and showing them under a POD
meant to carry only matched work is the quiet way to be wrong.

One POD failing does not empty the others. An unscoped board logs it and carries
on with the PODs it can read — the rule `syncAllTeams` already follows, because
an expired PAT on one board is no reason for a leadership roll-up, or the DevOps
scope sheet that joins back for a bug's severity, to return nothing. A request
**scoped to that POD** still throws, because there the failure is the answer.

> The demo seed used to create a POD under the id `amc-pod`, which the contract
> now points at a real board. `pnpm seed` creates **`demo-pod`** instead. A POD
> whose name slugs onto a contract id inherits that contract, so pick names with
> that in mind.

### Getting the field names right

The filters name Azure **reference names**, not the labels on the form, and that
is the one thing that cannot be guessed:

```bash
pnpm azure:probe --fields spoc     # reference names matching "spoc"
pnpm azure:probe --days 365        # for a live POD: the exact WIQL, the ids it
                                   # returns, what normalize() makes of them,
                                   # and how many the allowlists drop
```

A wrong name fails loudly — Azure answers WIQL with *"TF51005: The query
references a field that does not exist"* and names it. That is deliberate; the
alternative is a filter that silently matches nothing.

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

