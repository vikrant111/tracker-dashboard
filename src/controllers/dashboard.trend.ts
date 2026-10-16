/**
 * The closure trend: raised against closed, over a window the reader chooses.
 *
 * Split out of `dashboard.aggregate` when the chart gained its own window and
 * its own slice. It is the one panel that does not simply read the board's
 * filters — see `Filters.trendFrom` for why — so the rules live together here
 * rather than as four loose constants in the middle of the aggregation.
 *
 * Pure. `now` is passed in like everywhere else, so every panel is measured
 * from the same instant.
 */
import { TREND_WINDOW } from "../lib/contracts/trend-view.ts";
import { DAY_MS, daysAgo, floorDay, floorWeek } from "../lib/metrics/dates.ts";
import type { Bucket, TrendPoint } from "../lib/metrics/types.ts";
import type { ItemDoc } from "../db/models/index.ts";
import { fillSeries } from "./dashboard.shape.ts";
import { histogram } from "./dashboard.parts.ts";

export type TrendInput = {
  trendFrom?: string;
  trendTo?: string;
  trendEnvironment?: string;
  trendStatus?: string;
  /*
   * The **board's** range, which the items were already narrowed by before
   * they reached here. Read only to tell the reader when the two disagree —
   * never to filter again. See `clippedBy` below.
   */
  createdFrom?: string;
  createdTo?: string;
};

const at = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * The items this chart plots.
 *
 * Compared as stored, exactly as `matchesFilters` compares them — the drawer a
 * trend point opens re-states this slice as a real filter, and the two have to
 * agree or the list holds more rows than the point plotted.
 */
export function sliceForTrend(items: ItemDoc[], f: TrendInput): ItemDoc[] {
  if (!f.trendEnvironment && !f.trendStatus) return items;
  return items.filter(
    (i) =>
      (!f.trendEnvironment || String(i.environment) === f.trendEnvironment) &&
      (!f.trendStatus || String(i.status) === f.trendStatus),
  );
}

/**
 * The window to plot, in whole days, for one grain.
 *
 * Every bound is clamped rather than trusted. `trendFrom` is a query param: a
 * swapped pair, a date in 1970 or one in 2090 would otherwise reach the series
 * builder, which fills a bucket per step and would grind through millions of
 * them. The rules, in order:
 *
 * - `to` never runs past now — there is no data in the future to plot;
 * - `from` never starts earlier than `maxDays` back, which is as far as the
 *   board fetches, so the axis cannot promise more history than exists;
 * - `from` never lands after `to`; a swapped pair falls back to the default
 *   window rather than drawing an empty chart that looks like a quiet quarter.
 */
export function trendWindow(f: TrendInput, now: number, unit: "day" | "week"): { from: number; to: number } {
  const floor = unit === "day" ? floorDay : floorWeek;
  const defaultDays = unit === "day" ? TREND_WINDOW.dailyDays : TREND_WINDOW.weeklyDays;
  const earliest = floor(daysAgo(now, TREND_WINDOW.maxDays));

  const to = Math.min(now, at(f.trendTo) ?? now);
  const asked = at(f.trendFrom);
  const from = asked === null ? floor(daysAgo(to, defaultDays)) : floor(Math.max(asked, earliest));

  /* A swapped or absurd pair: fall back rather than plot nothing. */
  if (from > to) return { from: floor(daysAgo(to, defaultDays)), to };
  return { from, to };
}

/**
 * Whether the board's range is hiding part of the period that was asked for.
 *
 * The board narrows the items *before* the trend sees them, so a period
 * outside the chosen quarter draws an empty chart — which reads as "no bugs"
 * rather than "you are looking outside the quarter". Two filters, one of them
 * invisible, is the worst way for a dashboard to be wrong.
 *
 * This does not change a single count. It is only what lets the card say so.
 */
function clippedBy(f: TrendInput, window: { from: number; to: number }): boolean {
  const from = at(f.createdFrom);
  /* `createdTo` is exclusive, matching the filter's `$lt`. */
  const to = at(f.createdTo);
  if (from !== null && window.from < floorDay(from)) return true;
  if (to !== null && window.to >= to) return true;
  return false;
}

/** One grain's series, raised and closed merged onto a shared date key. */
function series(items: ItemDoc[], from: number, to: number, unit: "day" | "week"): TrendPoint[] {
  const toRow = (b: Bucket) => ({ date: b.key, count: b.count });
  const of = (field: "createdDate" | "closedDate") =>
    fillSeries(histogram(items, field, unit, from).map(toRow), from, to, unit);

  const closedBy = new Map(of("closedDate").map((b) => [b.key, b.count]));
  return of("createdDate").map((b) => ({ date: b.key, raised: b.count, closed: closedBy.get(b.key) ?? 0 }));
}

/** Both grains, over the chosen window and slice. */
export function buildTrend(items: ItemDoc[], f: TrendInput, now: number): {
  daily: TrendPoint[];
  weekly: TrendPoint[];
  from: string;
  to: string;
  clipped: boolean;
} {
  const plotted = sliceForTrend(items, f);
  const day = trendWindow(f, now, "day");
  const week = trendWindow(f, now, "week");

  return {
    daily: series(plotted, day.from, day.to, "day"),
    weekly: series(plotted, week.from, week.to, "week"),
    /* Said out loud rather than drawn as a flat line. */
    clipped: clippedBy(f, day),
    /*
     * What the window actually came out as, after clamping — the control shows
     * these back, so a date the board could not honour corrects itself on
     * screen instead of leaving the picker disagreeing with the axis.
     */
    from: new Date(day.from).toISOString().slice(0, 10),
    to: new Date(Math.max(day.to, day.from + DAY_MS)).toISOString().slice(0, 10),
  };
}
