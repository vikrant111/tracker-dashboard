/**
 * The item store, for PODs that read Azure live.
 *
 * It wraps whichever driver is configured rather than replacing it, because the
 * two kinds of POD coexist: one named in `contracts/azure-sources.ts` is read
 * from Azure on the request, and every other one still reads what was synced.
 * Accounts, PODs, permissions and tokens are untouched either way — this
 * decides one thing, where *items* come from.
 *
 * Filtering is the same `matchesFilters` the JSON driver uses, deliberately.
 * The aggregation cannot be allowed to care where a document came from, and a
 * second predicate written for live items is a second chance for a bar and the
 * drawer behind it to disagree about what "aged, critical, in production"
 * means.
 */
import { toDoc } from "../../controllers/items.shape.ts";
import { liveItems, readsLive } from "../../lib/live/fetch.ts";
import type { Filters } from "../../lib/metrics/types.ts";
import type { Team } from "../../lib/types.ts";
import type { ItemDoc } from "../models/index.ts";
import { matchesFilters } from "../query/predicate.ts";
import type { ItemStore, Store } from "./types.ts";

/**
 * The PODs in scope for a query: the one asked for, or every visible one.
 *
 * Read off the store's own POD collection rather than through `lib/teams.ts`,
 * which reaches back into `getStore()` — importing it here would be a cycle,
 * and the one that broke was indirect enough to read as a missing file.
 */
async function teamsInScope(store: Store, filters: Filters): Promise<Team[]> {
  const teams = await store.teams.all();
  if (filters.teamId) return teams.filter((t) => t.id === filters.teamId);
  /*
   * No POD named means "all of them", and the ageing rules carry the list:
   * `thresholdByTeam` holds exactly the PODs the caller may see, built by
   * `filtersFromRequest`. Reading it rather than the whole team list is what
   * keeps a live board inside the same scope as a stored one — widening here
   * would hand one POD's items to somebody who cannot see that POD.
   */
  const visible = Object.keys(filters.thresholdByTeam ?? {});
  return visible.length ? teams.filter((t) => visible.includes(t.id)) : teams;
}

export function withLiveItems(store: Store): ItemStore {
  const base = store.items;
  return {
    async find(filters: Filters, now: number) {
      const scope = await teamsInScope(store, filters);
      const live = scope.filter(readsLive);
      const liveIds = new Set(live.map((t) => t.id));

      /*
       * The stored side, minus anything a live POD owns.
       *
       * A POD that moved to live may still have rows left over from when it
       * synced, and an unscoped query would return both — every item twice,
       * every number doubled. Dropping them by team id is what makes the switch
       * safe to flip without clearing anything first.
       */
      const stored = (await base.find(filters, now)).filter((d) => !liveIds.has(String(d.teamId)));

      const fetched: ItemDoc[] = [];
      for (const team of live) {
        for (const item of await liveItems(team, now)) {
          const doc = { ...toDoc(item), _id: item.id } as ItemDoc;
          if (matchesFilters(doc, filters, now)) fetched.push(doc);
        }
      }
      return [...stored, ...fetched];
    },

    /**
     * Writes reach the underlying driver only for the PODs that have one.
     *
     * `syncTeam` and the upload route already refuse a live POD before they get
     * this far, and both say why. This is the same rule stated where it cannot
     * be forgotten: **a live POD's items cannot be written at all**, by any
     * caller, present or future. One guard here is smaller than a guard in
     * every call site, and it is the one that still holds when somebody adds
     * the next writer.
     *
     * It throws rather than dropping the rows. Accepting a write and discarding
     * it is the silent version — a spreadsheet reported as imported and
     * invisible on the board forever.
     */
    async bulkUpsert(docs) {
      const live = new Set((await store.teams.all()).filter(readsLive).map((t) => t.id));
      const refused = docs.filter((d) => live.has(String(d.teamId)));
      if (refused.length) {
        const pods = [...new Set(refused.map((d) => String(d.teamId)))].join(", ");
        throw new Error(
          `${refused.length} item(s) were not stored: ${pods} read from Azure on every request, so a stored copy would never be read again. Remove the POD from src/lib/contracts/azure-sources.ts to store its items.`,
        );
      }
      return base.bulkUpsert(docs);
    },
    deleteById: (id) => base.deleteById(id),
    deleteByTeam: (teamId) => base.deleteByTeam(teamId),
    count: () => base.count(),
  };
}
