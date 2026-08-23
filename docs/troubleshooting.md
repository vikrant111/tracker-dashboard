# Troubleshooting

Symptoms first. The last section records bugs already found and fixed here — if
something looks familiar, check there before re-debugging it.

## Data looks wrong

**A drill-down returns a different count than the bar.**
The drill filter does not mirror the aggregation. For ageing, `date_range` is
lower-inclusive / upper-exclusive, so the drill must use `gte` / `lt`. Anything
else: confirm both go through `buildQuery()` with equivalent `Filters`.

**Aggregation errors, or a dimension groups as one blob.**
The field is mapped `text`, not `keyword`. Add it to `src/lib/mappings.json` and
recreate the index — mappings only apply at creation. `pnpm seed --reset`
in dev.

**Everything maps to `Unknown`.**
The team's `fieldMap` points at reference names that board does not have. Check
`state` on a document — it stores the raw board value precisely for this. For
environment, remember the fallback chain is field → tags → area path.

**Closed items still counted as open, or the closure trend looks inflated.**
`ResolvedDate` is not a close date. Only `Microsoft.VSTS.Common.ClosedDate` sets
`closedDate`; `For QA Validation` is deliberately an **open** status.

**Average ageing looks impossibly high.**
It averages open items only, and a long-open outlier moves it a lot. Cross-check
against the ageing buckets, which show the distribution.

**Item counts double after a sync.**
Ids stopped being deterministic. They must be `<teamId>:<workItemId>` (Azure) or
`<teamId>:xlsx:<workItemId>` (upload).

## Sync

**"Azure DevOps rejected the PAT."**
Expired, or missing the Work Items (Read) scope. Azure returns HTTP 203 with an
HTML sign-in page rather than a 401, which is why the message is explicit.

**Sync reports 0 imported but the board has changed.**
The watermark is ahead. Check `lastChangedDate` in `tracker-sync`, or run a
**Full resync** which ignores it.

```bash
curl -s "localhost:9200/tracker-sync/_search?pretty"
```

**WIQL parse error.**
Almost always the timestamp format — it must be `yyyy-MM-ddTHH:mm:ssZ`, not
millisecond ISO. Or an unescaped quote in an area path.

**Nothing arrives via the webhook.**
In order: is `AZDO_WEBHOOK_TOKEN` set (unset rejects everything), does the
`?token=` match, is the URL publicly reachable, and does the item's area path
match a POD? `teamForAreaPath()` returns null when several PODs exist and none
matches — check the Azure DevOps subscription history for the response body,
which names the reason.

**The poller never runs.**
It is armed by the first `/api/metrics` request, so nothing polls until someone
opens the dashboard. Confirm `SYNC_POLL_SECONDS > 0` and look for
`[sync] polling Azure DevOps every Ns` in the server log.

## Upload

**"No Title column found."**
The header row must be row 1 of the **first** worksheet. Accepted aliases are in
`COLUMN_ALIASES`; the error lists the headers actually read.

**Dates import as today.**
The column is text that `new Date()` cannot parse. Format it as a real date in
Excel, or use ISO strings.

**Rows silently missing.**
Rows without a title are counted in `skipped` — the response reports both counts.

## Runtime

**`Module not found: Can't resolve 'https'`**
Something server-only reached a non-Node bundle. Usually a `lib/` import in a
`"use client"` file, or code placed in `instrumentation.ts`. Only `types.ts` and
`palette.ts` are safe to import from components.

**`[wildcard] query doesn't support multiple fields`**
The nested option form is required:
`{ wildcard: { field: { value: "*x*", case_insensitive: true } } }`.

**Type errors reading `body.aggregations`.**
Go through `search<T>()` in `opensearch.ts`, which narrows the client's
union-typed response once, rather than casting at the call site.

**401 on every API call after changing auth.**
`AUTH_SECRET` changed, invalidating existing cookies. Sign in again.

**A member sees no data instead of an error.**
They are assigned to no PODs. That is a deliberate 403 — check
`filtersFromRequest()` still throws rather than falling through to an unscoped
query.

## OpenSearch

**Connection refused on 9200.**
`brew services start opensearch`, then wait 20–40s. Check with `curl -s localhost:9200`.

