# DevOps status and records

A second board on the same shell. The POD board answers "how much is
outstanding"; this one answers "can I push right now, and what went out".

Reach it from the **PODs / DevOps** switch, which is on both boards. Each board
links to its **own** admin: the DevOps board to `/admin/devops`, the POD board to
`/admin`. The two admin screens link to each other.

Both tables page **seven rows at a time**; the pager only appears once there is
more than one page.

## Who sees what

| | member | admin |
|---|---|---|
| See repositories and freeze status | yes | yes |
| Read announcements | yes | yes |
| Onboard or remove a repository | no | yes |
| Freeze or unfreeze a branch | no | yes |
| Post or delete an announcement | no | yes |

`DEVOPS_ACCESS=admins` hides the board from members entirely. It defaults to
`members`, because seeing whether develop is frozen before pushing to it is the
job the board exists for.

## Onboarding a repository

**Admin → DevOps admin** (`/admin/devops`) — its own screen, because onboarding
a repository and onboarding a POD are different jobs done by different people at
different times. Paste the GitHub address; owner and repo are read from
it and shown back before you save, so you can see the right repository was
understood. Accepted: the browser URL, the clone URL, `.git`, an SSH remote, a
deep link, `owner/repo`, and an enterprise host.

**A repository can belong to several PODs.** One repo is routinely worked on by
more than one team, and a single owner made somebody pick one and be wrong about
the rest. Every POD picked sees the repo as theirs on the report. A repository
onboarded before this was a list keeps the POD it already had.

The id is `owner-repo`, slugged. Onboarding the same repository twice updates one
row rather than leaving two, each with its own freeze state and no way to tell
which is telling the truth.

**The token is write-only.** It is stored, never sent back, and the form shows
`••••••••` when one is set. Sending that mask back means "keep the stored one".
Blank falls back to `GITHUB_TOKEN`. Same rule as the Azure PAT on a POD.

## Freezing a branch

**Dry run is the default.** Nothing reaches GitHub until `GITHUB_MODE=live`. In
dry run the board records the freeze, reports the exact requests it would have
sent, and changes nothing — so deploying this cannot lock a branch by accident.

The control shows the requests before you agree to them, and freezing needs a
reason, because everyone blocked by it will read that reason and nothing else.
Unfreezing asks for nothing: being blocked needs explaining, being unblocked
does not.

Three mechanisms, per repo, because organisations differ on what they allow:

| `freezeMethod` | what it sends |
|---|---|
| `ruleset` | `POST /repos/{o}/{r}/rulesets` — refuses `update`, `deletion` and `creation` on the branch, with **no bypass actors**. Unfreezing deletes it. |
| `protection` | `PUT …/branches/{b}/protection` with `lock_branch: true`. Unfreezing removes protection. |
| `record` | nothing. The board notes the freeze; the branch is untouched. |

`bypass_actors` is empty on purpose. A freeze that repository admins can push
through is not a freeze, and admins are exactly the people most likely to push
anyway.

Unfreezing deletes the ruleset **this app created**, by the id recorded when it
was made. With no id recorded — a row that predates the feature — it looks the
ruleset up by name first rather than deleting by guess, which would remove
somebody else's rules.

**A refusal is recorded as `failed`, not as the change.** If GitHub says no, the
branch is in whatever state it was already in, and the board says so with
GitHub's reason attached.

### What has and has not been verified

The request shapes are checked exhaustively — paths, bodies, escaping, the
required nulls that a classic-protection call needs to avoid a 422. Those checks
run against the real functions.

**No call has been made against a real repository.** There is no token and no
test repo here, which is exactly why live mode is opt-in. Before switching it on,
freeze something disposable first and read the plan the control shows you.

## Who can change what

Three rights, kept apart on purpose:

| | who |
|---|---|
| Read the board | everyone signed in |
| **Add** a scope row | everyone — the person who shipped a change knows what it was, and a sheet only some people can fill is a sheet nobody fills |
| **Change** a saved row, or correct a PR record | admins, plus people an admin has made a **DevOps editor** |
| Freeze scope, remove rows, sync PRs, clear a period | admins |

Recording a **sign-off** is deliberately not gated: that is somebody putting
their own name to something, which carries its own accountability.

Grant it in **Admin → DevOps admin → Who can edit records**. Admins always
count, so it is never granted to them, and the capability is read from the
stored account on each request — granting or revoking takes effect immediately
rather than at the person's next sign-in. An unrelated edit, like a rename or a
password reset, leaves it alone.

