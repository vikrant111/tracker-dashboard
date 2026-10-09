/**
 * A POD's items, read from Azure on the request that needs them.
 *
 * **Nothing here is stored.** No collection, no JSON file, no watermark — the
 * only thing that outlives a request is a short-lived cache in this process's
 * memory, so a dashboard, the drawer it opens and the export behind it read one
 * answer instead of three. Restart and it is gone, which is the point: the only
 * durable records this app keeps are accounts, PODs, permissions and tokens.
 *
 * The window is the reason this is affordable. One POD's last 365 days is a few
 * thousand items; the same query without a bound is a project's whole history,
 * which is what made an earlier version slow and wrong at the same time —
 * items raised years ago arriving as though they were this year's.
 */
import { credsFor, fetchByIds, queryIds, resolveCreds, type AzureWorkItem } from "../azure.ts";
import { sourcesFor, type AzureSource } from "../contracts/azure-sources.ts";
import { LIVE, allows } from "../contracts/item-filters.ts";
import { fromAzure } from "../normalize.ts";
import type { Item, Team } from "../types.ts";
import { buildSourceWiql } from "./wiql.ts";

/**
 * Whether this POD reads live.
 *
 * Two conditions, and the second is what keeps a demo install working: a POD
 * named in the contract still falls back to the store when there is no PAT
 * anywhere to read Azure with. That is the only fallback — a PAT that exists
 * and fails is an error, loudly, because quietly showing yesterday's synced
 * numbers as though they were live is the worse outcome.
 */
export function readsLive(team: Team): boolean {
  return sourcesFor(team).length > 0 && Boolean(resolveCreds(team).pat);
}

/** The ISO instant the window starts at. */
export const windowStart = (now = Date.now()) => new Date(now - LIVE.windowDays * 86_400_000).toISOString();

/**
 * The POD, as the normaliser should see it for one source.
 *
 * `fromAzure` reads the org, project and field mapping off the team, so each
 * source gets a view of the POD pointed at its own project. Without this, an
 * item from the second project would be given the first project's URL and the
 * first project's status field — a link that 404s and a status that is blank.
 */
function viewFor(team: Team, source: AzureSource): Team {
  return {
    ...team,
    azure: {
      ...team.azure,
      orgUrl: source.orgUrl,
      project: source.project,
      areaPath: source.areaPath ?? "",
      workItemTypes: [...source.workItemTypes],
    },
    fieldMap: { ...team.fieldMap, ...(source.fieldMap ?? {}) },
  };
}

/**
 * What survives the window, and the allowlists if they are switched on.
 *
 * The window is applied again here, but **not** as "raised inside it". The rule
 * is *finished long ago and raised long ago*:
 *
 * - raised inside the window → kept, closed or not
 * - **still open** → kept whatever its age, because a bug that has waited two
 *   years is the single most important row an ageing board has. The buckets
 *   handle it correctly: it lands in `30+ days`, and the trend chart ignores a
 *   `createdDate` outside its own range, so nothing is distorted by keeping it.
 * - closed inside the window → kept, so the closure trend is complete
 * - closed **before** the window and raised before it → dropped. That is
 *   finished history, and it is the only thing here that would inflate a total
 *   with a year nobody asked about.
 */
export function keepAllowed(items: Item[], now: number): Item[] {
  const floor = now - LIVE.windowDays * 86_400_000;
  return items.filter((i) => {
    const created = new Date(i.createdDate).getTime();
    // An unparseable date is dropped rather than treated as now, which would
    // put a broken row in the newest ageing bucket and in today's trend point.
    if (!Number.isFinite(created)) return false;
    const closed = i.closedDate ? new Date(i.closedDate).getTime() : null;
    const current =
      created >= floor || i.isActive || (closed !== null && Number.isFinite(closed) && closed >= floor);
    if (!current) return false;
    return allows("severity", i.severity) && allows("environment", i.environment) && allows("status", i.status);
  });
}

async function fetchSource(team: Team, source: AzureSource, now: number): Promise<Item[]> {
  const creds = credsFor(team, { orgUrl: source.orgUrl, project: source.project });
  const since = windowStart(now);
  const ids = await queryIds(creds, buildSourceWiql(source, since), { types: source.workItemTypes, since });
  if (!ids.length) return [];

  // ponytail: batches are fetched in series, as sync has always done. A cold
  // read of a few thousand items is a handful of seconds; if that stops being
  // acceptable, this loop is the place to add bounded parallelism.
  const workItems: AzureWorkItem[] = await fetchByIds(creds, ids.slice(0, LIVE.maxIds));
  const view = viewFor(team, source);
  return workItems.map((wi) => fromAzure(wi, view));
}

/** Every live source for this POD, merged and deduplicated by item id. */
async function fetchAll(team: Team, now: number): Promise<Item[]> {
  const byId = new Map<string, Item>();
  for (const source of sourcesFor(team)) {
    for (const item of await fetchSource(team, source, now)) byId.set(item.id, item);
  }
  return keepAllowed([...byId.values()], now);
}

type Entry = { at: number; items: Item[] };
/*
 * Per process, and stashed on `globalThis` for the same reason the store is:
 * Next re-evaluates modules on hot reload, and a fresh module would mean a
 * fresh empty cache on every edit — and a re-fetch of a whole year per
 * keystroke.
 */
const KEY = Symbol.for("pod-tracker.live-cache");
type Cached = { entries: Map<string, Entry>; inflight: Map<string, Promise<Item[]>> };
const g = globalThis as typeof globalThis & { [KEY]?: Cached };
const cache: Cached = (g[KEY] ??= { entries: new Map(), inflight: new Map() });

/**
 * This POD's items, from cache when it is fresh.
 *
 * Concurrent callers share one request. A dashboard load fires the board and
 * its roster at once and the drawer follows immediately; without the in-flight
 * map that is three identical year-long fetches racing each other, and the
 * first two are thrown away.
 */
export async function liveItems(team: Team, now = Date.now()): Promise<Item[]> {
  const fresh = cache.entries.get(team.id);
  if (fresh && now - fresh.at < LIVE.cacheSeconds * 1000) return fresh.items;

  const pending = cache.inflight.get(team.id);
  if (pending) return pending;

  const run = fetchAll(team, now)
    .then((items) => {
      cache.entries.set(team.id, { at: now, items });
      return items;
    })
    .finally(() => cache.inflight.delete(team.id));

  cache.inflight.set(team.id, run);
  return run;
}

/** Drop a POD's cached answer, or every POD's. For the Refresh button. */
export function forgetLive(teamId?: string): void {
  if (teamId) cache.entries.delete(teamId);
  else cache.entries.clear();
}