**Useful direct queries**

```bash
curl -s "localhost:9200/_cat/indices?v"
curl -s "localhost:9200/tracker-items/_mapping?pretty"
curl -s "localhost:9200/tracker-items/_count"
curl -s "localhost:9200/tracker-items/_search?pretty" -H 'Content-Type: application/json' \
  -d '{"size":3,"query":{"term":{"teamId":"amc-pod"}}}'
```

---

## Bugs already fixed here

Each one is covered by a case in `pnpm check`, so it stays fixed.

### Correctness

| Bug | Cause | Fix |
|---|---|---|
| Ageing drill-downs returned one item too many | `lte` upper bound against lower-inclusive/upper-exclusive `date_range` buckets | `lt` for the upper bound |
| Search 500'd | flat `wildcard` with a sibling `case_insensitive` key | nested option form |
| Resolved items counted as closed | `ResolvedDate` used as a fallback for `ClosedDate` | only `ClosedDate` closes; `isActive` also requires no close date |
| A drawer claimed "200 items" for a 360-item slice | the page size was reported as the count | `listItems` returns the true total via `track_total_hits` |
| **The whole dashboard 500'd intermittently** with `unsupported_operation_exception: … DateRangeIncludingNowQuery … does not implement createWeight` | OpenSearch wraps any range containing `now` in a query class that cannot produce a weight; inside a filter aggregation this throws, but only for some segment states, so it looked random | all date windows resolved to absolute epoch millis in JS (`daysAgo` / `floorDay` / `floorWeek`) — no `now` reaches OpenSearch |
| Future-dated items dragged the average age below reality | the age script could return a negative | floored at zero in the script |
| Duplicate ids in one upload reported 3 imported when 1 document was written | rows counted instead of documents | deduped by id before indexing, `duplicates` reported separately |

### Robustness — user input reaching the query layer

| Bug | Cause | Fix |
|---|---|---|
| `?limit=abc` / `?limit=-5` → 500 | `Number()` of junk became `size: NaN` | `intParam()` clamps and drops unusable values |
| `?minAgeDays=abc` / `=-3` → 500 | became `now-NaNd` / `now--3d` date math | same |
| A POD saved with a negative ageing threshold 500'd on **every** query | no validation on write, and the value reaches date math | `clampThreshold()` bounds it to 1..365, on write and on read |
| Corrupt spreadsheet returned a raw zip parser error as a 500 | exceljs threw past the handler | caught, returned as a 400 naming the file |
| Webhook 500'd on a `null` JSON body | `req.json()` succeeds on `null`, then property access threw | coalesced to `{}`; non-object bodies rejected |
| Webhook synced on non-work-item events, and on ids like `"abc"`, `-1`, `1.5` | no event or id validation | event prefix checked, id must be a positive safe integer |

### Data integrity

| Bug | Cause | Fix |
|---|---|---|
| Two differently-named PODs silently merged into one document | every name with no ASCII letters (`团队`, `!!!`) slugged to the constant `"team"` | falls back to a hash of the name; a near-collision on an existing slug is a 409 |
| A 300-character POD name became a 300-character document id | no length bound | name capped at 80, slug at 48 |
| **A failed sync reset the watermark to 1970** | the error path defaulted `lastChangedDate` to the epoch, so the next success re-imported all history | the watermark is preserved on failure, and `clampSince()` floors any stored value at the first-run window, healing already-corrupted state |

### Authorization

| Bug | Cause | Fix |
|---|---|---|
| **`teamIds` saved as a string granted access by substring** | `"amc-pod-archive".includes("amc-pod")` is `true` | `cleanTeamIds()` coerces to an array on write, **and** `canSeeTeam()` requires `Array.isArray` — the second layer is what protects records written before the first existed |
| `role` accepted any string | no allowlist | validated against `admin` / `member`; member roles against `lead` / `member` |

### UI

