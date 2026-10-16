/**
 * How old is old.
 *
 * A POD sets ageing per severity: Critical might be two days while Minor gets a
 * fortnight. Anything a POD has not set falls back to the default of 7.
 *
 * Everything resolves through `thresholdFor` — the JSON driver's predicate, the
 * Mongo `$match`, and the aggregation behind the tiles. One implementation is
 * the only reason a tile and the drawer it opens cannot disagree about which
 * items are aged. Writing the precedence twice caused exactly that bug once.
 *
 * Pure: no clock, no store. The checks exercise these directly.
 */
import { AGEING } from "../constants.ts";
import { businessDaysAgo } from "./dates.ts";

export type ThresholdRules = {
  /** Fallback when nothing more specific applies. */
  thresholdDays?: number;
  /** A POD's own default, by team id. */
  thresholdByTeam?: Record<string, number>;
  /** A POD's per-severity rules: team id -> severity -> days. */
  severityThresholds?: Record<string, Record<string, number>>;
};

/**
 * A usable number of days, or null.
 *
 * Values are clamped on the way in, but a file can be hand-edited and an older
 * document can predate a rule. A string or a NaN here would become `now - NaN`
 * and mark everything aged, so anything unusable is treated as absent and the
 * next fallback applies.
 */
function usableDays(value: unknown): number | null {
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(days) || days <= 0) return null;
  return Math.min(AGEING.max, Math.max(AGEING.min, Math.trunc(days)));
}

/**
 * **Working days** this item may sit before it counts as aged.
 *
 * The order is the whole of the policy:
 *
 * 1. what this POD set for this severity, in Admin — somebody chose it;
 * 2. the turnaround for the severity — Critical 1, Major 6, Minor 12;
 * 3. the POD's own blanket threshold;
 * 4. the board default.
 *
 * The severity turnaround sits **above** the POD's blanket threshold on
 * purpose. It is the agreed policy, and a POD-wide "30 days" must not quietly
 * give a Critical a month. A POD that genuinely needs a different number for a
 * severity says so per severity, which is step 1.
 */
export function thresholdFor(rules: ThresholdRules, teamId: unknown, severity: unknown): number {
  const team = String(teamId ?? "");
  const sev = String(severity ?? "");

  return (
    usableDays(rules?.severityThresholds?.[team]?.[sev]) ??
    usableDays(AGEING.bySeverity[sev]) ??
    usableDays(rules?.thresholdByTeam?.[team]) ??
    usableDays(rules?.thresholdDays) ??
    AGEING.defaultThresholdDays
  );
}

/**
 * The instant an item of this severity becomes aged, counted in working days.
 *
 * Created at or before this counts. The bound is inclusive, matching `$lte` on
 * the Mongo side; an off-by-one here shows up as a drawer holding one more row
 * than the bar that opened it.
 */
export const agedBefore = (rules: ThresholdRules, now: number, teamId: unknown, severity: unknown): number =>
  businessDaysAgo(now, thresholdFor(rules, teamId, severity));

/**
 * The rules per POD, for a query engine that cannot call a function per row.
 *
 * Mongo builds its aged clause as an `$or` over these: a branch per tuned
 * severity, plus a catch-all excluding them. That exclusion is what
 * `bySeverity`'s keys are needed for.
 */
export function teamThresholds(
  rules: ThresholdRules,
  teamIds: string[],
): { teamId: string; days: number; bySeverity: Record<string, number> }[] {
  if (!Array.isArray(teamIds)) return [];

  const fallback = usableDays(rules?.thresholdDays) ?? AGEING.defaultThresholdDays;
  return teamIds.map((teamId) => ({
    teamId,
    days: usableDays(rules?.thresholdByTeam?.[teamId]) ?? fallback,
    /*
     * The POD's own rules on top of the severity turnarounds, so Mongo's `$or`
     * carries a branch for every severity that has one. Leaving the
     * turnarounds out here made the query disagree with `thresholdFor` — the
     * tile counted a Critical aged after one day and the drawer after seven.
     */
    bySeverity: { ...AGEING.bySeverity, ...(rules?.severityThresholds?.[teamId] ?? {}) },
  }));
}

/**
 * The longest any item in scope may sit.
 *
 * What the board reports as `thresholdDays`, and what the average-ageing tile
 * tints against. It has to be the widest rule rather than the default, or a POD
 * that allows a month gets called "serious" at a fortnight.
 */
export function widestThreshold(rules: ThresholdRules, teamIds: string[], severities: readonly string[]): number {
  const fallback = usableDays(rules?.thresholdDays) ?? AGEING.defaultThresholdDays;
  if (!Array.isArray(teamIds) || !teamIds.length || !severities?.length) return fallback;

  return Math.max(...teamIds.flatMap((id) => severities.map((sev) => thresholdFor(rules, id, sev))));
}

/** How to finish "aged means open …", so every panel says it the same way. */
export const agedPhrase = (board: { thresholdDays: number; severityTuned: boolean }): string =>
  board?.severityTuned
    ? "past the working days allowed for its severity"
    : `past ${usableDays(board?.thresholdDays) ?? AGEING.defaultThresholdDays} working days`;

/**
 * The one number the "critical and open past N days" tile may print, or null
 * when the PODs in scope disagree and no single number would be honest.
 */
export function agreedThreshold(rules: ThresholdRules, teamIds: string[], severity: string): number | null {
  if (!Array.isArray(teamIds) || !teamIds.length) {
    return usableDays(rules?.thresholdDays) ?? AGEING.defaultThresholdDays;
  }

  const seen = new Set(teamIds.map((id) => thresholdFor(rules, id, severity)));
  return seen.size === 1 ? [...seen][0] : null;
}
