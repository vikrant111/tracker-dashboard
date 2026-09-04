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
case-insensitive substring on assignee. The title is **anchored**, and the
input is escaped and stripped of control characters — `c++` is an invalid
pattern and BSON cannot carry a null byte inside a regex:

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
[the database rules](../.github/instructions/database.instructions.md).

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
health = round(closed × 100 / total)        closed = total − active
```

That is the whole calculation. 138 closed of 244 reads **57%**. There is nothing
to configure — `HEALTH` no longer exists in `lib/constants.ts`.

> **Scaled before it is divided**, deliberately. `round((closed / total) × 100)`
> disagrees at exactly one half: 207 closed of 360 is 57.5%, but that product is
> `57.49999999999999` in binary floating point, so it rounded to 57 while anyone
> checking by hand got 58. The point of this score is that it *can* be checked
> by hand, so the arithmetic has to agree with the reader.

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
| nothing tracked (`0/0`) | **`null`** | zero items is not a score of any kind — see below |
| open but nothing tracked (`5/0`) | **`null`** | incoherent, from a half-written aggregation; dividing would put `Infinity` on the dial |
| more open than tracked (`500/5`) | `0` | clamped, or `closed` goes negative and the score below zero |
| a negative open count (`-20/5`) | `100` | clamped, or `closed` exceeds the board and the score passes 100 |
| `NaN`, `Infinity`, strings, `null` | **`null`** | never `NaN`, and never a fake reading |

A real score is always a whole number in `0..100`.

### Why an empty board has no score

`nothing tracked` used to return **100**, reasoning that nothing tracked means
nothing outstanding. On an empty POD that is arguable. Under a **filter** it was
simply wrong, and it was reported from a real board: searching for somebody who
belonged to another POD matched no items, and the card answered with a green
**100%** over the selected POD's name — the most reassuring number on the
dashboard, for a question that had no answer.

`health: number | null`. The card renders
[`health-empty`](../src/components/health-empty.tsx) instead of inventing a
reading, and [`health-empty-copy.ts`](../src/components/health-empty-copy.ts)
picks which of five empty boards it is — on the roster with nothing assigned,
hidden behind other filters, present in a different POD, nowhere at all, or an
untouched POD. Same rule as the rest of the project: never invent data.

**Scaled before divided.** `round(closed × 100 / total)`, not
`round((closed / total) × 100)`. They disagree at exactly one half: 207 of 360
is 57.5%, but that product is `57.49999999999999` and rounded to 57 while a
reader dividing by hand got 58.

## Following a search to its POD

Every metrics query is scoped to one POD by `filtersFromRequest`, which is the
security boundary and is not negotiable. The cost is that searching for somebody
who belongs to a different POD returns an empty board, truthfully and uselessly.

`GET /api/search/pods?q=…` answers *where is this?* —
[`search.controller`](../src/controllers/search.controller.ts) returns every POD
**the caller can see** that matches, with why:

```json
{ "term": "nantha",
  "matches": [ { "teamId": "lc", "name": "LC", "items": 0, "people": ["nantha"] } ] }
```

**Items *and* rosters.** A person can be on a POD with nothing assigned, so an
items-only search reports "nowhere" about somebody plainly on the team. Ordering
is most-items-first, so "the first POD" is the one with the most to show and a
roster-only match sorts last.

It is handed the caller's own accessible team list rather than loading its own —
otherwise "where is this?" becomes "what PODs exist?", and a member could
enumerate every POD in the instance by searching. A check asserts a member only
ever sees their own.

The leaderboard's roster half is narrowed by the **same** search
([`filterRoster`](../src/lib/roster.ts)). Without that it listed the whole roster
at zero beside a search for one person, so the board claimed six people when the
reader had asked about one.

### One person, several PODs

The common case, and the one the ordering exists for. Somebody is on two PODs
and has work on only one:

| POD | On the roster | Items matching |
|---|---|---|
| AMC POD | yes | 0 |
| Payments POD | yes | **2** |

Matches are ordered **busiest first**, so the search opens *Payments*. Landing
on AMC would be technically correct and useless — it holds their name and
nothing else.

Each POD then reports **its own** truth for the same search, because every query
is scoped to one POD:

| Looking at | `totals.total` | `health` | Leaderboard |
|---|---|---|---|
| Payments POD | 2 | `50` (1 of 2 closed) | just them |
| AMC POD | 0 | `null` | just them, at zero, from the roster |

Switching PODs re-queries; nothing is carried across. That is what makes the two
answers different **and** both right.

Standing on the empty POD, the card names where the work actually is — *"2 items
in Payments POD"*, not merely *"also on Payments POD"*. Naming the POD without
the count is the half of the answer that does not help: knowing there is
somewhere else to look is not the same as knowing it is worth looking.

When several other PODs hold work, the busiest is named and the rest are
mentioned. When they are all empty too, it says so plainly rather than implying
work elsewhere.

## What "All PODs" means

The POD picker sets `teamId`, and that is the only thing that changes: with a
POD selected every panel is that POD's, with none selected every panel is the
sum of the PODs the caller can see. It is one filter through one query, so the
whole and the parts cannot drift.

| | All PODs | One POD |
|---|---|---|
| tiles, breakdowns, ageing, trend | across every visible POD | that POD only |
| leaderboard | everyone, from every visible POD | that POD's people and roster |
| POD roll-up | shown, one row per POD | hidden — there is nothing to compare |
| drill-downs | every visible POD | that POD only |

A **member** never sees "All PODs" as everything: `filtersFromRequest` narrows
it to the PODs assigned to them, and one with none gets a 403 rather than an
unscoped query.

### Aged means what each POD says it means

One board calls a week old, another a month, and `ageingThresholdDays` is per
POD. With a POD selected that is simply its own setting. Across **all** PODs
each item is judged by the board it came from — `Filters.thresholdByTeam` carries
every visible POD's threshold, and both the aggregation and the drill-down filter
read it.

That was wrong until it was measured. Every item was judged against one default,
so a POD set to 30 days had its work counted as aged after 7 as soon as the
picker said "All PODs":

```
AMC (7d)  criticalAged 3
Payments (30d)          0
                    sum 3      ·   All PODs said 5
