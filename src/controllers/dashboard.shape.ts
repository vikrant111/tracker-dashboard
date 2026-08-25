/**
 * Turning raw `$facet` output into the shapes the dashboard renders.
 *
 * Split out of the controller so that file reads as *what the board shows*, and
 * so these can be exercised by the check suite without a database — every
 * function here is pure.
 */
import { DAY_MS } from "../lib/metrics/dates.ts";
import type { Bucket } from "../lib/metrics/types.ts";

/** One decimal place, and never `NaN` or `null` reaching the browser. */
export function round1(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(n * 10) / 10;
}

/** `[{key, count}]` from a facet branch, with anything missing named `Unknown`. */
export function toBucketList(rows: unknown): Bucket[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    key: String((r as { key?: unknown }).key ?? "Unknown"),
    count: Number((r as { count?: unknown }).count ?? 0),
  }));
}

/**
 * The same, but in a fixed order with the gaps filled by zero.
 *
 * The ageing chart has five bars whatever the data says. Without this, a board
 * with nothing older than a week renders three bars and the axis silently
 * changes meaning between two PODs — which makes them look comparable when
 * they are not.
 */
export function orderedBuckets(rows: unknown, order: readonly string[]): Bucket[] {
  const found = new Map(toBucketList(rows).map((b) => [b.key, b.count]));
  return order.map((key) => ({ key, count: found.get(key) ?? 0 }));
}

/**
 * Every date in the window, whether or not anything happened on it.
 *
 * This is what OpenSearch's `min_doc_count: 0` plus `extended_bounds` did. The
 * pipeline cannot invent documents for quiet days, so the line would otherwise
 * jump straight from one busy day to the next and imply activity in between.
 *
 * Bounds are the same absolute epoch values the pipeline matched on, so the
 * first and last points line up exactly with the data.
 */
export function fillSeries(rows: unknown, from: number, to: number, unit: "day" | "week"): Bucket[] {
  const step = unit === "day" ? DAY_MS : 7 * DAY_MS;

  const counts = new Map<string, number>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const raw = (r as { date?: unknown }).date;
      const at = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(at.getTime())) continue;
      const key = isoDay(at);
      counts.set(key, (counts.get(key) ?? 0) + Number((r as { count?: unknown }).count ?? 0));
    }
  }

  const series: Bucket[] = [];
  /*
   * A hard ceiling on the loop. `from` comes from the caller, and a bad value —
   * a negative epoch, a swapped pair of bounds — would otherwise spin here
   * building millions of points until the process died. 512 is far more than
   * the 30 days and 12 weeks the dashboard ever asks for.
   */
  for (let at = from, guard = 0; at <= to && guard < 512; at += step, guard++) {
    const key = isoDay(new Date(at));
    series.push({ key, count: counts.get(key) ?? 0 });
  }
  return series;
}

/** `yyyy-MM-dd` in UTC — the format the chart's axis and drill-down both use. */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
