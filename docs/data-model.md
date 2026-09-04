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
  ageingThresholdDays,   // legacy; pinned to 7 on save, folded into the map below
  severityThresholdDays: { Critical?, Major?, Minor?, Unknown? },  // the POD's ageing rules
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

"Aged" means older than the threshold that applies to this item **and** still
open. Two levels: the POD's rule for that severity (`severityThresholdDays`),
then the default of 7. `thresholdFor` in `lib/metrics/threshold.ts` is the only
place that precedence is written, and everything asks it — see
[metrics.md](metrics.md#aged-means-what-each-pod-says-it-means).

A **missing key** in `severityThresholdDays` is the normal case and means
"inherit the default". It is never pre-filled — four copies of 7 would be four
overrides nobody set. The whole map reaches queries through
`filtersFromRequest()`, which loads every visible team.

`ageingThresholdDays` is retained but no longer a rule: `saveTeam` pins it to 7
and folds any customised value into the severities that were inheriting it, so a
POD onboarded before the severity row ages exactly as it did.

## One schema, whichever driver is running

The schemas in [`src/db/schemas/`](../src/db/schemas/) are Mongoose schemas, and
they are the definition of every collection even when `DB_DRIVER=json` and there
is no database anywhere.

Mongoose does not need a connection to use a schema. `new Model(raw)` casts the
values, fills in defaults and drops keys the schema does not declare;
`validateSync()` checks the enums and the required fields. Both are ordinary
in-process calls, so the file driver uses the same schemas MongoDB will.

Every write on every driver goes through one function,
[`toDocument`](../src/db/document.ts):

```
  items.bulkUpsert ─┐
  teams.save        ├─→ toDocument(Model, raw, id) ─→ cast · defaults · validate
  users.save        │                                         │
  sync.save        ─┘                                         ├→ JSON file
                                                              └→ MongoDB
```

So:

| | file driver | MongoDB |
|---|---|---|
| `severity: "Blocker"` | refused | refused |
| `priority: "3"` | stored as `3` | stored as `3` |
| a key not in the schema | dropped | dropped |
| a missing `createdDate` | refused | refused |
| `tags` absent | defaults to `[]` | defaults to `[]` |

That is what makes adding a real database a configuration change rather than a
migration: the documents already in `DB_store/` are documents MongoDB accepts,
because nothing else was ever allowed in.

**Why not trust `bulkWrite`.** The Mongo driver could rely on Mongoose to
validate on the way out, but how much of a schema `bulkWrite` applies has moved
between Mongoose versions. Checking in one place first means the two drivers
agree regardless of which version is installed.

**Dates.** JSON has no date type, so date fields are stored as ISO strings and
revived on read. Which fields those are is read off the schema
(`dateFields(model)`), so adding a `Date` to a schema is all that is needed —
there is no second list to keep in step.

**Proving it.** `pnpm parity` writes one POD and one item through the configured
driver and prints what came back:

```bash
DB_DRIVER=json    pnpm parity > /tmp/json.json
DB_DRIVER=mongodb pnpm parity > /tmp/mongo.json
diff /tmp/json.json /tmp/mongo.json      # must be empty
```

It currently is. That diff found a real difference the code review had not: the
file driver was dropping `_id` from items while Mongo returned it, so the same
item came back with different keys depending on the driver.

**Adding a field.** Put it in the schema, put it in the type in `lib/types.ts`,
and both drivers store it. Leave it out of the schema and neither will — the
file driver drops it exactly as Mongo's `strict: true` would, which is the point.

## Vocabulary

Defined once in [`src/lib/types.ts`](../src/lib/types.ts). The UI, the palette
and the aggregations all key off these exact strings, so adding a value means
touching three places:

1. `types.ts` — the union and, usually, `DEFAULT_VALUE_MAP`
2. `palette.ts` — a colour slot
3. `breakdown-card.tsx` — the `ORDER` table that fixes row order

Board-specific values map onto the vocabulary in `normalize.ts`; see
[azure-integration.md](azure-integration.md#field-mapping).
