# Operations

## Environment

`.env.local` (generated from `.env.example`, gitignored).

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | required in production |
| `MONGODB_DB` | `pod_tracker` | Atlas strings usually omit the database |
| `MONGODB_COLLECTION_PREFIX` | `tracker` | lets several environments share a cluster |
| `AUTH_MODE` | `password` | `off` \| `password` \| `entra` \| `both` |
| `AUTH_SECRET` | — | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` | needed behind a proxy |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@example.com` / `changeme` | used by `pnpm seed` |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` | — | SSO |
| `AZDO_ORG_URL` / `AZDO_PROJECT` / `AZDO_PAT` | — | fallback when a POD sets none |
| `SYNC_POLL_SECONDS` | `120` | `0` disables the poller |
| `AZDO_WEBHOOK_TOKEN` | — | unset rejects every webhook call |
| `WEATHER_LAT` / `WEATHER_LON` | blank | optional; blank means no weather at all |

**The DevOps board has its own file**, `.env.devopsdashboard`, holding every
setting and token it reads — `DEVOPS_ACCESS`, `GITHUB_MODE`, `GITHUB_TOKEN`,
`GITHUB_API_URL`, `DEVOPS_SYNC_PAGES`, `DEVOPS_PAGE_SIZE`. One file to open when
that board is misconfigured, and one place its secrets go. See
[devops.md](devops.md#environment). It is loaded by `src/lib/devops/config.ts`,
because Next reads only `.env` and `.env.local`.

### Weather is opt-in

The greeting sky follows the clock on its own. Set both `WEATHER_LAT` and
`WEATHER_LON` and it also follows the real weather, via
[Open-Meteo](https://open-meteo.com) — free, no API key, no account, one request
per 15 minutes.

Leave either blank and **nothing is fetched**. That is the shipped default, and
it is deliberate: the alternative is a dashboard drawing rain it invented, which
is the one thing this project must not do. Every failure — unset, blank,
unparseable, out of range, provider down, timeout, bad payload — degrades to no
weather rather than to a guess.

Set it to where the POD actually sits, e.g. Pune:

```bash
WEATHER_LAT=18.5204
WEATHER_LON=73.8567
```

Both are validated before they reach the URL (|lat| ≤ 90, |lon| ≤ 180), and the
values are never logged.

## Package manager

**pnpm**, pinned by the `packageManager` field in `package.json`. With Corepack
enabled (`corepack enable pnpm`) the right version is used automatically;
otherwise `brew install pnpm`.

`pnpm-lock.yaml` is committed and `package-lock.json` must not exist — two
lockfiles is two different dependency graphs. `pnpm check:docs` fails if any
document still tells someone to run `npm`.

pnpm passes arguments straight through — `pnpm seed --reset` — with no `--`
separator, unlike the other tool.

Install-time build scripts are refused unless listed in
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml), so a dependency cannot silently
execute code on install. `sharp` is declined there: it is Next's image
optimiser and this app renders no `<Image>`.

## Running

```bash
pnpm mongo:local   # a real MongoDB, nothing installed — or set MONGODB_URI
pnpm install
pnpm seed          # collections, indexes, admin + demo data
pnpm dev
```

Seed variants: `-- --no-demo` (indexes and admin only), `-- --reset` (drop the
collections first). The seeder uses a fixed PRNG seed, so demo data is identical
every run.

`pnpm seed` covers the **POD board only**. The DevOps board has its own,
`scripts/seed-devops.mjs`:

```bash
pnpm seed:devops              # four of each kind, per repo, per branch
pnpm seed:devops --reset      # clear the DevOps collections first
pnpm seed:devops --dry-run    # print what it would write
```

It fills the repositories **you have onboarded** rather than inventing its own,
so what you test is the flow against your real repos — and it refuses with an
explanation when there are none.

The four of each kind are not four copies. Each set walks the vocabulary that
decides what a screen does with the row, so every branch of the flow has
something to exercise it:

| | the four |
|---|---|
| scope rows | `planned`, `deployed`, `verified`, `rolled-back` |
| pull requests | all three sign-offs, missing POD, missing QA, none — the last two are the "risk" rows |
| announcements | `release`, `freeze`, `hotfix`, `note` |

Plus **two cycles per repo, one of them frozen**, so every refusal has something
to refuse; one pull request per branch left with **no cycle**, so "set a cycle
first" has a subject; and a planned row with no deploy date, because that is
what planned means. Dates spread across months, so the period picker, the
from/to range and the purge all have something to select.

Ids are derived rather than random, so running it twice updates the same rows
instead of leaving two of everything. It writes **through the store, not the
API** — deliberately, because the API refuses a row on a frozen cycle and a
frozen cycle is one of the things this exists to give you.

**Only ever run one dev server.** `pnpm predev` (`scripts/dev-guard.mjs`) runs
automatically and refuses to start a second one, because two `next dev`
processes share a build directory and neither notices. The second finds port
3000 taken, quietly moves to 3001, and then both write `.next` — each serving
pages whose chunks the other has just replaced. It surfaces as

```
ChunkLoadError: Loading chunk app/… failed
Invariant: Expected clientReferenceManifest to be defined
```

which reads as a framework bug, is not one, and sends people hunting in the
wrong place. It cost this project three debugging sessions. A build directory
of its own is safe and allowed through:
`NEXT_DIST_DIR=.next-alt pnpm dev`.

`pnpm check:env` reports what is missing before you run anything else. `pnpm
seed` fails fast with a sentence naming the real problem when it cannot reach
the cluster — a blocked port, an IP that is not on the Atlas allowlist, or a
password with an unencoded `@` in it.

### Clearing up

```bash
pnpm clear                  # node_modules, .next, .next-*, caches
pnpm clear --dry-run        # print what would go, remove nothing
pnpm clear --force          # clear even with a dev server running

