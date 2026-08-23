# Decisions

Why the non-obvious choices were made, and what would justify changing them.
If you are about to "fix" something on this list, read the entry first.

---

### One aggregation query for the whole dashboard

The numbers must agree with each other. Separate queries drift when data changes
between them, and the board's whole job is comparing counts.

*Revisit if* the query gets slow enough to matter — split the trend histograms
out first, since they are the only part with a bounded window.

---

### Age computed at query time, never stored

A stored age is wrong the next day, and would need a nightly job to stay honest.
`createdDate` plus `now` is always correct.

Cheap where it can be: filters use an index-backed `range` on `createdDate`; the
painless script is reserved for `avg`, where there is no alternative.

*Revisit if* script aggregations dominate the query cost — an OpenSearch runtime
field would be the next step, not a stored column.

---

### Flat item documents

Every dashboard number is a `terms`, `filter` or `date_range` over the same
document. Nesting would buy nothing and cost a `nested` query on every panel.

---

### Deterministic document ids

`<teamId>:<workItemId>` makes every import an upsert. That single property is
what lets the sync watermark overlap safely, the webhook and poller run together,
and a spreadsheet be re-uploaded after a correction — none of which need
de-duplication logic.

---

### Mappings in JSON, not TypeScript

`scripts/seed.mjs` must create identical indices without importing TypeScript.
One JSON file keeps the app and the seeder honest; two definitions would drift
and the failure would look like a UI bug.

---

### No `middleware.ts`

NextAuth v5 on the Edge runtime needs the config split in two, because the
credentials provider reads OpenSearch, which cannot run on Edge. Guarding in
server components and route handlers is two lines and no split.

*Revisit if* the app grows many protected routes and the guard lines start being
forgotten — the split is worth it at that point, not before.

---

### The poller lives in a lib module, not `instrumentation.ts`

`instrumentation.ts` is the documented place for this, but Next bundles it for a
runtime that cannot resolve `node:https`, which breaks the OpenSearch client in
dev. Arming from the metrics route also means polling only happens when someone
is actually watching the dashboard.

The trade: nothing syncs until the first page load after a restart. Acceptable —
the webhook covers instant updates, and a dashboard nobody has opened has no
staleness to speak of.

---

### Hand-written SVG charts

Three chart forms are needed. The mark specs the design system requires — 2px
surface gaps between stacked segments, rounded data-ends, direct end-labels,
recessive grid — are easier to hit directly than to force out of a library's
defaults, and it avoids a dependency plus its React-version churn.

*Revisit if* the board needs a chart form that is genuinely hard to hand-roll
(a real scatter matrix, a choropleth).

---

### Fixed row order in breakdown panels

Rows render in a declared `ORDER`, not sorted by count. Colour follows the
entity, so sorting by count would make rows swap places and appear to change
colour between refreshes. Severity and the release pipeline also have a natural
order that carries meaning.

---

### Client-side sorting on the leaderboard

Twelve buckets come back with everything needed for all three sort modes.
Sorting server-side would mean a different `order` per mode and a round trip per
toggle, for a list nobody scrolls past ten.

---

### Field and value mapping is per-POD

Every Azure board is customised differently — severity might be a picklist or a
tag, environment usually does not exist as a field at all. A global mapping would
work for exactly one team.

The fallback chain (field → tags → area path) exists because that is where teams
actually record environment. Do not remove it because one board has the field.

---

### `For QA Validation` is an open status

The work is resolved but still needs someone. Counting it as closed would make
the closure trend flatter than reality and move items out of the ageing buckets
early. This is also why `ResolvedDate` is not read as a close date.

---

### Every count is clickable

An ageing dashboard's job is to get someone to the work item. A number nobody
can act on is decoration, so every tile, bar and row opens the list behind it —
one drawer, one endpoint, filters built from the same `Filters` type as the
aggregation.

---

### `exceljs` over `xlsx`

The `xlsx` package on npm is pinned at an old version with a known prototype
pollution advisory. `exceljs` is maintained, published on npm, and reads both
xlsx and csv.

---

### Palette validated rather than chosen

Slot order in `SERIES` is the colourblind-safety mechanism — candidate orderings
were checked and only passing ones kept. It looks like an aesthetic list and is
not. Same for the ordinal ageing ramp stopping at step 600: darker falls under
2:1 against this surface.

Changing the glass recipe changes the surface the palette was validated against,
so it means re-running the validator too.

---

### `pnpm check` instead of a test framework

A sweep for edge cases turned up sixteen real bugs — NaN params reaching date
math, slug collisions merging two PODs into one document, a failed sync
resetting the sync watermark to 1970, a non-array `teamIds` granting access by
substring. None were visible from the UI, and none would have been caught by
unit tests on individual functions: they only appear when a real request crosses
the whole stack.

So the checks are end-to-end HTTP against a running server, in one dependency-free
script. No framework, no fixtures, no mocks — and each case maps to a bug that
was actually real. The suite was mutation-tested: reintroducing the ageing
off-by-one, the unclamped threshold, and the missing `Array.isArray` guard each
make it fail.

*Revisit if* the mapping rules in `normalize.ts` grow much further — `resolve()`
and `mapHeaders()` are pure functions and would be the first thing worth unit
tests, which the end-to-end script covers only indirectly.

---

### Validation clamps rather than rejects

A bad `?limit=abc` drops to the default; a threshold of `-5` clamps to `1`. The
alternative — 400 on anything unexpected — makes a dashboard fragile against its
own stale bookmarks and half-typed URLs, for input where a sane default is
obvious. Genuine mistakes that a default cannot paper over still 4xx: an unknown
POD, a name that collides with an existing one, a file that will not parse.

Values are clamped **on read as well as on write**, because a document saved by
an earlier build can hold anything.

---

### A check that cannot fail is worse than no check

The trend-point drill was fixed, a check was added for it, and the check passed.
Then the fix was reverted as a mutation test — and the check **still passed**,
165/165 green on a knowingly broken build.

It was passing for the wrong reason: histogram buckets start at exact UTC
midnight, and no seeded item lands there, so the `lt` / `lte` boundary was never
exercised. The suite reported coverage it did not have.

The fix was to plant a probe item at exactly `2026-01-15T00:00:00Z` through the
real CSV upload path, then assert it belongs to the later bucket only and that
adjacent windows do not double-count. **Mutation-test every new check**: revert
the fix it guards and confirm it goes red. A green suite is only worth what its
last failing run proved.

---

### Two layers guard `teamIds`

`saveUser()` coerces it to an array, and `canSeeTeam()` independently requires
`Array.isArray`. That looks redundant, and is deliberate: the write-side fix
does nothing for user documents already stored, and `"amc-pod-archive".includes("amc-pod")`
is `true`. `pnpm check` writes a poisoned document straight to OpenSearch to
exercise the second layer, since the first one otherwise hides it.
