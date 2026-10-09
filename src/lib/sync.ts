import { fetchWorkItems, isConnectable, queryChangedIds } from "./azure";
import { forgetLive, readsLive } from "./live/fetch";
import { fromAzure } from "./normalize";
import { bulkUpsertItems } from "../controllers/items.controller.ts";
import { findSyncState, saveSyncState } from "../controllers/sync-state.controller.ts";
import { getTeam, listTeams } from "./teams";
import type { Team } from "./types";
import { TIMING } from "./constants";

export type SyncState = {
  teamId: string;
  lastChangedDate: string;
  lastRunAt: string;
  lastResult: string;
};

export type SyncResult = {
  teamId: string;
  teamName: string;
  imported: number;
  failed: number;
  error?: string;
  /**
   * Said instead of a count, when a POD had nothing to import because it reads
   * Azure live. Not an `error`: nothing went wrong, and reporting it as one
   * puts a red toast in front of somebody whose board is working.
   */
  note?: string;
};

/** How far back a team's very first sync reaches. */
const FIRST_RUN_DAYS = 365;

const firstRunSince = () => new Date(Date.now() - FIRST_RUN_DAYS * 86_400_000).toISOString();

/**
 * Never query further back than the first-run window. A missing, unparseable or
 * absurdly old watermark — including one written by an earlier buggy build —
 * would otherwise ask Azure for the entire history of the project.
 */
function clampSince(iso: string | undefined): string {
  const floor = Date.now() - FIRST_RUN_DAYS * 86_400_000;
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) && t > floor ? new Date(t).toISOString() : new Date(floor).toISOString();
}

export async function getSyncState(teamId: string): Promise<SyncState | null> {
  return findSyncState(teamId);
}

export async function syncTeam(team: Team, opts: { full?: boolean } = {}): Promise<SyncResult> {
  const base = { teamId: team.id, teamName: team.name };

  /*
   * A live POD has nothing to sync, so Sync means **refresh**: drop the cached
   * answer and the next read fetches from Azure again.
   *
   * It returns before touching the store on purpose. Importing items for a POD
   * whose `find` reads Azure would write rows nothing ever reads again — the
   * exact "stored a copy anyway" outcome a live board exists to avoid.
   */
  if (readsLive(team)) {
    forgetLive(team.id);
    return { ...base, imported: 0, failed: 0, note: `${team.name} reads Azure live — refreshed, nothing stored.` };
  }

  try {
    const state = opts.full ? null : await getSyncState(team.id);
    const since = clampSince(state?.lastChangedDate);

    const ids = await queryChangedIds(team, since);
    if (!ids.length) {
      await saveSyncState(team.id, {
        teamId: team.id,
        lastChangedDate: since,
        lastRunAt: new Date().toISOString(),
        lastResult: "no changes",
      });
      return { ...base, imported: 0, failed: 0 };
    }

    const workItems = await fetchWorkItems(team, ids);
    const items = workItems.map((wi) => fromAzure(wi, team));
    const failed = await bulkUpsertItems(items);

    // Advance the watermark to the newest item actually indexed, minus a minute
    // of slack — Azure's ChangedDate ordering is not strict enough to trust exactly.
    const newest = items.reduce(
      (max, i) => (i.changedDate > max ? i.changedDate : max),
      since,
    );
    const watermark = new Date(new Date(newest).getTime() - TIMING.syncOverlapMs).toISOString();

    await saveSyncState(team.id, {
      teamId: team.id,
      lastChangedDate: watermark,
      lastRunAt: new Date().toISOString(),
      lastResult: `${items.length - failed} imported, ${failed} failed`,
    });

    return { ...base, imported: items.length - failed, failed };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Record the failure without touching the watermark. Defaulting it to the
    // epoch (as this once did) made the next successful run re-import the whole
    // history, which on a real board is an enormous query.
    const previous = await getSyncState(team.id).catch(() => null);
    await saveSyncState(team.id, {
      teamId: team.id,
      lastChangedDate: clampSince(previous?.lastChangedDate),
      lastRunAt: new Date().toISOString(),
      lastResult: `error: ${error}`,
    }).catch(() => {});
    return { ...base, imported: 0, failed: 0, error };
  }
}

/** One team's sync failing must not stop the others. */
export async function syncAllTeams(): Promise<SyncResult[]> {
  const teams = await listTeams();
  // A full connection, from either source. Checking only the org URL let a POD
  // with a URL but no PAT into the loop, where it failed on every run.
  //
  // A live POD is included although it may carry no project of its own — its
  // projects are in the contract — so that a sweep still refreshes its cache.
  const connected = teams.filter((t) => isConnectable(t) || readsLive(t));
  const results: SyncResult[] = [];
  for (const team of connected) results.push(await syncTeam(team));
  return results;
}

/** Webhook path: pull exactly one work item and upsert it. */
export async function syncSingleWorkItem(teamId: string, workItemId: number): Promise<boolean> {
  const team = await getTeam(teamId);
  if (!team) return false;
  /*
   * For a live POD the hook is a cache invalidation and nothing else: the next
   * read will see the change because it asks Azure, and writing the item here
   * would store a copy of data this board deliberately does not keep.
   */
  if (readsLive(team)) {
    forgetLive(team.id);
    return true;
  }
  const [wi] = await fetchWorkItems(team, [workItemId]);
  if (!wi) return false;
  await bulkUpsertItems([fromAzure(wi, team)]);
  return true;
}

/**
 * Webhooks do not say which team an item belongs to, so match on area path
 * (longest prefix wins, so a nested POD beats its parent), then fall back to
 * the only team when there is one.
 */
export async function teamForAreaPath(areaPath: string, project: string): Promise<Team | null> {
  const teams = await listTeams();
  const scoped = teams.filter((t) => !t.azure.project || t.azure.project === project);
  const pool = scoped.length ? scoped : teams;

  const byArea = pool
    .filter((t) => t.azure.areaPath && areaPath.startsWith(t.azure.areaPath))
    .sort((a, b) => b.azure.areaPath.length - a.azure.areaPath.length);

  return byArea[0] ?? (pool.length === 1 ? pool[0] : null);
}
