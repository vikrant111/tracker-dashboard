# Changing what the dashboard shows

A recipe book. Every entry is a change somebody has actually wanted to make,
with the files to touch **in order**, what breaks if you skip one, and how to
know it worked.

The other pages describe how the system *is*. This one is for when you want it
to be different.

> **The one rule.** Nothing here is finished until `pnpm test` passes. The suites
> are not ceremony — most of them exist because the change you are about to make
> was made before and broke something three files away.

---

## The pipeline, in one picture

Every change below happens at one of these seven points. Find yours, then jump
to the recipe.

```
  ①  Azure Boards                    ②  a spreadsheet
     src/lib/azure.ts                   src/app/api/upload/route.ts
     └── which items, which fields      └── which columns
                    │                              │
                    └──────────────┬───────────────┘
                                   ▼
  ③  src/lib/normalize.ts        fromAzure() / fromRow()
     src/lib/normalize/           one flat `Item`, whatever the source
                                   │
                                   ▼
  ④  src/lib/value-map.ts        the board's words → ours
     src/lib/types.ts             the vocabulary itself
                                   │
                                   ▼
  ⑤  MongoDB                     src/db/schemas/item.schema.ts
                                   │
                                   ▼
  ⑥  src/lib/metrics/            one query → every tile and chart
                                   │
                                   ▼
  ⑦  src/components/             what it looks like
```

**The direction matters.** Adding a field means walking ③ → ⑦. Changing a
*mapping* usually means only ④. Changing a *chart* usually means only ⑥ and ⑦.

---

## Recipe 1 · "This value from my board lands as `Unknown`"

**Time: 2 minutes. Files: 1.**

The most common change, and the easiest. Your board says `For PO Validation`,
`Sev-1`, `PreProd` — and the dashboard shows `Unknown`.

### Do it per-POD first, in the UI

**Admin → the POD → Value mapping.** Add the value there. It wins over
everything in the code, needs no deploy, and is the right home for anything
specific to one team.

### Or in the code, if every board will want it

[`src/lib/value-map.ts`](../src/lib/value-map.ts) — one table per dimension.
Keys are lower-case; values must be one of the words in
[`types.ts`](../src/lib/types.ts).

```ts
status: {
  "for po validation": "For QA Validation",
  //  ↑ what the board says      ↑ what we call it
}
```

**Then add a check.** In `scripts/check-ui.mjs`, section *"a board's own words
resolve"*, there is a table of `[value, expected]` pairs. Add yours to it. A
mapping with no check is a mapping the next person can delete by accident.

> ⚠️ **Do not add a key shorter than three characters.** Matching is
> word-bounded, but short keys still collide with real words. `it → IT-UAT`
> already matched inside *"microsites"* once and mislabelled a whole board.

<details>
<summary>How a value is resolved, in order</summary>

1. **The POD's own overrides** — exact match, lower-cased.
2. **The shipped table** — exact match.
3. **The word-bounded substring pass**, longest key first. This is what lets
   `3 - Medium (UI)` reach `Minor` and `Deployed to Prod` reach `Production`.
4. Nothing matched → the fallback, which is always `Unknown`.

Longest-first is what makes `not a bug` beat `bug`, and `biz-uat` beat `uat`.
Word-bounded is what stops `it` matching inside "microsites".
</details>

---

## Recipe 2 · "I want a new category — a fifth severity, another environment"

**Time: 20 minutes. Files: 4.**

Harder than it looks, because a category is not just a string: it needs a
colour, and the colour has to survive a colourblind check.

| Order | File | What |
|---|---|---|
| 1 | [`types.ts`](../src/lib/types.ts) | add it to `SEVERITIES` / `ENVIRONMENTS` / `STATUSES` |
| 2 | [`value-map.ts`](../src/lib/value-map.ts) | the spellings that should reach it |
| 3 | [`palette.ts`](../src/lib/palette.ts) | a colour in the matching `*_COLOR` record |
| 4 | `scripts/check-ui.mjs` | a `[value, expected]` pair |

**Step 3 is the one that fails.** The palette is validated for colourblind
separation, and `pnpm check:theme` will reject a colour too close to an existing
one. Do not pick a hex by eye — take the next slot from the ramp, then run:

```bash
pnpm check:theme
```

If a status is **terminal** (means "no longer open"), also add it to
`TERMINAL_STATUSES` in `types.ts`. Miss that and items with it stay counted as
open forever — the health score, the ageing chart and every "still open" number
go quietly wrong.

---

## Recipe 3 · "I want to import a field Azure has that we ignore"

**Time: 45 minutes. Files: 7.** The longest recipe, and worth doing in order.

Say you want `Iteration` (the sprint) on the board.

| Order | File | What | Skip it and… |
|---|---|---|---|
| 1 | [`types.ts`](../src/lib/types.ts) | add `iteration: string` to `Item` | nothing compiles — a good first failure |
| 2 | [`item.schema.ts`](../src/db/schemas/item.schema.ts) | add the field, and an index if you will group or filter by it | **the value is silently dropped on write** |
| 3 | [`normalize.ts`](../src/lib/normalize.ts) | read it in **`fromAzure`** | Azure items have no value |
| 4 | [`normalize.ts`](../src/lib/normalize.ts) | read it in **`fromRow`** | spreadsheet items have no value |
| 5 | [`normalize/columns.ts`](../src/lib/normalize/columns.ts) | add to `COLUMN_ALIASES` **and** `EXPORT_COLUMNS` | the round trip breaks — a downloaded report cannot be re-uploaded |
| 6 | [`metrics/types.ts`](../src/lib/metrics/types.ts) + [`api.ts`](../src/lib/api.ts) | add to `Filters` and to `filtersFromRequest` | you cannot filter or drill by it |
| 7 | [`components/`](../src/components/) | show it | it is in the data and nowhere on screen |

**Step 2 is the one people forget**, and under MongoDB it fails harder than it
used to. The schema is `strict`, so a field it does not declare is **thrown away
at write time** — not stored-but-unaggregatable, simply gone. Everything
compiles, the import reports success, and the column is empty forever.

A check asserts that every field on `Item` appears in the schema, so this fails
the suite rather than the dashboard.

**Step 5 is the one that bites later.** Export and import share one definition
on purpose, and a check asserts every exported header maps back through
`mapHeaders`. Add a column to one and not the other and the suite fails — which
is the point.

> ⚠️ **Existing documents will not have the new field.** Nothing back-fills
> them. Either run **Full resync** on each POD, or give the field a schema
> default and write the reader to cope with it missing. Recipe 7 covers the
> rebuild.

---

## Recipe 4 · "The wrong Azure field is feeding a dimension"

**Time: 1 minute. No code.**

This is configuration, not a change. **Admin → the POD → Field mapping.**

Those three boxes take Azure **reference names**, not the labels you see on the
work item form. Find yours: *Project settings → Process → the work item type →
click the field → Reference name.*

| Row | Ships as | Reality |
|---|---|---|
| Severity | `Microsoft.VSTS.Common.Severity` | usually right |
| Environment | `Custom.Environment` | **most boards do not have this field** |
| Status | `System.State` | often wrong — many boards use a custom `Bug Status` |

**Environment is worth leaving alone even when the field is missing.** The
importer falls back to **tags**, then to the **area path**, so a `Production`
tag is enough.

**Status is worth checking.** A bug can be `Active` in `System.State` while its
`Bug Status` says `For PO Validation`, and only the second is what the team
reads.

---

## Recipe 5 · "Items are missing after a sync"

**Time: 5 minutes.** Almost always one of three things, in this order.

### 1. The work item type does not match

The query is `[System.WorkItemType] IN ('Bug', 'Task', …)` — an **exact** match.
A board whose types are called `3IN1 TASK` matches none of the defaults, syncs
only its bugs, and reports success.

**Press Test.** It lists the project's real type names as chips under the field;
click one to add it. If a configured type does not exist, Test says so.

### 2. The area path excludes them

`[System.AreaPath] UNDER '…'`. Anything outside that subtree is invisible to
this POD. Blank means the whole project.

### 3. They did not change recently

**Sync** only fetches what changed since the last run. An item that has sat
untouched for a month was never in that window. **Full resync** ignores the
watermark and re-reads the last 365 days — that constant is `FIRST_RUN_DAYS` in
[`sync.ts`](../src/lib/sync.ts).