pnpm delete pod-seed        # work items, PODs, their sync watermarks
pnpm delete devops-seed     # repos, cycles, scope rows, PRs, announcements
pnpm delete all             # both
```

`pnpm clear` (`scripts/clear.mjs`) removes only what is installed or generated —
`pnpm install` and `pnpm build` put all of it back. It never touches `DB_store/`
or any `.env` file. Every target is resolved and checked against the project
root before anything is deleted, and it uses Node's own `rm` rather than shelling
out, so it behaves the same on Windows.

**It refuses while a dev server is running.** `.next` and `node_modules` are
exactly what `next dev` is reading, and removing them does not stop it: it keeps
serving, and the next request fails with

```
Invariant: Expected clientReferenceManifest to be defined. This is a bug in Next.js.
```

which reads as a framework bug and is not one — it is a build directory that
vanished mid-flight. Stop the server, clear, then `pnpm install && pnpm dev`.
`--force` overrides; `--dry-run` lists without touching anything, so it is never
blocked. On a platform the check cannot inspect it warns instead of refusing.

If you hit that invariant: stop the dev server, `rm -rf .next`, start it again.
That alone fixes it — `.next` is rebuilt on the next request.

`pnpm delete` (`scripts/delete-seed.mjs`) removes seeded data, one board at a
time — split by board rather than by collection, because "clear the DevOps demo"
is one decision, not five. **Accounts are never touched**: deleting the admin is
how somebody locks themselves out of an instance they are setting up.

It is irreversible and there is no undo anywhere in this app, so it counts
first, prints what it found, and asks. `--dry-run` counts only; `--yes` skips
the question, and without a terminal to ask it **refuses** rather than assuming.
The aliases `pnpm delete:pod-seed` and `pnpm delete:devops-seed` do the same
thing for anything that cannot pass an argument.

Both go through the same store the app does, so they work on whichever driver
`DB_DRIVER` selects. The sync watermark is reset rather than deleted — the store
has no remove for it, and a blank one makes the next sync a first run, which is
exactly what a cleared board needs. `pnpm seed` puts the demo data back.

### Clearing by date, from the screen

`pnpm delete` clears a whole board. To clear **a period** — a year, a month, a
day, or a **from/to range** — use the screen instead:

| Board | Where | Clears |
|---|---|---|
| POD | **Dashboard → Clear work items** | work items, by the day they were raised |
| DevOps | **DevOps board → Clear a period** | scope rows, pull requests, announcements |

Both sit on the board itself, admin-only — not tucked into a separate admin
screen.

Both are the same component (`purge-panel`) — the POD side wraps it as
`pod-purge` to fix its targets and scope — with the same picker, the same
count-then-confirm flow and the same safety rules — one implementation rather
than two that drift. Each screen passes its own target group, so neither can
offer the other's data: a POD admin cannot delete release announcements from
the POD screen, and the DevOps board cannot touch work items.

The POD one has **its own POD picker** — "Every POD", or one of them — and the
choice is shown in the title. It deliberately does *not* follow the board's
filter: deleting is not filtering, and the scope of a delete has to be stated
rather than inherited from a control somebody set for a different reason and has
since forgotten about. "Every POD" is offered and says so, because a
clear-everything that looks like a clear-one is the worst version of this
control.

Changing the POD **drops the count and releases the arming**. A count belongs to
the scope it was taken for; showing one team's number above a button that
removes another's is the failure this panel exists to prevent.

The chips (`purge-chips`) name the date each collection is filtered on, because
"clear September" is ambiguous until somebody says September of *what* — a bug
raised in September and one deployed in September are different rows.

It reads and writes through the `Store`, so it clears JSON files or MongoDB
purely according to `DB_DRIVER`. Nothing in the purge knows which.

## Data at rest, on the JSON driver

**The browser cannot reach the store.** That is worth stating plainly, because
it is the first thing people assume: `DB_store/*.json` lives on the **server**,
is not under `public/`, and no client component imports `node:fs` or the store —
`pnpm check:ui` fails if one ever does. Devtools shows the client bundle and the
network, and neither contains the files. Verified: every path to them answers
404, and no value from `.env.local` appears anywhere in the built client bundle.

Changing data always means calling an API, and every mutating route is
authorised on the **server**. Deleting a `disabled` attribute in devtools
changes what the browser sends, never what the server accepts.

So the risks that are real are these two, and both are quiet:

**1. Git.** `DB_store/` is committed on purpose, so a clone runs with no
database — but that means anything in it is readable by everyone with
repository access, *including in the history*. `DB_store/users.json` already
carries bcrypt password hashes, and `repos.json` / `teams.json` grow access
tokens the moment a repository or POD is onboarded. Before real data goes in:

```bash
git rm --cached DB_store/*.json
echo 'DB_store/' >> .gitignore
export DB_STORE_DIR=/var/lib/pod-tracker      # outside the checkout
```

Rotate anything already committed. A hash in git is a hash somebody can attack
offline at their leisure, and removing the file does not remove the history.

**2. File permissions.** These files are written `0600`, and the directory
`0700` — the same protection an SSH key gets, for the same reason. The default
`0644` makes every one of them readable by every other account on a shared host.
The mode is set at **creation**, not afterwards, because a file that is briefly
world-readable is a file somebody can read in that moment; a file written before
this rule existed is corrected on its next write. It is not configurable: a
setting that can weaken this is a setting somebody weakens.

`pnpm check:env` reports all of it — which store files git tracks, whether any
of them contains a hash or a token, whether `DB_STORE_DIR` points outside the
repository, and whether any file is readable by other users.

Switching to `DB_DRIVER=mongodb` moves the data out of the filesystem entirely,
but none of the above stops mattering: the same rules apply to `MONGODB_URI`,
which carries a password and belongs only in the environment.

## Verifying a change

## One command

```bash
pnpm test          # every suite; starts a dev server of its own
```

It runs the typecheck and the three static suites, then the end-to-end one.
If nothing is on port 3000 it starts a dev server, waits for it, and shuts down
**only the server it started** — an already-running one is reused and left alone.

`pnpm test --no-server` skips the end-to-end suite, `pnpm test invariants` runs
one group of it, and `pnpm test --keep` leaves the server up for poking at.

**It never touches your data, and never touches your dev server.** The
end-to-end suite writes as it runs — repositories, pull requests, scope rows —
so it gives itself:

- a **store of its own**, seeded into a temp directory and thrown away after
- a **port of its own**, the first free one from 3000 up
- a **build directory of its own** — `.next-e2e` for its dev server, `.next-check`
  for the production build, both via `NEXT_DIST_DIR`

That last one was only half true for a long time, and it mattered: the build
step was isolated but **the suite's dev server was not**, so every `pnpm test`
wrote the `.next` a developer's own `pnpm dev` was reading. That is the
`ChunkLoadError` above, arriving out of nowhere in the middle of a test run.

It used to reuse whatever was listening on 3000, which is normally your
`pnpm dev` reading the real `DB_store/`. Test pull requests then appeared on a
live sign-off report looking exactly like something a colleague had added, and
the `next build` step replaced the chunks your running server was serving —
which surfaces as `ChunkLoadError` on a page that worked a minute earlier.

Setting `CHECK_BASE` still points the checks at a named server. That is the one
path with no isolation, and the suite says so in red before it starts.

## The individual suites

```bash
pnpm exec tsc --noEmit      # must be clean
pnpm build         # must pass

pnpm dev           # in one terminal
pnpm check         # in another — 641 end-to-end checks
pnpm check:theme   # static, no server needed — 1294 theme-token checks
pnpm check:ui      # static — 2687 checks on client-side pure logic
pnpm check:docs    # static — the knowledgebase still matches the code
```

`pnpm check` runs three groups against a live server, and each case
corresponds to a bug that was real at some point:

| Group | Covers |
|---|---|
| `invariants` | aggregations agree with each other and with their drill-downs, across scopes; trend shape; sort order; paging |
| `input` | malformed and hostile input is rejected rather than 5xx'ing; POD identity; threshold clamping; uploads; webhook payloads; sync watermark |
| `auth` | POD scoping, write permissions, page guards, anonymous access, privilege escalation |

`pnpm check:theme` reads `globals.css` **and every component** to verify:

- every token exists in all three theme blocks, and the two dark blocks have not
  drifted apart;
- text clears its contrast floor across the whole panel gradient, not just the
  declared `--surface`;
- the ageing ramps stay monotonic with visible steps;
- **no component writes `white/N`, `black/N` or a raw hex** — dark-mode
  assumptions that break the light theme;
- **no component uses a solid-colour blurred halo**, which a panel's
  `overflow: hidden` clips into a hard edge;
- the top bar stays pinned with its gap-covering backdrop.

Comments are stripped before the source rules run, so a comment explaining a
rule cannot trip it.

`pnpm check:docs` (`scripts/check-docs.mjs`) keeps this knowledgebase honest:
every relative link resolves, every hex quoted in the docs still exists in
`globals.css` or the brand ramp, every source module is mentioned somewhere,
every npm script is documented, and the check counts are quoted consistently.
Stale docs mislead the next reader — human or Copilot — more than no docs would.

Run one group with `pnpm check invariants`, or `VERBOSE=1` to list passes.
The `auth` group is skipped under `AUTH_MODE=off`.

> Do not run `pnpm build` while `pnpm dev` is running — the build
> overwrites `.next` underneath the dev server and it starts throwing
> `Cannot find module './chunks/…'`. Stop the dev server first.

### Aggregations agree with drill-downs

`pnpm check invariants` does this automatically. By hand:

Every bar must return exactly its own count when clicked.

```bash
curl -s "localhost:3000/api/metrics" | jq '.ageing'
curl -s "localhost:3000/api/items?activeOnly=true&maxAgeDays=3&limit=500"                 | jq '.items|length'
curl -s "localhost:3000/api/items?activeOnly=true&minAgeDays=3&maxAgeDays=7&limit=500"    | jq '.items|length'
curl -s "localhost:3000/api/items?activeOnly=true&minAgeDays=7&maxAgeDays=14&limit=500"   | jq '.items|length'
curl -s "localhost:3000/api/items?activeOnly=true&minAgeDays=14&maxAgeDays=30&limit=500"  | jq '.items|length'
curl -s "localhost:3000/api/items?activeOnly=true&minAgeDays=30&limit=500"                | jq '.items|length'
```

Also useful: each leaderboard row's `severity` segments must sum to its `active`.

```bash
curl -s localhost:3000/api/metrics \
  | jq '.assignees[] | {name, active, sum: ([.severity[].count] | add)}'
```

### Verifying scoping

Sign in with an admin cookie jar, create a member scoped to one POD, then confirm
every cross-POD route is refused. Expected results are in
[auth-and-tenancy.md](auth-and-tenancy.md#verified-behaviour).

```bash
CSRF=$(curl -s -c cj.txt localhost:3000/api/auth/csrf | jq -r .csrfToken)
curl -s -b cj.txt -c cj.txt -X POST localhost:3000/api/auth/callback/credentials \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=admin@example.com" \
  --data-urlencode "password=changeme" \
  --data-urlencode "redirect=false"
```

## Deploying

**Set the environment variables and start it.** Indices, the first admin and —
if Azure is configured — the first POD are all created on first use. There is
nothing to run by hand against a production database.

Needs a **long-lived Node server**, not a serverless target: the poller is an
in-process `setInterval`. On serverless, set `SYNC_POLL_SECONDS=0` and drive
`/api/sync` from an external scheduler.

### What you must set

| | Why |
|---|---|
| `AUTH_SECRET` | **The process refuses to start without it.** `openssl rand -base64 32` |
| `AUTH_TRUST_HOST=true` | you are behind a proxy |
| `AUTH_MODE` | anything but `off`, which disables login entirely |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | becomes the first account, once |
| `MONGODB_URI` | **required** — production never falls back to localhost |

Optional: the three `AZDO_*` variables (a POD is created and syncs on its own),
`AZDO_WEBHOOK_TOKEN` (unset rejects every webhook call, which is the safe
default), and `WEATHER_LAT`/`WEATHER_LON`.

Everything else has a working default. [`.env.example`](../.env.example) marks
which is which.

### With Docker

```bash
docker build -t pod-tracker .
docker run -p 3000:3000 --env-file .env.production pod-tracker
```

Multi-stage, so the image carries no compiler and no dev dependencies. It runs
as a **non-root** user and builds `output: "standalone"`, so nothing is
installed at start.

### Without Docker

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start          # not `pnpm dev`
```

### Health checks

| Probe | Path | Answers |
|---|---|---|
| **liveness** | `/api/health` | can this process serve? No I/O, so a slow database does not trigger a restart |
| **readiness** | `/api/health?ready=1` | can it reach MongoDB? `503` when not, so traffic stops without a kill |

Both return **503 when `AUTH_SECRET` is missing or a placeholder.** That is
deliberate and was a real bug: the health route did not import the auth config,
so a container with a broken secret reported *healthy* while every page returned
500 — and the orchestrator sent it live traffic. A health check that only proves
itself healthy turns an obvious outage into a silent one.

Neither endpoint needs a session, and neither returns anything worth having: no
versions, no hostnames, no cluster details, no error text.

### Behind TLS

Session cookies are issued `Secure` with the `__Secure-` prefix in production,
so **a browser will refuse them over plain HTTP** and sign-in will appear to do
nothing. Terminate TLS at your proxy and forward `X-Forwarded-Proto`; that is
the normal arrangement and it works. Running the app itself on bare HTTP in
production is not supported, by design.

### Security headers

Sent on every route from [`next.config.ts`](../next.config.ts): `X-Frame-Options:
DENY`, `nosniff`, `strict-origin-when-cross-origin`, HSTS, a locked-down
`Permissions-Policy`, and a CSP that blocks framing, plugins and every outbound
origin except Open-Meteo.

HSTS deliberately omits `preload`: submitting a host to the preload list is
close to irreversible, and is the operator's decision rather than a default.

## Backup and recovery

Item data is fully rebuildable — `Full resync` re-imports the last 365 days from
Azure. Teams and users are not: they exist only in `tracker-teams` and
`tracker-users`. Snapshot those two, or accept re-onboarding.

Spreadsheet-sourced items are **not** rebuildable. Keep the source files.

## Changing an index mapping

Mappings are only applied at index creation. Editing `src/lib/mappings.json`
does nothing to an existing index.

- Development: `pnpm seed --reset`.
- Production: create the new index, reindex, alias-swap. Then re-run the sync to
  backfill anything the reindex could not derive.
