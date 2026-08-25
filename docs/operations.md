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

`pnpm check:env` reports what is missing before you run anything else. `pnpm
seed` fails fast with a sentence naming the real problem when it cannot reach
the cluster — a blocked port, an IP that is not on the Atlas allowlist, or a
password with an unencoded `@` in it.

## Verifying a change

## One command

```bash
pnpm test          # every suite; starts a dev server if none is listening
```

It runs the typecheck and the three static suites, then the end-to-end one.
If nothing is on port 3000 it starts a dev server, waits for it, and shuts down
**only the server it started** — an already-running one is reused and left alone.

`pnpm test --no-server` skips the end-to-end suite, `pnpm test invariants` runs
one group of it, and `pnpm test --keep` leaves the server up for poking at.

## The individual suites

```bash
pnpm exec tsc --noEmit      # must be clean
pnpm build         # must pass

pnpm dev           # in one terminal
pnpm check         # in another — 330 end-to-end checks
pnpm check:theme   # static, no server needed — 728 theme-token checks
pnpm check:ui      # static — 1653 checks on client-side pure logic
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
