/**
 * Every number on the board, from **one** aggregation.
 *
 * `$facet` is what makes that possible: each branch runs over the same matched
 * set, in the same request, at the same instant. Splitting these into separate
 * queries would let the data change between them, and then two tiles argue on
 * screen about the same figure — which is the exact problem this project
 * exists to solve.
 */
import { PAGE } from "../lib/constants.ts";
import { healthScore } from "../lib/health.ts";
import { daysAgo, floorDay, floorWeek } from "../lib/metrics/dates.ts";
import type { Bucket, Dashboard, Filters, TrendPoint } from "../lib/metrics/types.ts";
import { mergeRoster, type RosterPerson } from "../lib/roster.ts";
import { connectToDatabase } from "../db/connect.ts";
import { ItemModel } from "../db/models/index.ts";
import { buildMatch } from "../db/query/match.ts";
import {
  AGEING_KEYS,
  ACTIVE,
  ageInDays,
  ageingBucket,
  countIf,
  histogramFacet,
  IS_ACTIVE,
  isCriticalAged,
  termsFacet,
} from "../db/query/stages.ts";
import { listTeams } from "../lib/teams.ts";
import { fillSeries, orderedBuckets, round1, toBucketList } from "./dashboard.shape.ts";

export async function getDashboard(f: Filters): Promise<Dashboard> {
  await connectToDatabase();

  const now = Date.now();
  const thresholdDays = f.thresholdDays ?? 7;
  const agedBefore = new Date(daysAgo(now, thresholdDays));
  const bound = (days: number) => floorDay(daysAgo(now, days));
  const bounds = { d3: bound(3), d7: bound(7), d14: bound(14), d30: bound(30) };

  const dailyFrom = floorDay(daysAgo(now, 30));
  const weeklyFrom = floorWeek(daysAgo(now, 84));

  const [result] = await ItemModel.aggregate([
    { $match: buildMatch(f, now) },
    {
      $facet: {
        /* Headline counts — one pass, no re-scan per tile. */
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: countIf(IS_ACTIVE),
              criticalAged: countIf(isCriticalAged(agedBefore)),
              avgAgeDays: { $avg: { $cond: [IS_ACTIVE, ageInDays(now), null] } },
            },
          },
        ],
        /* Distinct open environments, for the "environments covered" tile. */
        envCount: [{ $match: ACTIVE }, { $group: { _id: "$environment" } }, { $count: "n" }],

        severity: termsFacet("severity", 10),
        environment: termsFacet("environment", 10),
        status: termsFacet("status", 15),

        ageing: [
          { $match: ACTIVE },
          { $group: { _id: ageingBucket(bounds), count: { $sum: 1 } } },
          { $project: { _id: 0, key: "$_id", count: 1 } },
        ],

        assignees: [
          {
            $group: {
              _id: "$assignee",
              email: { $first: "$assigneeEmail" },
              total: { $sum: 1 },
              active: countIf(IS_ACTIVE),
              critical: countIf({ $and: [IS_ACTIVE, { $eq: ["$severity", "Critical"] }] }),
              aged: countIf({ $and: [IS_ACTIVE, { $lte: ["$createdDate", agedBefore] }] }),
              avgAgeDays: { $avg: { $cond: [IS_ACTIVE, ageInDays(now), null] } },
              /*
               * Per-person severity, collected as a flat list and counted after
               * the fact. A nested `$group` is not available inside `$facet`,
               * and the list is bounded by that person's item count.
               */
              severities: { $push: { $cond: [IS_ACTIVE, "$severity", "$$REMOVE"] } },
            },
          },
          { $sort: { total: -1, _id: 1 } },
          { $limit: PAGE.leaderboard },
        ],

        teams: [
          {
            $group: {
              _id: "$teamId",
              total: { $sum: 1 },
              active: countIf(IS_ACTIVE),
              criticalAged: countIf(isCriticalAged(agedBefore)),
              avgAgeDays: { $avg: { $cond: [IS_ACTIVE, ageInDays(now), null] } },
            },
          },
          { $sort: { total: -1, _id: 1 } },
          { $limit: PAGE.teams },
        ],

        raisedDaily: histogramFacet("createdDate", "day", dailyFrom),
        closedDaily: histogramFacet("closedDate", "day", dailyFrom),
        raisedWeekly: histogramFacet("createdDate", "week", weeklyFrom),
        closedWeekly: histogramFacet("closedDate", "week", weeklyFrom),
      },
    },
  ]);

  const head = result?.totals?.[0];
  const total = head?.total ?? 0;
  const active = head?.active ?? 0;

  const totals = {
    total,
    active,
    closed: total - active,
    avgAgeDays: round1(head?.avgAgeDays),
    criticalAged: head?.criticalAged ?? 0,
    environments: result?.envCount?.[0]?.n ?? 0,
  };

  /**
   * The rosters of the PODs in scope, so an onboarded person with no items
   * still appears — as a zero rather than a gap.
   *
   * A failure here must not take the dashboard with it: the roster is a
   * nicety, the counts are the product. It degrades to no roster.
   */
  const roster: RosterPerson[] = await listTeams()
    .then((teams) => teams.filter((t) => !f.teamId || t.id === f.teamId).flatMap((t) => t.members ?? []))
    .catch(() => []);

  return {
    generatedAt: new Date().toISOString(),
    thresholdDays,
    totals,
    severity: toBucketList(result?.severity),
    environment: toBucketList(result?.environment),
    status: toBucketList(result?.status),
    /* Fixed order — a missing bucket is a zero, never a hole in the chart. */
    ageing: orderedBuckets(result?.ageing, AGEING_KEYS),
    assignees: mergeRoster(
      (result?.assignees ?? []).map((a: Record<string, unknown>) => ({
        name: String(a._id ?? ""),
        email: String(a.email ?? ""),
        total: Number(a.total ?? 0),
        active: Number(a.active ?? 0),
        critical: Number(a.critical ?? 0),
        aged: Number(a.aged ?? 0),
        avgAgeDays: round1(a.avgAgeDays),
        severity: countValues(a.severities as string[] | undefined),
      })),
      roster,
    ),
    teams: (result?.teams ?? []).map((t: Record<string, unknown>) => ({
      teamId: String(t._id ?? ""),
      total: Number(t.total ?? 0),
      active: Number(t.active ?? 0),
      criticalAged: Number(t.criticalAged ?? 0),
      avgAgeDays: round1(t.avgAgeDays),
    })),
    trend: {
      daily: mergeTrend(
        fillSeries(result?.raisedDaily, dailyFrom, now, "day"),
        fillSeries(result?.closedDaily, dailyFrom, now, "day"),
      ),
      weekly: mergeTrend(
        fillSeries(result?.raisedWeekly, weeklyFrom, now, "week"),
        fillSeries(result?.closedWeekly, weeklyFrom, now, "week"),
      ),
    },
    health: healthScore(totals),
  };
}

/** Tally a flat list of severities into buckets, biggest first. */
function countValues(values: string[] | undefined): Bucket[] {
  const tally = new Map<string, number>();
  for (const v of values ?? []) tally.set(v, (tally.get(v) ?? 0) + 1);
  return [...tally.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Two series, one point per date, closed defaulting to zero. */
function mergeTrend(raised: Bucket[], closed: Bucket[]): TrendPoint[] {
  const closedBy = new Map(closed.map((b) => [b.key, b.count]));
  return raised.map((b) => ({ date: b.key, raised: b.count, closed: closedBy.get(b.key) ?? 0 }));
}
