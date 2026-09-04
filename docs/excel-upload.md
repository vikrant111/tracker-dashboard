# Uploading a spreadsheet

**Admins only.** A row overwrites whatever item shares its id, so an upload is a
bulk edit of the board a whole POD is measured by. Members do not see the
control, and `/api/upload` answers 403 to them — on their own POD too. See
[auth-and-tenancy.md](auth-and-tenancy.md#uploading-is-an-admins-right-on-their-own-pod-too).
Downloading is unaffected.

From **Upload** in the top bar. `.xlsx`, `.xlsm`, `.csv` or `.numbers`, up to
20 MB — the old binary `.xls` is not supported, so resave it as `.xlsx` first.
The **first sheet with a Title column** is read, and its **first row** is the
header.

Every column is matched by **name, not position** — reorder them freely, and
leave out any you do not have. Columns the importer does not recognise are
ignored rather than rejected, so exporting straight from Azure Boards or Jira and
uploading the file unedited works.

## The one column you cannot leave out

**Title.** It is the only field with no sensible default, and a board full of
"(untitled)" is worse than a shorter import.

- **No title column at all** → the whole file is rejected, and the error lists
  the headers it actually read, so you can see what it saw.
- **A row with an empty title** → that row is skipped and counted as skipped.

Everything else has a fallback. An upload with nothing but a `Title` column
works — you get items with unknown severity, unknown environment and today's
date, which is honest about what you gave it.

## Every column it reads

Header matching is case-insensitive and ignores `_`, `-`, `.` and extra spaces,
so `Work_Item_ID`, `work item id` and `Work Item ID` are the same column.

| Field | Accepted headers | Falls back to |
|---|---|---|
| Id | `ID`, `Work Item ID`, `WorkItemID`, `Bug ID`, `Ticket ID`, `Key` | the row number |
| **Title** | `Title`, `Summary`, `Subject`, `Name` | — *row is skipped* |
| Link | `URL`, `Link`, `Work Item URL`, `Browse URL` | `#<id>`, which is not clickable |
| Assignee | `Assignee`, `Assigned To`, `Owner`, `Developer` | `Unassigned` |
| Assignee email | `Assignee Email`, `Email`, `Assigned To Email` | blank |
| Severity | `Severity`, `Sev`, `Criticality` | `Unknown` |
| Environment | `Environment`, `Env`, `Raised In`, `Found In` | tags, then `Unknown` |
| Status | `Status`, `State`, `Bug Status` | `Unknown` |
| Type | `Type`, `Work Item Type`, `Issue Type` | `Bug` |
| Priority | `Priority`, `Prio` | empty |
| Tags | `Tags`, `Labels` | none |
| Created | `Created Date`, `Created`, `Created On`, `Raised On`, `Reported Date` | **today** |
| Closed | `Closed Date`, `Closed`, `Resolved Date`, `Closed On` | empty — treated as open |

### Id, and re-uploading

Rows are stored as `<pod>:xlsx:<id>`. **Upload the same file twice and you get
one set of items, not two** — the ids collide and the second upload updates the
first. That is what makes a weekly export workable.

The corollary: if your sheet has **no id column**, the fallback is the row
number, so adding a row at the top shifts every id below it and the next upload
duplicates the lot. Include an id column if you plan to upload more than once.

### Dates

Real Excel dates work, and so does anything JavaScript can parse:
`2026-08-22`, `22 Aug 2026`, `2026-08-22T14:30:00Z`. An unparseable date is
treated as absent rather than as an error — a created date falls back to today,
a closed date to empty.

**Ageing is computed from the created date**, so a sheet without one shows every
item as raised today and the ageing chart will be empty. It is the column worth
adding if you only add one.

### Open or closed

An item is **closed** when it has a closed date, or its status maps to `Closed`
or `Not a Bug`. A closed date wins over the status text — a row marked "In
Progress" with a closed date is closed.

## How values are matched

Severity, environment and status are matched against this vocabulary. Anything
unrecognised becomes `Unknown` rather than being invented into a category.

| | Values | Recognised from |
|---|---|---|
| Severity | `Critical`, `Major`, `Minor`, `Unknown` | `1 - Critical`, `Blocker`, `High`, `Medium`, `Low`, `2 - High`… |
| Environment | `IT-UAT`, `BIZ-UAT`, `CUG`, `Production`, `Unknown` | `ituat`, `uat`, `biz`, `stage`, `staging`, `prod`, `live`… |
| Status | `Open`, `Commented`, `For QA Validation`, `Not a Bug`, `Closed`, `Unknown` | your board's own state names |

Matching runs in three passes: an exact match on your POD's own overrides, then
on the shipped table above, then a **whole-word** pass with the longest key
first — so `3 - Medium (UI)` lands on `Minor`, `Deployed to Prod` on
`Production`, and `Not a Bug` beats `Bug`.

Whole-word means a key only matches when it stands alone: `uat` matches
`BIZ-UAT` but not `evaluate`. Without that, the two-letter key `it` matched
inside a board's "microsites" and labelled the lot IT-UAT.

If your board uses words none of these cover, add them under **Value mapping**
on the POD in Admin rather than editing the spreadsheet. Those overrides win over
everything above.

### Environment when you have no column for it

Most boards do not have an environment field. The importer falls back to the
**tags** column before giving up, so `prod` or `biz-uat` in `Tags` is enough. In
an Azure sync it also falls back to the area path.

### Bug, ticket or CR

Not a column — it is derived, so the `Everything / Bugs / Tickets / CRs` filter
works without you maintaining another field:

- **Bug** — the type contains `bug` or `defect`
- **CR** — the type contains `change request`, or any tag contains `cr`
- **Ticket** — everything else

## A minimal sheet

| Work Item ID | Title | Assignee | Severity | Environment | Status | Created Date | Closed Date |
|---|---|---|---|---|---|---|---|
| 10432 | Statement PDF fails to download | Ananya Rao | 1 - Critical | prod | Open | 2026-08-01 | |
| 10433 | Nominee name truncated at 20 chars | Kabir Menon | 3 - Medium | biz-uat | For QA Validation | 2026-08-14 | |
| 10429 | Duplicate SIP mandate on retry | Priya Nair | 2 - High | ituat | Closed | 2026-07-22 | 2026-08-11 |

That sheet gives you one critical production item aged since 1 August, one
`Minor` in BIZ-UAT awaiting QA, and one closed item that lands in the closure
trend on 11 August.

## What it tells you afterwards

The upload reports rows **imported** and rows **skipped**. Skipped means no
title. Because rows sharing an id collapse into one document, the imported count
is documents written, not lines in your file — a sheet with a duplicated id
reports fewer than you sent, and that is the truth about what is on the board.

## Which POD it lands in

The POD selected in the top bar when you upload. There is no column for it —
uploading a mixed sheet and expecting it to split across PODs will put
everything in one. Upload once per POD.

## Downloading a report

**Report** in the top bar writes the current view as `.xlsx` — and writes it in
**exactly the format described above**, so you can edit the file and upload it
straight back with nothing lost and nothing mis-mapped.

That is not a coincidence, it is enforced: export and import share one column
definition (`EXPORT_COLUMNS` in `lib/normalize.ts`), and a check asserts every
exported header maps back through `mapHeaders` to the field it came from. Adding
a column the importer does not know about fails the suite.

The sheet it writes:

| Work Item ID | Title | Type | Assignee | Assignee Email | Severity | Environment | Status | Priority | Tags | Created Date | Closed Date | URL |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

- **Same filters as the screen.** POD, kind, severity, environment, status,
  assignee, search, ageing window — whatever the board is showing is what you
  get. A download that ignored the filters would be a different dataset wearing
  the same name.
- **Dates are written as dates**, not as locale strings, so editing the file in
  Excel and uploading it back does not turn `2026-08-01` into something
  ambiguous.
- **Tags join on semicolons**, because the parser splits on `;` or `,` and a
  comma inside a CSV cell is the one separator that will not survive.
- Blank means blank. An item with no closed date gets an empty cell, not the
  word `null` — which would re-import as an unparseable date.
- The header row is frozen and filterable, and the filename carries the POD and
  the date: `pod-tracker-amc-pod-2026-08-22.xlsx`.

Capped at 20,000 rows per download. The whole sheet is built in memory before a
byte is sent, so the cap is a real limit rather than a formality.

### Round trip

The obvious use is the one that works: **download, edit, upload**. Because rows
are matched on `Work Item ID`, re-uploading updates the same items rather than
duplicating them — so you can correct severities in Excel and push them back.

The one thing to know: the export carries `Work Item ID`, not the internal
document id. Re-uploading a report exported from an **Azure-synced** POD creates
Excel-sourced copies alongside the synced ones, because the two sources use
different id prefixes. Round-tripping is for spreadsheet-sourced PODs; for an
Azure POD, fix the data in Azure and sync.

## You do not need Excel

Nothing here requires Microsoft Excel, and nothing depends on how a file is
named. **The uploader reads the bytes**, so a CSV works whether it arrives as
`.csv`, `.txt`, `.tsv` or with no extension at all — and a real `.xlsx` is read
as one even if somebody renamed it.

Three formats upload directly: **`.xlsx`**, **`.csv`**, and **`.numbers`**.

### Numbers files upload as they are

On a Mac, Numbers is usually the only spreadsheet app installed, so a `.numbers`
file is read directly — no export step. Drag it in and it imports through the
same column mapping as everything else.

What it reads: text, numbers, dates and the results of formulas, across a table
of any size. What it does not: a password-protected file, and a file written by
a version of Numbers whose internal layout this does not recognise. Both come
back asking you to export CSV, because a **wrong** value imported silently would
be far worse than a file politely refused — so anything it cannot read with
confidence it declines rather than guesses at.

If your file has several tables, the one with a `Title` column is used, the same
rule as a workbook with several tabs.

### Exporting from what you actually have

| App | How |
|---|---|
| **Numbers** (macOS) | Upload the `.numbers` file directly, or File → Export To → CSV |
| **Google Sheets** | File → Download → Comma-separated values |
| **LibreOffice Calc** | File → Save a Copy → Text CSV |
| **Excel** | File → Save As → CSV, or just upload the `.xlsx` |

If you upload something that cannot be read, the message names the format and
the way out — *"board.ods is an OpenDocument sheet. In LibreOffice choose File →
Save a Copy → CSV, then upload that."* — rather than a flat "could not read it".

Two formats are still recognised and refused with instructions rather than a
shrug:

- `.ods` — OpenDocument, from LibreOffice.
- The old binary `.xls` — a different file format entirely from `.xlsx`,
  and not one exceljs can read.

### Downloading without Excel

**Download as CSV** in the *For you* menu writes the same columns as the `.xlsx`
report. It opens in anything, and it re-uploads through exactly the same column
mapping — so the download → edit → upload round trip works with no Microsoft
software anywhere in it.

### If a sheet will not open

**"…contained no readable sheets."** The file is a valid `.xlsx` container but
this reader found nothing inside it. Some apps write `.xlsx` files structured in
a way exceljs cannot open, even though Excel itself reads them fine. **Export as
CSV instead**; that path has no such problem.

**"…could not be read as a Numbers file."** The bundle opened but held no table
this reader recognises — an older or newer Numbers layout, or a protected file.
**File → Export To → CSV** and upload that.

**"No Title column found in any of the N sheets."** The message lists every tab
and what was on its first row, so you can see whether the headers are wrong or
whether your header row simply is not row 1. Move it to row 1.

### Which tab it reads

**The first tab with a Title column** — not simply the first tab. A "Notes" or
"Instructions" sheet in front of your data no longer breaks the upload, and the
response tells you which sheet it used.
