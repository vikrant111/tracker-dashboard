/**
 * One answer per POD, in this process's memory, for a minute.
 *
 * **Nothing here touches disk.** It exists so that a dashboard, its roster, the
 * drill-down behind a tile and the export all read the same year of work
 * instead of fetching it four times — and so that switching a quarter in the
 * picker costs nothing, because the narrowing happens over what is already in
 * hand.
 *
 * Restart and it is gone, which is the point: the only durable records this
 * app keeps are accounts, PODs, permissions and tokens.
 */
import { LIVE } from "../contracts/item-filters.ts";
import type { Item } from "../types.ts";

type Entry = { at: number; items: Item[] };
type Store = { entries: Map<string, Entry>; inflight: Map<string, Promise<Item[]>> };

/*
 * Stashed on `globalThis` for the same reason the store is: Next re-evaluates
 * modules on hot reload, and a fresh module would mean a fresh empty cache on
 * every edit — a re-fetch of a whole year per keystroke.
 */
const KEY = Symbol.for("pod-tracker.live-cache");
const g = globalThis as typeof globalThis & { [KEY]?: Store };
const store: Store = (g[KEY] ??= { entries: new Map(), inflight: new Map() });

/**
 * The fresh answer for this key, or `load()` — and concurrent callers share
 * one request.
 *
 * Without the in-flight map a dashboard load fires the board and its roster at
 * once with the drawer following immediately: three identical year-long
 * fetches racing each other, two of them thrown away.
 */
export function cached(key: string, now: number, load: () => Promise<Item[]>): Promise<Item[]> {
  const fresh = store.entries.get(key);
  if (fresh && now - fresh.at < LIVE.cacheSeconds * 1000) return Promise.resolve(fresh.items);

  const pending = store.inflight.get(key);
  if (pending) return pending;

  const run = load()
    .then((items) => {
      store.entries.set(key, { at: now, items });
      return items;
    })
    .finally(() => store.inflight.delete(key));

  store.inflight.set(key, run);
  return run;
}

/** Drop a POD's cached answer, or every POD's. For the Refresh button. */
export function forgetLive(teamId?: string): void {
  if (teamId) store.entries.delete(teamId);
  else store.entries.clear();
}

/** For the checks: how many PODs are held right now. */
export const cachedCount = () => store.entries.size;
