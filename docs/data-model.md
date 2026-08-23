# Data model

Four indices, prefixed by `OPENSEARCH_INDEX_PREFIX` (default `tracker`). Mappings
are in [`src/lib/mappings.json`](../src/lib/mappings.json) — the single source
shared by the app and `scripts/seed.mjs`.

## `tracker-items`

One flat document per bug, ticket or CR. Flat on purpose: every dashboard number
is a `terms`, `filter` or `date_range` aggregation over these fields, and nesting
would cost a `nested` query for no gain.

| Field | Type | Notes |
|---|---|---|
| `id` | keyword | deterministic, see below |
| `workItemId` | keyword | id on the source system |
| `teamId` | keyword | the POD; every scoped query filters on it |
| `source` | keyword | `azure` \| `excel` |
| `kind` | keyword | `bug` \| `ticket` \| `cr` |
| `type` | keyword | raw work item type (`Bug`, `User Story`, …) |
| `title` | text + `.raw` | text for prefix search |
| `url` | keyword, not indexed | link out to Azure |
| `assignee` | keyword | display name — what the leaderboard groups on |
| `assigneeEmail` | keyword | |
| `severity` | keyword | `Critical` `Major` `Minor` `Unknown` |
| `environment` | keyword | `IT-UAT` `BIZ-UAT` `CUG` `Production` `Unknown` |
| `status` | keyword | `Open` `Commented` `For QA Validation` `Not a Bug` `Closed` `Unknown` |
| `state` | keyword | raw board state, kept for debugging a mapping |
| `priority` | integer | |
| `tags` | keyword[] | |
| `createdDate` | date | **the ageing anchor** |
| `changedDate` | date | drives the sync watermark |
| `closedDate` | date \| null | only a real close, never a resolve |
| `isActive` | boolean | |

### Keyword vs text

Anything grouped, filtered or sorted on **must** be `keyword`. Dynamic mapping
would type it `text` and a `terms` aggregation on a `text` field fails at query
time. Adding a field means adding it to `mappings.json` first; changing a type
needs a reindex (`pnpm seed --reset` in dev).

### Ids are deterministic

| Source | Id |
|---|---|
| Azure | `<teamId>:<workItemId>` |
| Excel/CSV | `<teamId>:xlsx:<workItemId>` |

So every sync and every re-upload **upserts**. Re-running a sync is always safe,
which is what lets the watermark overlap by a minute without creating duplicates.

### Active vs closed

```ts
isActive = !TERMINAL_STATUSES.includes(status) && !closedDate
```

`TERMINAL_STATUSES` is `["Closed", "Not a Bug"]`. A close date is decisive and
overrides the status text. Note `For QA Validation` is **open** — the work is
resolved but still needs someone. This is why `ResolvedDate` must not be read as
`closedDate`.

## `tracker-teams`

A POD. `members`, `azure`, `fieldMap` and `valueMap` are mapped
`{"type":"object","enabled":false}` — stored and returned, never indexed, because
nothing aggregates over them.

```ts
{
  id, name, description,
  members: [{ name, email, designation, azureIdentity?, role: "lead"|"member" }],
  azure: { orgUrl, project, pat, areaPath, workItemTypes[] },
  fieldMap: { severity, environment, status },   // Azure reference names
  valueMap: { severity: {}, environment: {}, status: {} },  // per-board overrides
  ageingThresholdDays,   // default 7
  createdAt,
}
```

`id` is a slug of the name (`AMC POD` → `amc-pod`). Renaming a POD keeps the id,
so item ids stay valid.

Deleting a team deletes its items in the same call. Orphaned items would keep
counting toward every cross-POD total with no way to reach them.

## `tracker-users`

```ts
{ id: email, email, name, passwordHash | null, role: "admin"|"member", teamIds[], createdAt }
```

Id is the lowercased email. `passwordHash` is bcrypt (cost 10) and mapped
`index: false`. SSO users have `passwordHash: null`.

## `tracker-sync`

One document per team, id = `teamId`.

```ts
{ teamId, lastChangedDate, lastRunAt, lastResult }
```

`lastResult` is a human sentence surfaced in the UI, including the error text
when a sync failed.

## Ageing

**Age is never stored.** A stored age is wrong the next day. It is computed
wherever needed:

- **Aggregations** — a painless script over `createdDate` with `now` as a
  parameter, used only for `avg` where there is no alternative.
- **Filters** — a plain `range` on `createdDate` (`lte: "now-7d"`), which is
  index-backed and cheap. Prefer this.
- **Item lists** — in JS in `listItems()`: closed items age from `createdDate` to
  `closedDate`, open items to now.

"Aged" means older than the POD's `ageingThresholdDays` (default 7) **and** still
open. The threshold is per-POD and reaches queries through
`filtersFromRequest()`, which loads the team.

## Vocabulary

Defined once in [`src/lib/types.ts`](../src/lib/types.ts). The UI, the palette
and the aggregations all key off these exact strings, so adding a value means
touching three places:

1. `types.ts` — the union and, usually, `DEFAULT_VALUE_MAP`
2. `palette.ts` — a colour slot
3. `breakdown-card.tsx` — the `ORDER` table that fixes row order

Board-specific values map onto the vocabulary in `normalize.ts`; see
[azure-integration.md](azure-integration.md#field-mapping).
