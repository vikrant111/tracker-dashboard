---
applyTo: "src/lib/{opensearch,metrics,sync,teams,users}.ts,src/lib/mappings.json,scripts/seed.mjs"
description: OpenSearch access, index mappings and aggregation rules
---

# OpenSearch layer

## Indices

Names are prefixed by `OPENSEARCH_INDEX_PREFIX` (default `tracker`) and exposed
as `IDX.items | IDX.teams | IDX.users | IDX.sync`. Never hardcode a name.

Mappings live in **`src/lib/mappings.json`**, not in TypeScript, because
`scripts/seed.mjs` creates identical indices without importing TS. Change the
JSON and both stay in step.

`ensureIndices()` is memoised per process and creates anything missing. Every
entry point awaits it first. A failure clears the cache so the next request
retries rather than caching a broken bootstrap.

## Field types are load-bearing

Anything grouped, filtered or sorted on must be `keyword` in `mappings.json`.
Dynamic mapping types strings as `text`, and a `terms` aggregation on a `text`
field errors at query time — which will look like a UI bug, not a mapping bug.

`title` is the exception: `text` for prefix search, with a `.raw` keyword
subfield.

Changing a field's type needs a reindex. In development,
`pnpm seed --reset` is the shortcut.

## Reading responses

The client types `aggregations` as a union of every aggregate shape, which
cannot be read without casting at every access. Go through the one narrowing
point:

```ts
import { search } from "./opensearch";
const body = await search<Item>(IDX.items, { size: 0, query, aggs });
const count = body.aggregations.active.doc_count;
```

Do not call `os().search()` directly outside `opensearch.ts`.

## Writing

- `putDoc(index, id, doc)` — single upsert, refreshes by default.
- `bulkIndex(index, docs)` — bulk upsert keyed on `doc.id`, returns the **failed**
  count. Callers report `docs.length - failed` as imported.

Document ids are deterministic so every sync upserts instead of duplicating:

| Source | Id |
|---|---|
| Azure | `<teamId>:<workItemId>` |
| Excel/CSV | `<teamId>:xlsx:<workItemId>` |
| Team | slug of the name (`AMC POD` → `amc-pod`) |
| User | lowercased email |

## Age is computed, never stored

Storing an age makes it wrong tomorrow. Aggregations use a painless script over
`createdDate` with `now` passed as a parameter:

```ts
const ageScript = (now: number) => ({
  source:
    "if (doc['createdDate'].size() == 0) { return 0; } " +
    "return (params.now - doc['createdDate'].value.toInstant().toEpochMilli()) / 86400000.0;",
  params: { now },
});
```

Prefer a `range` query on `createdDate` over a script wherever possible — an
aged filter is a plain range, which is cheap and index-backed. Reserve the
script for `avg`, where there is no alternative.

## Never send `now` in a range query

Resolve date windows to absolute epoch millis in JS — `daysAgo()`, `floorDay()`
and `floorWeek()` in `metrics.ts` — and pass numbers.

OpenSearch wraps a range containing `now` in `DateRangeIncludingNowQuery`, which
does not implement `createWeight`. Inside a filter aggregation that throws
`unsupported_operation_exception` and fails the entire search, but only for some
segment states, so it presents as an intermittent 500 across the whole dashboard.
Absolute bounds avoid it and are cacheable.

`floorDay` is the equivalent of date math's `/d`; `floorWeek` matches `/w` and
the Monday start that `calendar_interval: week` buckets on.

## date_range bounds

Buckets are **lower-inclusive, upper-exclusive** (`from` in, `to` out). Any
drill-down that reproduces a bucket must use `gte` / `lt` to match. Using `lte`
returns one extra item and the drawer disagrees with the bar it came from.

## Sync watermark

`syncTeam()` reads `lastChangedDate` from `IDX.sync`, queries Azure for items
changed since, then advances the watermark to the newest indexed
`changedDate` **minus 60 seconds**. Azure's `ChangedDate` ordering is not strict
enough to trust exactly; the overlap re-imports a few items, which is harmless
because ids are deterministic.

`syncAllTeams()` must never let one team's failure stop the others — errors are
captured per team into `SyncResult.error`.