## Deployment cycles and the scope sheet

A **cycle** is one release going out of one repository — `2026.09`, `Sprint 42`.
Admins create them in **Admin → Deployment cycles**.

The **scope sheet** belongs to a cycle, not to the repository. "What is in
2026.09" is a different list from "what is in 2026.10", and agreeing one must
not close the other.

**Members fill the sheet in.** They are the people who know what their change is
and which branch it is sitting on, and a sheet only an admin can write is a sheet
nobody fills. Only the **title** is required; everything else defaults, because a
half-filled row that exists beats a complete row nobody bothered to add.

| column | why |
|---|---|
| POD | which team the row is for. Offered only when the repo is linked to more than one; with a single POD it is filled in, and a POD the repo does not have is refused |
| Ticket | the work item id, when there is one — this is what links the row to the bug |
| Branch, Environment | which bug is residing where, the question the board exists for |
| State | planned → deployed → verified, or rolled-back |
| Deployed on | `YYYY-MM-DD`, so a day, a month and a year are the same filter |

### The live join

The sheet's last two columns — **Bug severity now** and **Bug status now** — are
read from the tracker at the moment you look or download, not copied when the
form was filled. As people update bugs on the POD board, this sheet follows.
That is why the row stores a work item id rather than a snapshot.

A ticket the tracker does not know leaves those columns blank rather than
inventing a status for something that may not be a work item at all.

### Freezing the scope

An admin freezes a cycle's scope when it is agreed. Frozen means **no rows added,
edited or removed** — for everyone, the admin who froze it included. An exception
for one person would make "agreed" mean nothing.

It refuses deletes too. Scope that could still be emptied one row at a time
would not be frozen.

Renaming a cycle cannot reopen it. Only the scope route may write that flag.

Freezing the *branch* and freezing the *scope* are separate on purpose: the
branch is usually frozen **so that** the sheet gets finished.

### Reading and editing a row

**Every row expands.** Open one to see everything on it — POD, ticket, branch,
environment, state, the PR, the notes — rather than squeezing it into columns.

Inside, an **Edit** button turns the row into fields, for admins and DevOps
editors. Everyone else sees "Read only" with a tooltip naming who can grant it,
rather than a missing button and no explanation. A frozen cycle refuses editing
for everyone, editors included.

Both sections carry a **filter** and page **seven rows at a time**
(`DEVOPS_PAGE_SIZE`). The filter matches every word you type across every field,
so "813 production" means both.

Beside the filter sits the number of **PODs registered on the repository**.
Pressing it opens a dialog listing them as chips. A count rather than the names
inline: five chips wrapped the controls onto a second line for a fact most
readers only want the shape of. `pods-modal` is a native `<dialog>` opened with
`showModal()`, which brings the focus trap, Escape, the backdrop and the
inertness of the page behind it — four things worth not reimplementing, and
three of them the kind that get reimplemented slightly wrong.

### Downloading

`.xlsx` or `.csv`, honouring **every** filter the board has — repository, cycle,
period, sign-off state, and the words in the filter box. What you are looking at
is what you get, including the POD, the notes and the date the row was filed.

The filtering is not re-implemented in the export routes. `matchesQuery`,
`scopeRowFields`, `pullRowFields` and `matchesSignoff` are the same pure
functions the panels call, over the same resolved names — otherwise a filter
that found eleven rows on screen quietly writes nine into the file.

**Anything the board shows is in the file.** A download exists to be read by
somebody who cannot open the board, so a column that only appears on screen is
a column that does not exist for them. `check:ui` refuses a column the row
builder does not fill, and the end-to-end suite reads the header of a real
download.

## Announcements

Per repo, about the release branch. Pinned first, then newest — somebody opening
the board mid-release wants the freeze notice at the top, not whatever was
posted last. Four kinds (release, freeze, hotfix, note) carried by an icon, so
they are recognisable in a list rather than only by colour.

An edit keeps the original byline.

## The sign-off report

One row per pull request that reached a release branch, with the columns asked
for: **Project | Repo | PR | Sign-off status | Merged date | Release branch |
Deployed on**, plus **Deployed to** and **Risk**.

The download carries more than the screen has room for: the **title**, who
opened it, the ticket, the cycle, and **who signed each level off and when**.
The prose status says what is missing; those three say who to go back to.

