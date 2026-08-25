---
applyTo: "src/lib/{azure,normalize,sync,poller,value-map,spreadsheet,numbers}.ts,src/lib/normalize/**,src/lib/numbers/**,src/app/api/webhooks/**,src/app/api/sync/**,src/app/api/upload/**,src/app/api/export/**"
description: Azure DevOps REST, field mapping and spreadsheet import
---

# Azure Boards and spreadsheet import

## REST calls

API version `7.1`. Auth is Basic with an empty username:
`Basic base64(":" + PAT)`. Two calls only:

1. **WIQL** `POST {org}/{project}/_apis/wit/wiql` — returns ids of work items
   changed since the watermark, oldest first.
2. **Batch** `POST {org}/_apis/wit/workitemsbatch` — hydrates up to **200** ids
   per call (Azure's hard cap; `fetchWorkItems` chunks for you).

Credentials resolve per team, falling back to env:
`team.azure.orgUrl || AZDO_ORG_URL`, same for project and PAT. Missing
credentials throw `AzureError` with a sentence naming the team.

### WIQL quirks

- Timestamps must be `yyyy-MM-ddTHH:mm:ssZ`. Millisecond ISO is rejected — use
  the `wiqlDate()` helper.
- Single quotes in values are escaped by doubling (`escapeWiql`).
- An expired or under-scoped PAT returns **HTTP 203 with an HTML sign-in page**,
  not a 401. `call()` detects this and says so plainly.

## Field mapping

Boards differ, so severity / environment / status are resolved per team.
`normalize.ts` orchestrates; the matching itself lives in
`normalize/vocabulary.ts`, and the shipped word table in `value-map.ts`.
`resolve()` runs four passes:

1. the team's own `valueMap` override,
2. `DEFAULT_VALUE_MAP` exact match (keys are lowercase),
3. a direct match against the allowed values,
4. **longest word-bounded match**, so `3 - Medium (UI)` still lands on `Minor`.

Longest-first matters: `not a bug` must beat `bug`, `biz-uat` must beat `uat`.

### Word-bounded, not `includes`

Pass 4 uses `wordMatch()`, which requires a non-alphanumeric character (or the
end of the string) on both sides of the key. **Never replace it with
`includes()`.** That is what shipped first, and a real board broke it: the key
`it` matched inside "microsites", so every item under an area path named
"…Investment Mall and microsites" was labelled IT-UAT. `monitoring`, `credit`,
`editor` and `digital` all matched the same key. A two-letter key is a substring
of an enormous number of ordinary words.

`\b` is not used because the keys themselves contain punctuation — `biz-uat`,
`cug(stage)`, `not a bug` — and `\b` around those is hard to predict.

`kindOf()` has the same shape of bug in its history: `tags.includes("cr")` made
anything tagged **critical** a change request. The CR tag is now matched
exactly (`n === "cr"`), with `wordMatch` for the spelled-out forms.

**Environment falls back** to tags, then to the area path, because most boards
have no environment field and teams record it in one of those instead.

### Growing the table

A new board's vocabulary goes in `src/lib/value-map.ts` (shipped defaults, all
lowercase keys) if it is common, or in that POD's own `valueMap` in Admin if it
is not. Unrecognised values become `Unknown` — **never guess at which real value
was meant.** `docs/changing-the-data.md` has the walkthrough.

### Closing an item

Only `Microsoft.VSTS.Common.ClosedDate` closes an item. `ResolvedDate` is set
while an item still waits on QA — treating it as closed overstates the closure
trend. `isActive` is `!TERMINAL_STATUSES.includes(status) && !closedDate`: a
close date is decisive and beats whatever the status text says.

## Keeping data live — three paths, all wired

| Path | Trigger | Notes |
|---|---|---|
| Poller | `startPoller()`, armed by the first `/api/metrics` request | `SYNC_POLL_SECONDS`, `0` disables. Guarded against overlapping runs and stashed on `globalThis` so dev reload cannot start a second timer. |
| Webhook | Azure Service Hook → `/api/webhooks/azure?token=…` | Instant. Needs a public URL. |
| Manual | Sync button, or Admin → Sync / Full resync | |

The poller lives in `src/lib/poller.ts`, **not** `instrumentation.ts` — Next
bundles instrumentation for a runtime that cannot resolve `node:https`, which
breaks the OpenSearch client in dev.

### Webhook routing

The payload shape differs per event (`resource.id` vs `resource.workItemId`,
`resource.fields` vs `resource.revision.fields`), so only the id and area path
are read from it; the canonical item is re-fetched over REST.

`teamForAreaPath()` matches the longest area-path prefix, so a nested POD beats
its parent, and falls back to the only team when there is exactly one.

Deleted events remove the document by its deterministic id.

## Spreadsheet import

`exceljs`, first worksheet, row 1 is the header. `mapHeaders()` matches headers
against `COLUMN_ALIASES` case-insensitively after collapsing `_ - .` to spaces.
A `Title` column is required; anything else is optional.

- Hyperlink cells expose the URL at `cell.value.hyperlink`, separate from the
  display text.
- Date columns keep the `Date` object when Excel typed the cell as one;
  everything else is read as `cell.text`.
- Rows without a title are counted as `skipped`, not failed.
- Unknown headers are returned as `ignoredHeaders` and shown to the user.

### Apple Numbers

`.numbers` files are read by `src/lib/numbers.ts` — hand-written, because there
is no maintained JS library and Apple publishes no schema. The format is a zip
of IWA archives: Snappy-framed chunks of length-delimited protobuf messages.
`numbers/` holds the four layers (`zip`, `snappy`, `protobuf`, `cells`).

Two rules, both learned the hard way:

- **Resolve references by what they point at, never by field number.** Apple
  renumbers fields between versions. Filter the candidate ids by the *type* of
  object they resolve to:
  ```ts
  const tiles = pairs.filter((pair) => byId.get(pair.id)?.type === TILE)
  ```
- **Content decides the format; the filename is only a hint.** `spreadsheet.ts`
  sniffs the zip's entry names to tell a Numbers bundle from an xlsx, and scans
  **both ends** of the archive — Numbers writes its central directory at the
  tail, so a head-only scan misses every entry name.