| Bug | Cause | Fix |
|---|---|---|
| Every number counted up from zero on each 30s refresh | `CountUp` always animated from `0` | animates from the previously shown value |
| A hard straight edge across the health card where the red halo stopped | the halo was a solid colour with `filter: blur()`, and a blurred element is clipped by the panel's `overflow: hidden` | halos are radial gradients now, whose alpha reaches zero inside their own box |
| Panels looked like flat white boxes in light mode | glass needs a backdrop to refract; the plane was nearly the same value as the panels, so the effect had nothing to work with | saturated four-colour mesh, four drifting orbs at 0.5 opacity, film grain, and a specular rim on `.glass` |
| The greeting could render "Hi, " with no name | a session name may be empty, whitespace, or an email with no local part | `displayName()` falls back to "there", and is checked against all of those |
| The health dial could render `NaN` as the board health | non-finite pointer coordinates passed the dead-zone test, since `NaN < 28` is `false` | `valueAt` rejects non-finite input and `clamp` will not launder a `NaN` |
| **Leaderboard looked unsorted** | it ranked by the selected metric but every row displayed `total`, so "ranked by ageing" showed 50, 46, 51, 49 | the row shows the figure it ranks by, and its drill follows the sort |
| An open drawer could disagree with the tile behind it | the drawer and expanded POD rows had no `refreshInterval` while the dashboard polled every 30s | one shared policy in `lib/swr.ts`; sync and upload revalidate every API key |
| Health card had a large void at the bottom | its content was shorter than the leaderboard beside it in a stretched grid | the ageing spine fills it with the distribution of open work |
| Leadership roll-up read as dead | cells did drill, but there was no affordance and the obvious target — the POD name — switched dashboard scope instead | chevron + row-level expand; scope-switching moved to its own ↗ button |
| **Trend point drill returned more items than the point plotted** | the window came from day-granularity age maths (`floor`/`ceil` plus `/d` rounding), which cannot express a histogram bucket | exact `createdFrom` / `createdTo` ISO bounds |
| POD detail assignee chip showed the open count but listed everything | query was missing `activeOnly` | added it, so the list matches the number |
| Environments tile showed 5 and opened a drawer of 360 | that number is a cardinality, not an item count | inherent — the tile now names the environments and the drawer says what it is listing |
| The evening sky showed a midday sun overhead | the sun's height came from the phase, not the hour, so it sat at its peak for the whole day | `skyBodies()` traces a half-sine from rise to set; exactly one body is up at any minute, checked across all 1440 |
| **The greeting reported the weather at 0°N 0°E as yours** | `.env.example` ships `WEATHER_LAT=` blank, and `Number("")` is **0** — which passed the finite and bounds tests, and is a real point in the Atlantic that Open-Meteo answers for | blank is rejected before `Number()`; the check stubs `fetch`, calls the real function, and asserts nothing was requested |
| The cat read as a puppet on sticks | legs were single segments on a symmetric sine, which is a pendulum, not a walk | jointed legs, 62% stance, and a lateral-sequence gait — see [design-system.md](design-system.md#why-the-first-version-read-as-cartoon) |

### Invisible layers

| Bug | Cause | Fix |
|---|---|---|
| **The scroll takeover, and the parallax mesh, never appeared at all** | both are `position: fixed` at a **negative** z-index, and `body` carried an opaque background. A negative-z child paints *before* the in-flow block backgrounds of its stacking context, so `body`'s gradient covered both layers completely | the page background moved to `html`. The root element's background is propagated to the canvas and painted first, so the `-z-` layers sit above it |

Worth reading twice, because it fails **silently** — no error, no warning,
nothing in the console. The maths was right, the component rendered, the
`clip-path` was correct, and none of it was ever on screen. `pnpm check:theme`
now fails if a background reappears on `body`, if `html` loses its own, or if
the sky layer sinks below the mesh.

The general shape: when a fixed layer is invisible, check what is painting over
it before checking the layer itself.

### Hard edges

| Bug | Cause | Fix |
|---|---|---|
| **A razor-sharp rectangle across the page while the sky grew** | the window was a `clip-path` — a binary test per pixel, so the sky met the page in a hard step with no transition | the window is a **mask** of four intersected gradients, whose edge fades over up to 150px. The clip stays underneath as containment, cutting where the alpha is already zero |
| **Two vertical seams either side of the header** | the topbar's blurred backdrop was `absolute inset-0`, and the bar lives inside a `max-w-[1400px]` container — so on any wider screen it stopped at the container edge | it reaches `-50vw` past each side, which the viewport's `overflow-x: hidden` clips. No edge at any width, no extra scrollbar |
| A giant cat across the middle of the page | `preserveAspectRatio="slice"` on a 400×120 scene fills a tall viewport by scaling ~8× and cropping to the middle 57% of the width — the sun went off-frame too | the full-bleed sky is drawn in a band at the top, and passes `grounded={false}` to drop the ground line and the animals standing on it |
| **The moon was drawn half off the left edge, and often not visible at all** | bodies tracked east→west across the full 400-unit scene, but `slice` crops a square-ish card to the middle strip (x ∈ [140, 260]) — so a body was outside the crop for most of its time up | `placeBody` holds x at 224 and moves only the **height**, horizon to zenith. `visibleXRange()` computes the surviving strip, and a check asserts 224 lands inside it for every card size from 620×430 to 280×300 |
| The greeting text sat under the horizon and read as an afterthought | the card's content column was `justify-end`, pinned to the floor | `justify-center` — the greeting is the point of the card, so it holds the middle |
| A ruled 1px line across the bottom of the card | it was a literal ground line, and read as a border rather than as ground | two layers of wind-blown grass; the near fringe is scaled to 0.45 so it reaches the cat's ankles without hiding its legs |

### Small devices

| Bug | Cause | Fix |
|---|---|---|
| **On a phone the sun's disc was drawn over the crop boundary** | `BODY_X = 224` is fine on a 620×430 desktop card (62 units of clearance) but a 296×620 phone card crops to a 58-unit strip, leaving **4.6** | `placeBody` takes the box it is drawn into and clamps the line inside that box's own crop, keeping `BODY_MARGIN = 34` or a fifth of the strip, whichever is smaller |
| The full-bleed sky threw away three-quarters of its width on a phone | `slice` into a tall band scales the 400×120 scene ~4× and crops to the middle | `fit="adapt"` grows the viewBox **upward** by the open sky the band's shape needs, so 100% of the scene width shows at every size — 0 extra units at 1920, 278 on a 400px phone |
| **A hard brown line across the background while scrolling on mobile** | both meadow layers drew their own phase wash, so everything below y=102 was tinted twice while the page-level meadow below the band was tinted once — a brightness step exactly where they met | the wash is drawn **once**, in the near layer, covering the whole meadow |
| The background kept the old flat-sky design after the card gained its meadow | `grounded` gated the meadow *and* the animals, so turning off the giant full-bleed cat also deleted the ground | split into `grounded` (meadow) and `cast` (animals) |
| **The grass sat halfway down the background instead of at the bottom** | the meadow held a fixed 22-unit depth however tall the frame got, so it was a thin strip with flat colour painted below it — and the band was only `30vw`, putting the horizon mid-screen | the ground scales with the added sky (`22 + above × 0.30`), and the scene fills the whole layer instead of a band plus a painted-on meadow. Horizon lands at 70–72% at every size |
| The sun sat near the ground with a screenful of empty sky above it | `ZENITH_Y` was fixed at 26, which is 61% down a tall frame | the arc scales too: `zenith = 26 − above × 0.88` |
| The animals were missing from the background | `cast={false}`, added when `slice` scaled the cat ~8× by height | `adapt` scales by width, so the cast is back on at roughly its card size |
| **Bats skimmed the grass and the moon sat in it** | bats and the crane carry a `y` authored for a 120-tall scene, so in a 240- or 865-tall frame they land in the bottom fifth; and the arc's low end tracked the ground exactly, so at low altitude the moon was level with the horizon | every flyer carries a `depth` and goes through `liftBy(y, above, depth)`; the arc's low end rises at 0.45 against the ground's 0.30, so it clears the horizon |
| Two clouds were drawn **below the horizon** on a phone | their depths were 0.12 and 0.33, so they lifted far less than the ground rose | raised to 0.5 and 0.58 — found the moment the check stopped hardcoding the depths |
| **The sky left bare gutters down both sides on a wide screen** | the content column caps at 1400px, so on a 1917px screen ~260px either side stayed uncovered — 86% width for most of the scroll | the takeover **finishes sooner** (`SPAN_HEIGHT = 0.35`), so the whole screen is covered inside a third of a screenful of scroll |
| The takeover read as a **curtain** | my first fix for the above ran the sides ahead of the top and bottom (`X_LEAD = 1.9`). It covered the gutters, and the horizontal edges arrived long before the vertical ones, so the eye followed the mismatch | reverted to one `open` value for all four edges. A check now asserts every edge opens by the same fraction, and catches a lead on *either* axis |
| The sky never quite met the right edge | the viewport was measured with `window.innerWidth`, which **includes the scrollbar**, while the layer is `fixed inset-0`, which does not | measured from `documentElement.clientWidth` |
| The sky band overhung behind the mobile URL bar and resized as it hid | sized in `vh`, which is the tallest the viewport ever gets | `dvh` |
| **The sky was invisible on anything narrower than ~1500px** | the content column is capped at 1400px, so a 1440px laptop has 6.1% open gutter — the same as a phone. The veil was a flat 0.2→0.5, which erased the only remaining view of the sky (through 0.11-alpha glass) | `veilAt(progress, viewportWidth)` ramps its ceiling from 0.18 at ≤900px to 0.50 at ≥1600px |

The last one is the general lesson: **"mobile" was the wrong frame.** The problem
was a fixed-width content column, so it began at 1500px and got no worse on a
phone. Testing at 1280px would have shown it; testing "desktop vs mobile" did not.

The container-width seam is the one to remember: it is **invisible at 1280px**
and obvious on any wide monitor, so it survives casual testing. Anything
decorative that should read as page-wide has to escape its container explicitly.

### Tooling

| Bug | Cause | Fix |
|---|---|---|
| **`pnpm test` left a dev server running** | `next dev` forks a `next-server` worker; SIGTERM to the parent alone orphaned it, and it kept port 3000 | the server is spawned `detached` and the whole **process group** is signalled (`process.kill(-pid)`) |

That one is worse than it looks. The next run sees a listening port, reports
"using the server already listening", and quietly tests **last run's code** — and
a `pnpm build` against a live server corrupts `.next`, which is how stale output
once reached the browser. If a run ever says it reused a server you did not
start, check `lsof -ti:3000` before trusting the result.

### Checks that passed on broken code

The recurring failure of this project, and the one worth re-reading. Every entry
was found by deliberately breaking the code and noticing the suite stayed green.

| The check | Why it could not fail | Fix |
|---|---|---|
| `createdFrom` / `createdTo` boundary | no item existed at the boundary, so inclusive and exclusive agreed | a probe item planted at exactly `2026-01-15T00:00:00Z` through the real upload path |
| Ageing bucket boundary | same class, different path | a probe at exactly `floorDay(now − 7d)` |
| "the cat's feet stay above the ground" | it matched the first `scale(0.8)` in the file, which is the **crane** | anchored to the cat's own block |
| Everything about the sky, moon and weather | `check-ui.mjs` **mirrored** the logic in-file, so mutating `lib/sky.ts` changed nothing — three knowingly-broken builds passed | the script now **imports the real modules** (Node strips the types), and nine mutations were run to confirm each check bites |
| "the full-bleed sky never crops" | it asserted `backdrop.includes('fit="adapt"')`, and that string also appears in the **doc comment** above the element — so it passed on the comment alone while the real prop said `slice` | anchored to the JSX element: `/<Sky[\s\S]{0,200}?fit="adapt"/` |
| "the field is not randomised" | `!/Math\.random/` tripped on the comment *explaining* the rule | comments stripped before the source rules run |
| "every flyer flies high" | the y/depth pairs were **typed into the check by hand**, so it passed while the shipped crane sat on the horizon | the pairs are parsed out of `greeting.tsx`. It immediately found two clouds drawn below the horizon on a phone |

The last one is the general lesson: a check that reimplements what it is checking
tests only its own copy. `check-ui.mjs` imports `lib/greeting.ts`, `lib/sky.ts`
and `lib/weather.ts` directly. The one deliberate exception is the health dial's
pointer maths, which lives inside a client component that cannot be imported —
and it is labelled as a mirror at the top of the file so nobody trusts it further
than that.

Fixing this immediately paid for itself: it is what surfaced the Null Island
weather bug above, which had been passing a source-text grep.

### Product

| Bug | Cause | Fix |
|---|---|---|
| **Adding POD members changed nothing on the dashboard** | the leaderboard is built by aggregating **work items**, so a person with none is not in the aggregation at all. Onboarding five people and seeing nothing reads as "adding members didn't work" rather than "nobody has any bugs yet" | `mergeRoster` folds the POD roster into the leaderboard: members with no items appear at zero, tagged *nothing open*, and fill in as items arrive |
| Password fields had no reveal | there was no shared control, so each form used a bare `type="password"` | one `PasswordField`; a check asserts no bare password input survives anywhere |
| No way out of an admin form | editing a POD, adding members and creating a user had a save path and no cancel | Cancel on the editor (asking only when there is something to lose), Clear on the user form, and a two-step confirm on delete — which takes every work item with it |
| A configured environment still showed an empty board | `AZDO_*` fall back per POD, but with **no POD** there is nothing to sync, and a fresh install has none | `ensureDefaultTeam` provisions one from the environment, but only when the list is empty — otherwise deleting your last POD would conjure another |
| A POD with an org URL but no PAT failed on every sync run | `syncAllTeams` filtered on the org URL alone | `isConnectable`, which resolves all three fields from either source |
| **The search box was invisible on a phone** | it shared a row with seven buttons under `flex-1 min-w-0`, which made it the only element that could give — so it collapsed to **0px wide**. Present in the DOM, focusable, and completely invisible | `basis-full` puts it on its own row below them |

### Checks that passed on broken code — product edition

| The check | Why it could not fail | Fix |
|---|---|---|
| "the input is never mutated" | it reused a fixture the block had already merged, so a second call changed nothing | a fresh fixture inside the check |
| "the search takes a whole row" | it searched the **whole file**, where `sm:basis-auto` elsewhere satisfied it | anchored to the search wrapper |
| "the reveal toggle cannot submit" | `ui.tsx` has other `type="button"` elements | scoped to `PasswordField` |
| "deleting a POD needs two clicks" | `confirmThen(` is also used by cancel, and `del-` also appears in the busy flag | anchored to the delete button's own `onClick` |

### Silent CSS overrides

| Bug | Cause | Fix |
|---|---|---|
| **Opening the "For you" menu stretched the whole header** | `.glass` set `position: relative`, which beat Tailwind's `.absolute`. The panel was in flow rather than absolute, and an in-flow panel grows its parent | the declaration moved into `@layer components`, which `utilities` beats |

Worth remembering as a class, not a one-off: **anything this stylesheet declares
at full specificity beats the Tailwind utility of the same name.** It fails
silently — no error, no warning, the element simply ignores the class you wrote
in the JSX. `pnpm check:theme` now fails if a rule targeting `.glass` itself sets
`position` or `display`; `.glass::before` and `.glass > *` are exempt, because
those are different boxes and positioning them is what they are for.

### Cascade layers beat specificity

My first fix for the header-stretch bug was `:where(.glass) { position: relative }`
— zero specificity, so surely any utility would win. **It changed nothing**, and
the reason is worth writing down.

Tailwind v4 declares `@layer theme, base, components, utilities` and puts
`.absolute` inside `utilities`. An **unlayered** rule beats every layered rule
regardless of how weak its selector is — layer order is consulted *before*
specificity. `:where(.glass)`, sitting outside any layer, still won.

The rule has to be **inside a layer that `utilities` beats**:

```css
@layer components {
  .glass { position: relative; }
}
```

`pnpm check:theme` now asserts the declaration is inside `@layer components`
*and* that no unlayered rule positions `.glass` — the `:where()` version fails
both, so the fix that looked right cannot come back.

### Export

| Bug | Cause | Fix |
|---|---|---|
| **Download report returned a 500, saved as `export.json`** | `EXPORT.maxRows` was 20,000 and `listItems` asks for it as a single `size`. OpenSearch refuses any `from + size` above `index.max_result_window` — 10,000 by default — so it failed on **every** board, including one holding 360 items. Chrome named the file from the JSON error response | `streamItems` pages with `search_after`, which has no window at all. `workItemId` is appended to the sort so the order is total — with ties, documents can repeat across pages or be skipped between them |

The response now carries `X-Row-Count`, so a caller can tell a complete export
from one that reached the cap.

| The "For you" panel opened off the left of a phone screen, labels cut in half | it was anchored `right-0`, which is correct on a desktop where the trigger sits near the right — on a phone the trigger is at the left, so a 19rem panel extended off-screen | the anchor flips by breakpoint, **and** the panel measures itself against the viewport on open and nudges back in |
| The menu was see-through | it used `.glass`, which is translucent by design | `--panel`, the token documented for "solid popovers, drawers, menus" |

### Forms

| Bug | Cause | Fix |
|---|---|---|
| **A rejected account still cleared the form** | `save` returned `undefined` on both paths, and the caller cleared in a `.then()` — so a duplicate email or a server error wiped everything typed while a red toast flashed past | `save` returns a boolean; the form clears only on `true`. Losing the input is a worse punishment for a typo than the typo |
| A dropped connection looked like a rejected form | the `fetch` was unguarded, so a network error escaped as an unhandled rejection | caught and reported as "Nothing was saved", with the input left alone |
| The **Add** button stayed dead with no explanation | it was disabled until the email contained an `@`, so a malformed address gave no feedback at all | enabled whenever there is something to judge; the reason is a toast |
| A half-filled member row was dropped silently | the save path strips rows with neither a name nor an email, and a row with only an email matched that filter | `validateTeam` names the row: *Member 2 has an email but no name* |
| Two members could share an email | nothing checked | refused, case-insensitively — both would match the same work items |

The rule, stated once: **success clears, failure keeps and explains.** Validation
runs before the request in [`lib/validation.ts`](../src/lib/validation.ts), which
is pure and imported by the checks. It is a courtesy, not a boundary — the server
re-checks all of it, because a client-side rule is a suggestion to anyone holding
curl.

A blank password is deliberately **valid**: it is how an SSO account is created.
Only a password somebody actually typed has to clear the length bar. And a blank
member row is deliberately **not** an error — the form ships with one, and
refusing it would mean a new POD could never be saved at all.

### Uploads without Excel

| Bug | Cause | Fix |
|---|---|---|
| **A reader with no Excel could not upload their data** | the file picker filtered on extensions alone, so the OS greyed out files it types differently; and the server chose its reader by `filename.endsWith(".csv")`, which assumes files are named the way Excel names them | the picker offers MIME types as well as extensions, and the server sniffs the **bytes** — a CSV is read as one whether it is called `.csv`, `.txt`, `.tsv` or nothing at all |
| `.numbers` and `.ods` failed with "could not read it" | both are zips like `.xlsx`, so they reached the Excel reader and died inside it | identified by their zip entries; `.ods` is refused with the exact export path out of that app, and `.numbers` is now read directly |
| **A real `.numbers` file was still refused** after that | detection scanned only the first 4 KB, and a Numbers bundle leads with hundreds of kilobytes of preview artwork — so `Index/` sat far past the read limit and the file typed as "unknown" | both ends are scanned. The **central directory** at the tail lists every entry name in one place, which is the question being asked |
| Numbers was the only spreadsheet app on the machine, so every upload meant an export step | `.numbers` was refused with instructions rather than read | `lib/numbers.ts` reads Apple's format directly — zip, Snappy, IWA, Protobuf. It resolves references by **what they point at**, never by field number, so an unrecognised layout yields no rows rather than wrong ones |
| The round trip needed Excel at one end | the report was `.xlsx` only | `?format=csv` and a **Download as CSV** menu item, same columns, same mapping |

The general rule: **content decides, filenames are a hint.** A name is chosen by
whoever exported the file, and they were not thinking about this parser.

| **"That workbook has no sheets"** on a real `.xlsx` | `worksheets[0]` was taken blindly, and the message was a dead end — it named the symptom and offered nothing | every tab's header row is read, the one with a Title column is used, and an empty workbook now says *why* (some apps write `.xlsx` this reader cannot open) and points at CSV |
| A workbook whose data sat on the second tab failed | same cause: only the first sheet was ever looked at | `pickDataSheet` scans them all. The response reports which sheet it used |
