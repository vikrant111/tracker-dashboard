import { IDX, ensureIndices, search } from "./opensearch";
import type { Item, Kind } from "./types";
import { PAGE } from "./constants";
import { healthScore } from "./health";
import { mergeRoster, type RosterPerson } from "./roster";
import { listTeams } from "./teams";
import type { AggBucket } from "./metrics/aggregations.ts";
import { activeFilter, histogram, toBuckets } from "./metrics/aggregations.ts";
import { ageScript, daysAgo, floorDay, floorWeek } from "./metrics/dates.ts";
import { buildQuery } from "./metrics/query.ts";
import type { Bucket, Dashboard, Filters, TrendPoint } from "./metrics/types.ts";

export { buildQuery };
export type { Bucket, Dashboard, Filters, AssigneeStat, TeamStat, TrendPoint, ListedItem, ItemSort } from "./metrics/types.ts";
export { listItems, streamItems } from "./metrics/list-items.ts";

export async function dashboard(f: Filters): Promise<Dashboard> {
  await ensureIndices();
  const now = Date.now();
  const thresholdDays = f.thresholdDays ?? 7;
  const agedRange = { range: { createdDate: { lte: daysAgo(now, thresholdDays) } } };
  const ageBound = (days: number) => floorDay(daysAgo(now, days));

  const body = await search<Item>(IDX.items, {
    size: 0,
    track_total_hits: true,
    query: buildQuery(f, now),
    aggs: {
        active: { filter: activeFilter },
        avgAge: { filter: activeFilter, aggs: { v: { avg: { script: ageScript(now) } } } },
        criticalAged: {
          filter: { bool: { filter: [activeFilter, { term: { severity: "Critical" } }, agedRange] } },
        },
        envCount: { cardinality: { field: "environment" } },

        severity: { terms: { field: "severity", size: 10 } },
        environment: { terms: { field: "environment", size: 10 } },
        status: { terms: { field: "status", size: 15 } },

        ageing: {
          filter: activeFilter,
          aggs: {
            buckets: {
              date_range: {
                field: "createdDate",
                // `from` inclusive, `to` exclusive — the drill-down mirrors this
                // with gte/lt, and both sides use the same absolute bounds.
                ranges: [
                  { key: "0-3 days", from: ageBound(3) },
                  { key: "4-7 days", from: ageBound(7), to: ageBound(3) },
                  { key: "8-14 days", from: ageBound(14), to: ageBound(7) },
                  { key: "15-30 days", from: ageBound(30), to: ageBound(14) },
                  { key: "30+ days", to: ageBound(30) },
                ],
              },
            },
          },
        },

        assignees: {
          terms: { field: "assignee", size: PAGE.leaderboard, order: { _count: "desc" } },
          aggs: {
            email: { terms: { field: "assigneeEmail", size: 1 } },
            active: { filter: activeFilter },
            critical: { filter: { bool: { filter: [activeFilter, { term: { severity: "Critical" } }] } } },
            aged: { filter: { bool: { filter: [activeFilter, agedRange] } } },
            avgAge: { filter: activeFilter, aggs: { v: { avg: { script: ageScript(now) } } } },
            bySeverity: { filter: activeFilter, aggs: { s: { terms: { field: "severity", size: 5 } } } },
          },
        },

        teams: {
          terms: { field: "teamId", size: PAGE.teams },
          aggs: {
            active: { filter: activeFilter },
            criticalAged: {
              filter: { bool: { filter: [activeFilter, { term: { severity: "Critical" } }, agedRange] } },
            },
            avgAge: { filter: activeFilter, aggs: { v: { avg: { script: ageScript(now) } } } },
          },
        },

        raisedDaily: histogram("createdDate", "day", floorDay(daysAgo(now, 30)), now),
        closedDaily: histogram("closedDate", "day", floorDay(daysAgo(now, 30)), now),
        raisedWeekly: histogram("createdDate", "week", floorWeek(daysAgo(now, 84)), now),
        closedWeekly: histogram("closedDate", "week", floorWeek(daysAgo(now, 84)), now),
    },
  });

  const a = body.aggregations;
  const total = body.hits.total.value ?? 0;
  const active = a.active.doc_count;

  const totals = {
    total,
    active,
    closed: total - active,
    avgAgeDays: Math.round((a.avgAge.v.value ?? 0) * 10) / 10,
    criticalAged: a.criticalAged.doc_count,
    environments: a.envCount.value ?? 0,
  };

  /**
   * The rosters of the PODs in scope, so onboarded people appear even with no
   * work items. Scoped exactly like the query: one POD when one is selected,
   * every POD the caller can see otherwise.
   *
   * A failure here must not take the dashboard with it — the roster is a
   * nicety, the counts are the product. It degrades to no roster.
   */
  const roster: RosterPerson[] = await listTeams()
    .then((teams) => teams.filter((t) => !f.teamId || t.id === f.teamId).flatMap((t) => t.members ?? []))
    .catch(() => []);

  return {
    generatedAt: new Date().toISOString(),
    thresholdDays,
    totals,
    severity: toBuckets(a.severity),
    environment: toBuckets(a.environment),
    status: toBuckets(a.status),
    ageing: toBuckets(a.ageing.buckets),
    assignees: mergeRoster((a.assignees.buckets as AggBucket[]).map((b) => ({
      name: String(b.key),
      email: String((b.email as { buckets?: AggBucket[] })?.buckets?.[0]?.key ?? ""),
      total: b.doc_count,
      active: (b.active as { doc_count: number }).doc_count,
      critical: (b.critical as { doc_count: number }).doc_count,
      aged: (b.aged as { doc_count: number }).doc_count,
      avgAgeDays: Math.round(((b.avgAge as { v: { value: number | null } }).v.value ?? 0) * 10) / 10,
      severity: toBuckets((b.bySeverity as { s: { buckets: AggBucket[] } }).s),
    })), roster),
    teams: (a.teams.buckets as AggBucket[]).map((b) => ({
      teamId: String(b.key),
      total: b.doc_count,
      active: (b.active as { doc_count: number }).doc_count,
      criticalAged: (b.criticalAged as { doc_count: number }).doc_count,
      avgAgeDays: Math.round(((b.avgAge as { v: { value: number | null } }).v.value ?? 0) * 10) / 10,
    })),
    trend: {
      daily: mergeTrend(a.raisedDaily.series, a.closedDaily.series),
      weekly: mergeTrend(a.raisedWeekly.series, a.closedWeekly.series),
    },
    health: healthScore(totals),
  };
}

function mergeTrend(raised: { buckets: AggBucket[] }, closed: { buckets: AggBucket[] }): TrendPoint[] {
  const closedBy = new Map(closed.buckets.map((b) => [String(b.key_as_string), b.doc_count]));
  return raised.buckets.map((b) => ({
    date: String(b.key_as_string),
    raised: b.doc_count,
    closed: closedBy.get(String(b.key_as_string)) ?? 0,
  }));
}