---

## Recipe 6 · "I want a new tile or chart"

**Time: 30 minutes. Files: 3.**

| Order | File | What |
|---|---|---|
| 1 | [`metrics.ts`](../src/lib/metrics.ts) | add the aggregation to the **one** `size: 0` query |
| 2 | [`metrics/types.ts`](../src/lib/metrics/types.ts) | add it to `Dashboard` |
| 3 | [`components/`](../src/components/) | draw it, and make it drill |

**Do not add a second query.** Everything on the board comes from one search on
purpose: separate queries run at different moments, and then two tiles disagree
on screen about the same number. That is the bug this design exists to prevent.

**Make it clickable.** Every number on this dashboard opens the items behind it.
A number you cannot click is a number nobody can check.

> ⚠️ **The drill-down must return exactly the number shown.** `pnpm check
> invariants` asserts that for every bar and tile. If your new panel's filter and
> its aggregation disagree, the suite tells you — read
> [metrics.md](metrics.md#ageing-buckets) for the date-bound trap that has caused
> this twice.

---

## Recipe 7 · "I changed the schema and need to rebuild"

MongoDB has no fixed mapping, so **adding** a field needs nothing but the schema
change — existing documents simply lack it. Two changes still need a rebuild:

- **changing a field's type** (a string that becomes a date), because the old
  documents keep the old type and the aggregation sees both;
- **renaming** a field, because nothing migrates the values across.

```bash
pnpm seed --reset       # drops the collections and recreates them, indexes and all
```

Then **Full resync** each POD from Admin, and re-upload any spreadsheet-sourced
data. `--reset` destroys everything — including spreadsheet items, which have no
upstream to re-fetch from.

For production, take a snapshot first: [operations.md](operations.md#backup-and-recovery).

---

## Where each thing lives

| I want to change… | File |
|---|---|
| which items Azure returns | [`azure.ts`](../src/lib/azure.ts) `queryChangedIds` |
| which Azure fields are read | [`normalize.ts`](../src/lib/normalize.ts) `fromAzure` |
| which spreadsheet columns are read | [`normalize/columns.ts`](../src/lib/normalize/columns.ts) `COLUMN_ALIASES` |
| what a board's words become | [`value-map.ts`](../src/lib/value-map.ts) |
| the categories themselves | [`types.ts`](../src/lib/types.ts) |
| what "closed" means | [`types.ts`](../src/lib/types.ts) `TERMINAL_STATUSES` |
| how a field is stored and indexed | [`item.schema.ts`](../src/db/schemas/item.schema.ts) |
| every tile and chart | [`metrics.ts`](../src/lib/metrics.ts) |
| what a drill-down accepts | [`api.ts`](../src/lib/api.ts) `filtersFromRequest` ← **the security boundary** |
| the health score | [`health.ts`](../src/lib/health.ts) |
| ageing buckets | [`metrics.ts`](../src/lib/metrics.ts), and `AGEING` in [`constants.ts`](../src/lib/constants.ts) |
| colours | [`palette.ts`](../src/lib/palette.ts) |
| how often it syncs | `SYNC_POLL_SECONDS` |
| how far a full resync reaches | `FIRST_RUN_DAYS` in [`sync.ts`](../src/lib/sync.ts) |

---

## Before you call it done

```bash
pnpm exec tsc --noEmit    # the fastest way to find what you missed
pnpm test                 # every suite, dev server managed for you
```

Then, if you touched anything that reads or writes items:

```bash
pnpm check invariants     # every number agrees with its drill-down
```

### Add a check, then break the code on purpose

A check that cannot fail is worse than no check, because it is trusted. After
adding one, change the code so it *should* fail and confirm it does. Every
finding in this codebase's history came from doing that — including three
knowingly-broken builds that sailed through a suite which was testing its own
copy of the logic rather than the real module.

Two traps worth knowing, both of which have caught people here:

- **A check that reimplements what it checks** tests only its copy. Import the
  real module.
- **A comment quoting the string its own rule forbids** will trip that rule.
  Anchor source rules to code, not prose.

Symptoms and their causes, including every bug already fixed here:
[troubleshooting.md](troubleshooting.md).