**Sync PRs** (admin) asks which **repository** and which **branch**, then reads
the merged pull requests on it. The branch is prefilled with the repo's release
branch, so the common case is one click — but teams cut from more than one, and
a report that could only ever read the release branch left the rest invisible. It is *not* gated by
`GITHUB_MODE`: that switch stops this app **changing** anything on GitHub, and
listing pull requests changes nothing. What gates it is the token.

Closed is not merged. GitHub has no "merged" filter, so a listing returns
abandoned PRs beside shipped ones and only `merged_at` tells them apart — an
abandoned PR on this report is a change somebody investigates that never
happened.

### What counts as a risk

**Merged, and missing business or QA sign-off.** Those two mean somebody outside
the change agreed it should ship. Risky rows sort to the top, are tinted, and
carry the words "merged without …" — three cues, because this is the row to
notice while scrolling past forty that are fine, and tint alone fails a
colourblind reader and a projector equally.

Two things deliberately do *not* count:

- **POD verification missing on its own.** It is worth showing and is a different
  problem; if it counted, every fresh PR would flag and the real ones would drown.
- **An open PR missing sign-offs.** That is a PR awaiting review, which is the
  normal state of things.

### Filtering by sign-off state

A select above the report narrows it to **Sign-off complete** or **Sign-off
incomplete**. Those are the two questions the report is actually read for —
"what is cleared to ship" and "what is still waiting on somebody" — rather than
something to work out by reading a column forty times.

Complete means **all three** levels are signed, the same definition the column
uses, so the filter and the words in the row can never disagree. It is one pure
function, `matchesSignoff`, which the download applies too — a filtered file
holds exactly the rows that were filtered on screen. An unrecognised value in
the URL widens to "all" rather than narrowing to nothing: a typo should show the
report, not an empty table that reads as "there is nothing here".

The panel's four filters live in `use-report-filters`, which also builds the
download URL. Every one of them returns the table to page one — narrowing a list
while sitting on page 4 leaves an empty table with rows behind it.

### Sign-offs, including after the merge

**A sign-off arriving after the merge is the normal case, not an exception.** A
PR goes in and business signs it off the next morning; nothing gates the tick on
the order things happened. Click the chip on the row whenever it comes through.

Any signed-in person may record one, and their name and the time are stored
against it — that name is the entire value of the record. Withdrawing **somebody
else's** sign-off is admin-only; you can always withdraw your own.

A re-sync never touches them. GitHub owns the facts about the pull request; the
sign-offs, the cycle and the deploy date are ours, and a sync that overwrote them
would erase the evidence the report exists to keep.

### Opening a row

Every row on the report expands. Inside are the four fields that are **ours**
rather than GitHub's, and so survive a sync:

| | |
|---|---|
| Deployed on | when it actually went out |
| Deployed to | which environment it reached — merged is not deployed, and UAT is not production |
| Ticket | when the PR title named the wrong one, or none |
| Cycle | which release it belongs to |
| POD | which team the change is for — offered only when the repo has more than one, and a POD the repo does not have is refused |

Everything else is read from GitHub each sync and editing it here would be a
change the next sync undoes.

### Moving a PR onto the scope sheet

Every row has a **To sheet** button that copies the change onto a scope sheet —
title, ticket, branch and environment come with it, so nobody retypes something
that is one click away and gets it subtly different.

**It goes onto the sheet of the cycle the pull request is assigned to, and no
other.** Open the row, set **Cycle**, and that is where the move lands. The
cycle is shown in the row itself, so "where would this go?" is answerable
without opening anything.

That is a change from the first version, which moved a PR to "the first cycle
whose scope is still open". Under that rule, correcting a pull request's cycle
changed nothing about where it ended up — which made the field look decorative
and put changes on the wrong release.

The server takes the cycle off the **stored record**, not off the request body.
A body naming a different cycle is refused with a sentence saying so rather
than obeyed, so an old tab cannot file something under the wrong release.
`cycleForPull` is the one function that answers "which sheet?", and it refuses a
cycle belonging to another repository — two repos can both have a `2026.09`.

The button is disabled for exactly one reason at a time, and the tooltip says
which:

