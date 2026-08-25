import type { Filters } from "./types.ts";
import { daysAgo, floorDay } from "./dates.ts";

/**
 * One query builder, serving both the aggregation and the drill-down list.
 *
 * That sharing is what keeps a bar and the drawer it opens consistent: they
 * cannot disagree about what "Critical, aged, in production" means if they are
 * the same function.
 */
export function buildQuery(f: Filters, now = Date.now()) {
  const must: object[] = [];
  const filter: object[] = [];

  if (f.teamId) filter.push({ term: { teamId: f.teamId } });
  if (f.kind && f.kind !== "all") filter.push({ term: { kind: f.kind } });
  if (f.severity) filter.push({ term: { severity: f.severity } });
  if (f.environment) filter.push({ term: { environment: f.environment } });
  if (f.status) filter.push({ term: { status: f.status } });
  if (f.assignee) filter.push({ term: { assignee: f.assignee } });
  if (f.activeOnly) filter.push({ term: { isActive: true } });
  if (f.closedOnly) filter.push({ term: { isActive: false } });
  if (f.agedOnly) {
    filter.push({ term: { isActive: true } });
    filter.push({ range: { createdDate: { lte: daysAgo(now, f.thresholdDays ?? 7) } } });
  }
  // Older item == earlier createdDate, so a *minimum* age is an *upper* bound on
  // the date. Bounds mirror the ageing date_range agg — lower inclusive, upper
  // exclusive — so a drill-down returns exactly the count on the bar.
  if (f.minAgeDays != null || f.maxAgeDays != null) {
    const range: Record<string, number> = {};
    if (f.minAgeDays != null) range.lt = floorDay(daysAgo(now, f.minAgeDays));
    if (f.maxAgeDays != null) range.gte = floorDay(daysAgo(now, f.maxAgeDays));
    filter.push({ range: { createdDate: range } });
  }
  if (f.createdFrom || f.createdTo) {
    const range: Record<string, string> = {};
    if (f.createdFrom) range.gte = f.createdFrom;
    if (f.createdTo) range.lt = f.createdTo;
    filter.push({ range: { createdDate: range } });
  }
  if (f.search) {
    must.push({
      bool: {
        should: [
          { match_phrase_prefix: { title: f.search } },
          { term: { workItemId: f.search } },
          { wildcard: { assignee: { value: `*${f.search}*`, case_insensitive: true } } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  return must.length || filter.length ? { bool: { must, filter } } : { match_all: {} };
}
