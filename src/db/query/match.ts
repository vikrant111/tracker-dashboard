/**
 * One `$match` builder, serving both the dashboard aggregation and the
 * drill-down list.
 *
 * That sharing is the whole reason every number on the board agrees with the
 * list behind it: a bar and its drawer cannot disagree about what "Critical,
 * aged, in production" means if they are the same function. This replaces the
 * OpenSearch bool-query builder and keeps the identical semantics — most
 * importantly the **lower-inclusive, upper-exclusive** age bounds, which is
 * what stops a drill-down returning one more row than the bar it came from.
 */
import type { Filters } from "../../lib/metrics/types.ts";
import { daysAgo, floorDay } from "../../lib/metrics/dates.ts";
import { teamThresholds } from "../../lib/metrics/threshold.ts";
import { DEFAULT_THRESHOLD_DAYS } from "../../lib/types.ts";

/** Anything Mongo will accept as a filter document. */
export type MatchStage = Record<string, unknown>;

/**
 * A user's search text, made safe to put inside a regular expression.
 *
 * Two separate hazards, both of which produced a 500 before this existed:
 *
 * 1. **Regex metacharacters.** A title containing `(` or `[` — or somebody
 *    searching for `c++` — is an invalid pattern, and the driver throws.
 * 2. **Control characters.** BSON cannot carry a null byte inside a regex, so
 *    `?search=%00` reached Mongo and came back as a 500 rather than an empty
 *    result. They are stripped rather than escaped: no control character is
 *    ever a meaningful thing to search a bug title for.
 */
export function escapeRegex(input: string): string {
  return stripControl(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * C0 controls, DEL and the C1 range, removed.
 *
 * Stripped rather than escaped: no control character is ever a meaningful
 * thing to search a bug title for, and BSON cannot carry a null byte inside a
 * regex — `?search=%00` reached the driver and came back as a 500 instead of
 * an empty result.
 */
export function stripControl(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

/**
 * "Aged", as a filter document.
 *
 * Mongo cannot call `thresholdFor` per document, so its precedence is unrolled
 * into an `$or`: a branch per severity a POD overrides, then a catch-all for
 * that POD with `$nin` of exactly those severities. The `$nin` stops an item
 * matching two bounds at once; without it a Critical held to two days also
 * matches its POD's seven-day catch-all and the count exceeds the tile.
 *
 * `severity` is compared as stored, matching `thresholdFor`.
 */
function agedClause(f: Filters, now: number): MatchStage {
  const bound = (days: number) => ({ createdDate: { $lte: new Date(daysAgo(now, days)) } });

  const teamIds = f.teamId ? [f.teamId] : Object.keys(f.thresholdByTeam ?? {});
  // No POD scope to speak of — a caller with no accessible teams, or a filter
  // built without them. One bound is all there is to apply.
  if (!teamIds.length) return bound(f.thresholdDays ?? DEFAULT_THRESHOLD_DAYS);

  const branches: MatchStage[] = [];
  for (const { teamId, days, bySeverity } of teamThresholds(f, teamIds)) {
    const tuned = Object.keys(bySeverity);
    for (const severity of tuned) branches.push({ teamId, severity, ...bound(bySeverity[severity]) });
    branches.push(
      tuned.length
        ? { teamId, severity: { $nin: tuned }, ...bound(days) }
        : { teamId, ...bound(days) },
    );
  }
  return branches.length === 1 ? branches[0] : { $or: branches };
}

export function buildMatch(f: Filters, now = Date.now()): MatchStage {
  const and: MatchStage[] = [];

  if (f.teamId) and.push({ teamId: f.teamId });
  if (f.kind && f.kind !== "all") and.push({ kind: f.kind });
  if (f.severity) and.push({ severity: f.severity });
  if (f.environment) and.push({ environment: f.environment });
  if (f.status) and.push({ status: f.status });
  if (f.assignee) and.push({ assignee: f.assignee });
  if (f.activeOnly) and.push({ isActive: true });
  if (f.closedOnly) and.push({ isActive: false });

  if (f.agedOnly) {
    and.push({ isActive: true });
    and.push(agedClause(f, now));
  }

  /*
   * An older item has an *earlier* `createdDate`, so a minimum age is an upper
   * bound on the date. These bounds mirror the ageing buckets exactly — lower
   * inclusive, upper exclusive — so a drill-down returns precisely the count
   * printed on the bar. Using `$lte` here instead of `$lt` returns one extra
   * item, and the drawer then disagrees with the chart.
   */
  if (f.minAgeDays != null || f.maxAgeDays != null) {
    const range: Record<string, Date> = {};
    if (f.minAgeDays != null) range.$lt = new Date(floorDay(daysAgo(now, f.minAgeDays)));
    if (f.maxAgeDays != null) range.$gte = new Date(floorDay(daysAgo(now, f.maxAgeDays)));
    and.push({ createdDate: range });
  }

  if (f.createdFrom || f.createdTo) {
    const range: Record<string, Date> = {};
    if (f.createdFrom) range.$gte = new Date(f.createdFrom);
    if (f.createdTo) range.$lt = new Date(f.createdTo);
    and.push({ createdDate: range });
  }

  if (f.search) {
    const term = f.search.trim();
    if (term) {
      const safe = escapeRegex(term);
      const plain = stripControl(term);
      /*
       * Three ways to find the same thing, matching what the OpenSearch version
       * did: a title *prefix*, an exact work item id, and an assignee
       * substring.
       *
       * The title is anchored with `^`. An unanchored match would find "site"
       * inside "microsites" — the same class of accident that mislabelled a
       * whole board when value matching used `includes`, and the reason a text
       * index is not used here either: it would stem and match far more.
       */
      and.push({
        $or: [
          { title: { $regex: `^${safe}`, $options: "i" } },
          { workItemId: plain },
          { assignee: { $regex: safe, $options: "i" } },
        ],
      });
    }
  }

  if (!and.length) return {};
  return and.length === 1 ? and[0] : { $and: and };
}