| | |
|---|---|
| Not a DevOps editor | checked **first**, and before the pull request is even looked up — somebody without rights should not learn from the answer whether a given PR exists |
| No cycle set | there is no sheet to move it onto until somebody says which. The message says to set it, because the field is one click away |
| Scope frozen | *"This pull request can't be moved — the scope sheet for 2026.09 is frozen: …"*, quoting the reason. Worded around the pull request rather than the form, because that is what the reader is holding |
| Missing a sign-off | **all three**, not just business and QA. The sheet is the record of what shipped; an unverified change on it makes the record say something nobody agreed to |
| Already moved | it says "On the sheet" instead of offering a button that would refuse |

The refusal is one shared function, so the disabled button and the API give the
same answer for the same reason. A re-sync does not un-move it.

### And back off it again

A move is not final. An admin who finds something wrong with a change takes the
row off the sheet, and the pull request **returns to the sign-off report**
rather than disappearing — because the change is still on the release branch,
and somebody has to deal with it.

So removal asks for a reason first. The row that came from a pull request
carries a small box next to **Remove it?**, and the button stays disabled until
something is typed in it. That sentence is what the person who moved it reads,
on the report row and again in the drawer, with who took it off and when:

> ⤺ Back off the sheet: QA sign-off was for the wrong build

They then have exactly two ways out, and the remark is what tells them which:
fix what it says and move it again, or take the change out of the release
branch. Moving it again clears the remark — it described a problem that has
just been dealt with, and leaving it would have the report complaining about
something already fixed.

A row somebody typed into the sheet by hand is removed on one press, with no
box. There is nobody waiting to hear about it, and demanding a sentence to
delete a typo is friction with no reader.

The row remembers the pull request by **id**, not by URL: removing it has to
find that pull request again to hand it back, and matching on a URL somebody
may have edited is a link that quietly stops working.

A frozen sheet is answered before any of this. It refuses the removal outright,
so nobody types a reason for something that was never going to happen.

The rule is one shared function again (`lib/devops/return-to-report.ts`), so
the table and the API refuse for the same reason with the same sentence.

### Opening a row

**The whole row is the target**, on both tables. The chevron stays — it is what
*says* the row opens — but it was a small mark at the end of a very wide row and
everybody tried the row itself first. The affordance and the hit area are two
different problems.

The row is a real control, not a div with a click handler: it takes Tab, Enter
and Space, and reports `aria-expanded` so a screen reader knows it opens at all.
Space does not also scroll the page.

Controls inside the row keep their own clicks — links, sign-off chips, Remove,
and the box that asks why a row is coming off the sheet. Without that, pressing
Remove would also expand the row, and every space typed into the remark box
would toggle it.

One shared helper (`components/devops/expandable-row.ts`), because a row that
expands on one table and not the other is worse than neither doing it.

#### How it opens

The drawer animates its **height**, through `row-drawer`. The first version
appeared at full size in one frame while a `motion.div` faded and slid four
pixels — so the table jumped under the cursor and the animation played *after*
the jolt it was supposed to soften.

A height is not known until it renders, so framer-motion measures it:
`height: 0 → "auto"`, with `overflow: hidden` so a partial height shows a
partial drawer. It is already a dependency and already measures heights for the
rest of this board, so this costs no bundle.

**It was CSS first, and that was wrong.** `grid-template-rows: 0fr → 1fr` is the
one way to interpolate to an unknown height without JavaScript, and it needs no
measurement — but it needs Chrome 107, Firefox 127 or Safari 17.4, and the
reduced-motion block at the foot of `globals.css` zeroes `animation-duration` on
`*` with `!important`. On an older browser, or on any machine with the setting
on, the drawer simply did not animate: not degraded, nothing, and nothing said
so. The framer version honours the same preference explicitly, through
`useReducedMotion`, rather than by having its duration taken away.

Under `prefers-reduced-motion` it **fades rather than freezes** — opacity kept,
height dropped. That is the house rule everywhere on this board (see
`ui/menu.tsx`). Removing the animation outright leaves the drawer appearing in
one frame, which is the jolt this exists to remove, handed to the people least
likely to want it.

The chevron stays a plain CSS `transition` — universally supported — and shares
the drawer's easing so the two read as one gesture. Both durations and the one
curve (in the two spellings CSS and framer each want) are `DEVOPS_MOTION` in the
constants file.

