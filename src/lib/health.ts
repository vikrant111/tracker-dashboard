/**
 * The board health score: **the share of tracked items that are closed**.
 *
 * ```
 * health = round(closed / total × 100)        closed = total − active
 * ```
 *
 * 138 closed of 244 reads 57%. That is the entire calculation, and it is the
 * point of it: a reader can check the number on the dial against the "106 of
 * 244" printed a few rows below on the same card and get the same answer.
 *
 * This replaced a weighted heuristic — full marks less capped penalties for
 * aged criticals, a stale average age and an open backlog. It was more
 * diagnostic and nobody could verify it. A score that has to be explained
 * before it can be trusted is not doing its job on a dashboard.
 *
 * **What that trades away, deliberately: age and severity.** Three criticals
 * open for a quarter score exactly the same here as three trivial items opened
 * this morning. The card still shows *Critical aged* and *Average age* beside
 * the ring, because they are the numbers this one cannot see — the score says
 * how much is left, and those two say how bad what is left has become.
 *
 * Its own module rather than a private function in `metrics.ts` because that
 * file imports the OpenSearch client and so can never be loaded by the
 * pure-logic suite. Client-safe and pure.
 */

/** The numbers the score is computed from. */
export type HealthTotals = {
  total: number;
  active: number;
};

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Share of tracked items that are closed, 0..1.
 *
 * An empty board is **1**, not `0/0`: nothing tracked means nothing
 * outstanding, so the score reads 100 rather than punishing a POD for having no
 * work yet.
 */
export function closedRatio(t: Partial<HealthTotals> | null | undefined): number {
  const total = finite(t?.total);
  if (total <= 0) return 1;
  /*
   * Clamped both ways before subtracting. A half-written aggregation can report
   * more open than tracked, or a negative count; either would make `closed`
   * nonsense — negative, or larger than the board — and put an impossible
   * percentage on the dial.
   */
  const active = Math.min(total, Math.max(0, finite(t?.active)));
  return (total - active) / total;
}

/** The board score: the percentage of tracked items that are closed. */
export function healthScore(t: Partial<HealthTotals> | null | undefined): number {
  return Math.round(closedRatio(t) * 100);
}
