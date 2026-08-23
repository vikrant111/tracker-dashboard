# Metrics

Everything on the dashboard comes from one function:
`dashboard(filters)` in [`src/lib/metrics.ts`](../src/lib/metrics.ts). It issues
a single `size: 0` search carrying every aggregation the page needs.

One query, not eight, because the numbers must agree with each other. Separate
queries drift when data changes between them.

## Filters

```ts
type Filters = {
  teamId?, kind?, severity?, environment?, status?, assignee?,
  activeOnly?, closedOnly?, agedOnly?, search?,
  minAgeDays?, maxAgeDays?,         // ageing-bucket window, day granularity
  createdFrom?, createdTo?,         // exact ISO window, `from` in / `to` out
  thresholdDays?,                   // from the team, not the caller
}
```

Two date windows exist because they answer different questions. `minAgeDays` /
`maxAgeDays` reproduce an **ageing bucket** and round to the day.
`createdFrom` / `createdTo` are **exact instants**, which is what a trend point
needs — a histogram bucket cannot be expressed in whole days of age, and
approximating it returns more items than the point plots.

`buildQuery(filters)` turns this into a bool query. The same function serves the
aggregation and the drill-down list — that shared path is what keeps a bar and
its drawer consistent.

`search` matches three ways: title prefix phrase, exact work item id, and a
case-insensitive wildcard on assignee. The wildcard needs OpenSearch's nested
option form:

```ts
{ wildcard: { assignee: { value: `*${term}*`, case_insensitive: true } } }
```

The flat form with a sibling `case_insensitive` key is a parse error.

## The panels

| Panel | Aggregation |
|---|---|
| Total | `hits.total.value` with `track_total_hits` |
| Active | `filter` on `isActive` |
| Average ageing | `filter` active → `avg` over the age script |
| Critical aged | `filter` active + `severity: Critical` + `createdDate <= daysAgo(now, threshold)` |
| Environments | `cardinality` on `environment` |
| Severity / Environment / Status | `terms` |
| Ageing | `filter` active → `date_range` on `createdDate` |
| Top assignees | `terms` on `assignee` (size 12) with sub-aggs |
| POD roll-up | `terms` on `teamId` (size 50) with sub-aggs |
| Closure trend | four `date_histogram`s |

### Top assignees

Each bucket carries `active`, `critical`, `aged`, `avgAge` and a `bySeverity`
sub-aggregation restricted to open items. That last one draws the load bar, and
its segments sum to the row's `active` count — a useful invariant when checking
a change.

Sorting between volume / ageing / criticals happens **client-side** over the 12
returned buckets. Sorting server-side would need a different `order` per mode and
three round trips for a list nobody scrolls past ten.

### Ageing buckets

`date_range` on `createdDate`, active items only. Bounds are **absolute epoch
millis** computed in JS — `ageBound(n) = floorDay(daysAgo(now, n))` — never
`now-3d/d` date math, for the reason in
[the OpenSearch rules](../.github/instructions/opensearch.instructions.md).

| Bucket | Range |
|---|---|
| 0-3 days | `from: ageBound(3)` |
| 4-7 days | `from: ageBound(7), to: ageBound(3)` |
| 8-14 days | `from: ageBound(14), to: ageBound(7)` |
| 15-30 days | `from: ageBound(30), to: ageBound(14)` |
| 30+ days | `to: ageBound(30)` |

**`from` is inclusive, `to` is exclusive.** The drill-down mirrors this with
`gte` / `lt`, using the identical bounds:

```ts
if (minAgeDays != null) range.lt  = floorDay(daysAgo(now, minAgeDays));  // older than N
if (maxAgeDays != null) range.gte = floorDay(daysAgo(now, maxAgeDays));  // younger than N
```

Using `lte` for the upper bound returns one extra item and the drawer disagrees
with the bar. This has been wrong once already — see
[troubleshooting.md](troubleshooting.md).

Older item means *earlier* `createdDate`, so a **minimum age is an upper bound on
the date**. Worth re-reading before touching this.

### Closure trend

Raised and closed key off different date fields, so they are separate
histograms, each wrapped in a `filter` to bound its window:

- `raisedDaily` / `closedDaily` — `calendar_interval: day`, from `floorDay(daysAgo(now, 30))`
- `raisedWeekly` / `closedWeekly` — `calendar_interval: week`, from `floorWeek(daysAgo(now, 84))`

All four use `min_doc_count: 0` with `extended_bounds` so empty days still
appear — otherwise the line silently skips gaps and misrepresents the shape.
`mergeTrend()` joins them on the formatted date key.

The top-level query carries **no date filter**, so an item created 60 days ago
and closed yesterday still lands in the closed series.

### Health score

`lib/health.ts` — its own module, not a private function in `metrics.ts`, so the
pure-logic suite can exercise the arithmetic directly rather than infer it from
whatever the seeded data happens to contain.

```
health = round(closed / total × 100)        closed = total − active
```

That is the whole calculation. 138 closed of 244 reads **57%**. There is nothing
to configure — `HEALTH` no longer exists in `lib/constants.ts`.

#### Why it is only this

It used to be a weighted heuristic: full marks less three capped penalties for
aged criticals, a stale average age, and an open backlog. On the same board that
read 32% where this reads 57%, and the gap was entirely age and severity.