```

The tile and the drill-down behind it now agree in both views, which is the
property the whole board rests on.

### ...and a severity may be held to a tighter clock

A Critical left for three days and a Minor left for three days are not the same
problem, and one threshold judged them identically. An admin can now set a
per-severity override on a POD, under **Admin → the POD → Ageing by severity**.

Two levels, most specific first:

| | where it lives |
|---|---|
| this POD's rule for this severity | `Team.severityThresholdDays[severity]` |
| the default | `AGEING.defaultThresholdDays` (7) |

There *was* a third — a single POD-level `ageingThresholdDays` box above the
severity row. It went, because the four severities already cover every item
(`Unknown` included), so a fifth number could only agree with them or silently
overrule them, with nothing on screen saying which had won. A POD that had set
one keeps its behaviour exactly: `foldPodDefault` writes the value into every
severity that was inheriting it, and pins the stored default back so the fold
cannot repeat. `Team.ageingThresholdDays` survives in the data as that
migration's input; nothing reads it as a rule any more.

`Dashboard.thresholdDays` is therefore the **widest** rule in play across the
PODs with items, not the stored default — the average-ageing tile tints against
it, and a POD that allows a month must not be called "serious" at a fortnight by
a number nothing on it is measured by.

`thresholdFor` in `lib/metrics/threshold.ts` is the **only** place that
precedence is written. The JSON driver's predicate, the Mongo `$match` and the
aggregation that prints the tile all resolve through it, because a tile and the
drawer it opens must not be able to disagree about which items are aged.

**Blank means inherit, and is stored as a missing key** — not as the POD's
number copied in. Copying it would turn a later change to the POD threshold into
a change that silently does nothing, and clearing a field would have nowhere to
fall back to. `clampSeverityThresholds` drops blanks, unknown severities and
unusable values rather than clamping them to something nobody typed.

On the Mongo side the precedence is unrolled into an `$or`: one branch per
overridden severity, then a catch-all branch for that POD carrying `$nin` of
exactly those severities. Without the `$nin` a Critical held to two days would
also match its POD's seven-day catch-all, and the count would exceed the tile.

#### What the copy is allowed to say

"Critical and open past 7 days" was already approximate across PODs with
different thresholds, and became wrong outright once Critical could be tuned on
its own. So the board reports `criticalThresholdDays` — the one number every POD
*with items* agrees on, or `null` when they disagree, at which point the tile
says "past each POD's threshold" rather than naming a number it cannot stand
behind. The POD roll-up sidesteps the question: each row carries its own
`criticalThresholdDays`, because comparing PODs that disagree is what that table
is for.

A rule the store honours can still be dropped on the way to the numbers. It was:
`getDashboard` copied the ageing rules into the aggregation field by field and
the new map was missed, so the drawer filtered on the severity rule while the
tile judged by the POD's. The rules are now forwarded whole.

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

A `$facet` returns one document whose keys are the branches' raw output, and
those shapes are not what the panels render. The conversion lives in
[`dashboard.shape.ts`](../src/controllers/dashboard.shape.ts) — `toBucketList`,
`orderedBuckets`, `fillSeries` — all pure, so the suite exercises them without a
database. Do not spread coercion through the controller; extend the helpers.

`fillSeries` is the one to know about: the pipeline cannot invent documents for
quiet days, so without it the trend jumps between busy days and implies activity
in between.
