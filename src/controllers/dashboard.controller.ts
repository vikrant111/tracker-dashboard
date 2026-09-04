/**
 * The board, from whichever store is configured.
 *
 * The driver narrows to the items that matched; `aggregateDashboard` turns them
 * into every number on screen. One aggregation, so `DB_DRIVER=json` and
 * `DB_DRIVER=mongodb` cannot produce different figures from the same data —
 * which is the only way "swap the storage later" is safe to offer.
 */
import { healthScore } from "../lib/health.ts";
import type { Dashboard, Filters } from "../lib/metrics/types.ts";
import { mergeRoster } from "../lib/roster.ts";
import { getStore } from "../db/store/index.ts";
import { aggregateDashboard } from "./dashboard.aggregate.ts";
import { loadRoster } from "./dashboard.roster.ts";

export async function getDashboard(f: Filters): Promise<Dashboard> {
  const store = getStore();
  await store.init();

  const now = Date.now();
  const thresholdDays = f.thresholdDays ?? 7;

  const items = await store.items.find(f, now);
  /*
   * The ageing rules are forwarded **whole**, not field by field.
   *
   * They were copied one at a time, and adding per-severity thresholds meant
   * adding a field here too — which was missed, so the driver filtered on the
   * severity rule while the aggregation still judged by the POD's, and the tile
   * disagreed with the drawer it opened. Spreading the filters means a rule the
   * store honours cannot be silently dropped on the way to the numbers.
   */
  const board = aggregateDashboard({ ...f, items, now, thresholdDays });

  /*
   * The rosters of the PODs in scope, so an onboarded person with no items
   * appears as a zero rather than a gap — narrowed by the same search the items
   * were. A failure here must not take the dashboard with it: the roster is a
   * nicety, the counts are the product.
   */
  const roster = await loadRoster(f);

  return {
    ...board,
    assignees: mergeRoster(board.assignees, roster),
    health: healthScore(board.totals),
  };
}