It was more diagnostic and nobody could verify it. A reader looking at `32`
beside `106 of 244` had no way to connect the two without the source. **A score
that has to be explained before it can be trusted is not doing its job on a
dashboard**, so the diagnosis moved to the tiles beside the ring — where the
numbers are named — and the score became the one thing a reader can check by
dividing what is already on the card.

#### What it deliberately cannot see

**Age and severity.** Three criticals open for a quarter score exactly the same
as three trivial items opened this morning. That is the trade, and it is the
reason the card still shows *Critical aged* and *Average age* next to the ring:
the score says how much work is left, and those two say how old and how bad what
is left has become. Only *Still open* moves the number.

If a board ever needs the score itself to react to age, the honest fix is to
change what "closed" counts — not to reintroduce a blend nobody can audit.

`thresholdDays` still drives the *Critical aged* tile and the `agedOnly` filter.
It no longer touches the score, so it is not passed to it.

#### The ring

Captioned **closed**, not *health*, because that is literally what it counts —
and `57%` cannot be mistaken for the tally sitting a few rows below it. See
[design-system.md](design-system.md#it-reads-as-a-percentage).

#### How much is still open

The score's complement is what the card prints: **"106 of 244 open"**, and `106`
beside `of 244` on the *Still open* tile. Those two numbers **are** the score, so
a reader who doubts the dial can do the division themselves. A count with no
denominator is not interpretable — `106` alone looks like a bug.

Edge cases, all covered by checks:

| Board | Score | Why |
|---|---|---|
| nothing tracked (`0/0`) | `100` | empty is not unhealthy, and `0/0` is not a number |
| open but nothing tracked (`5/0`) | `100` | incoherent, from a half-written aggregation; dividing would put `Infinity` on the dial |
| more open than tracked (`500/5`) | `0` | clamped, or `closed` goes negative and the score below zero |
| a negative open count (`-20/5`) | `100` | clamped, or `closed` exceeds the board and the score passes 100 |
| `NaN`, `Infinity`, strings, `null` | `100` | never `NaN` on the dial |

The score is always a whole number in `0..100`, by construction rather than by a
clamp: a ratio in `0..1` times 100, rounded.

## Drill-downs

`listItems(filters, size, sort)` returns a page of items plus the **true total**,
with `ageDays` computed per item.

The total matters: the drawer pages at 200, so returning only the page would
make a 360-item slice claim to be 200. `track_total_hits` gives the real number
and the drawer says "200 of 360".

Sorts are `oldest` (default), `newest` and `severity`. Severity is a keyword
field with no inherent rank, so that sort uses a `_script` rank
(Critical → Major → Minor → Unknown) with `createdDate: asc` as the tiebreak.

### Filtering inside a drawer

The drawer composes three layers of query, later winning over earlier:

1. **`baseQuery`** — dashboard scope: team, kind, top-bar search.
2. **the drill query** — what was clicked (`{ severity: "Critical" }`).
3. **the drawer's own filters** — severity, status, environment, assignee, free
   text, open/closed, sort.

Because all three go through the same `Filters` type and `buildQuery()`, a
filtered drawer stays consistent with the panel it came from.

A dimension pinned by layer 2 renders as a locked chip rather than a select —
letting it be changed would contradict the panel the drawer was opened from.
`agedOnly` pins the open/closed control too, since it already implies open;
offering "closed only" beside it would build a query that can only return
nothing.

### Every drill must return the number it sits next to

Ten surfaces open the drawer: the five headline tiles, the health ring and its
three drivers, every breakdown row, every leaderboard row, every roll-up cell,
every chip inside an expanded POD, and every point on the trend chart.

Wherever a number is printed beside a drill, the drill must return **exactly
that number**. Three did not, and each was invisible until the two were compared:

| Surface | Showed | Returned | Cause |
|---|---|---|---|
| Trend point | 19 raised | 28 items | day-granularity age maths overshot the bucket |
| POD detail assignee chip | 21 open | 51 items | query was missing `activeOnly` |
| Leaderboard row | ranked by `aged`, displayed `total` | — | a correctly sorted list looked unsorted |
| Environments tile | 5 | 360 items | the number is a cardinality, not an item count |

All but the last are fixed. The leaderboard now shows **the figure it ranks by**
and its drill follows the sort (`Volume` → all items, `Ageing` → `agedOnly`,
`Critical` → open criticals), so the number, the ordering and the list always
agree.

The Environments tile is **inherent** — it counts distinct environments — so
instead it lists the environment names and its drawer is explicitly labelled
"all items across 5 environments". It is the one tile whose number is
deliberately not an item count.

`pnpm check invariants` asserts all of these.

## Adding a metric

1. Add the aggregation inside `dashboard()`.
2. Extend the `Dashboard` type and map the bucket in the return object.
3. Render it, and give it a drill-down query that reproduces the same filter.
4. Check the two agree:

```bash
curl -s "localhost:3000/api/metrics" | jq '.yourMetric'
curl -s "localhost:3000/api/items?yourFilter=…&limit=500" | jq '.items|length'
```

If they disagree, the drill-down filter is wrong — the aggregation is the source
of truth for the number on screen.

## Reading aggregation responses

The OpenSearch client types `aggregations` as a union of every possible aggregate
shape, which is unusable directly. `search<T>()` in `opensearch.ts` narrows once;
`AggBucket` and the `toBuckets()` helper cover the rest. Do not spread casts
through the file — extend the helpers.
