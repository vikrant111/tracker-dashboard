/**
 * What the closure trend adds up to.
 *
 * Two curves answer "how many, when". They do not answer the question anybody
 * actually opens this card with — *are we keeping up?* — and a reader was left
 * to eyeball which line sat higher over thirty points.
 *
 * Pure, and derived from the plotted points rather than re-queried, so the
 * headline cannot disagree with the chart under it.
 */
import type { TrendPoint } from "./types.ts";

export type TrendStats = {
  raised: number;
  closed: number;
  /** closed − raised. Positive means the backlog shrank over the window. */
  net: number;
  /** The bucket with the most raised, or null when nothing was raised at all. */
  busiest: { date: string; raised: number } | null;
  /** Mean raised per bucket, to one decimal. */
  perBucket: number;
  /**
   * The longest run of consecutive buckets that closed at least as much as
   * they took in — the thing a team actually feels. Buckets with no activity
   * at all do not count: a quiet weekend is not a winning streak.
   */
  streak: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function trendStats(points: TrendPoint[]): TrendStats {
  const rows = Array.isArray(points) ? points : [];
  let raised = 0;
  let closed = 0;
  let busiest: TrendStats["busiest"] = null;
  let streak = 0;
  let run = 0;

  /*
   * `Number(x) || 0` lets `Infinity` through — it is truthy — and a single bad
   * value then made the headline read "Infinity closed" while the curve beside
   * it drew fine. Finite or nothing.
   */
  const count = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  for (const p of rows) {
    const r = count(p?.raised);
    const c = count(p?.closed);
    raised += r;
    closed += c;

    if (r > 0 && (!busiest || r > busiest.raised)) busiest = { date: String(p.date), raised: r };

    /*
     * A bucket with nothing in it breaks the run rather than extending it.
     * Counting empty days as "keeping up" turned a fortnight of leave into a
     * fourteen-day winning streak, which is the opposite of informative.
     */
    if (r === 0 && c === 0) run = 0;
    else if (c >= r) {
      run += 1;
      if (run > streak) streak = run;
    } else run = 0;
  }

  return {
    raised,
    closed,
    net: closed - raised,
    busiest,
    perBucket: rows.length ? round1(raised / rows.length) : 0,
    streak,
  };
}
