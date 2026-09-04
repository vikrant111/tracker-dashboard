/**
 * Board health: the share of tracked items that are closed.
 *
 * ```
 * health = round(closed × 100 / total)        closed = total − active
 * ```
 *
 * 138 closed of 244 reads 57%. That is the whole calculation, and that is the
 * point: a reader can check the dial against the "106 of 244" printed a few
 * rows below and get the same answer. It replaced a weighted heuristic that was
 * more diagnostic and that nobody could verify.
 *
 * It deliberately ignores age and severity. Three criticals open for a quarter
 * score the same as three trivial items raised this morning, so the card shows
 * *Critical aged* and *Average age* next to the ring: this number says how much
 * is left, those two say how bad it has become.
 *
 * Its own module because `metrics.ts` pulls in the database client and so can
 * never be loaded by the pure-logic suite. Client-safe and pure.
 */

/** The numbers the score is computed from. */
export type HealthTotals = {
  total: number;
  active: number;
};

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * The two counts, cleaned up. The one place clamping happens.
 *
 * Clamped both ways before anything is subtracted: a half-written aggregation
 * can report more open than tracked, or a negative count, and either makes
 * `closed` nonsense and puts an impossible percentage on the dial.
 *
 * `null` means nothing to score. Callers decide what that renders as.
 */
function counts(t: Partial<HealthTotals> | null | undefined): { total: number; closed: number } | null {
  const total = finite(t?.total);
  if (total <= 0) return null;

  const active = Math.min(total, Math.max(0, finite(t?.active)));
  return { total, closed: total - active };
}

/** Share of tracked items that are closed, 0..1. An empty board is 1. */
export function closedRatio(t: Partial<HealthTotals> | null | undefined): number {
  const c = counts(t);
  return c ? c.closed / c.total : 1;
}

/**
 * The percentage closed, or null when there is nothing to score.
 *
 * Scaled before dividing, not `round(ratio × 100)`. The two disagree at exactly
 * one half: 207 closed of 360 is 57.5%, but `(207 / 360) * 100` is
 * `57.49999999999999` in floating point, so rounding gave 57 while anyone
 * checking by hand got 58. On a score whose selling point is that you can check
 * it by hand, that matters more than the size of the error suggests.
 *
 * Null rather than 100 for an empty board. It used to return 100 — nothing
 * tracked, nothing outstanding — which is arguable for an empty POD and simply
 * wrong under a filter. Reported from a real board: searching for somebody in
 * another POD matched nothing, and the card answered with a green 100% over
 * this POD's name. Zero items is not a score, so the card says "no items"
 * instead of inventing a reading.
 */
export function healthScore(t: Partial<HealthTotals> | null | undefined): number | null {
  const c = counts(t);
  return c ? Math.round((c.closed * 100) / c.total) : null;
}
