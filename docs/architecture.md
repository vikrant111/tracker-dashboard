# Architecture

## Layers

```
components/          client. Props in, events out. Two fetchers only.
  ↕
app/api/*/route.ts   auth, scope, delegate, serialise. No business logic.
  ↕
lib/*.ts             domain. Pure-ish, no Request/Response, no React.
  ↕
MongoDB · Azure DevOps REST
```

Rules that keep it honest:

- **`lib/` never imports from `app/` or `components/`.** It knows nothing about
  HTTP or React.
- **Route handlers hold no logic.** If a handler grows a branch worth naming,
  the branch belongs in `lib/`.
- **`lib/` is server-only** except `types.ts` and `palette.ts`, which are pure
  data and safe to import from a client component. Importing anything else into
  a `"use client"` file drags the MongoDB driver into the browser bundle and
  the build fails.

## Request path: dashboard load

1. `src/app/page.tsx` (server) calls `currentUser()`. No session → redirect to
   `/login`. It fetches accessible teams for the POD picker and picks the
   landing scope: admins get all PODs, members get their own.
2. `DashboardClient` mounts, builds `baseQuery` from `{teamId, kind, search}` and
   polls `/api/metrics?…` every 30s through SWR.
3. `/api/metrics` runs `requireUser()` → `filtersFromRequest()` → `dashboard()`.
4. `dashboard()` issues **one** MongoDB aggregation whose `$facet` carries every
   aggregation the page needs. One round trip fills the whole board.
5. The response carries `teamNames` and last-sync info alongside the numbers, so
   the page needs no second call.

## Request path: drill-down

Panels do not fetch. They call `useDrill()` with a query fragment; `DrillProvider`
merges it with `baseQuery`, hits `/api/items`, and renders the drawer.

That indirection is what keeps counts and lists consistent: the drawer's filter
is built from the same `Filters` type and `buildQuery()` as the aggregation, so a
bar and its drawer cannot drift apart — as long as bucket bounds are mirrored
(see [metrics.md](metrics.md#ageing-buckets)).

## Request path: sync

```
poller ──┐
webhook ─┼─► syncTeam(team) ─► queryChangedIds (WIQL, since watermark)
manual ──┘                  ─► fetchWorkItems (batches of 200)
                            ─► fromAzure() per item
                            ─► bulkIndex (upsert by deterministic id)
                            ─► advance watermark
```

The webhook takes a shortcut: `syncSingleWorkItem()` fetches exactly one item.
It still re-fetches over REST rather than trusting the hook payload, because the
payload shape varies per event type.

## Runtime notes

- Every route handler is the **Node runtime**. The MongoDB driver needs
  `node:https`; Edge cannot resolve it.
- `serverExternalPackages` in `next.config.ts` keeps `mongoose`,
  `exceljs` and `bcryptjs` out of the webpack graph.
- The poller is started from the metrics route rather than `instrumentation.ts`,
  because Next compiles instrumentation for a runtime that cannot resolve
  `node:https`. It is stashed on `globalThis` under a `Symbol.for` key so dev's
  module reloading cannot start a second timer.

## Keeping the screen self-consistent

Every panel that reads the API shares one policy, in
[`src/lib/swr.ts`](../src/lib/swr.ts): the same `refreshInterval`, the same
deduping window, the same `keepPreviousData`.

That is not tidiness. The dashboard polls every 30s; before this, the drawer and
the expanded POD rows had **no** refresh at all. A sync landing while a drawer
was open left a tile reading 45 above a list still showing 42 — two numbers on
screen at once, with nothing to tell the reader which was right.

Anything that changes the data underneath the whole screen — a sync, an upload —
calls `mutate(isApiKey)` rather than mutating its own key, so every panel,
drawer and expanded row revalidates together.

## State ownership

`dashboard-client.tsx` owns everything the dashboard shares — team, kind, search,
sync and upload progress, toasts. Panels are presentational and take props.

The two exceptions that fetch: `DrillProvider` (the drawer) and `AdminClient`
(teams and users, via SWR).

## What deliberately does not exist

No ORM, no state library, no chart library, no test framework, no
`middleware.ts`. Auth is checked in server components and route handlers instead
of middleware, which avoids splitting the NextAuth config into an Edge-safe half
for the sake of one redirect. See [decisions.md](decisions.md).
