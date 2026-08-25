# Data model

Four MongoDB collections, prefixed by `MONGODB_COLLECTION_PREFIX` (default
`tracker`). The schemas are in [`src/db/schemas/`](../src/db/schemas/), one file
per collection — the single source shared by the app and `scripts/seed.mjs`,
which imports the real models rather than describing them again.

## `tracker_items`

One flat document per bug, ticket or CR. Flat on purpose: every dashboard number
is a `terms`, `filter` or `date_range` aggregation over these fields, and nesting
would cost a `nested` query for no gain.

| Field | Type | Notes |
|---|---|---|
| `id` | String | deterministic, see below — and the document's `_id` |
| `workItemId` | String | id on the source system; also the sort tiebreak |
| `teamId` | String, indexed | the POD; every scoped query filters on it |
| `source` | String, enum | `azure` \| `excel` |
| `kind` | String, enum | `bug` \| `ticket` \| `cr` |
| `type` | String | raw work item type (`Bug`, `User Story`, …) |
| `title` | String | matched by an **anchored** regex, never a text index |
| `url` | String | link out to Azure; never queried |
| `assignee` | String, indexed | display name — what the leaderboard groups on |
| `assigneeEmail` | String | |
| `severity` | String, enum | `Critical` `Major` `Minor` `Unknown` |
| `environment` | String, enum | `IT-UAT` `BIZ-UAT` `CUG` `Production` `Unknown` |
| `status` | String, enum | `Open` `Commented` `For QA Validation` `Not a Bug` `Closed` `Unknown` |
| `state` | String | raw board state, kept for debugging a mapping |
| `priority` | Number \| null | |
| `tags` | String[] | |
| `createdDate` | **Date**, indexed | **the ageing anchor** |
| `changedDate` | **Date** | drives the sync watermark |
| `closedDate` | **Date** \| null, indexed | only a real close, never a resolve |
| `isActive` | Boolean | |

### The schema is strict, and dates are dates

Two rules, and both fail quietly if you break them.

**A field the schema does not declare is dropped on write.** Not
stored-and-unqueryable — gone. Everything compiles, the import reports success,
and the column is empty forever. Add the field to `Item` *and* to
[`item.schema.ts`](../src/db/schemas/item.schema.ts); a check asserts the two
agree.

**Dates must be `Date`, never `String`.** Declared as a string they still save
and still read back, and only the aggregation breaks: `$dateTrunc` against a
string returns null, so every trend bucket empties while every other panel looks
correct. The controller converts to ISO strings on the way out, because that is
what crosses the wire — [`items.shape.ts`](../src/controllers/items.shape.ts) is
the one place that knows.

Adding a field needs no rebuild; existing documents simply lack it. **Changing** a
field's type or renaming one does — `pnpm seed --reset` in dev.

### Ids are deterministic

| Source | Id |
|---|---|
| Azure | `<teamId>:<workItemId>` |
| Excel/CSV | `<teamId>:xlsx:<workItemId>` |

The id is the document's `_id`, so every sync and every re-upload **upserts**.
Re-running a sync is always safe, which is what lets the watermark overlap by a
minute without creating duplicates. Letting Mongoose generate an `ObjectId`
instead would duplicate the whole board on the next sync.

### Active vs closed

```ts
isActive = !TERMINAL_STATUSES.includes(status) && !closedDate
```

`TERMINAL_STATUSES` is `["Closed", "Not a Bug"]`. A close date is decisive and
overrides the status text. Note `For QA Validation` is **open** — the work is
resolved but still needs someone. This is why `ResolvedDate` must not be read as
`closedDate`.

## `tracker_teams`

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

## `tracker_users`

```ts
{ id: email, email, name, passwordHash | null, role: "admin"|"member", teamIds[], createdAt }
```

Id is the lowercased email. `passwordHash` is bcrypt (cost 10) and mapped
`index: false`. SSO users have `passwordHash: null`.

## `tracker_sync`

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