> If the drawer ever appears not to animate, **check the bundle before the
> code**. That has happened once and the cause was a `.next` that was missing
> the route's chunk entirely, not the animation. A temporary badge printing
> `useReducedMotion()`, the raw media query and a build marker settled it in one
> reload, after two wrong theories had been chased on evidence gathered from a
> stale bundle. See [troubleshooting.md](troubleshooting.md#runtime).

Opening only. The row unmounts the instant it is closed, deliberately: a drawer
that lingers on the way out keeps stale fields on screen while the reader has
moved on, and it stops the table settling. The two detail components carry no
motion of their own any more — sliding the contents inside a height animation
read as two things moving at once.

There is no `AnimatePresence` on either table body, and `check:ui` refuses one.
The detail row is a plain `<tr>`, and a non-motion child inside presence
tracking is watched for an exit it can never finish — which held the old row set
and made expanding do nothing at all. CSS needs no presence tracking.

### Why "already moved" is not a stored flag

It was one, and it drifted. A row moved onto a sheet by a build that did not
yet write the link back could be removed, and the pull request was then marked
as moved with **no row anywhere** — off the sign-off report, absent from every
scope sheet, and invisible on every screen. The change was still on the release
branch and nothing in the app said so.

So the flag is no longer believed on its own. Whether a pull request is on a
sheet is a **join**: does a scope row point at it? The report recomputes that on
every read (`lib/devops/scope-link.ts`), which means a board in that broken
state repairs itself the moment somebody opens it. No migration to run.

The row points back by **id**. A row written before the id existed is matched on
its `prUrl` instead, and reading the sheet fills the id in and stores it — done
once, on a read that was happening anyway. Two spellings of one GitHub URL (a
trailing slash, `/files`, an anchor, http against https) count as the same pull
request.

Where a row carries both, **the id wins**. The URL is a field somebody can edit,
and if editing it could redirect where the row goes back to, a removal would
hand back the wrong change. A `prUrl` that matches nothing on the report is left
alone: somebody typed it into the form by hand, and that is not a move.

## Tracking and clearing by date

Every date on this board is stored as `YYYY-MM-DD`, which makes a year, a month
and a day the same filter — a string prefix. No date arithmetic, no timezone.

The date picker takes three routes in, because people arrive knowing different
amounts: **type it** (`2026`, `2026-09`, `sep 2026`, `04/09/2026`), **click it**
on a month grid, or **pick a month that has data**. Days holding rows carry a
dot, which is what stops somebody selecting an empty date and concluding the
data was lost.

### A range of days

`range-fields` puts **From** and **To** above the grid. Click a day to fill
whichever is active; filling From moves to To and commits nothing, because a
range with one end is not a range. Filling To completes it and closes. Press
either field to go back and re-pick that end without starting over — a two-click
gesture with no state on screen leaves somebody who clicked once with no way to
tell what the calendar is waiting for.

The calendar **lights every day in the selection**, and previews the range under
the cursor while it is half-made. Whether a day is lit is `inPeriod` — the same
function that decides which rows the filter keeps — so picking a whole month
lights the whole month, and the calendar can never show something the table
disagrees with. The two ends carry the strong fill; the days between get a flat
tint, so a range reads as one bar rather than thirty separate selections.

A range is stored and sent as `2026-09-01..2026-09-30`. `..` rather than a dash,
because every date here already contains dashes and `2026-09-01-2026-09-30`
cannot be split without guessing where the middle is. Typed, it also accepts
`01/09/2026 to 30/09/2026`.

Both ends are **days**. A range of months would be two spellings of one filter —
`2026-09..2026-10` is `2026-09-01..2026-10-31` — and two spellings is how a
screen and a download start disagreeing, so it is refused rather than guessed at.
A **backwards** range is swapped, not refused: clicking the 30th then the 1st
says what it means, and answering that with nothing reads as "there is no data".

`cleanPeriod` still means strictly a prefix. Ranges go through `cleanSpan`,
which accepts either — widening `cleanPeriod` would have quietly widened
`grainOf` and everything built on it.

The month and year names above the grid still select that whole month or year in
one click. A range is for "the 3rd to the 17th", not for a period that already
has a name.

### Guards on the calendar

The month on screen is derived from a value that arrives in a **URL**, so
"somebody typed nonsense into the address bar" is a normal input here, not an
attack. `use-period-selection` holds the rules and clamps every one of them;
`period-picker` is only the popover around it.

Four things were wrong, and three of them were silent:

- **`monthGrid` threw.** A `NaN` year reached `Array(lead)` as `Array(NaN)` and
  raised `RangeError: Invalid array length`. That is not an empty calendar — it
  is the whole panel gone, and `Number("")` was one bad link away. It now
  returns an empty grid: visible, and not a crash.
- **A month outside `0..11` built `2026-100-01`** from the raw number and handed
  it out as a date. The month is normalised through `Date`, which rolls 12 into
  January of the next year, and the cells are built from what came back rather
  than from what was asked for.
- **Stepping had no bound.** Held down, an arrow key walked the year into the
  range where `Date` gives up. Navigation is clamped to `MIN_YEAR..MAX_YEAR`.
- **Periods were unbounded.** They are capped at `MAX_PERIOD_CHARS` **before**
  the trim, not after — the point is to not walk a megabyte of somebody else's
  text at all, and `String(value).trim()` has already walked it by the time a
  later check could refuse it.

And one that was not about the calendar at all: the scope sheet filtered dates
with a raw `startsWith` rather than `inPeriod`. That was wrong twice —
`on=2026-0` matched `2026-09-15`, because a prefix has to end on a boundary and
`startsWith` does not know that, and a range matched nothing at all, so a
filtered download came back empty with no explanation. Both tables ask the
shared rule now.

Completing a range can never reach `onChange("")` either: an unparseable span
falls back to the single day, because silently clearing the filter is the one
thing somebody finishing a range cannot have meant.

### Clearing a period

**Admin → the DevOps board → Clear a period.** Irreversible, and there is no
backup anywhere in this app, so:

- **Counting and deleting are separate handlers.** Asking how much there is must
  never be the thing that removes it.
- You see the exact count per collection, choose which kinds to clear, and
  confirm twice.
- **An empty period matches nothing**, not everything. A missing parameter must
  not become "delete the lot".
- **A request naming no targets clears nothing.** Defaulting to everything would
  turn a malformed request into the most destructive one available.
- The period is parsed strictly: `2026-9` is refused rather than becoming
  `2026`, which is the difference between clearing September and clearing a year.
- **A range clears too**, since the picker is the same control. The same rules
  hold: a half-written range (`2026-09-01..`) matches nothing rather than
  falling through to a wider reading of the text, and the count is still shown
  before anything goes. A range is a bigger blast radius than a day, so read the
  count — that is what it is there for.

## Environment

**Everything this board reads from the environment lives in
`.env.devopsdashboard`**, at the repository root — not in `.env.local`, which is
the POD board's. One file to open when something is misconfigured, and one place
every token for this board goes.

| | |
|---|---|
| `DEVOPS_ACCESS` | `members` (default) or `admins` |
| `GITHUB_MODE` | `dry-run` (default) or `live`. Anything else, including a typo, is a dry run |
| `GITHUB_TOKEN` | fallback token when a repo has none |
| `GITHUB_API_URL` | for GitHub Enterprise; defaults to `https://api.github.com` |
| `DEVOPS_SYNC_PAGES` | pages of 100 merged PRs one sync reads. Default 5 |
| `DEVOPS_PAGE_SIZE` | rows a section shows before it pages. Default 7 |
| `DB_DRIVER` | `json` (default) or `mongodb`. Shared with the POD board |

A token needs **admin** on the repository to change branch rules.

`.env.devopsdashboard` **is committed** — it carries the shape and the safe
defaults so a clone runs. Put a real `GITHUB_TOKEN` in
`.env.devopsdashboard.local` beside it, which is git-ignored. Values already set
on the process always win over both, so a container's own environment overrides
anything in the repository.

Next only loads `.env` and `.env.local`, so `src/lib/devops/config.ts` loads this
one itself, once per process. It does that rather than `next.config.ts` because
`output: "standalone"` never executes the config file.

### Where a setting lives

| | |
|---|---|
| `.env.devopsdashboard` | anything that differs between deployments, or must never be committed: tokens, the API host, whether freezes are real |
| `src/lib/devops/constants.ts` | product decisions identical everywhere: page size, how long a row takes to open, the exact wording of a refusal |

`constants.ts` is pure and client-safe — it is imported by browser components,
so it never touches `node:fs`, a store or `process.env`. `config.ts` is the only
module on this board that reads the environment, and it is server-only. Nothing
else hardcodes a host, a default or a refusal.

### Switching to MongoDB

One value: `DB_DRIVER=mongodb`, with `MONGODB_URI` in `.env.local`. Every part
of this board goes through the same `Store` interface — repos, cycles, scope
rows, pull requests, announcements — so nothing here knows what a JSON file is,
including `pnpm delete`. Every number is computed from the same code on both
drivers, so nothing on the board can change shape when you move.
