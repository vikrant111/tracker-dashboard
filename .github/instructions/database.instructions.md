---
applyTo: "src/db/**,src/controllers/**,src/lib/{metrics,sync,teams,users,health}.ts,src/lib/metrics/**,scripts/seed.mjs,scripts/mongo-local.mjs"
description: MongoDB access, schemas, models and aggregation rules
---

# The data layer

MongoDB via Mongoose. Four collections, one connection, and one aggregation that
fills the whole dashboard.

```
src/db/
  connect.ts        one cached connection; every entry point awaits it
  uri.ts            env → connection string, and what it refuses (pure)
  constants/        collection names, connection tuning
  schemas/          one file per collection
  models/index.ts   the compiled models
  query/            match.ts (filters → $match) · stages.ts (pipeline pieces)
src/controllers/    what routes and lib/* call
```

## Connecting

`connectToDatabase()` replaces the old `ensureIndices()`. It is idempotent, and
every entry point awaits it before touching data.

**The connection is cached on `globalThis`.** Next re-evaluates modules on every
hot reload while the connection survives, so a module-level `let` leaks a
connection per edit and Atlas starts refusing them. Do not "simplify" it.

`ensureIndexes()` is deliberately **separate** and not on the read path —
`syncIndexes` on a large collection is slow, and a dashboard that blocks on it
every cold start is worse than one whose first query is. `pnpm seed` and the
readiness probe call it; a plain request does not.

Configuration is one URL:

```
MONGODB_URI=mongodb://127.0.0.1:27017              # local
MONGODB_URI=mongodb+srv://…@cluster.mongodb.net    # hosted, nothing installed
```

`resolveMongoUri` is pure and refuses a placeholder, a missing host, and — in
production only — a missing URI. **Never add a localhost fallback for
production**: in a container that connects to the container itself and fails
with an error that sends people to the wrong machine.

## Schemas

One file per collection in `schemas/`. Every schema is `strict`, `versionKey:
false`, and supplies its **own `_id`**.

**Deterministic ids are load-bearing.** `<teamId>:<workItemId>` is what makes
every import an upsert — it is why the sync watermark can overlap by 60 seconds
safely, why the webhook and poller can run together, and why a spreadsheet can
be re-uploaded after a correction. Let Mongoose generate an ObjectId instead and
every re-sync duplicates the board.

| Collection | `_id` |
|---|---|
| items | `<teamId>:<workItemId>` |
| teams | slug of the name (`AMC POD` → `amc-pod`) |
| users | lowercased email |
| sync | team id |

**A field not in the schema is dropped on write.** Not stored-and-unqueryable —
gone. Add the field to `Item` *and* to `item.schema.ts`, or the import reports
success and the column is empty forever. A check asserts the two agree.

**Dates are `Date`, never `String`.** `$dateTrunc` and date arithmetic against a
string return null, so the trend silently empties while every other panel looks
right. The controller converts to ISO strings on the way out, because that is
what crosses the wire.

## One query fills the dashboard

`getDashboard()` issues a **single** aggregation whose `$facet` carries every
panel. Each branch runs over the same matched set at the same instant. Split it
into separate queries and the data changes between them, and then two tiles
disagree on screen about the same number.

`buildMatch()` in `db/query/match.ts` is the **only** filter builder, shared by
the aggregation and the drill-down. That sharing is what stops a bar and its
drawer disagreeing about what "Critical, aged, in production" means.

## Bounds, and why they are absolute

Age windows are absolute epoch millis computed in JS — `daysAgo`, `floorDay`,
`floorWeek` — never `$$NOW`. Every number on one dashboard must be measured from
the same instant, or two panels straddle midnight and disagree by a day.

Ageing buckets are **lower-inclusive, upper-exclusive**, and `buildMatch`
mirrors that with `$gte`/`$lt`. Using `$lte` returns one extra item and the
drawer disagrees with the bar it came from.

Weeks start on **Monday** (`startOfWeek: "monday"`), matching what
`calendar_interval: week` did. Sunday shifts every weekly point by a day.

Empty buckets are filled in JS (`fillSeries`), because the pipeline cannot
invent documents for quiet days — without it the line jumps between busy days
and implies activity in between.

## Guarding a lookup key

Mongo accepts an object where a string is expected, so an id of `{"$ne": null}`
arriving from a query string matches the **first document in the collection** —
very possibly an admin, or a POD the caller cannot see. Every `findById` in
`controllers/` refuses a non-string before it queries. Keep that.

`mongoose.set("strictQuery", true)` is set once in `connect.ts`: a filter naming
a field the schema lacks is dropped rather than sent, which turns a typo from
"matches everything" into "matches nothing" — the failure you notice.

## Search

An **anchored** regex on the title, an exact match on the work item id, a
substring on the assignee. Deliberately not a `$text` index: text search stems
and tokenises, so "microsite" would match "microsites" — the same class of
near-miss that once mislabelled an entire board.

Search input goes through `escapeRegex`, which escapes metacharacters **and
strips control characters**. Both were 500s: `c++` is an invalid pattern, and
BSON cannot carry a null byte inside a regex.

## Writing

- `bulkUpsertItems(items)` — `ordered: false`, returns the **failed** count. One
  bad row in a 500-row spreadsheet costs you that row, not the import.
- A partially-failing unordered `bulkWrite` **throws while still having written
  the good documents**. The error carries `writeErrors`, so the count is
  recoverable — treating the throw as total failure reports a successful 499-row
  import as a loss.
- `insertFirstUser` is an atomic insert, not count-then-write: two workers
  booting together both see an empty collection, and the second would overwrite
  the first including its password hash.

## Paging

`streamItems` uses a **cursor**, never `skip`/`limit` — `skip` re-walks the
collection from the start on every page, so exporting a large board degrades
quadratically. The cursor is closed in a `finally`, so an aborted download does
not leave it open against a shared tier's cursor limit.

Every sort ends with `workItemId`, making the order **total**. Without a
tiebreak, documents sharing a sort key repeat across pages or vanish between
them.

## Local development

`pnpm mongo:local` runs a real MongoDB with nothing installed and no Docker,
storing data in `.mongo-data/`. Development convenience only — production points
`MONGODB_URI` at a real cluster.
