# Operations

## Environment

`.env.local` (generated from `.env.example`, gitignored).

| Variable | Default | Notes |
|---|---|---|
| `OPENSEARCH_URL` | `http://localhost:9200` | |
| `OPENSEARCH_USERNAME` / `_PASSWORD` | blank | blank when the security plugin is off |
| `OPENSEARCH_INDEX_PREFIX` | `tracker` | lets several environments share a cluster |
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
brew install opensearch && brew services start opensearch   # or: docker compose up -d
pnpm install
pnpm seed          # indices + admin + demo data
pnpm dev
```

Seed variants: `-- --no-demo` (indices and admin only), `-- --reset` (drop
indices first). The seeder uses a fixed PRNG seed, so demo data is identical
every run.

OpenSearch takes 20–40 seconds to accept connections after starting. `pnpm
seed` fails fast with the start command if it cannot reach the cluster.

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
pnpm check         # in another — 316 end-to-end checks
pnpm check:theme   # static, no server needed — 183 theme-token checks
pnpm check:ui      # static — 1166 checks on client-side pure logic
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

Needs a **long-lived Node server** — not a serverless target — because the
in-process poller is a `setInterval`. On serverless, set `SYNC_POLL_SECONDS=0`
and drive `/api/sync` from an external scheduler instead.

Checklist:

1. `AUTH_SECRET` set, `AUTH_TRUST_HOST=true`.
2. `AUTH_MODE` not `off`.
3. `ADMIN_PASSWORD` changed from the default.
4. OpenSearch reachable, **with the security plugin enabled** — the dev setup
   disables it.
5. `AZDO_WEBHOOK_TOKEN` set, and the Service Hook pointed at the public URL.
6. `pnpm seed --no-demo` once, to create indices and the first admin.
7. `pnpm build`, then `pnpm start` — not `pnpm dev`.

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
